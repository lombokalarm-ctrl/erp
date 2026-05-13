import type { PoolClient } from 'pg'
import { ApiError } from '../lib/http.js'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'

function pad4(n: number) {
  return String(n).padStart(4, '0')
}

function normalizeCode(input: string) {
  return input.trim().toLowerCase()
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + Math.trunc(days))
  return d.toISOString().slice(0, 10)
}

async function generateInvoiceNumber(client: PoolClient, invoiceDate: string) {
  const dateKey = invoiceDate.replace(/-/g, '')
  const like = `FB-${dateKey}-%`
  const res = await client.query(
    `select invoice_no as no from purchase_invoices where invoice_no like $1 order by invoice_no desc limit 1`,
    [like],
  )
  const last = res.rows[0]?.no as string | undefined
  const nextSeq = last ? Number(last.split('-').pop()) + 1 : 1
  return `FB-${dateKey}-${pad4(nextSeq)}`
}

async function getToBaseFactor(client: PoolClient, productId: string, uomCode: string) {
  const code = normalizeCode(uomCode)
  const res = await client.query(
    `
      select pu.to_base_factor::numeric as "toBaseFactor"
      from product_uoms pu
      join uoms u on u.id = pu.uom_id
      where pu.product_id = $1
        and u.code = $2
      limit 1
    `,
    [productId, code],
  )
  const row = res.rows[0] as { toBaseFactor: string } | undefined
  if (!row) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: `Mapping satuan produk tidak ditemukan untuk ${code}`,
    })
  }
  return Number(row.toBaseFactor ?? 0)
}

function calcLine(params: {
  qty: number
  basePrice: number
  disc1Type: 'PERCENT' | 'AMOUNT'
  disc1Value: number
  disc2Type: 'PERCENT' | 'AMOUNT'
  disc2Value: number
}) {
  const qty = Number(params.qty)
  const basePrice = Number(params.basePrice)
  const disc1Value = Number(params.disc1Value)
  const disc2Value = Number(params.disc2Value)

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Qty harus > 0' })
  }
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Harga dasar tidak valid' })
  }
  if (!Number.isFinite(disc1Value) || disc1Value < 0 || !Number.isFinite(disc2Value) || disc2Value < 0) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Nilai diskon tidak valid' })
  }
  if (params.disc1Type === 'PERCENT' && disc1Value > 100) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Diskon 1 (%) maksimal 100' })
  }
  if (params.disc2Type === 'PERCENT' && disc2Value > 100) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Diskon 2 (%) maksimal 100' })
  }

  const grossUnit = basePrice
  const disc1Unit = params.disc1Type === 'PERCENT' ? (grossUnit * disc1Value) / 100 : disc1Value
  const after1Unit = Math.max(0, grossUnit - disc1Unit)
  const disc2Unit = params.disc2Type === 'PERCENT' ? (after1Unit * disc2Value) / 100 : disc2Value
  const netUnit = Math.max(0, after1Unit - disc2Unit)

  const lineGross = grossUnit * qty
  const lineDiscount = (disc1Unit + disc2Unit) * qty
  const lineNet = netUnit * qty

  return {
    netUnitPrice: netUnit,
    lineGross,
    lineDiscount,
    lineNet,
  }
}

export async function listPurchaseInvoices(params: {
  page?: number
  pageSize?: number
  supplierId?: string
  warehouseId?: string
  status?: 'DRAFT' | 'POSTED' | 'CANCELLED'
  fromDate?: string
  toDate?: string
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []
  if (params.supplierId) {
    values.push(params.supplierId)
    where.push(`pi.supplier_id = $${values.length}`)
  }
  if (params.warehouseId) {
    values.push(params.warehouseId)
    where.push(`pi.warehouse_id = $${values.length}`)
  }
  if (params.status) {
    values.push(params.status)
    where.push(`pi.status = $${values.length}`)
  }
  if (params.fromDate) {
    values.push(params.fromDate)
    where.push(`pi.invoice_date >= $${values.length}::date`)
  }
  if (params.toDate) {
    values.push(params.toDate)
    where.push(`pi.invoice_date <= $${values.length}::date`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `
      select count(*)::int as c
      from purchase_invoices pi
      ${whereSql}
    `,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select
        pi.id,
        pi.invoice_no as "invoiceNo",
        pi.invoice_date::text as "invoiceDate",
        pi.term_days::int as "termDays",
        pi.due_date::text as "dueDate",
        pi.status,
        w.code as "warehouseCode",
        w.name as "warehouseName",
        s.name as "supplierName",
        coalesce(sum(i.line_gross), 0)::text as "grossAmount",
        coalesce(sum(i.line_discount), 0)::text as "discountAmount",
        coalesce(sum(i.line_net), 0)::text as "netAmount",
        count(i.id)::int as "itemCount"
      from purchase_invoices pi
      join warehouses w on w.id = pi.warehouse_id
      join suppliers s on s.id = pi.supplier_id
      left join purchase_invoice_items i on i.purchase_invoice_id = pi.id
      ${whereSql}
      group by
        pi.id, pi.invoice_no, pi.invoice_date, pi.term_days, pi.due_date, pi.status,
        w.code, w.name, s.name
      order by pi.invoice_date desc, pi.invoice_no desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: res.rows, total }
}

export async function getPurchaseInvoiceDetail(id: string) {
  const pool = getPool()
  const headerRes = await pool.query(
    `
      select
        pi.id,
        pi.invoice_no as "invoiceNo",
        pi.invoice_date::text as "invoiceDate",
        pi.warehouse_id as "warehouseId",
        w.code as "warehouseCode",
        w.name as "warehouseName",
        pi.supplier_id as "supplierId",
        s.name as "supplierName",
        pi.term_days::int as "termDays",
        pi.due_date::text as "dueDate",
        pi.status,
        pi.notes
      from purchase_invoices pi
      join warehouses w on w.id = pi.warehouse_id
      join suppliers s on s.id = pi.supplier_id
      where pi.id = $1
      limit 1
    `,
    [id],
  )
  const header = headerRes.rows[0]
  if (!header) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Faktur pembelian tidak ditemukan' })
  }

  const itemsRes = await pool.query(
    `
      select
        i.id,
        i.product_id as "productId",
        p.sku,
        p.name as "productName",
        i.uom_code as "uomCode",
        i.qty::text as qty,
        i.qty_base::text as "qtyBase",
        i.base_price::text as "basePrice",
        i.disc1_type as "disc1Type",
        i.disc1_value::text as "disc1Value",
        i.disc2_type as "disc2Type",
        i.disc2_value::text as "disc2Value",
        i.net_unit_price::text as "netUnitPrice",
        i.line_gross::text as "lineGross",
        i.line_discount::text as "lineDiscount",
        i.line_net::text as "lineNet"
      from purchase_invoice_items i
      join products p on p.id = i.product_id
      where i.purchase_invoice_id = $1
      order by i.created_at asc
    `,
    [id],
  )

  return { header, items: itemsRes.rows }
}

export async function createPurchaseInvoice(input: {
  invoiceDate?: string
  warehouseId: string
  supplierId: string
  termDays?: number
  dueDate?: string
  notes?: string
  createdBy: string
  items: Array<{
    productId: string
    uomCode: string
    qty: number
    basePrice: number
    disc1Type?: 'PERCENT' | 'AMOUNT'
    disc1Value?: number
    disc2Type?: 'PERCENT' | 'AMOUNT'
    disc2Value?: number
  }>
}) {
  if (!input.items.length) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Minimal satu item harus diisi' })
  }

  return withTransaction(async (client) => {
    const invoiceDate = input.invoiceDate ?? new Date().toISOString().slice(0, 10)
    const termDays = Math.trunc(Number(input.termDays ?? 0))
    const dueDate = input.dueDate ?? addDays(invoiceDate, termDays)
    const invoiceNo = await generateInvoiceNumber(client, invoiceDate)

    const headerRes = await client.query(
      `
        insert into purchase_invoices(
          invoice_no, invoice_date, warehouse_id, supplier_id, term_days, due_date, status, notes, created_by
        )
        values ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8)
        returning id, invoice_no as "invoiceNo"
      `,
      [
        invoiceNo,
        invoiceDate,
        input.warehouseId,
        input.supplierId,
        termDays,
        dueDate,
        input.notes ?? null,
        input.createdBy,
      ],
    )
    const purchaseInvoiceId = String(headerRes.rows[0].id)

    for (const it of input.items) {
      const uomCode = normalizeCode(it.uomCode)
      const qty = Number(it.qty)
      const basePrice = Number(it.basePrice)
      const disc1Type = it.disc1Type ?? 'PERCENT'
      const disc2Type = it.disc2Type ?? 'PERCENT'
      const disc1Value = Number(it.disc1Value ?? 0)
      const disc2Value = Number(it.disc2Value ?? 0)

      const factor = await getToBaseFactor(client, it.productId, uomCode)
      const qtyBase = qty * factor
      if (!Number.isFinite(qtyBase) || qtyBase <= 0) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: `Qty base tidak valid untuk ${uomCode}`,
        })
      }

      const line = calcLine({
        qty,
        basePrice,
        disc1Type,
        disc1Value,
        disc2Type,
        disc2Value,
      })

      await client.query(
        `
          insert into purchase_invoice_items(
            purchase_invoice_id, product_id, uom_code, qty, qty_base,
            base_price, disc1_type, disc1_value, disc2_type, disc2_value,
            net_unit_price, line_gross, line_discount, line_net
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `,
        [
          purchaseInvoiceId,
          it.productId,
          uomCode,
          qty,
          qtyBase,
          basePrice,
          disc1Type,
          disc1Value,
          disc2Type,
          disc2Value,
          line.netUnitPrice,
          line.lineGross,
          line.lineDiscount,
          line.lineNet,
        ],
      )
    }

    return { id: purchaseInvoiceId, invoiceNo: String(headerRes.rows[0].invoiceNo) }
  })
}

export async function updatePurchaseInvoice(
  purchaseInvoiceId: string,
  input: {
    invoiceDate?: string
    warehouseId?: string
    supplierId?: string
    termDays?: number
    dueDate?: string
    notes?: string
    items: Array<{
      productId: string
      uomCode: string
      qty: number
      basePrice: number
      disc1Type?: 'PERCENT' | 'AMOUNT'
      disc1Value?: number
      disc2Type?: 'PERCENT' | 'AMOUNT'
      disc2Value?: number
    }>
  },
) {
  if (!input.items.length) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Minimal satu item harus diisi' })
  }

  return withTransaction(async (client) => {
    const currentRes = await client.query(
      `
        select
          invoice_no as "invoiceNo",
          invoice_date::text as "invoiceDate",
          term_days::int as "termDays",
          due_date::text as "dueDate",
          status
        from purchase_invoices
        where id = $1
        for update
      `,
      [purchaseInvoiceId],
    )
    const current = currentRes.rows[0] as
      | { invoiceNo: string; invoiceDate: string; termDays: number; dueDate: string; status: string }
      | undefined
    if (!current) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Faktur pembelian tidak ditemukan' })
    }
    if (current.status !== 'DRAFT') {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Faktur hanya bisa diedit saat status masih DRAFT',
      })
    }

    const nextInvoiceDate = input.invoiceDate ?? current.invoiceDate
    const nextTermDays = Math.trunc(Number(input.termDays ?? current.termDays ?? 0))
    const computedDueDate = addDays(nextInvoiceDate, nextTermDays)
    const nextDueDate = input.dueDate ?? computedDueDate

    await client.query(
      `
        update purchase_invoices
        set
          invoice_date = $2::date,
          warehouse_id = coalesce($3::uuid, warehouse_id),
          supplier_id = coalesce($4::uuid, supplier_id),
          term_days = $5::int,
          due_date = $6::date,
          notes = $7,
          updated_at = now()
        where id = $1
      `,
      [
        purchaseInvoiceId,
        nextInvoiceDate,
        input.warehouseId ?? null,
        input.supplierId ?? null,
        nextTermDays,
        nextDueDate,
        input.notes ?? null,
      ],
    )

    await client.query(`delete from purchase_invoice_items where purchase_invoice_id = $1`, [
      purchaseInvoiceId,
    ])

    for (const it of input.items) {
      const uomCode = normalizeCode(it.uomCode)
      const qty = Number(it.qty)
      const basePrice = Number(it.basePrice)
      const disc1Type = it.disc1Type ?? 'PERCENT'
      const disc2Type = it.disc2Type ?? 'PERCENT'
      const disc1Value = Number(it.disc1Value ?? 0)
      const disc2Value = Number(it.disc2Value ?? 0)

      const factor = await getToBaseFactor(client, it.productId, uomCode)
      const qtyBase = qty * factor
      if (!Number.isFinite(qtyBase) || qtyBase <= 0) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: `Qty base tidak valid untuk ${uomCode}`,
        })
      }

      const line = calcLine({
        qty,
        basePrice,
        disc1Type,
        disc1Value,
        disc2Type,
        disc2Value,
      })

      await client.query(
        `
          insert into purchase_invoice_items(
            purchase_invoice_id, product_id, uom_code, qty, qty_base,
            base_price, disc1_type, disc1_value, disc2_type, disc2_value,
            net_unit_price, line_gross, line_discount, line_net
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `,
        [
          purchaseInvoiceId,
          it.productId,
          uomCode,
          qty,
          qtyBase,
          basePrice,
          disc1Type,
          disc1Value,
          disc2Type,
          disc2Value,
          line.netUnitPrice,
          line.lineGross,
          line.lineDiscount,
          line.lineNet,
        ],
      )
    }

    return { id: purchaseInvoiceId, invoiceNo: current.invoiceNo }
  })
}

export async function deletePurchaseInvoice(purchaseInvoiceId: string) {
  return withTransaction(async (client) => {
    const currentRes = await client.query(
      `select status from purchase_invoices where id = $1 for update`,
      [purchaseInvoiceId],
    )
    const current = currentRes.rows[0] as { status: string } | undefined
    if (!current) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Faktur pembelian tidak ditemukan' })
    }
    if (current.status !== 'DRAFT') {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Faktur hanya bisa dihapus saat status masih DRAFT',
      })
    }

    await client.query(`delete from purchase_invoices where id = $1`, [purchaseInvoiceId])
    return { deleted: true }
  })
}

export async function postPurchaseInvoice(purchaseInvoiceId: string) {
  return withTransaction(async (client) => {
    const res = await client.query(
      `
        update purchase_invoices
        set status = 'POSTED', updated_at = now()
        where id = $1 and status = 'DRAFT'
        returning id, invoice_no as "invoiceNo", status
      `,
      [purchaseInvoiceId],
    )
    const row = res.rows[0]
    if (!row) {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Faktur tidak bisa diposting (pastikan status masih DRAFT)',
      })
    }
    return row
  })
}
