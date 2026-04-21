import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type Supplier = {
  id: string
  code: string
  name: string
  phone: string | null
  address: string | null
}

export async function listSuppliers(params: { page?: number; pageSize?: number; q?: string }) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize
  const q = params.q?.trim()

  const where: string[] = []
  const values: unknown[] = []
  if (q) {
    values.push(`%${q.toLowerCase()}%`)
    where.push('(lower(code) like $1 or lower(name) like $1)')
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from suppliers ${whereSql}`,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select id, code, name, phone, address
      from suppliers
      ${whereSql}
      order by created_at desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: res.rows as Supplier[], total }
}

export async function createSupplier(input: {
  code: string
  name: string
  phone?: string
  address?: string
}) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into suppliers(code, name, phone, address)
      values ($1,$2,$3,$4)
      returning id, code, name, phone, address
    `,
    [input.code, input.name, input.phone ?? null, input.address ?? null],
  )
  return res.rows[0] as Supplier
}

export async function updateSupplier(
  id: string,
  input: Partial<Omit<Supplier, 'id'>>,
) {
  const pool = getPool()

  const current = await getSupplierById(id)

  const next = {
    code: input.code ?? current.code,
    name: input.name ?? current.name,
    phone: input.phone ?? current.phone,
    address: input.address ?? current.address,
  }

  const res = await pool.query(
    `
      update suppliers
      set code = $2,
          name = $3,
          phone = $4,
          address = $5,
          updated_at = now()
      where id = $1
      returning id, code, name, phone, address
    `,
    [id, next.code, next.name, next.phone, next.address],
  )

  return res.rows[0] as Supplier
}

export async function deleteSupplier(id: string) {
  const pool = getPool()
  try {
    const res = await pool.query('delete from suppliers where id = $1 returning id', [id])
    if (res.rowCount === 0) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Pemasok tidak ditemukan' })
    }
  } catch (err: any) {
    if (err.code === '23503') {
      throw new ApiError({ code: 'FOREIGN_KEY_VIOLATION', status: 400, message: 'Tidak dapat menghapus pemasok karena data sudah digunakan pada transaksi' })
    }
    throw err
  }
}

export async function getSupplierById(id: string) {
  const pool = getPool()
  const res = await pool.query(
    `select id, code, name, phone, address from suppliers where id = $1 limit 1`,
    [id],
  )
  const row = res.rows[0] as Supplier | undefined
  if (!row) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Supplier tidak ditemukan' })
  return row
}

