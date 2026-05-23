import type { PoolClient } from 'pg'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { ApiError } from '../lib/http.js'

function pad4(n: number) {
  return String(n).padStart(4, '0')
}

async function generateTransferNumber(client: PoolClient, transferDate: string) {
  const dateKey = transferDate.replace(/-/g, '')
  const like = `TRF-${dateKey}-%`
  const res = await client.query(
    `select transfer_no from inventory_transfers where transfer_no like $1 order by transfer_no desc limit 1`,
    [like],
  )
  const last = res.rows[0]?.transfer_no as string | undefined
  const nextSeq = last ? Number(last.split('-').pop()) + 1 : 1
  return `TRF-${dateKey}-${pad4(nextSeq)}`
}

async function generateTransferRequestNumber(client: PoolClient, transferDate: string) {
  const dateKey = transferDate.replace(/-/g, '')
  const like = `TRQ-${dateKey}-%`
  const res = await client.query(
    `select request_no from inventory_transfer_requests where request_no like $1 order by request_no desc limit 1`,
    [like],
  )
  const last = res.rows[0]?.request_no as string | undefined
  const nextSeq = last ? Number(last.split('-').pop()) + 1 : 1
  return `TRQ-${dateKey}-${pad4(nextSeq)}`
}

export async function getDefaultWarehouseId(client?: PoolClient) {
  const q = client ?? getPool()
  const res = await q.query(
    `select id from warehouses where code = 'WH-01' limit 1`,
  )
  return res.rows[0]?.id as string | undefined
}

type InventoryTransactionInput = {
  warehouseId: string
  productId: string
  type: string
  qtyDelta: number
  createdBy?: string
  refType?: string
  refId?: string
  note?: string
  client?: PoolClient
}

function assertValidInventoryQuantity(qtyDelta: number, type: string) {
  if (!Number.isFinite(qtyDelta) || qtyDelta === 0) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: `Kuantitas transaksi ${type} tidak valid`,
      details: {
        issue: 'INVALID_QUANTITY',
        qtyDelta,
      },
    })
  }
}

async function resolveWarehouseOrThrow(q: PoolClient | ReturnType<typeof getPool>, warehouseId: string) {
  const warehouseRes = await q.query(
    `
      select id, code, name
      from warehouses
      where id = $1
      limit 1
    `,
    [warehouseId],
  )

  const warehouse = warehouseRes.rows[0] as
    | { id: string; code: string; name: string }
    | undefined

  if (!warehouse) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Gudang transaksi tidak ditemukan',
      details: {
        issue: 'WAREHOUSE_NOT_FOUND',
        warehouseId,
      },
    })
  }

  return warehouse
}

async function getInventoryBalanceForUpdate(
  q: PoolClient | ReturnType<typeof getPool>,
  warehouseId: string,
  productId: string,
) {
  const suffix = 'release' in q ? ' for update' : ''
  const balanceRes = await q.query(
    `
      select coalesce(qty, 0)::numeric as qty
      from inventory_balances
      where warehouse_id = $1 and product_id = $2
      limit 1${suffix}
    `,
    [warehouseId, productId],
  )

  return Number(balanceRes.rows[0]?.qty ?? 0)
}

async function applyInventoryTransactionWithClient(input: InventoryTransactionInput & { client: PoolClient }) {
  const q = input.client
  assertValidInventoryQuantity(input.qtyDelta, input.type)
  const warehouse = await resolveWarehouseOrThrow(q, input.warehouseId)

  if (input.qtyDelta < 0) {
    const availableQty = await getInventoryBalanceForUpdate(q, warehouse.id, input.productId)
    const requestedQty = Math.abs(input.qtyDelta)
    if (availableQty < requestedQty) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: `Stok gudang ${warehouse.code} tidak cukup`,
        details: {
          issue: 'INSUFFICIENT_STOCK',
          warehouseId: warehouse.id,
          warehouseCode: warehouse.code,
          productId: input.productId,
          availableQty,
          requestedQty,
          transactionType: input.type,
        },
      })
    }
  }

  await q.query(
    `
      insert into inventory_transactions(
        warehouse_id,
        product_id,
        type,
        qty_delta,
        ref_type,
        ref_id,
        note,
        created_by
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      input.warehouseId,
      input.productId,
      input.type,
      input.qtyDelta,
      input.refType ?? null,
      input.refId ?? null,
      input.note ?? null,
      input.createdBy ?? null,
    ],
  )

  await q.query(
    `
      insert into inventory_balances(warehouse_id, product_id, qty)
      values ($1,$2,$3)
      on conflict(warehouse_id, product_id) do update
        set qty = inventory_balances.qty + excluded.qty,
            updated_at = now()
    `,
    [input.warehouseId, input.productId, input.qtyDelta],
  )
}

export async function applyInventoryTransaction(input: InventoryTransactionInput) {
  if (input.client) {
    return applyInventoryTransactionWithClient(input as InventoryTransactionInput & { client: PoolClient })
  }

  return withTransaction(async (client: PoolClient) => {
    return applyInventoryTransactionWithClient({
      ...input,
      client,
    })
  })
}

export async function listInventorySummary(params: { q?: string }) {
  const pool = getPool()
  const q = params.q?.trim()
  const values: unknown[] = []
  const where: string[] = []
  if (q) {
    values.push(`%${q.toLowerCase()}%`)
    where.push('(lower(p.sku) like $1 or lower(p.name) like $1)')
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const res = await pool.query(
    `
      select
        p.id as "productId",
        p.sku,
        p.name,
        p.pack_size as "packSize",
        p.pack_per_dus as "packPerDus",
        p.dus_size as "dusSize",
        coalesce(sum(b.qty), 0)::text as qty
      from products p
      left join inventory_balances b on b.product_id = p.id
      ${whereSql}
      group by p.id, p.sku, p.name, p.pack_size, p.pack_per_dus, p.dus_size
      order by p.name asc
      limit 500
    `,
    values,
  )
  return res.rows
}

export async function listInventoryTransactions(params: {
  page?: number
  pageSize?: number
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50
  const offset = (page - 1) * pageSize

  const totalRes = await pool.query(
    `select count(*)::int as c from inventory_transactions`,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select
        it.id,
        it.type,
        it.qty_delta::text as "qtyDelta",
        it.ref_type as "refType",
        it.ref_id as "refId",
        it.created_at as "createdAt",
        w.code as "warehouseCode",
        p.sku as sku,
        p.name as "productName"
      from inventory_transactions it
      join warehouses w on w.id = it.warehouse_id
      join products p on p.id = it.product_id
      order by it.created_at desc
      limit $1 offset $2
    `,
    [pageSize, offset],
  )

  return { items: res.rows, total }
}

export async function listReplenishmentSuggestions(params: {
  warehouseId?: string
  q?: string
  lookbackDays?: number
}) {
  const pool = getPool()
  const lookbackDays = Math.max(1, Math.min(180, Number(params.lookbackDays ?? 30)))
  const values: unknown[] = [lookbackDays]
  const conditions: string[] = ['coalesce(p.min_stock_base, 0) > 0']

  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`)
    conditions.push(`(lower(p.sku) like $${values.length} or lower(p.name) like $${values.length})`)
  }

  const warehouseFilter = params.warehouseId?.trim() ? params.warehouseId.trim() : null
  let warehouseJoinSql = ''
  if (warehouseFilter) {
    values.push(warehouseFilter)
    warehouseJoinSql = `and b.warehouse_id = $${values.length}`
  }

  const res = await pool.query(
    `
      with sales as (
        select
          ii.product_id as "productId",
          coalesce(sum(coalesce(ii.qty_base, ii.qty * coalesce(ii.uom_to_pcs, 1))), 0)::numeric as "soldQtyBase"
        from invoice_items ii
        join invoices i on i.id = ii.invoice_id
        where i.invoice_date >= current_date - ($1::int || ' days')::interval
        group by ii.product_id
      ),
      stock as (
        select
          p.id as "productId",
          p.sku,
          p.name as "productName",
          p.purchase_price::numeric as "purchasePrice",
          coalesce(p.min_stock_base, 0)::numeric as "minStockBase",
          coalesce(p.reorder_qty_base, 0)::numeric as "reorderQtyBase",
          coalesce(p.lead_time_days, 0)::int as "leadTimeDays",
          coalesce(p.buffer_days, 0)::int as "bufferDays",
          coalesce(s."soldQtyBase", 0)::numeric as "soldQtyBase",
          coalesce(sum(b.qty), 0)::numeric as "currentQtyBase"
        from products p
        left join sales s on s."productId" = p.id
        left join inventory_balances b on b.product_id = p.id ${warehouseJoinSql}
        where ${conditions.join(' and ')}
        group by p.id, p.sku, p.name, p.purchase_price, p.min_stock_base, p.reorder_qty_base, p.lead_time_days, p.buffer_days, s."soldQtyBase"
      )
      select
        s."productId",
        s.sku,
        s."productName",
        s."purchasePrice"::text as "purchasePrice",
        s."currentQtyBase"::text as "currentQtyBase",
        s."minStockBase"::text as "minStockBase",
        s."reorderQtyBase"::text as "reorderQtyBase",
        s."leadTimeDays",
        s."bufferDays",
        (s."soldQtyBase" / greatest($1::int, 1))::text as "avgDailySalesBase",
        (
          s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
        )::text as "targetStockBase",
        greatest(
          (
            s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
          ) - s."currentQtyBase",
          0
        )::text as "shortageQtyBase",
        (
          case
            when s."currentQtyBase" >= (
              s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
            ) then 0
            when s."reorderQtyBase" > 0 then greatest(
              s."reorderQtyBase",
              (
                s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
              ) - s."currentQtyBase"
            )
            else (
              s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
            ) - s."currentQtyBase"
          end
        )::text as "recommendedQtyBase",
        (
          (
            case
              when s."currentQtyBase" >= (
                s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
              ) then 0
              when s."reorderQtyBase" > 0 then greatest(
                s."reorderQtyBase",
                (
                  s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
                ) - s."currentQtyBase"
              )
              else (
                s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
              ) - s."currentQtyBase"
            end
          ) * s."purchasePrice"
        )::text as "estimatedPurchaseValue"
      from stock s
      where s."currentQtyBase" < (
        s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
      )
      order by (
        (
          s."minStockBase" + ((s."soldQtyBase" / greatest($1::int, 1)) * greatest((s."leadTimeDays" + s."bufferDays"), 0))
        ) - s."currentQtyBase"
      ) desc, s."productName" asc
    `,
    values,
  )

  const summary = res.rows.reduce(
    (acc, row) => {
      acc.totalItems += 1
      acc.totalShortageQtyBase += Number(row.shortageQtyBase ?? 0)
      acc.totalRecommendedQtyBase += Number(row.recommendedQtyBase ?? 0)
      acc.totalEstimatedPurchase += Number(row.estimatedPurchaseValue ?? 0)
      return acc
    },
    {
      totalItems: 0,
      totalShortageQtyBase: 0,
      totalRecommendedQtyBase: 0,
      totalEstimatedPurchase: 0,
    },
  )

  return {
    summary: {
      ...summary,
      lookbackDays,
      totalShortageQtyBase: String(summary.totalShortageQtyBase),
      totalRecommendedQtyBase: String(summary.totalRecommendedQtyBase),
      totalEstimatedPurchase: String(summary.totalEstimatedPurchase),
    },
    items: res.rows,
  }
}

export async function createInventoryTransfer(input: {
  sourceWarehouseId: string
  targetWarehouseId: string
  items: Array<{ productId: string; qtyBase: number }>
  createdBy: string
  transferDate?: string
  clientRef?: string
  note?: string
}) {
  if (input.sourceWarehouseId === input.targetWarehouseId) {
    throw new Error('Gudang asal dan tujuan tidak boleh sama')
  }
  if (!input.items.length) {
    throw new Error('Item transfer tidak boleh kosong')
  }

  return withTransaction(async (client) => {
    if (input.clientRef?.trim()) {
      const existingRes = await client.query(
        `
          select id, transfer_no as "transferNo"
          from inventory_transfers
          where client_ref = $1
          limit 1
        `,
        [input.clientRef.trim()],
      )
      const existing = existingRes.rows[0]
      if (existing) {
        return {
          transferRefId: existing.id as string,
          transferNo: existing.transferNo as string,
          duplicate: true,
        }
      }
    }

    const result = await postInventoryTransfer(client, input)
    return { ...result, duplicate: false }
  })
}

async function postInventoryTransfer(
  client: PoolClient,
  input: {
    sourceWarehouseId: string
    targetWarehouseId: string
    items: Array<{ productId: string; qtyBase: number }>
    createdBy: string
    transferDate?: string
    clientRef?: string
    note?: string
  },
) {
  const normalizedDate = input.transferDate ?? new Date().toISOString().slice(0, 10)
  const transferNo = await generateTransferNumber(client, normalizedDate)
  const headerRes = await client.query(
    `
      insert into inventory_transfers(
        transfer_no,
        client_ref,
        source_warehouse_id,
        target_warehouse_id,
        transfer_date,
        note,
        created_by
      )
      values ($1,$2,$3,$4,$5,$6,$7)
      returning id, transfer_no as "transferNo"
    `,
    [
      transferNo,
      input.clientRef?.trim() || null,
      input.sourceWarehouseId,
      input.targetWarehouseId,
      normalizedDate,
      input.note ?? null,
      input.createdBy,
    ],
  )
  const transferRefId = headerRes.rows[0].id as string
  const transferNoCreated = headerRes.rows[0].transferNo as string

  const mergedItems = new Map<string, number>()
  for (const item of input.items) {
    mergedItems.set(item.productId, (mergedItems.get(item.productId) ?? 0) + Number(item.qtyBase))
  }

  for (const [productId, qtyBaseRaw] of mergedItems.entries()) {
    const qtyBase = Number(qtyBaseRaw)
    if (!Number.isFinite(qtyBase) || qtyBase <= 0) continue

    await applyInventoryTransaction({
      warehouseId: input.sourceWarehouseId,
      productId,
      type: 'TRANSFER_OUT',
      qtyDelta: -qtyBase,
      createdBy: input.createdBy,
      refType: 'inventory_transfer',
      refId: transferRefId,
      note: `${transferNoCreated}${input.note ? ` - ${input.note}` : ''}`,
      client,
    })

    await applyInventoryTransaction({
      warehouseId: input.targetWarehouseId,
      productId,
      type: 'TRANSFER_IN',
      qtyDelta: qtyBase,
      createdBy: input.createdBy,
      refType: 'inventory_transfer',
      refId: transferRefId,
      note: `${transferNoCreated}${input.note ? ` - ${input.note}` : ''}`,
      client,
    })

    await client.query(
      `
        insert into inventory_transfer_items(transfer_id, product_id, qty_base)
        values ($1,$2,$3)
      `,
      [transferRefId, productId, qtyBase],
    )
  }

  return { transferRefId, transferNo: transferNoCreated }
}

export async function createInventoryTransferRequest(input: {
  sourceWarehouseId: string
  targetWarehouseId: string
  items: Array<{ productId: string; qtyBase: number }>
  createdBy: string
  transferDate?: string
  clientRef?: string
  note?: string
}) {
  if (input.sourceWarehouseId === input.targetWarehouseId) {
    throw new Error('Gudang asal dan tujuan tidak boleh sama')
  }
  if (!input.items.length) {
    throw new Error('Item transfer tidak boleh kosong')
  }

  return withTransaction(async (client) => {
    const normalizedDate = input.transferDate ?? new Date().toISOString().slice(0, 10)

    if (input.clientRef?.trim()) {
      const existingRes = await client.query(
        `
          select id, request_no as "requestNo", status
          from inventory_transfer_requests
          where client_ref = $1
          limit 1
        `,
        [input.clientRef.trim()],
      )
      const existing = existingRes.rows[0]
      if (existing) {
        return {
          requestId: existing.id as string,
          requestNo: existing.requestNo as string,
          requestStatus: existing.status as string,
          duplicate: true,
        }
      }
    }

    const requestNo = await generateTransferRequestNumber(client, normalizedDate)
    const requestRes = await client.query(
      `
        insert into inventory_transfer_requests(
          request_no,
          client_ref,
          source_warehouse_id,
          target_warehouse_id,
          transfer_date,
          status,
          note,
          created_by
        )
        values ($1,$2,$3,$4,$5,'PENDING_L1',$6,$7)
        returning id, request_no as "requestNo", status as "requestStatus"
      `,
      [
        requestNo,
        input.clientRef?.trim() || null,
        input.sourceWarehouseId,
        input.targetWarehouseId,
        normalizedDate,
        input.note ?? null,
        input.createdBy,
      ],
    )
    const requestId = requestRes.rows[0].id as string

    const mergedItems = new Map<string, number>()
    for (const item of input.items) {
      mergedItems.set(item.productId, (mergedItems.get(item.productId) ?? 0) + Number(item.qtyBase))
    }

    for (const [productId, qtyBaseRaw] of mergedItems.entries()) {
      const qtyBase = Number(qtyBaseRaw)
      if (!Number.isFinite(qtyBase) || qtyBase <= 0) continue

      await client.query(
        `
          insert into inventory_transfer_request_items(request_id, product_id, qty_base)
          values ($1,$2,$3)
        `,
        [requestId, productId, qtyBase],
      )
    }

    await client.query(
      `
        insert into inventory_transfer_approvals(request_id, level, status)
        values ($1,1,'PENDING'),($1,2,'PENDING')
      `,
      [requestId],
    )

    return {
      requestId,
      requestNo: requestRes.rows[0].requestNo as string,
      requestStatus: requestRes.rows[0].requestStatus as string,
      duplicate: false,
    }
  })
}

export async function listInventoryTransfers(params: { page?: number; pageSize?: number }) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50
  const offset = (page - 1) * pageSize

  const totalRes = await pool.query(`select count(*)::int as c from inventory_transfers`)
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select
        t.id,
        t.transfer_no as "transferNo",
        t.transfer_date::text as "transferDate",
        ws.code as "sourceWarehouseCode",
        wt.code as "targetWarehouseCode",
        coalesce(sum(ti.qty_base), 0)::text as "totalQtyBase",
        count(ti.id)::int as "itemCount",
        t.created_at as "createdAt"
      from inventory_transfers t
      join warehouses ws on ws.id = t.source_warehouse_id
      join warehouses wt on wt.id = t.target_warehouse_id
      left join inventory_transfer_items ti on ti.transfer_id = t.id
      group by t.id, t.transfer_no, t.transfer_date, ws.code, wt.code, t.created_at
      order by t.created_at desc
      limit $1 offset $2
    `,
    [pageSize, offset],
  )

  return { items: res.rows, total }
}

export async function listInventoryTransferApprovals(params: {
  page?: number
  pageSize?: number
  level?: 1 | 2
  status?: 'PENDING' | 'APPROVED' | 'REJECTED'
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []
  if (params.level) {
    values.push(params.level)
    where.push(`a.level = $${values.length}`)
  }
  if (params.status) {
    values.push(params.status)
    where.push(`a.status = $${values.length}`)
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `
      select count(*)::int as c
      from inventory_transfer_approvals a
      join inventory_transfer_requests r on r.id = a.request_id
      ${whereSql}
    `,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select
        a.id as "approvalId",
        a.level,
        a.status as "approvalStatus",
        a.notes as "approvalNotes",
        r.id as "requestId",
        r.request_no as "requestNo",
        r.status as "requestStatus",
        r.transfer_date::text as "transferDate",
        r.note as "requestNote",
        ws.code as "sourceWarehouseCode",
        wt.code as "targetWarehouseCode",
        u.full_name as "requestedByName",
        r.created_at as "requestedAt",
        coalesce(sum(ri.qty_base), 0)::text as "totalQtyBase",
        count(ri.id)::int as "itemCount"
      from inventory_transfer_approvals a
      join inventory_transfer_requests r on r.id = a.request_id
      join warehouses ws on ws.id = r.source_warehouse_id
      join warehouses wt on wt.id = r.target_warehouse_id
      left join users u on u.id = r.created_by
      left join inventory_transfer_request_items ri on ri.request_id = r.id
      ${whereSql}
      group by
        a.id, a.level, a.status, a.notes,
        r.id, r.request_no, r.status, r.transfer_date, r.note, r.created_at,
        ws.code, wt.code, u.full_name
      order by r.created_at asc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: res.rows, total }
}

export async function processInventoryTransferApproval(input: {
  approvalId: string
  action: 'APPROVED' | 'REJECTED'
  approverId: string
  notes?: string
  actorLevels: Array<1 | 2>
}) {
  return withTransaction(async (client) => {
    const approvalRes = await client.query(
      `
        select
          a.id as "approvalId",
          a.level,
          a.status as "approvalStatus",
          r.id as "requestId",
          r.request_no as "requestNo",
          r.status as "requestStatus",
          r.source_warehouse_id as "sourceWarehouseId",
          r.target_warehouse_id as "targetWarehouseId",
          r.transfer_date::text as "transferDate",
          r.client_ref as "clientRef",
          r.note as "requestNote",
          r.created_by as "createdBy"
        from inventory_transfer_approvals a
        join inventory_transfer_requests r on r.id = a.request_id
        where a.id = $1
        limit 1
        for update of a, r
      `,
      [input.approvalId],
    )
    const approval = approvalRes.rows[0] as
      | {
          approvalId: string
          level: 1 | 2
          approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
          requestId: string
          requestNo: string
          requestStatus: 'PENDING_L1' | 'PENDING_L2' | 'APPROVED' | 'REJECTED'
          sourceWarehouseId: string
          targetWarehouseId: string
          transferDate: string
          clientRef?: string | null
          requestNote?: string | null
          createdBy: string
        }
      | undefined

    if (!approval) {
      throw new Error('Approval transfer tidak ditemukan')
    }
    if (!input.actorLevels.includes(approval.level)) {
      throw new Error('Anda tidak berhak memproses level approval ini')
    }
    if (approval.approvalStatus !== 'PENDING') {
      throw new Error('Approval transfer sudah diproses')
    }

    const expectedStatus = approval.level === 1 ? 'PENDING_L1' : 'PENDING_L2'
    if (approval.requestStatus !== expectedStatus) {
      throw new Error(`Status request tidak sesuai (${approval.requestStatus})`)
    }

    await client.query(
      `
        update inventory_transfer_approvals
        set status = $2,
            approver_id = $3,
            notes = $4,
            acted_at = now(),
            updated_at = now()
        where id = $1
      `,
      [input.approvalId, input.action, input.approverId, input.notes ?? null],
    )

    if (input.action === 'REJECTED') {
      await client.query(
        `
          update inventory_transfer_requests
          set status = 'REJECTED',
              updated_at = now()
          where id = $1
        `,
        [approval.requestId],
      )
      await client.query(
        `
          update inventory_transfer_approvals
          set status = 'REJECTED',
              notes = coalesce(notes, 'Auto reject karena request ditolak di level lain'),
              acted_at = now(),
              updated_at = now()
          where request_id = $1 and status = 'PENDING'
        `,
        [approval.requestId],
      )
      return {
        requestId: approval.requestId,
        requestNo: approval.requestNo,
        newRequestStatus: 'REJECTED' as const,
      }
    }

    if (approval.level === 1) {
      await client.query(
        `
          update inventory_transfer_requests
          set status = 'PENDING_L2',
              updated_at = now()
          where id = $1
        `,
        [approval.requestId],
      )
      return {
        requestId: approval.requestId,
        requestNo: approval.requestNo,
        newRequestStatus: 'PENDING_L2' as const,
      }
    }

    const itemsRes = await client.query(
      `
        select product_id as "productId", qty_base::text as "qtyBase"
        from inventory_transfer_request_items
        where request_id = $1
      `,
      [approval.requestId],
    )
    const transferItems = itemsRes.rows.map((r) => ({
      productId: r.productId as string,
      qtyBase: Number(r.qtyBase ?? 0),
    }))
    if (!transferItems.length) {
      throw new Error('Item transfer request tidak ditemukan')
    }

    const posted = await postInventoryTransfer(client, {
      sourceWarehouseId: approval.sourceWarehouseId,
      targetWarehouseId: approval.targetWarehouseId,
      transferDate: approval.transferDate,
      clientRef: approval.clientRef ?? undefined,
      note: approval.requestNote ?? undefined,
      createdBy: approval.createdBy,
      items: transferItems,
    })

    await client.query(
      `
        update inventory_transfer_requests
        set status = 'APPROVED',
            posted_transfer_id = $2,
            updated_at = now()
        where id = $1
      `,
      [approval.requestId, posted.transferRefId],
    )

    return {
      requestId: approval.requestId,
      requestNo: approval.requestNo,
      newRequestStatus: 'APPROVED' as const,
      postedTransferId: posted.transferRefId,
      postedTransferNo: posted.transferNo,
    }
  })
}

export async function inferSuppliersForProducts(productIds: string[]) {
  if (!productIds.length) return new Map<string, string>()
  const pool = getPool()
  const res = await pool.query(
    `
      select distinct on (poi.product_id)
        poi.product_id as "productId",
        po.supplier_id as "supplierId"
      from purchase_order_items poi
      join purchase_orders po on po.id = poi.purchase_order_id
      where poi.product_id = any($1::uuid[])
      order by poi.product_id, po.order_date desc, po.created_at desc
    `,
    [productIds],
  )
  const map = new Map<string, string>()
  for (const row of res.rows) {
    map.set(row.productId as string, row.supplierId as string)
  }
  return map
}
