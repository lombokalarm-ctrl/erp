import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type Supplier = {
  id: string
  code: string
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  isActive: boolean
}

export type SupplierImportRow = {
  code?: string
  name?: string
}

function toNullableText(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export async function listSuppliers(params: {
  page?: number
  pageSize?: number
  q?: string
  isActive?: boolean | 'all'
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize
  const q = params.q?.trim()

  const where: string[] = []
  const values: unknown[] = []
  if (params.isActive !== 'all') {
    values.push(params.isActive ?? true)
    where.push(`is_active = $${values.length}`)
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`)
    where.push(
      `(lower(code) like $${values.length} or lower(name) like $${values.length} or lower(coalesce(contact_person, '')) like $${values.length} or lower(coalesce(phone, '')) like $${values.length} or lower(coalesce(email, '')) like $${values.length})`,
    )
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from suppliers ${whereSql}`,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select id, code, name, contact_person as "contactPerson", phone, email, address, is_active as "isActive"
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
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  isActive?: boolean
}) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into suppliers(code, name, contact_person, phone, email, address, is_active)
      values ($1,$2,$3,$4,$5,$6,$7)
      returning id, code, name, contact_person as "contactPerson", phone, email, address, is_active as "isActive"
    `,
    [
      input.code,
      input.name,
      toNullableText(input.contactPerson),
      toNullableText(input.phone),
      toNullableText(input.email),
      toNullableText(input.address),
      input.isActive ?? true,
    ],
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
    contactPerson:
      input.contactPerson !== undefined ? toNullableText(input.contactPerson) : current.contactPerson,
    phone: input.phone !== undefined ? toNullableText(input.phone) : current.phone,
    email: input.email !== undefined ? toNullableText(input.email) : current.email,
    address: input.address !== undefined ? toNullableText(input.address) : current.address,
    isActive: input.isActive ?? current.isActive,
  }

  const res = await pool.query(
    `
      update suppliers
      set code = $2,
          name = $3,
          contact_person = $4,
          phone = $5,
          email = $6,
          address = $7,
          is_active = $8,
          updated_at = now()
      where id = $1
      returning id, code, name, contact_person as "contactPerson", phone, email, address, is_active as "isActive"
    `,
    [id, next.code, next.name, next.contactPerson, next.phone, next.email, next.address, next.isActive],
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
    `select id, code, name, contact_person as "contactPerson", phone, email, address, is_active as "isActive" from suppliers where id = $1 limit 1`,
    [id],
  )
  const row = res.rows[0] as Supplier | undefined
  if (!row) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Supplier tidak ditemukan' })
  return row
}

export async function importSuppliers(rows: SupplierImportRow[]) {
  const pool = getPool()
  const prepared = rows.filter((row) => row.code?.trim() || row.name?.trim())
  let created = 0
  let updated = 0
  const errors: Array<{ row: number; message: string; code?: string }> = []

  for (let i = 0; i < prepared.length; i++) {
    const row = prepared[i]
    const rowNo = i + 2
    try {
      const code = row.code?.trim()
      const name = row.name?.trim()
      if (!code || !name) {
        throw new Error('Kolom code dan name wajib diisi')
      }

      const existingRes = await pool.query(
        `select id from suppliers where lower(code) = lower($1) limit 1`,
        [code],
      )
      const existingId = existingRes.rows[0]?.id as string | undefined

      if (existingId) {
        await updateSupplier(existingId, { code, name })
        updated += 1
      } else {
        await createSupplier({ code, name })
        created += 1
      }
    } catch (err: any) {
      errors.push({
        row: rowNo,
        code: row.code,
        message: err instanceof ApiError ? err.message : String(err?.message ?? err),
      })
    }
  }

  return {
    total: prepared.length,
    created,
    updated,
    failed: errors.length,
    errors,
  }
}

