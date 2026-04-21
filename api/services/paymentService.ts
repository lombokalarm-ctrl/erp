import { ApiError } from '../lib/http.js'
import { withTransaction } from '../db/tx.js'
import { getPool } from '../db/pool.js'

export async function getPaymentDetail(id: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        p.id,
        p.invoice_id as "invoiceId",
        p.method,
        p.amount::text as amount,
        p.paid_at as "paidAt",
        p.note,
        i.invoice_no as "invoiceNo",
        c.name as "customerName",
        c.code as "customerCode"
      from payments p
      join invoices i on i.id = p.invoice_id
      join customers c on c.id = i.customer_id
      where p.id = $1
      limit 1
    `,
    [id],
  )
  const payment = res.rows[0]
  if (!payment) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Pembayaran tidak ditemukan' })
  }
  return payment
}

export async function createPayment(input: {
  invoiceId: string
  method: 'CASH' | 'TRANSFER' | 'TERM'
  amount: number
  paidAt: string
  note?: string
  proofFileId?: string | null
  createdBy: string
}) {
  if (input.amount <= 0) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Amount harus lebih besar dari 0',
    })
  }

  return withTransaction(async (client) => {
    const invoiceRes = await client.query(
      `
        select id, total_amount::float as total, due_date::text as "dueDate"
        from invoices
        where id = $1
        limit 1
      `,
      [input.invoiceId],
    )
    const invoiceRow = invoiceRes.rows[0] as { id: string; total: number; dueDate: string } | undefined
    if (!invoiceRow) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Invoice tidak ditemukan' })
    }

    const paidTotalRes = await client.query(
      `select coalesce(sum(amount), 0)::float as paid from payments where invoice_id = $1`,
      [input.invoiceId],
    )
    const paidTotal = Number(paidTotalRes.rows[0]?.paid ?? 0)
    const remaining = Math.max(0, invoiceRow.total - paidTotal)

    if (input.amount > remaining) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Pembayaran melebihi sisa tagihan',
        details: { remaining },
      })
    }

    const res = await client.query(
      `
        insert into payments(
          invoice_id,
          method,
          amount,
          paid_at,
          note,
          proof_file_id,
          created_by
        )
        values ($1,$2,$3,$4,$5,$6,$7)
        returning *
      `,
      [
        input.invoiceId,
        input.method,
        input.amount,
        input.paidAt,
        input.note ?? null,
        input.proofFileId ?? null,
        input.createdBy,
      ],
    )
    const payment = res.rows[0]

    const paidAfterRes = await client.query(
      `select coalesce(sum(amount), 0)::float as paid from payments where invoice_id = $1`,
      [input.invoiceId],
    )
    const paidAfter = Number(paidAfterRes.rows[0]?.paid ?? 0)
    const remainingAfter = Math.max(0, invoiceRow.total - paidAfter)
    const today = new Date().toISOString().slice(0, 10)
    const overdue = remainingAfter > 0 && invoiceRow.dueDate < today
    const nextStatus = remainingAfter <= 0 ? 'PAID' : overdue ? 'OVERDUE' : 'UNPAID'

    await client.query(
      `update invoices set status = $2, updated_at = now() where id = $1`,
      [input.invoiceId, nextStatus],
    )

    return {
      payment,
      invoice: {
        id: input.invoiceId,
        status: nextStatus,
        paid: paidAfter,
        remaining: remainingAfter,
      },
    }
  })
}
