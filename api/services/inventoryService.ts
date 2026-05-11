import type { PoolClient } from 'pg'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { randomUUID } from 'node:crypto'

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

export async function listReplenishmentSuggestions(params: { warehouseId?: string; q?: string }) {
  const pool = getPool()
  const values: unknown[] = []
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
      with stock as (
        select
          p.id as "productId",
          p.sku,
          p.name as "productName",
          p.purchase_price::numeric as "purchasePrice",
          coalesce(p.min_stock_base, 0)::numeric as "minStockBase",
          coalesce(p.reorder_qty_base, 0)::numeric as "reorderQtyBase",
          coalesce(sum(b.qty), 0)::numeric as "currentQtyBase"
        from products p
        left join inventory_balances b on b.product_id = p.id ${warehouseJoinSql}
        where ${conditions.join(' and ')}
        group by p.id, p.sku, p.name, p.purchase_price, p.min_stock_base, p.reorder_qty_base
      )
      select
        s."productId",
        s.sku,
        s."productName",
        s."purchasePrice"::text as "purchasePrice",
        s."currentQtyBase"::text as "currentQtyBase",
        s."minStockBase"::text as "minStockBase",
        s."reorderQtyBase"::text as "reorderQtyBase",
        greatest(s."minStockBase" - s."currentQtyBase", 0)::text as "shortageQtyBase",
        (
          case
            when s."currentQtyBase" >= s."minStockBase" then 0
            when s."reorderQtyBase" > 0 then greatest(s."reorderQtyBase", s."minStockBase" - s."currentQtyBase")
            else (s."minStockBase" - s."currentQtyBase")
          end
        )::text as "recommendedQtyBase",
        (
          (
            case
              when s."currentQtyBase" >= s."minStockBase" then 0
              when s."reorderQtyBase" > 0 then greatest(s."reorderQtyBase", s."minStockBase" - s."currentQtyBase")
              else (s."minStockBase" - s."currentQtyBase")
            end
          ) * s."purchasePrice"
        )::text as "estimatedPurchaseValue"
      from stock s
      where s."currentQtyBase" < s."minStockBase"
      order by (s."minStockBase" - s."currentQtyBase") desc, s."productName" asc
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
  note?: string
}) {
  if (input.sourceWarehouseId === input.targetWarehouseId) {
    throw new Error('Gudang asal dan tujuan tidak boleh sama')
  }
  if (!input.items.length) {
    throw new Error('Item transfer tidak boleh kosong')
  }

  return withTransaction(async (client) => {
    const transferRefId = randomUUID()
    for (const item of input.items) {
      const qtyBase = Number(item.qtyBase)
      if (!Number.isFinite(qtyBase) || qtyBase <= 0) continue

      const stockRes = await client.query(
        `
          select coalesce(qty, 0)::numeric as qty
          from inventory_balances
          where warehouse_id = $1 and product_id = $2
          limit 1
        `,
        [input.sourceWarehouseId, item.productId],
      )
      const available = Number(stockRes.rows[0]?.qty ?? 0)
      if (available < qtyBase) {
        throw new Error('Stok gudang asal tidak cukup untuk transfer')
      }

      await applyInventoryTransaction({
        warehouseId: input.sourceWarehouseId,
        productId: item.productId,
        type: 'TRANSFER_OUT',
        qtyDelta: -qtyBase,
        createdBy: input.createdBy,
        refType: 'inventory_transfer',
        refId: transferRefId,
        note: input.note,
        client,
      })

      await applyInventoryTransaction({
        warehouseId: input.targetWarehouseId,
        productId: item.productId,
        type: 'TRANSFER_IN',
        qtyDelta: qtyBase,
        createdBy: input.createdBy,
        refType: 'inventory_transfer',
        refId: transferRefId,
        note: input.note,
        client,
      })
    }

    return { transferRefId }
  })
}
