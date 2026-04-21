import { getPool } from '../db/pool.js'

function daysBetween(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export async function listReceivables(params: {
  page?: number
  pageSize?: number
  customerId?: string
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []

  if (params.customerId) {
    values.push(params.customerId)
    where.push(`i.customer_id = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `
      select count(*)::int as c
      from invoices i
      ${whereSql}
    `,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const listRes = await pool.query(
    `
      select
        i.id,
        i.invoice_no as "invoiceNo",
        i.customer_id as "customerId",
        c.name as "customerName",
        i.invoice_date::text as "invoiceDate",
        i.due_date::text as "dueDate",
        i.total_amount::text as "totalAmount",
        i.status,
        coalesce((
          select sum(p.amount) from payments p where p.invoice_id = i.id
        ), 0)::text as "paidAmount"
      from invoices i
      join customers c on c.id = i.customer_id
      ${whereSql}
      order by i.due_date asc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  const items = listRes.rows.map((r) => {
    const totalAmount = Number(r.totalAmount)
    const paidAmount = Number(r.paidAmount)
    const remainingAmount = Math.max(0, totalAmount - paidAmount)
    return { ...r, remainingAmount: remainingAmount.toFixed(2) }
  })

  return { items, total }
}

export async function agingSummary(params: { customerId?: string }) {
  const pool = getPool()
  const where: string[] = []
  const values: unknown[] = []

  if (params.customerId) {
    values.push(params.customerId)
    where.push(`i.customer_id = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const res = await pool.query(
    `
      select
        i.id,
        i.due_date,
        i.total_amount,
        coalesce((
          select sum(p.amount) from payments p where p.invoice_id = i.id
        ), 0) as paid_amount
      from invoices i
      ${whereSql}
    `,
    values,
  )

  const now = new Date()
  const buckets = {
    '0_30': 0,
    '31_60': 0,
    '61_90': 0,
    '90_plus': 0,
  }

  for (const row of res.rows) {
    const remaining = Math.max(0, Number(row.total_amount) - Number(row.paid_amount))
    if (remaining <= 0) continue
    const due = new Date(row.due_date)
    const overdueDays = Math.max(0, daysBetween(now, due))

    if (overdueDays <= 30) buckets['0_30'] += remaining
    else if (overdueDays <= 60) buckets['31_60'] += remaining
    else if (overdueDays <= 90) buckets['61_90'] += remaining
    else buckets['90_plus'] += remaining
  }

  return buckets
}
