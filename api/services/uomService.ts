import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type Uom = {
  id: string
  code: string
  name: string
  isActive: boolean
}

export async function listUoms(params: {
  page?: number
  pageSize?: number
  q?: string
  isActive?: boolean
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize
  const values: unknown[] = []
  const where: string[] = []

  const q = params.q?.trim()
  if (q) {
    values.push(`%${q.toLowerCase()}%`)
    where.push(`(lower(code) like $${values.length} or lower(name) like $${values.length})`)
  }
  if (typeof params.isActive === 'boolean') {
    values.push(params.isActive)
    where.push(`is_active = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(`select count(*)::int as c from uoms ${whereSql}`, values)
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const listRes = await pool.query(
    `
      select
        id,
        code,
        name,
        is_active as "isActive"
      from uoms
      ${whereSql}
      order by code asc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: listRes.rows as Uom[], total }
}

export async function createUom(input: { code: string; name: string; isActive?: boolean }) {
  const pool = getPool()
  const code = input.code.trim().toLowerCase()
  const name = input.name.trim()
  if (!code || !name) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Kode dan nama satuan wajib diisi',
    })
  }
  const res = await pool.query(
    `
      insert into uoms(code, name, is_active)
      values ($1, $2, $3)
      returning id, code, name, is_active as "isActive"
    `,
    [code, name, input.isActive ?? true],
  )
  return res.rows[0] as Uom
}

export async function updateUom(id: string, input: Partial<Omit<Uom, 'id'>>) {
  const pool = getPool()
  const currentRes = await pool.query(
    `select id, code, name, is_active as "isActive" from uoms where id = $1 limit 1`,
    [id],
  )
  const current = currentRes.rows[0] as Uom | undefined
  if (!current) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Satuan tidak ditemukan' })
  }

  const nextCode = (input.code ?? current.code).trim().toLowerCase()
  const nextName = (input.name ?? current.name).trim()
  const nextActive = input.isActive ?? current.isActive

  const res = await pool.query(
    `
      update uoms
      set code = $2,
          name = $3,
          is_active = $4,
          updated_at = now()
      where id = $1
      returning id, code, name, is_active as "isActive"
    `,
    [id, nextCode, nextName, nextActive],
  )
  return res.rows[0] as Uom
}

export async function deleteUom(id: string) {
  const pool = getPool()
  try {
    const res = await pool.query('delete from uoms where id = $1 returning id', [id])
    if (res.rowCount === 0) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Satuan tidak ditemukan' })
    }
  } catch (err: any) {
    if (err.code === '23503') {
      throw new ApiError({
        code: 'FOREIGN_KEY_VIOLATION',
        status: 400,
        message: 'Satuan tidak dapat dihapus karena sudah dipakai pada mapping produk',
      })
    }
    throw err
  }
}
