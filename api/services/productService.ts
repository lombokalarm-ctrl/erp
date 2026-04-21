import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type Product = {
  id: string
  sku: string
  name: string
  unit: string
  purchasePrice: string
  salePrice: string
  categoryPrices?: Record<string, number>
}

export async function listProducts(params: {
  page?: number
  pageSize?: number
  q?: string
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize
  const q = params.q?.trim()

  const where: string[] = []
  const values: unknown[] = []

  if (q) {
    values.push(`%${q.toLowerCase()}%`)
    where.push('(lower(sku) like $1 or lower(name) like $1)')
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from products ${whereSql}`,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const listRes = await pool.query(
    `
      select
        id,
        sku,
        name,
        unit,
        purchase_price::text as "purchasePrice",
        sale_price::text as "salePrice",
        category_prices as "categoryPrices"
      from products
      ${whereSql}
      order by created_at desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return {
    items: listRes.rows as Product[],
    total,
  }
}

export async function getProductById(id: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        id,
        sku,
        name,
        unit,
        purchase_price::text as "purchasePrice",
        sale_price::text as "salePrice",
        category_prices as "categoryPrices"
      from products
      where id = $1
      limit 1
    `,
    [id],
  )
  const row = res.rows[0] as Product | undefined
  if (!row) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Produk tidak ditemukan' })
  }
  return row
}

export async function createProduct(input: {
  sku: string
  name: string
  unit: string
  purchasePrice: number
  salePrice: number
  categoryPrices?: Record<string, number>
}) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into products(sku, name, unit, purchase_price, sale_price, category_prices)
      values ($1, $2, $3, $4, $5, $6)
      returning
        id,
        sku,
        name,
        unit,
        purchase_price::text as "purchasePrice",
        sale_price::text as "salePrice",
        category_prices as "categoryPrices"
    `,
    [input.sku, input.name, input.unit, input.purchasePrice, input.salePrice, JSON.stringify(input.categoryPrices || {})],
  )
  return res.rows[0] as Product
}

export async function deleteProduct(id: string) {
  const pool = getPool()
  try {
    const res = await pool.query('delete from products where id = $1 returning id', [id])
    if (res.rowCount === 0) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Produk tidak ditemukan' })
    }
  } catch (err: any) {
    if (err.code === '23503') {
      throw new ApiError({ code: 'FOREIGN_KEY_VIOLATION', status: 400, message: 'Tidak dapat menghapus produk karena data sudah digunakan pada transaksi' })
    }
    throw err
  }
}

export async function updateProduct(
  id: string,
  input: Partial<{
    sku: string
    name: string
    unit: string
    purchasePrice: number
    salePrice: number
    categoryPrices: Record<string, number>
  }>,
) {
  const pool = getPool()
  const current = await getProductById(id)

  const res = await pool.query(
    `
      update products
      set sku = $2,
          name = $3,
          unit = $4,
          purchase_price = $5,
          sale_price = $6,
          category_prices = $7,
          updated_at = now()
      where id = $1
      returning
        id,
        sku,
        name,
        unit,
        purchase_price::text as "purchasePrice",
        sale_price::text as "salePrice",
        category_prices as "categoryPrices"
    `,
    [
      id,
      input.sku ?? current.sku,
      input.name ?? current.name,
      input.unit ?? current.unit,
      input.purchasePrice ?? Number(current.purchasePrice),
      input.salePrice ?? Number(current.salePrice),
      input.categoryPrices ? JSON.stringify(input.categoryPrices) : JSON.stringify(current.categoryPrices || {}),
    ],
  )

  return res.rows[0] as Product
}
