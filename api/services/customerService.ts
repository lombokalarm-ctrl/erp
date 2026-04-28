import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type Customer = {
  id: string
  code: string
  name: string
  ownerName?: string | null
  ktpNo?: string | null
  npwpNo?: string | null
  category: string
  phone: string | null
  email: string | null
  address: string | null
  regionId: string | null
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
    where.push('(lower(c.code) like $1 or lower(c.name) like $1 or lower(c.owner_name) like $1)')
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
        c.id, c.code, c.name,
        c.owner_name as "ownerName",
        c.ktp_no as "ktpNo",
        c.npwp_no as "npwpNo",
        c.category, c.phone, c.email, c.address,
        c.region_id as "regionId",
        c.status,
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
        c.id, c.code, c.name,
        c.owner_name as "ownerName",
        c.ktp_no as "ktpNo",
        c.npwp_no as "npwpNo",
        c.category, c.phone, c.email, c.address,
        c.region_id as "regionId",
        c.status,
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
  ownerName?: string | null
  ktpNo?: string | null
  npwpNo?: string | null
  category: string
  phone?: string | null
  email?: string | null
  address?: string | null
  regionId?: string | null
  status?: string
  salesId?: string | null
}) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into customers(
        code, name, owner_name, ktp_no, npwp_no,
        category, phone, email, address, region_id, status, sales_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      returning
        id, code, name,
        owner_name as "ownerName",
        ktp_no as "ktpNo",
        npwp_no as "npwpNo",
        category, phone, email, address,
        region_id as "regionId",
        status, sales_id as "salesId"
    `,
    [
      input.code,
      input.name,
      input.ownerName ?? null,
      input.ktpNo ?? null,
      input.npwpNo ?? null,
      input.category,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.regionId ?? null,
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
  input: Partial<{
    code: string
    name: string
    ownerName: string | null
    ktpNo: string | null
    npwpNo: string | null
    category: string
    phone: string | null
    email: string | null
    address: string | null
    regionId: string | null
    status: 'ACTIVE' | 'BLOCKED'
    salesId: string | null
  }>,
) {
  const pool = getPool()
  const sets = []
  const values = []
  let i = 1
  for (const [k, v] of Object.entries(input)) {
    if (k === 'salesId') {
      sets.push(`sales_id = $${i++}`)
      values.push(v)
    } else if (k === 'regionId') {
      sets.push(`region_id = $${i++}`)
      values.push(v)
    } else if (k === 'ownerName') {
      sets.push(`owner_name = $${i++}`)
      values.push(v)
    } else if (k === 'ktpNo') {
      sets.push(`ktp_no = $${i++}`)
      values.push(v)
    } else if (k === 'npwpNo') {
      sets.push(`npwp_no = $${i++}`)
      values.push(v)
    } else {
      sets.push(`${k} = $${i++}`)
      values.push(v)
    }
  }
  if (sets.length === 0) return await getCustomerById(id)

  sets.push(`updated_at = now()`)
  values.push(id)
  await pool.query(`update customers set ${sets.join(', ')} where id = $${i}`, values)
  return await getCustomerById(id)
}
