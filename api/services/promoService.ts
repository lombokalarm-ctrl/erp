import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type ProductPromo = {
  id: string
  productId: string
  name: string
  promoType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  discountValue: number
  minQty: number
  startDate: string | null
  endDate: string | null
  isActive: boolean
}

export async function listPromos(params: {
  page?: number
  pageSize?: number
  q?: string
  productId?: string
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []

  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`)
    where.push('(lower(p.name) like $1 or lower(pr.name) like $1)')
  }

  if (params.productId) {
    values.push(params.productId)
    where.push(`p.product_id = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from product_promos p left join products pr on pr.id = p.product_id ${whereSql}`,
    values,
  )

  const listRes = await pool.query(
    `
      select
        p.id,
        p.product_id as "productId",
        pr.name as "productName",
        pr.sku as "productSku",
        p.name,
        p.promo_type as "promoType",
        p.discount_value::float as "discountValue",
        p.min_qty as "minQty",
        p.start_date::text as "startDate",
        p.end_date::text as "endDate",
        p.is_active as "isActive"
      from product_promos p
      left join products pr on pr.id = p.product_id
      ${whereSql}
      order by p.created_at desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: listRes.rows, total: Number(totalRes.rows[0]?.c ?? 0) }
}

export async function createPromo(input: Omit<ProductPromo, 'id'>) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into product_promos(
        product_id, name, promo_type, discount_value, min_qty, start_date, end_date, is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning *
    `,
    [
      input.productId,
      input.name,
      input.promoType,
      input.discountValue,
      input.minQty,
      input.startDate ?? null,
      input.endDate ?? null,
      input.isActive ?? true,
    ],
  )
  return res.rows[0]
}

export async function updatePromo(id: string, input: Partial<Omit<ProductPromo, 'id'>>) {
  const pool = getPool()
  const currentRes = await pool.query(`select * from product_promos where id = $1`, [id])
  if (!currentRes.rowCount) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Promo tidak ditemukan' })
  const current = currentRes.rows[0]

  const next = {
    productId: input.productId ?? current.product_id,
    name: input.name ?? current.name,
    promoType: input.promoType ?? current.promo_type,
    discountValue: input.discountValue ?? current.discount_value,
    minQty: input.minQty ?? current.min_qty,
    startDate: input.startDate !== undefined ? input.startDate : current.start_date,
    endDate: input.endDate !== undefined ? input.endDate : current.end_date,
    isActive: input.isActive ?? current.is_active,
  }

  const res = await pool.query(
    `
      update product_promos
      set
        product_id = $2,
        name = $3,
        promo_type = $4,
        discount_value = $5,
        min_qty = $6,
        start_date = $7,
        end_date = $8,
        is_active = $9,
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      next.productId,
      next.name,
      next.promoType,
      next.discountValue,
      next.minQty,
      next.startDate ?? null,
      next.endDate ?? null,
      next.isActive,
    ],
  )
  return res.rows[0]
}

export async function deletePromo(id: string) {
  const pool = getPool()
  const res = await pool.query(`delete from product_promos where id = $1`, [id])
  if (!res.rowCount) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Promo tidak ditemukan' })
}

export async function calculateBestPromo(productId: string, qty: number, unitPrice: number) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        promo_type as "promoType",
        discount_value::float as "discountValue"
      from product_promos
      where product_id = $1
        and is_active = true
        and min_qty <= $2
        and (start_date is null or start_date <= now())
        and (end_date is null or end_date >= now())
    `,
    [productId, qty]
  )

  let bestDiscountPerItem = 0

  for (const promo of res.rows) {
    let discount = 0
    if (promo.promoType === 'PERCENTAGE') {
      discount = unitPrice * (promo.discountValue / 100)
    } else if (promo.promoType === 'FIXED_AMOUNT') {
      discount = promo.discountValue
    }
    
    if (discount > bestDiscountPerItem) {
      bestDiscountPerItem = discount
    }
  }

  return bestDiscountPerItem * qty
}
