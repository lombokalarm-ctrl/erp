import type { PoolClient } from 'pg'
import { getPool } from '../db/pool.js'

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
        coalesce(sum(b.qty), 0)::text as qty
      from products p
      left join inventory_balances b on b.product_id = p.id
      ${whereSql}
      group by p.id, p.sku, p.name
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
