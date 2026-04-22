import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type Invoice = {
  id: string
  invoiceNo: string
  customerId: string
  invoiceDate: string
  dueDate: string
  totalAmount: string
  status: string
}

export async function listInvoices(params: {
  page?: number
  pageSize?: number
  q?: string
  customerId?: string
  salesId?: string
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []

  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`)
    where.push('(lower(i.invoice_no) like $1)')
  }

  if (params.customerId) {
    values.push(params.customerId)
    where.push(`i.customer_id = $${values.length}`)
  }

  if (params.salesId) {
    values.push(params.salesId)
    where.push(`c.sales_id = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `
      select count(*)::int as c 
      from invoices i
      join customers c on c.id = i.customer_id
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
        i.invoice_date::text as "invoiceDate",
        i.due_date::text as "dueDate",
        i.total_amount::text as "totalAmount",
        i.status
      from invoices i
      join customers c on c.id = i.customer_id
      ${whereSql}
      order by i.invoice_date desc, i.invoice_no desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: listRes.rows as Invoice[], total }
}

export async function getInvoiceById(id: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        id,
        invoice_no as "invoiceNo",
        customer_id as "customerId",
        invoice_date::text as "invoiceDate",
        due_date::text as "dueDate",
        total_amount::text as "totalAmount",
        status
      from invoices
      where id = $1
      limit 1
    `,
    [id],
  )
  const row = res.rows[0] as Invoice | undefined
  if (!row) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Invoice tidak ditemukan' })
  }
  return row
}

export async function getInvoiceDetail(id: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        i.id,
        i.invoice_no as "invoiceNo",
        c.name as "customerName",
        c.code as "customerCode",
        i.invoice_date::text as "invoiceDate",
        i.due_date::text as "dueDate",
        i.total_amount::text as "totalAmount",
        i.status,
        so.order_no as "soNo"
      from invoices i
      join customers c on c.id = i.customer_id
      left join sales_orders so on so.id = i.sales_order_id
      where i.id = $1
      limit 1
    `,
    [id],
  )
  const invoice = res.rows[0]
  if (!invoice) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Invoice tidak ditemukan' })
  }

  const itemsRes = await pool.query(
    `
      select
        p.sku,
        p.name as "productName",
        ii.uom as unit,
        ii.qty,
        ii.unit_price::text as "unitPrice",
        ii.discount_amount::text as "discountAmount",
        ii.line_total::text as "lineTotal"
      from invoice_items ii
      join products p on p.id = ii.product_id
      where ii.invoice_id = $1
    `,
    [invoice.id],
  )

  const paid = await getInvoicePaidTotal(invoice.id)
  
  return {
    ...invoice,
    items: itemsRes.rows,
    paid: String(paid),
    remaining: String(Math.max(0, Number(invoice.totalAmount) - paid))
  }
}

export async function getInvoicePaidTotal(invoiceId: string) {
  const pool = getPool()
  const res = await pool.query(
    `select coalesce(sum(amount), 0) as paid from payments where invoice_id = $1`,
    [invoiceId],
  )
  return Number(res.rows[0]?.paid ?? 0)
}

export async function recalcInvoiceStatus(invoiceId: string) {
  const pool = getPool()
  const invoice = await getInvoiceById(invoiceId)
  const paid = await getInvoicePaidTotal(invoiceId)
  const total = Number(invoice.totalAmount)

  const remaining = Math.max(0, total - paid)
  const today = new Date().toISOString().slice(0, 10)
  const overdue = remaining > 0 && invoice.dueDate < today

  const nextStatus =
    remaining <= 0 ? 'PAID' : overdue ? 'OVERDUE' : 'UNPAID'

  await pool.query('update invoices set status = $2, updated_at = now() where id = $1', [
    invoiceId,
    nextStatus,
  ])

  return { ...invoice, status: nextStatus, paid, remaining }
}
