import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type Customer = {
  id: string
  code: string
  name: string
  category: string
  phone: string | null
  address: string | null
  status: string
  salesId?: string | null
  salesName?: string | null
}

export async function listCustomers(params: {
  page?: number
  pageSize?: number
  q?: string
  salesId?: string
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
    where.push('(lower(c.code) like $1 or lower(c.name) like $1)')
  }

  if (params.salesId) {
    values.push(params.salesId)
    where.push(`c.sales_id = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from customers c ${whereSql}`,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const listRes = await pool.query(
    `
      select 
        c.id, c.code, c.name, c.category, c.phone, c.address, c.status,
        c.sales_id as "salesId",
        u.full_name as "salesName"
      from customers c
      left join users u on u.id = c.sales_id
      ${whereSql}
      order by c.created_at desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return {
    items: listRes.rows as Customer[],
    total,
  }
}

export async function getCustomerById(id: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select 
        c.id, c.code, c.name, c.category, c.phone, c.address, c.status,
        c.sales_id as "salesId",
        u.full_name as "salesName"
      from customers c
      left join users u on u.id = c.sales_id
      where c.id = $1
      limit 1
    `,
    [id],
  )
  const row = res.rows[0] as Customer | undefined
  if (!row) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Customer tidak ditemukan' })
  }
  return row
}

export async function createCustomer(input: {
  code: string
  name: string
  category: string
  phone?: string | null
  address?: string | null
  status?: string
  salesId?: string | null
}) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into customers(code, name, category, phone, address, status, sales_id)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, code, name, category, phone, address, status, sales_id as "salesId"
    `,
    [
      input.code,
      input.name,
      input.category,
      input.phone ?? null,
      input.address ?? null,
      input.status ?? 'ACTIVE',
      input.salesId ?? null,
    ],
  )
  return res.rows[0] as Customer
}

export async function deleteCustomer(id: string) {
  const pool = getPool()
  try {
    const res = await pool.query('delete from customers where id = $1 returning id', [id])
    if (res.rowCount === 0) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Pelanggan tidak ditemukan' })
    }
  } catch (err: any) {
    if (err.code === '23503') {
      throw new ApiError({ code: 'FOREIGN_KEY_VIOLATION', status: 400, message: 'Tidak dapat menghapus pelanggan karena data sudah digunakan pada transaksi' })
    }
    throw err
  }
}

export async function updateCustomer(
  id: string,
  input: Partial<Omit<Customer, 'id' | 'salesName'>>,
) {
  const pool = getPool()

  const current = await getCustomerById(id)

  const next = {
    code: input.code ?? current.code,
    name: input.name ?? current.name,
    category: input.category ?? current.category,
    phone: input.phone ?? current.phone,
    address: input.address ?? current.address,
    status: input.status ?? current.status,
    salesId: input.salesId !== undefined ? input.salesId : current.salesId,
  }

  const res = await pool.query(
    `
      update customers
      set code = $2,
          name = $3,
          category = $4,
          phone = $5,
          address = $6,
          status = $7,
          sales_id = $8,
          updated_at = now()
      where id = $1
      returning id, code, name, category, phone, address, status, sales_id as "salesId"
    `,
    [id, next.code, next.name, next.category, next.phone, next.address, next.status, next.salesId],
  )

  return res.rows[0] as Customer
}
