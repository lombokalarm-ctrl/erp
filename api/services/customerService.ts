import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'
import { upsertCreditProfile } from './customerCreditService.js'

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
  regionId?: string
  includeUnassigned?: boolean
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
    const salesIdParamIndex = values.length
    if (params.includeUnassigned) {
      where.push(`(c.sales_id = $${salesIdParamIndex} or c.sales_id is null)`)
    } else {
      where.push(`c.sales_id = $${salesIdParamIndex}`)
    }
  }

  if (params.regionId) {
    values.push(params.regionId)
    where.push(`c.region_id = $${values.length}`)
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

export type CustomerImportRow = {
  code: string
  name: string
  ownerName?: string | null
  ktpNo?: string | null
  npwpNo?: string | null
  category?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  regionId?: string | null
  regionName?: string | null
  status?: string | null
  salesId?: string | null
  salesEmail?: string | null
  creditLimit?: number | null
  salesOrderLimit?: number | null
  paymentTermDays?: number | null
}

function normalizeCategory(input?: string | null) {
  if (!input) return 'RETAIL'
  const value = input.trim().toUpperCase()
  const allowed = ['RETAIL', 'GROSIR', 'MODERN RETAIL', 'HOREKA', 'NASIONAL MODERN RETAIL']
  if (!allowed.includes(value)) {
    throw new Error(
      `Kategori "${input}" tidak valid. Gunakan: ${allowed.join(', ')}`,
    )
  }
  return value
}

function normalizeStatus(input?: string | null) {
  if (!input) return 'ACTIVE'
  const value = input.trim().toUpperCase()
  if (!['ACTIVE', 'BLOCKED'].includes(value)) {
    throw new Error('Status harus ACTIVE atau BLOCKED')
  }
  return value as 'ACTIVE' | 'BLOCKED'
}

export async function importCustomers(rows: CustomerImportRow[]) {
  const pool = getPool()
  const prepared = rows.filter((r) => r.code?.trim() || r.name?.trim())
  const salesEmailSet = Array.from(
    new Set(
      prepared
        .map((r) => r.salesEmail?.trim().toLowerCase())
        .filter((v): v is string => Boolean(v)),
    ),
  )
  const regionNameSet = Array.from(
    new Set(
      prepared
        .map((r) => r.regionName?.trim().toLowerCase())
        .filter((v): v is string => Boolean(v)),
    ),
  )

  const salesByEmail = new Map<string, string>()
  if (salesEmailSet.length > 0) {
    const salesRes = await pool.query(
      `
        select id, lower(email) as email
        from users
        where lower(email) = any($1)
      `,
      [salesEmailSet],
    )
    for (const row of salesRes.rows as Array<{ id: string; email: string }>) {
      salesByEmail.set(row.email, row.id)
    }
  }

  const regionByName = new Map<string, string>()
  if (regionNameSet.length > 0) {
    const regionRes = await pool.query(
      `
        select id, lower(name) as name
        from regions
        where lower(name) = any($1)
      `,
      [regionNameSet],
    )
    for (const row of regionRes.rows as Array<{ id: string; name: string }>) {
      regionByName.set(row.name, row.id)
    }
  }

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

      const category = normalizeCategory(row.category)
      const status = normalizeStatus(row.status)

      let salesId = row.salesId?.trim() || null
      if (!salesId && row.salesEmail?.trim()) {
        const byEmail = salesByEmail.get(row.salesEmail.trim().toLowerCase())
        if (!byEmail) {
          throw new Error(`Sales email "${row.salesEmail}" tidak ditemukan`)
        }
        salesId = byEmail
      }

      let regionId = row.regionId?.trim() || null
      if (!regionId && row.regionName?.trim()) {
        const byRegionName = regionByName.get(row.regionName.trim().toLowerCase())
        if (!byRegionName) {
          throw new Error(`Wilayah "${row.regionName}" tidak ditemukan`)
        }
        regionId = byRegionName
      }

      const existingRes = await pool.query(
        `select id from customers where lower(code) = lower($1) limit 1`,
        [code],
      )
      const existingId = existingRes.rows[0]?.id as string | undefined
      let customerId = existingId

      if (existingId) {
        await updateCustomer(existingId, {
          code,
          name,
          ownerName: row.ownerName?.trim() || null,
          ktpNo: row.ktpNo?.trim() || null,
          npwpNo: row.npwpNo?.trim() || null,
          category,
          phone: row.phone?.trim() || null,
          email: row.email?.trim() || null,
          address: row.address?.trim() || null,
          regionId,
          status,
          salesId,
        })
        updated += 1
      } else {
        const createdCustomer = await createCustomer({
          code,
          name,
          ownerName: row.ownerName?.trim() || null,
          ktpNo: row.ktpNo?.trim() || null,
          npwpNo: row.npwpNo?.trim() || null,
          category,
          phone: row.phone?.trim() || null,
          email: row.email?.trim() || null,
          address: row.address?.trim() || null,
          regionId,
          status,
          salesId,
        })
        customerId = createdCustomer.id
        created += 1
      }

      const hasCredit =
        row.creditLimit != null || row.salesOrderLimit != null || row.paymentTermDays != null
      if (hasCredit && customerId) {
        await upsertCreditProfile({
          customerId,
          creditLimit: Number(row.creditLimit ?? 0),
          salesOrderLimit: Number(row.salesOrderLimit ?? 0),
          paymentTermDays: Number(row.paymentTermDays ?? 0),
        })
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
