import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type CreditReasonType = 'CREDIT_LIMIT' | 'DOCUMENT_LIMIT'

export type CreditOpenDocument = {
  type: 'INVOICE' | 'SALES_ORDER'
  id: string
  number: string
  date: string
  totalAmount: number
  remainingAmount: number
  status: string
}

export type CreditValidationResult = {
  creditLimit: number
  salesOrderLimit: number
  currentOutstanding: number
  outstanding: number
  newOrderAmount: number
  projectedOutstanding: number
  projected: number
  exceedsLimit: boolean
  exceedsSalesOrderLimit: boolean
  openInvoiceCount: number
  openSoWithoutInvoiceCount: number
  currentOpenDocumentCount: number
  projectedOpenDocumentCount: number
  openDocuments: CreditOpenDocument[]
  reasonTypes: CreditReasonType[]
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export async function getCustomerOutstanding(customerId: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        coalesce(sum(i.total_amount), 0) as invoice_total,
        coalesce((
          select sum(p.amount) from payments p where p.invoice_id in (
            select id from invoices where customer_id = $1
          )
        ), 0) as paid_total,
        coalesce((
          select sum(cna.amount) from credit_note_applies cna where cna.invoice_id in (
            select id from invoices where customer_id = $1
          )
        ), 0) as credited_total,
        coalesce((
          select sum(total_amount) from sales_orders
          where customer_id = $1
            and delivery_status = 'PENDING'
            and status = 'CONFIRMED'
            and not exists (
              select 1 from invoices i2 where i2.sales_order_id = sales_orders.id
            )
        ), 0) as pending_so_total
      from invoices i
      where i.customer_id = $1
    `,
    [customerId],
  )

  const invoiceTotal = Number(res.rows[0]?.invoice_total ?? 0)
  const paidTotal = Number(res.rows[0]?.paid_total ?? 0)
  const creditedTotal = Number(res.rows[0]?.credited_total ?? 0)
  const pendingSoTotal = Number(res.rows[0]?.pending_so_total ?? 0)

  return {
    invoiceTotal,
    paidTotal,
    creditedTotal,
    pendingSoTotal,
    outstanding: Math.max(0, roundCurrency(invoiceTotal - paidTotal - creditedTotal + pendingSoTotal)),
  }
}

export async function getCustomerOpenDocuments(customerId: string): Promise<CreditOpenDocument[]> {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        'INVOICE'::text as type,
        i.id,
        i.invoice_no as number,
        i.invoice_date::text as date,
        i.total_amount::float as "totalAmount",
        greatest(
          0,
          i.total_amount
            - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
            - coalesce((select sum(cna.amount) from credit_note_applies cna where cna.invoice_id = i.id), 0)
        )::float as "remainingAmount",
        i.status
      from invoices i
      where i.customer_id = $1
        and greatest(
          0,
          i.total_amount
            - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
            - coalesce((select sum(cna.amount) from credit_note_applies cna where cna.invoice_id = i.id), 0)
        ) > 0

      union all

      select
        'SALES_ORDER'::text as type,
        so.id,
        so.order_no as number,
        so.order_date::text as date,
        so.total_amount::float as "totalAmount",
        so.total_amount::float as "remainingAmount",
        so.status
      from sales_orders so
      where so.customer_id = $1
        and so.status in ('CONFIRMED', 'DELIVERED')
        and not exists (
          select 1 from invoices i2 where i2.sales_order_id = so.id
        )

      order by date asc, number asc
    `,
    [customerId],
  )

  return (res.rows as Array<{
    type: 'INVOICE' | 'SALES_ORDER'
    id: string
    number: string
    date: string
    totalAmount: number | string
    remainingAmount: number | string
    status: string
  }>).map((row) => ({
    type: row.type,
    id: row.id,
    number: row.number,
    date: row.date,
    totalAmount: roundCurrency(Number(row.totalAmount ?? 0)),
    remainingAmount: roundCurrency(Number(row.remainingAmount ?? 0)),
    status: row.status,
  }))
}

export async function getCustomerOpenDocumentCount(customerId: string) {
  const openDocuments = await getCustomerOpenDocuments(customerId)
  const openInvoiceCount = openDocuments.filter((doc) => doc.type === 'INVOICE').length
  const openSoWithoutInvoiceCount = openDocuments.filter((doc) => doc.type === 'SALES_ORDER').length
  return {
    openInvoiceCount,
    openSoWithoutInvoiceCount,
    openDocumentCount: openInvoiceCount + openSoWithoutInvoiceCount,
  }
}

export async function getCustomerCreditProfile(customerId: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select credit_limit, sales_order_limit, payment_term_days
      from customer_credit_profiles
      where customer_id = $1
      limit 1
    `,
    [customerId],
  )
  const row = res.rows[0] as
    | { credit_limit: string | number; sales_order_limit: string | number; payment_term_days: number }
    | undefined
  return row
    ? {
        creditLimit: Number(row.credit_limit),
        salesOrderLimit: Number(row.sales_order_limit),
        paymentTermDays: Number(row.payment_term_days),
      }
    : { creditLimit: 0, salesOrderLimit: 0, paymentTermDays: 0 }
}

export async function validateCreditOrThrow(params: {
  customerId: string
  newInvoiceAmount: number
  allowOverLimit: boolean
  isDraft?: boolean
}) {
  const [profile, ar, openDocuments] = await Promise.all([
    getCustomerCreditProfile(params.customerId),
    getCustomerOutstanding(params.customerId),
    getCustomerOpenDocuments(params.customerId),
  ])

  const openInvoiceCount = openDocuments.filter((doc) => doc.type === 'INVOICE').length
  const openSoWithoutInvoiceCount = openDocuments.filter((doc) => doc.type === 'SALES_ORDER').length
  const currentOpenDocumentCount = openDocuments.length
  const newOrderAmount = roundCurrency(params.newInvoiceAmount)
  const projectedOutstanding = roundCurrency(ar.outstanding + newOrderAmount)
  const projectedOpenDocumentCount = currentOpenDocumentCount + 1
  const exceedsSalesOrderLimit =
    profile.salesOrderLimit > 0 && projectedOpenDocumentCount > profile.salesOrderLimit

  const exceedsLimit = profile.creditLimit > 0 && projectedOutstanding > profile.creditLimit
  const reasonTypes: CreditReasonType[] = []
  if (exceedsLimit) reasonTypes.push('CREDIT_LIMIT')
  if (exceedsSalesOrderLimit) reasonTypes.push('DOCUMENT_LIMIT')

  const result: CreditValidationResult = {
    creditLimit: profile.creditLimit,
    salesOrderLimit: profile.salesOrderLimit,
    currentOutstanding: ar.outstanding,
    outstanding: ar.outstanding,
    newOrderAmount,
    projectedOutstanding,
    projected: projectedOutstanding,
    exceedsLimit,
    exceedsSalesOrderLimit,
    openInvoiceCount,
    openSoWithoutInvoiceCount,
    currentOpenDocumentCount,
    projectedOpenDocumentCount,
    openDocuments,
    reasonTypes,
  }

  const message =
    exceedsLimit && exceedsSalesOrderLimit
      ? 'Limit kredit dan jumlah nota terlampaui'
      : exceedsSalesOrderLimit
      ? 'Limit jumlah nota terlampaui'
      : 'Limit kredit terlampaui'

  if (profile.creditLimit <= 0) {
    if ((exceedsLimit || exceedsSalesOrderLimit) && !params.allowOverLimit && !params.isDraft) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message,
        details: result,
      })
    }
    return result
  }

  // If overlimit and not allowed, we throw only if it's NOT a draft order needing approval
  if ((exceedsLimit || exceedsSalesOrderLimit) && !params.allowOverLimit && !params.isDraft) {
    throw new ApiError({
      code: 'CONFLICT',
      status: 409,
      message,
      details: result,
    })
  }

  return result
}
