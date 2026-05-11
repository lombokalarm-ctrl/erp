import type { PoolClient } from 'pg'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'

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

export async function getDefaultWarehouseId(client?: PoolClient) {
  const q = client ?? getPool()
  const res = await q.query(
    `select id from warehouses where code = 'WH-01' limit 1`,
  )
  return res.rows[0]?.id as string | undefined
}

export async function applyInventoryTransaction(input: {
  warehouseId: string
  productId: string
  type: string
  qtyDelta: number
  createdBy?: string
  refType?: string
  refId?: string
  note?: string
  client?: PoolClient
}) {
  const q = input.client ?? getPool()
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

      const stockRes = await client.query(
        `
          select coalesce(qty, 0)::numeric as qty
          from inventory_balances
          where warehouse_id = $1 and product_id = $2
          limit 1
        `,
        [input.sourceWarehouseId, productId],
      )
      const available = Number(stockRes.rows[0]?.qty ?? 0)
      if (available < qtyBase) {
        throw new Error('Stok gudang asal tidak cukup untuk transfer')
      }

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

    return { transferRefId, transferNo: transferNoCreated, duplicate: false }
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
