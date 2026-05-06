import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

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
  const pendingSoTotal = Number(res.rows[0]?.pending_so_total ?? 0)

  return {
    invoiceTotal,
    paidTotal,
    pendingSoTotal,
    outstanding: Math.max(0, invoiceTotal - paidTotal + pendingSoTotal),
  }
}

export async function getCustomerOpenDocumentCount(customerId: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        (
          select count(*)::int
          from invoices i
          where i.customer_id = $1
            and greatest(
              0,
              i.total_amount
                - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
                - coalesce((select sum(cna.amount) from credit_note_applies cna where cna.invoice_id = i.id), 0)
            ) > 0
        ) as open_invoice_count,
        (
          select count(*)::int
          from sales_orders so
          where so.customer_id = $1
            and so.status in ('CONFIRMED', 'DELIVERED')
            and not exists (
              select 1 from invoices i2 where i2.sales_order_id = so.id
            )
        ) as open_so_without_invoice_count
    `,
    [customerId],
  )

  const openInvoiceCount = Number(res.rows[0]?.open_invoice_count ?? 0)
  const openSoWithoutInvoiceCount = Number(res.rows[0]?.open_so_without_invoice_count ?? 0)
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
  const profile = await getCustomerCreditProfile(params.customerId)
  const ar = await getCustomerOutstanding(params.customerId)
  const docs = await getCustomerOpenDocumentCount(params.customerId)
  const projected = ar.outstanding + params.newInvoiceAmount
  const projectedOpenDocumentCount = docs.openDocumentCount + 1
  const exceedsSalesOrderLimit =
    profile.salesOrderLimit > 0 && projectedOpenDocumentCount > profile.salesOrderLimit

  const exceedsLimit = profile.creditLimit > 0 && projected > profile.creditLimit

  if (profile.creditLimit <= 0) {
    if ((exceedsLimit || exceedsSalesOrderLimit) && !params.allowOverLimit && !params.isDraft) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Limit pelanggan terlampaui',
        details: {
          reason: exceedsSalesOrderLimit ? 'SALES_ORDER_LIMIT_EXCEEDED' : 'CREDIT_LIMIT_EXCEEDED',
          creditLimit: profile.creditLimit,
          salesOrderLimit: profile.salesOrderLimit,
          outstanding: ar.outstanding,
          projected,
          openInvoiceCount: docs.openInvoiceCount,
          openSoWithoutInvoiceCount: docs.openSoWithoutInvoiceCount,
          projectedOpenDocumentCount,
        },
      })
    }
    return {
      creditLimit: profile.creditLimit,
      salesOrderLimit: profile.salesOrderLimit,
      outstanding: ar.outstanding,
      projected,
      exceedsLimit,
      exceedsSalesOrderLimit,
      openInvoiceCount: docs.openInvoiceCount,
      openSoWithoutInvoiceCount: docs.openSoWithoutInvoiceCount,
      projectedOpenDocumentCount,
    }
  }

  // If overlimit and not allowed, we throw only if it's NOT a draft order needing approval
  if ((exceedsLimit || exceedsSalesOrderLimit) && !params.allowOverLimit && !params.isDraft) {
    throw new ApiError({
      code: 'CONFLICT',
      status: 409,
      message: exceedsSalesOrderLimit ? 'Limit jumlah nota terlampaui' : 'Limit kredit terlampaui',
      details: {
        reason: exceedsSalesOrderLimit ? 'SALES_ORDER_LIMIT_EXCEEDED' : 'CREDIT_LIMIT_EXCEEDED',
        creditLimit: profile.creditLimit,
        salesOrderLimit: profile.salesOrderLimit,
        outstanding: ar.outstanding,
        projected,
        openInvoiceCount: docs.openInvoiceCount,
        openSoWithoutInvoiceCount: docs.openSoWithoutInvoiceCount,
        projectedOpenDocumentCount,
      },
    })
  }

  return {
    creditLimit: profile.creditLimit,
    salesOrderLimit: profile.salesOrderLimit,
    outstanding: ar.outstanding,
    projected,
    exceedsLimit,
    exceedsSalesOrderLimit,
    openInvoiceCount: docs.openInvoiceCount,
    openSoWithoutInvoiceCount: docs.openSoWithoutInvoiceCount,
    projectedOpenDocumentCount,
  }
}

