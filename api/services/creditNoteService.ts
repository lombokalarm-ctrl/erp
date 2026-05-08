import type { PoolClient } from 'pg'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { ApiError } from '../lib/http.js'

function pad4(n: number) {
  return String(n).padStart(4, '0')
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

async function generateCreditNo(client: PoolClient, creditDate: string) {
  const dateKey = creditDate.replace(/-/g, '')
  const like = `CN-${dateKey}-%`
  const res = await client.query(
    `select credit_no from credit_notes where credit_no like $1 order by credit_no desc limit 1`,
    [like],
  )
  const last = res.rows[0]?.credit_no as string | undefined
  const nextSeq = last ? Number(last.split('-').pop()) + 1 : 1
  return `CN-${dateKey}-${pad4(nextSeq)}`
}

async function recalcCreditNoteBalanceTx(client: PoolClient, creditNoteId: string) {
  const cnRes = await client.query(
    `select id, total_amount::float as total from credit_notes where id = $1 limit 1`,
    [creditNoteId],
  )
  const cn = cnRes.rows[0] as { id: string; total: number } | undefined
  if (!cn) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Note kredit tidak ditemukan' })

  const appliedRes = await client.query(
    `select coalesce(sum(amount), 0)::float as applied from credit_note_applies where credit_note_id = $1`,
    [creditNoteId],
  )
  const applied = roundCurrency(Number(appliedRes.rows[0]?.applied ?? 0))
  const remaining = roundCurrency(Math.max(0, Number(cn.total) - applied))

  let status: 'POSTED' | 'PARTIALLY_APPLIED' | 'FULLY_APPLIED'
  if (applied <= 0) status = 'POSTED'
  else if (remaining <= 0) status = 'FULLY_APPLIED'
  else status = 'PARTIALLY_APPLIED'

  await client.query(
    `
      update credit_notes
      set applied_amount = $2,
          remaining_amount = $3,
          status = $4,
          updated_at = now()
      where id = $1
    `,
    [creditNoteId, applied, remaining, status],
  )

  return { applied, remaining, status }
}

async function getInvoiceRemainingTx(client: PoolClient, invoiceId: string) {
  const invRes = await client.query(
    `select id, total_amount::float as total from invoices where id = $1 limit 1`,
    [invoiceId],
  )
  const inv = invRes.rows[0] as { id: string; total: number } | undefined
  if (!inv) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Invoice tidak ditemukan' })

  const paidRes = await client.query(
    `select coalesce(sum(amount), 0)::float as paid from payments where invoice_id = $1`,
    [invoiceId],
  )
  const creditRes = await client.query(
    `select coalesce(sum(amount), 0)::float as credited from credit_note_applies where invoice_id = $1`,
    [invoiceId],
  )
  const paid = roundCurrency(Number(paidRes.rows[0]?.paid ?? 0))
  const credited = roundCurrency(Number(creditRes.rows[0]?.credited ?? 0))
  const remaining = roundCurrency(Math.max(0, Number(inv.total) - paid - credited))

  return { total: Number(inv.total), paid, credited, remaining }
}

export async function applyCreditNoteToInvoice(params: {
  creditNoteId: string
  invoiceId: string
  amount?: number
  createdBy: string
  client?: PoolClient
}) {
  const applyTx = async (client: PoolClient) => {
    const cnRes = await client.query(
      `select id, remaining_amount::float as remaining from credit_notes where id = $1 limit 1`,
      [params.creditNoteId],
    )
    const cn = cnRes.rows[0] as { id: string; remaining: number } | undefined
    if (!cn) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Note kredit tidak ditemukan' })
    if (cn.remaining <= 0) {
      throw new ApiError({ code: 'CONFLICT', status: 409, message: 'Saldo note kredit sudah habis' })
    }

    const invoiceBalance = await getInvoiceRemainingTx(client, params.invoiceId)
    if (invoiceBalance.remaining <= 0) {
      throw new ApiError({ code: 'CONFLICT', status: 409, message: 'Invoice sudah lunas' })
    }

    const requestedAmount = params.amount != null ? roundCurrency(params.amount) : invoiceBalance.remaining
    if (requestedAmount <= 0) {
      throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Nominal apply harus lebih besar dari 0' })
    }
    const applyAmount = Math.min(requestedAmount, cn.remaining, invoiceBalance.remaining)

    await client.query(
      `
        insert into credit_note_applies(credit_note_id, invoice_id, amount, created_by)
        values ($1, $2, $3, $4)
      `,
      [params.creditNoteId, params.invoiceId, applyAmount, params.createdBy],
    )

    const cnBalance = await recalcCreditNoteBalanceTx(client, params.creditNoteId)
    return { applyAmount, creditNote: cnBalance }
  }

  if (params.client) return applyTx(params.client)
  return withTransaction(async (client) => applyTx(client))
}

export async function createCreditNoteFromSalesReturn(params: {
  returnId: string
  sourceInvoiceId?: string
  salesOrderId?: string
  customerId: string
  creditDate: string
  reason?: string
  notes?: string
  createdBy: string
  items: Array<{
    sourceReturnItemId?: string
    sourceInvoiceItemId?: string
    productId: string
    qty: number
    uom: string
    uomToPcs: number
    qtyPcs: number
    qtyBase?: number
    baseUomId?: string | null
    conversionSource?: 'legacy' | 'product_uom_v2'
    unitPrice: number
    discountAmount: number
    lineTotal: number
    reason?: string
  }>
}) {
  return withTransaction(async (client) => {
    if (!params.items.length) {
      throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Item note kredit kosong' })
    }

    const discount = roundCurrency(params.items.reduce((a, it) => a + it.discountAmount, 0))
    const lineTotal = roundCurrency(params.items.reduce((a, it) => a + it.lineTotal, 0))
    const subtotal = roundCurrency(lineTotal + discount)
    const total = roundCurrency(Math.max(0, subtotal - discount))
    if (total <= 0) {
      throw new ApiError({ code: 'CONFLICT', status: 409, message: 'Nilai note kredit tidak valid' })
    }

    const creditNo = await generateCreditNo(client, params.creditDate)
    const cnRes = await client.query(
      `
        insert into credit_notes(
          credit_no,
          customer_id,
          return_id,
          sales_order_id,
          invoice_id,
          credit_date,
          reason,
          subtotal_amount,
          discount_amount,
          tax_amount,
          total_amount,
          applied_amount,
          remaining_amount,
          status,
          notes,
          created_by,
          posted_by,
          posted_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,0,$10,'POSTED',$11,$12,$12,now())
        returning id
      `,
      [
        creditNo,
        params.customerId,
        params.returnId,
        params.salesOrderId ?? null,
        params.sourceInvoiceId ?? null,
        params.creditDate,
        params.reason ?? null,
        subtotal,
        discount,
        total,
        params.notes ?? null,
        params.createdBy,
      ],
    )
    const creditNoteId = String(cnRes.rows[0].id)

    for (const item of params.items) {
      await client.query(
        `
          insert into credit_note_items(
            credit_note_id,
            product_id,
            source_invoice_item_id,
            source_return_item_id,
            qty,
            uom,
            uom_to_pcs,
            qty_pcs,
            unit_price,
            discount_amount,
            line_total,
            reason
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          creditNoteId,
          item.productId,
          item.sourceInvoiceItemId ?? null,
          item.sourceReturnItemId ?? null,
          item.qty,
          item.uom,
          item.uomToPcs,
          item.qtyPcs,
          item.unitPrice,
          item.discountAmount,
          item.lineTotal,
          item.reason ?? null,
        ],
      )
    }

    let appliedResult: { applyAmount: number } | null = null
    if (params.sourceInvoiceId) {
      const invoiceBalance = await getInvoiceRemainingTx(client, params.sourceInvoiceId)
      if (invoiceBalance.remaining > 0) {
        appliedResult = await applyCreditNoteToInvoice({
          creditNoteId,
          invoiceId: params.sourceInvoiceId,
          createdBy: params.createdBy,
          client,
        })
      }
    }

    const balance = await recalcCreditNoteBalanceTx(client, creditNoteId)
    await client.query(
      `
        update returns
        set credit_note_id = $2,
            financial_status = 'CREDIT_NOTE_POSTED',
            updated_at = now()
        where id = $1
      `,
      [params.returnId, creditNoteId],
    )

    return {
      id: creditNoteId,
      creditNo,
      totalAmount: total,
      appliedAmount: balance.applied,
      remainingAmount: balance.remaining,
      autoAppliedAmount: appliedResult?.applyAmount ?? 0,
    }
  })
}

export async function listCreditNotes(params: {
  page?: number
  pageSize?: number
  q?: string
  customerId?: string
  status?: 'POSTED' | 'PARTIALLY_APPLIED' | 'FULLY_APPLIED' | 'DRAFT' | 'CANCELLED'
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []
  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`)
    where.push(`(lower(cn.credit_no) like $${values.length})`)
  }
  if (params.customerId) {
    values.push(params.customerId)
    where.push(`cn.customer_id = $${values.length}`)
  }
  if (params.status) {
    values.push(params.status)
    where.push(`cn.status = $${values.length}`)
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from credit_notes cn ${whereSql}`,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const listRes = await pool.query(
    `
      select
        cn.id,
        cn.credit_no as "creditNo",
        cn.credit_date::text as "creditDate",
        c.code as "customerCode",
        c.name as "customerName",
        cn.status,
        cn.total_amount::text as "totalAmount",
        cn.applied_amount::text as "appliedAmount",
        cn.remaining_amount::text as "remainingAmount",
        i.invoice_no as "invoiceNo",
        r.return_no as "returnNo"
      from credit_notes cn
      join customers c on c.id = cn.customer_id
      left join invoices i on i.id = cn.invoice_id
      left join returns r on r.id = cn.return_id
      ${whereSql}
      order by cn.credit_date desc, cn.credit_no desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: listRes.rows, total }
}

export async function getCreditNoteDetail(id: string) {
  const pool = getPool()
  const headerRes = await pool.query(
    `
      select
        cn.id,
        cn.credit_no as "creditNo",
        cn.credit_date::text as "creditDate",
        cn.status,
        cn.reason,
        cn.notes,
        cn.total_amount::text as "totalAmount",
        cn.applied_amount::text as "appliedAmount",
        cn.remaining_amount::text as "remainingAmount",
        c.code as "customerCode",
        c.name as "customerName",
        i.invoice_no as "invoiceNo",
        r.return_no as "returnNo"
      from credit_notes cn
      join customers c on c.id = cn.customer_id
      left join invoices i on i.id = cn.invoice_id
      left join returns r on r.id = cn.return_id
      where cn.id = $1
      limit 1
    `,
    [id],
  )
  const header = headerRes.rows[0]
  if (!header) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Note kredit tidak ditemukan' })
  }

  const itemsRes = await pool.query(
    `
      select
        cni.id,
        p.sku,
        p.name as "productName",
        cni.qty::text as qty,
        cni.uom,
        cni.unit_price::text as "unitPrice",
        cni.discount_amount::text as "discountAmount",
        cni.line_total::text as "lineTotal",
        cni.reason
      from credit_note_items cni
      join products p on p.id = cni.product_id
      where cni.credit_note_id = $1
      order by p.name asc
    `,
    [id],
  )

  const appliesRes = await pool.query(
    `
      select
        a.id,
        a.apply_date as "applyDate",
        a.amount::text as amount,
        i.id as "invoiceId",
        i.invoice_no as "invoiceNo"
      from credit_note_applies a
      join invoices i on i.id = a.invoice_id
      where a.credit_note_id = $1
      order by a.apply_date desc
    `,
    [id],
  )

  return { ...header, items: itemsRes.rows, applies: appliesRes.rows }
}

export async function getInvoiceCreditedTotal(invoiceId: string) {
  const pool = getPool()
  const res = await pool.query(
    `select coalesce(sum(amount), 0)::float as credited from credit_note_applies where invoice_id = $1`,
    [invoiceId],
  )
  return roundCurrency(Number(res.rows[0]?.credited ?? 0))
}
