import type { PoolClient } from 'pg'
import type { JwtUser } from '../auth/jwt.js'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { ApiError } from '../lib/http.js'
import { buildSimplePdfLines, createSimplePdfBuffer } from '../lib/simplePdf.js'
import {
  getCustomerCreditProfile,
  validateCreditOrThrow,
  type CreditOpenDocument,
  type CreditReasonType,
  type CreditValidationResult,
} from './creditService.js'
import { applyInventoryTransaction, getDefaultWarehouseId } from './inventoryService.js'
import { calculateBestPromo } from './promoService.js'
import { getCompanySettings } from './settingService.js'
import { getToBaseFactorByCode } from './uomConversionService.js'

export type SalesOrderItemInput = {
  productId: string
  qty: number
  uom: string
  unitPrice: number
  discountAmount?: number
}

type ResolvedOrderItem = {
  productId: string
  qty: number
  uom: string
  unitPrice: number
  uomToPcs: number
  qtyPcs: number
  qtyBase: number
  baseUomId: string | null
  conversionSource: 'legacy' | 'product_uom_v2'
  discountAmount: number
  lineTotal: number
}

type Queryable = {
  query: PoolClient['query']
}

type SalesOrderActor = Pick<JwtUser, 'userId' | 'role'>

type SalesOrderAccessRecord = {
  id: string
  orderNo: string
  createdBy: string | null
  status: string
  deliveryStatus: string
}

function normalizeUom(uom: string) {
  return uom.trim().toLowerCase()
}

function formatSimpleCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0) || 0)
}

function formatSalesOrderStatusLabel(status: string | null | undefined) {
  switch (String(status ?? '').toUpperCase()) {
    case 'DRAFT':
      return 'Draft'
    case 'CONFIRMED':
      return 'Terkonfirmasi'
    case 'DELIVERED':
      return 'Terkirim'
    case 'CANCELLED':
      return 'Dibatalkan'
    default:
      return status || '-'
  }
}

async function getSalesOrderAccessRecord(executor: Queryable, salesOrderId: string) {
  const soRes = await executor.query(
    `
      select
        id,
        order_no as "orderNo",
        created_by as "createdBy",
        status,
        delivery_status as "deliveryStatus"
      from sales_orders
      where id = $1
      limit 1
    `,
    [salesOrderId],
  )

  return (soRes.rows[0] as SalesOrderAccessRecord | undefined) ?? null
}

function assertSalesOrderAccess(record: SalesOrderAccessRecord | null, actor?: SalesOrderActor) {
  if (!record) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Sales Order tidak ditemukan' })
  }

  if (actor?.role === 'Sales' && record.createdBy !== actor.userId) {
    throw new ApiError({
      code: 'FORBIDDEN',
      status: 403,
      message: 'Anda tidak berhak mengakses Sales Order milik sales lain',
    })
  }

  return record
}

function toLegacyFactor(params: { uom: string; packSize: number; packPerDus: number; dusSize: number }) {
  const code = normalizeUom(params.uom)
  if (code === 'pcs') return 1
  if (code === 'pack') return params.packSize
  if (code === 'dus') return params.dusSize || (params.packSize > 0 && params.packPerDus > 0 ? params.packSize * params.packPerDus : 0)
  return 0
}

function pad4(n: number) {
  return String(n).padStart(4, '0')
}

function formatRupiah(value: number) {
  return `Rp${new Intl.NumberFormat('id-ID').format(Math.round(value))}`
}

function formatOpenDocument(doc: CreditOpenDocument) {
  const amountText =
    doc.type === 'INVOICE'
      ? `sisa ${formatRupiah(doc.remainingAmount)}`
      : `nilai SO ${formatRupiah(doc.remainingAmount)}`
  return `${doc.number} (${amountText})`
}

function inferReasonTypesFromText(text?: string | null): CreditReasonType[] {
  const source = String(text ?? '').toLowerCase()
  const reasonTypes: CreditReasonType[] = []
  if (source.includes('limit kredit')) reasonTypes.push('CREDIT_LIMIT')
  if (source.includes('limit nota') || source.includes('limit jumlah nota')) reasonTypes.push('DOCUMENT_LIMIT')
  return reasonTypes
}

function parseApprovalStoredNotes(notes?: string | null) {
  const raw = String(notes ?? '').trim()
  if (!raw) {
    return {
      requestSummary: '',
      approverNotes: null as string | null,
      processSnapshot: null as string | null,
    }
  }

  const marker = '\n\nCatatan Approver:'
  const markerIndex = raw.indexOf(marker)
  if (markerIndex === -1) {
    return {
      requestSummary: raw,
      approverNotes: null,
      processSnapshot: null,
    }
  }

  const requestSummary = raw.slice(0, markerIndex).trim()
  const approverBlock = raw.slice(markerIndex + 2).trim()
  const snapshotMarker = '\nKondisi Saat Diproses:\n'
  const snapshotIndex = approverBlock.indexOf(snapshotMarker)

  if (snapshotIndex === -1) {
    return {
      requestSummary,
      approverNotes: approverBlock.replace(/^Catatan Approver:\s*/i, '').trim() || null,
      processSnapshot: null,
    }
  }

  return {
    requestSummary,
    approverNotes:
      approverBlock
        .slice(0, snapshotIndex)
        .replace(/^Catatan Approver:\s*/i, '')
        .trim() || null,
    processSnapshot: approverBlock.slice(snapshotIndex + snapshotMarker.length).trim() || null,
  }
}

function buildApprovalReasonContext(check: CreditValidationResult, salesNotes?: string | null) {
  const requestLines: string[] = []
  const currentLines: string[] = []
  const openDocumentList = check.openDocuments.length
    ? check.openDocuments.map((doc) => formatOpenDocument(doc)).join(', ')
    : 'Tidak ada dokumen aktif'

  if (check.exceedsLimit) {
    requestLines.push(
      `Limit kredit terlampaui. Limit ${formatRupiah(check.creditLimit)}, outstanding aktif ${formatRupiah(check.currentOutstanding)}, nilai order baru ${formatRupiah(check.newOrderAmount)}, proyeksi ${formatRupiah(check.projectedOutstanding)}.`,
    )
  }
  if (check.exceedsSalesOrderLimit) {
    requestLines.push(
      `Limit nota terlampaui. Limit ${check.salesOrderLimit}, dokumen aktif saat ini ${check.currentOpenDocumentCount}, proyeksi menjadi ${check.projectedOpenDocumentCount}.`,
    )
    requestLines.push(`Dokumen aktif yang dihitung: ${openDocumentList}.`)
  }
  if (!requestLines.length) {
    requestLines.push('Kondisi limit saat ini normal.')
  }
  if (salesNotes?.trim()) {
    requestLines.push(`Catatan sales: ${salesNotes.trim()}`)
  }

  currentLines.push(
    `Outstanding aktif saat ini ${formatRupiah(check.currentOutstanding)} dari limit ${formatRupiah(check.creditLimit)}.`,
  )
  currentLines.push(
    `Dokumen aktif saat ini ${check.currentOpenDocumentCount} dari limit ${check.salesOrderLimit}.`,
  )
  if (check.openDocuments.length) {
    currentLines.push(`Dokumen aktif saat ini: ${openDocumentList}.`)
  } else {
    currentLines.push('Tidak ada dokumen aktif yang masih dihitung.')
  }

  const liveStatusLabel = check.reasonTypes.length
    ? check.reasonTypes.length === 2
      ? 'Masih melebihi limit kredit dan limit nota'
      : check.reasonTypes[0] === 'CREDIT_LIMIT'
      ? 'Masih melebihi limit kredit'
      : 'Masih melebihi limit nota'
    : 'Kondisi terbaru sudah normal'

  return {
    reasonTypes: check.reasonTypes,
    requestSummary: requestLines.join('\n'),
    requestLines,
    liveSummary: currentLines.join('\n'),
    liveLines: currentLines,
    liveStatusLabel,
    creditSnapshot: {
      creditLimit: check.creditLimit,
      currentOutstanding: check.currentOutstanding,
      newOrderAmount: check.newOrderAmount,
      projectedOutstanding: check.projectedOutstanding,
      exceedsLimit: check.exceedsLimit,
    },
    documentSnapshot: {
      salesOrderLimit: check.salesOrderLimit,
      currentOpenDocumentCount: check.currentOpenDocumentCount,
      projectedOpenDocumentCount: check.projectedOpenDocumentCount,
      openInvoiceCount: check.openInvoiceCount,
      openSoWithoutInvoiceCount: check.openSoWithoutInvoiceCount,
      exceedsLimit: check.exceedsSalesOrderLimit,
    },
    openDocuments: check.openDocuments,
  }
}

async function generateNumber(
  client: PoolClient,
  prefix: string,
  dateKey: string,
  table: 'sales_orders' | 'invoices' | 'purchase_orders' | 'goods_receipts' | 'delivery_orders',
  column: string,
) {
  const like = `${prefix}-${dateKey}-%`
  const res = await client.query(
    `select ${column} as no from ${table} where ${column} like $1 order by ${column} desc limit 1`,
    [like],
  )
  const last = res.rows[0]?.no as string | undefined
  const nextSeq = last ? Number(last.split('-').pop()) + 1 : 1
  return `${prefix}-${dateKey}-${pad4(nextSeq)}`
}

async function getExistingInvoiceBySalesOrderId(client: PoolClient, salesOrderId: string) {
  const existing = await client.query(
    `
      select id, invoice_no as "invoiceNo", sales_order_id as "salesOrderId"
      from invoices
      where sales_order_id = $1
      limit 1
    `,
    [salesOrderId],
  )
  return existing.rows[0] as { id: string; invoiceNo: string; salesOrderId: string } | undefined
}

async function ensureInvoiceForSalesOrder(client: PoolClient, salesOrderId: string, invoiceDate: string) {
  const exists = await getExistingInvoiceBySalesOrderId(client, salesOrderId)
  if (exists) return exists

  const soRes = await client.query('select * from sales_orders where id = $1 limit 1', [salesOrderId])
  const so = soRes.rows[0]
  if (!so) throw new Error('SO tidak ditemukan')

  const profile = await getCustomerCreditProfile(so.customer_id)
  const dateKey = invoiceDate.replace(/-/g, '')
  const dueDate = new Date(invoiceDate)
  dueDate.setDate(dueDate.getDate() + profile.paymentTermDays)
  const dueDateStr = dueDate.toISOString().slice(0, 10)
  const invoiceNo = await generateNumber(client, 'INV', dateKey, 'invoices', 'invoice_no')

  const invRes = await client.query(
    `
      insert into invoices(
        invoice_no,
        customer_id,
        sales_order_id,
        invoice_date,
        due_date,
        subtotal,
        discount_amount,
        total_amount,
        status
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,'UNPAID')
      returning id, invoice_no as "invoiceNo", sales_order_id as "salesOrderId"
    `,
    [
      invoiceNo,
      so.customer_id,
      so.id,
      invoiceDate,
      dueDateStr,
      so.subtotal,
      so.discount_amount,
      so.total_amount,
    ],
  )
  const invoice = invRes.rows[0] as { id: string; invoiceNo: string; salesOrderId: string }

  const itemsRes = await client.query('select * from sales_order_items where sales_order_id = $1', [salesOrderId])
  for (const it of itemsRes.rows) {
    await client.query(
      `
        insert into invoice_items(
          invoice_id,
          product_id,
          qty,
          uom,
          uom_to_pcs,
          qty_pcs,
          qty_base,
          base_uom_id,
          conversion_source,
          unit_price,
          discount_amount,
          line_total
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `,
      [
        invoice.id,
        it.product_id,
        Math.trunc(Number(it.qty)),
        it.uom ?? 'pcs',
        Number(it.uom_to_pcs ?? 1),
        Math.trunc(Number(it.qty_pcs ?? 0)),
        Number(it.qty_base ?? it.qty_pcs ?? 0),
        it.base_uom_id ?? null,
        it.conversion_source ?? 'legacy',
        it.unit_price,
        it.discount_amount,
        it.line_total,
      ],
    )
  }

  return invoice
}

export async function createSalesOrder(params: {
  customerId: string
  createdBy: string
  orderDate: string
  discountAmount?: number
  notes?: string
  items: SalesOrderItemInput[]
  allowOverLimit: boolean
}) {
  const headerDiscount = params.discountAmount ?? 0
  const resolvedItems = await resolveOrderItems(params.items)

  const subtotal = resolvedItems.reduce((a, it) => a + it.qty * it.unitPrice, 0)
  const itemDiscount = resolvedItems.reduce((a, it) => a + it.discountAmount, 0)
  const discountAmount = headerDiscount + itemDiscount
  const totalAmount = Math.max(0, subtotal - discountAmount)

  const creditCheck = await validateCreditOrThrow({
    customerId: params.customerId,
    newInvoiceAmount: totalAmount,
    allowOverLimit: params.allowOverLimit,
    isDraft: true, // Bypass throw to allow creating PENDING_APPROVAL
  })

  // Set status: if exceeds credit/order limit and no override, requires approval.
  const requiresApproval =
    (creditCheck.exceedsLimit || creditCheck.exceedsSalesOrderLimit) && !params.allowOverLimit
  const status = requiresApproval ? 'PENDING_APPROVAL' : 'DRAFT'

  const dateKey = params.orderDate.replace(/-/g, '')

  return withTransaction(async (client) => {
    const orderNo = await generateNumber(client as any, 'SO', dateKey, 'sales_orders', 'order_no')

    const soRes = await client.query(
      `
        insert into sales_orders(
          order_no,
          customer_id,
          created_by,
          order_date,
          status,
          delivery_status,
          subtotal,
          discount_amount,
          total_amount,
          notes
        )
        values ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,$9)
        returning *
      `,
      [
        orderNo,
        params.customerId,
        params.createdBy,
        params.orderDate,
        status,
        subtotal,
        discountAmount,
        totalAmount,
        params.notes ?? null,
      ],
    )
    const salesOrder = soRes.rows[0]

    const approvalContext =
      status === 'PENDING_APPROVAL' ? buildApprovalReasonContext(creditCheck, params.notes) : null

    if (approvalContext) {
      await client.query(
        `insert into sales_order_approvals(sales_order_id, requested_by, status, notes) values ($1, $2, 'PENDING', $3)`,
        [salesOrder.id, params.createdBy, approvalContext.requestSummary]
      )
    }

    for (const it of resolvedItems) {
      await client.query(
        `
          insert into sales_order_items(
            sales_order_id,
            product_id,
            qty,
            uom,
            uom_to_pcs,
            qty_pcs,
            qty_base,
            base_uom_id,
            conversion_source,
            unit_price,
            discount_amount,
            line_total
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          salesOrder.id,
          it.productId,
          it.qty,
          it.uom,
          it.uomToPcs,
          it.qtyPcs,
          it.qtyBase,
          it.baseUomId,
          it.conversionSource,
          it.unitPrice,
          it.discountAmount,
          it.lineTotal,
        ],
      )
    }

    if (status !== 'PENDING_APPROVAL') {
      await client.query(`update sales_orders set status = 'CONFIRMED' where id = $1`, [salesOrder.id])
      salesOrder.status = 'CONFIRMED'
      return { salesOrder }
    }

    return { salesOrder, approvalContext: approvalContext ?? undefined }
  })
}

async function resolveOrderItems(items: SalesOrderItemInput[]): Promise<ResolvedOrderItem[]> {
  const resolvedItems: ResolvedOrderItem[] = []
  for (const it of items) {
    const pRes = await getPool().query(
      `
        select
          pack_size as "packSize",
          dus_size as "dusSize",
          pack_per_dus as "packPerDus",
          base_uom_id as "baseUomId"
        from products
        where id = $1
        limit 1
      `,
      [it.productId],
    )
    const p = pRes.rows[0] as
      | { packSize?: number; dusSize?: number; packPerDus?: number; baseUomId?: string | null }
      | undefined
    if (!p) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Produk tidak ditemukan' })

    const qty = Math.trunc(it.qty)
    const uomCode = normalizeUom(it.uom)
    const packSize = Number(p.packSize ?? 0)
    const packPerDus = Number(p.packPerDus ?? 0)
    const dusSize =
      Number(p.dusSize ?? 0) ||
      (packSize > 0 && packPerDus > 0 ? packSize * packPerDus : 0)

    let uomToPcs = toLegacyFactor({ uom: uomCode, packSize, packPerDus, dusSize })
    let qtyBase = qty * uomToPcs
    let conversionSource: 'legacy' | 'product_uom_v2' = 'legacy'

    try {
      const toBaseFactor = await getToBaseFactorByCode({
        productId: it.productId,
        uomCode,
      })
      if (Number.isFinite(toBaseFactor) && toBaseFactor > 0) {
        qtyBase = qty * Number(toBaseFactor)
        uomToPcs = Number(toBaseFactor)
        conversionSource = 'product_uom_v2'
      }
    } catch {
      // Fallback ke konversi legacy selama fase transisi.
    }

    if (!Number.isFinite(uomToPcs) || uomToPcs <= 0) {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: `Konversi satuan produk belum diatur untuk unit ${uomCode}`,
      })
    }

    const promoDiscount = await calculateBestPromo(it.productId, it.qty, it.unitPrice)
    const manualDiscount = it.discountAmount ?? 0
    const finalDiscount = Math.max(promoDiscount, manualDiscount)

    resolvedItems.push({
      productId: it.productId,
      qty,
      uom: uomCode,
      unitPrice: it.unitPrice,
      uomToPcs,
      qtyPcs: Math.round(qty * uomToPcs),
      qtyBase,
      baseUomId: p.baseUomId ?? null,
      conversionSource,
      discountAmount: finalDiscount,
      lineTotal: qty * it.unitPrice - finalDiscount,
    })
  }
  return resolvedItems
}

export async function getSalesOrderDetail(soId: string, actor?: SalesOrderActor) {
  const pool = getPool()
  const accessRecord = assertSalesOrderAccess(await getSalesOrderAccessRecord(pool, soId), actor)
  const soRes = await pool.query(
    `
      select
        so.id,
        so.order_no as "orderNo",
        so.customer_id as "customerId",
        c.code as "customerCode",
        c.name as "customerName",
        so.order_date::text as "orderDate",
        case
          when so.status = 'DRAFT'
            and exists (
              select 1 from sales_order_approvals a
              where a.sales_order_id = so.id and a.status = 'APPROVED'
            )
            then 'CONFIRMED'
          else so.status
        end as status,
        so.delivery_status as "deliveryStatus",
        so.subtotal::text as subtotal,
        so.discount_amount::text as "discountAmount",
        so.total_amount::text as "totalAmount",
        so.notes
      from sales_orders so
      join customers c on c.id = so.customer_id
      where so.id = $1
      limit 1
    `,
    [accessRecord.id],
  )
  const order = soRes.rows[0]
  if (!order) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Sales Order tidak ditemukan' })

  const itemRes = await pool.query(
    `
      select
        soi.id,
        soi.product_id as "productId",
        p.sku,
        p.name as "productName",
        soi.qty::text as qty,
        soi.uom,
        soi.qty_base::text as "qtyBase",
        soi.conversion_source as "conversionSource",
        soi.unit_price::text as "unitPrice",
        soi.discount_amount::text as "discountAmount",
        soi.line_total::text as "lineTotal"
      from sales_order_items soi
      join products p on p.id = soi.product_id
      where soi.sales_order_id = $1
      order by p.name asc
    `,
    [accessRecord.id],
  )

  const approvalRes = await pool.query(
    `
      select
        a.id,
        a.status,
        a.notes,
        a.created_at::text as "requestedAt",
        a.updated_at::text as "updatedAt",
        req.full_name as "requestedByName",
        app.full_name as "approverName"
      from sales_order_approvals a
      join users req on req.id = a.requested_by
      left join users app on app.id = a.approver_id
      where a.sales_order_id = $1
      order by a.created_at desc
    `,
    [accessRecord.id],
  )

  const approvals = (approvalRes.rows as Array<{
    id: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    notes?: string | null
    requestedAt: string
    updatedAt: string
    requestedByName: string
    approverName?: string | null
  }>).map((row) => {
    const parsedNotes = parseApprovalStoredNotes(row.notes)
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt,
      requestedByName: row.requestedByName,
      approverName: row.approverName ?? null,
      processedAt: row.status === 'PENDING' ? null : row.updatedAt,
      requestSummary: parsedNotes.requestSummary,
      approverNotes: parsedNotes.approverNotes,
      processSnapshot: parsedNotes.processSnapshot,
    }
  })

  return { ...order, items: itemRes.rows, approvals }
}

export async function exportSalesOrderPdf(soId: string, actor?: SalesOrderActor) {
  const [company, detail] = await Promise.all([getCompanySettings(), getSalesOrderDetail(soId, actor)])
  const rows = detail.items.map((item: any, index: number) => [
    index + 1,
    item.sku,
    item.productName,
    Number(item.qty),
    String(item.uom || '').toUpperCase(),
    formatSimpleCurrency(item.unitPrice),
    formatSimpleCurrency(item.lineTotal),
  ])

  const lines = buildSimplePdfLines({
    companyName: company.name || 'PT ERP DISTRIBUTOR FNB',
    title: `Sales Order ${detail.orderNo}`,
    printedAt: new Date().toLocaleString('id-ID'),
    sections: [
      {
        title: 'Informasi Order',
        headers: ['Field', 'Nilai'],
        rows: [
          ['No. SO', detail.orderNo],
          ['Tanggal', detail.orderDate],
          ['Pelanggan', `${detail.customerCode} - ${detail.customerName}`],
          ['Status', formatSalesOrderStatusLabel(detail.status)],
          ['Status Kirim', detail.deliveryStatus || '-'],
          ['Catatan', detail.notes || '-'],
        ],
      },
      {
        title: 'Item Order',
        headers: ['No', 'SKU', 'Produk', 'Qty', 'Satuan', 'Harga', 'Total'],
        rows,
      },
      {
        title: 'Ringkasan',
        headers: ['Komponen', 'Nilai'],
        rows: [
          ['Subtotal', formatSimpleCurrency(detail.subtotal)],
          ['Diskon', formatSimpleCurrency(detail.discountAmount)],
          ['Total', formatSimpleCurrency(detail.totalAmount)],
        ],
      },
    ],
  })

  return {
    fileName: `${String(detail.orderNo || 'sales-order').replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`,
    contentType: 'application/pdf',
    buffer: createSimplePdfBuffer(`Sales Order ${detail.orderNo}`, lines),
  }
}

export async function updateSalesOrder(params: {
  salesOrderId: string
  customerId: string
  orderDate: string
  discountAmount?: number
  notes?: string
  items: SalesOrderItemInput[]
  updatedBy: string
  actorRole: string
  allowOverLimit: boolean
}) {
  return withTransaction(async (client) => {
    const so = assertSalesOrderAccess(await getSalesOrderAccessRecord(client, params.salesOrderId), {
      userId: params.updatedBy,
      role: params.actorRole,
    })
    if (so.deliveryStatus !== 'PENDING') {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Sales Order sudah diproses pengiriman dan tidak dapat diubah',
      })
    }

    const invoiceRes = await client.query(`select id from invoices where sales_order_id = $1 limit 1`, [params.salesOrderId])
    if (invoiceRes.rowCount) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Sales Order sudah memiliki invoice dan tidak dapat diubah',
      })
    }

    const resolvedItems = await resolveOrderItems(params.items)
    const headerDiscount = params.discountAmount ?? 0
    const subtotal = resolvedItems.reduce((a, it) => a + it.qty * it.unitPrice, 0)
    const itemDiscount = resolvedItems.reduce((a, it) => a + it.discountAmount, 0)
    const discountAmount = headerDiscount + itemDiscount
    const totalAmount = Math.max(0, subtotal - discountAmount)

    const creditCheck = await validateCreditOrThrow({
      customerId: params.customerId,
      newInvoiceAmount: totalAmount,
      allowOverLimit: params.allowOverLimit,
      isDraft: true,
    })
    const requiresApproval =
      (creditCheck.exceedsLimit || creditCheck.exceedsSalesOrderLimit) && !params.allowOverLimit
    const status = requiresApproval ? 'PENDING_APPROVAL' : 'CONFIRMED'

    await client.query(
      `
        update sales_orders
        set customer_id = $2,
            order_date = $3,
            status = $4,
            subtotal = $5,
            discount_amount = $6,
            total_amount = $7,
            notes = $8,
            updated_at = now()
        where id = $1
      `,
      [
        params.salesOrderId,
        params.customerId,
        params.orderDate,
        status,
        subtotal,
        discountAmount,
        totalAmount,
        params.notes ?? null,
      ],
    )

    await client.query(`delete from sales_order_items where sales_order_id = $1`, [params.salesOrderId])
    for (const it of resolvedItems) {
      await client.query(
        `
          insert into sales_order_items(
            sales_order_id, product_id, qty, uom, uom_to_pcs, qty_pcs, qty_base, base_uom_id, conversion_source, unit_price, discount_amount, line_total
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          params.salesOrderId,
          it.productId,
          it.qty,
          it.uom,
          it.uomToPcs,
          it.qtyPcs,
          it.qtyBase,
          it.baseUomId,
          it.conversionSource,
          it.unitPrice,
          it.discountAmount,
          it.lineTotal,
        ],
      )
    }

    if (status === 'PENDING_APPROVAL') {
      const approvalContext = buildApprovalReasonContext(creditCheck, params.notes)

      const pendingRes = await client.query(
        `select id from sales_order_approvals where sales_order_id = $1 and status = 'PENDING' limit 1`,
        [params.salesOrderId],
      )
      if (pendingRes.rowCount) {
        await client.query(
          `
            update sales_order_approvals
            set requested_by = $2, notes = $3, updated_at = now()
            where id = $1
          `,
          [pendingRes.rows[0].id, params.updatedBy, approvalContext.requestSummary],
        )
      } else {
        await client.query(
          `insert into sales_order_approvals(sales_order_id, requested_by, status, notes) values ($1, $2, 'PENDING', $3)`,
          [params.salesOrderId, params.updatedBy, approvalContext.requestSummary],
        )
      }
      return {
        ...(await getSalesOrderDetail(params.salesOrderId, {
          userId: params.updatedBy,
          role: params.actorRole,
        })),
        approvalContext,
      }
    } else {
      await client.query(
        `delete from sales_order_approvals where sales_order_id = $1 and status = 'PENDING'`,
        [params.salesOrderId],
      )
    }

    return getSalesOrderDetail(params.salesOrderId, {
      userId: params.updatedBy,
      role: params.actorRole,
    })
  })
}

export async function deleteSalesOrder(salesOrderId: string, actor: SalesOrderActor) {
  return withTransaction(async (client) => {
    const so = assertSalesOrderAccess(await getSalesOrderAccessRecord(client, salesOrderId), actor)
    if (so.deliveryStatus !== 'PENDING') {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Sales Order sudah diproses pengiriman dan tidak dapat dihapus',
      })
    }

    const invoiceRes = await client.query(`select id from invoices where sales_order_id = $1 limit 1`, [salesOrderId])
    if (invoiceRes.rowCount) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Sales Order sudah memiliki invoice dan tidak dapat dihapus',
      })
    }

    await client.query(`delete from sales_order_approvals where sales_order_id = $1`, [salesOrderId])
    await client.query(`delete from sales_orders where id = $1`, [salesOrderId])
    return { deleted: true, id: salesOrderId, orderNo: so.orderNo }
  })
}

export async function getDeliveryOrderBySoId(soId: string, actor?: SalesOrderActor) {
  const pool = getPool()
  const accessRecord = assertSalesOrderAccess(await getSalesOrderAccessRecord(pool, soId), actor)
  const doRes = await pool.query(
    `
      select
        d.id,
        d.do_no as "doNo",
        d.delivery_date::text as "deliveryDate",
        so.order_no as "soNo",
        so.order_date::text as "orderDate",
        c.name as "customerName",
        c.code as "customerCode"
      from delivery_orders d
      join sales_orders so on so.id = d.sales_order_id
      join customers c on c.id = so.customer_id
      where d.sales_order_id = $1
      limit 1
    `,
    [accessRecord.id],
  )
  const deliveryOrder = doRes.rows[0]
  if (!deliveryOrder) {
    throw new Error('Delivery order not found for this SO')
  }

  const itemsRes = await pool.query(
    `
      select
        p.sku,
        p.name as "productName",
        doi.uom as unit,
        doi.qty,
        doi.qty_pcs as "qtyPcs",
        doi.qty_base as "qtyBase"
      from delivery_order_items doi
      join products p on p.id = doi.product_id
      where doi.delivery_order_id = $1
    `,
    [deliveryOrder.id],
  )

  return {
    ...deliveryOrder,
    items: itemsRes.rows,
  }
}

export async function getApprovalList(params: { page?: number; pageSize?: number }) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const countRes = await pool.query(
    `
      select count(*)::int as c
      from sales_order_approvals a
      join sales_orders so on so.id = a.sales_order_id
      where a.status = 'PENDING'
        and so.status = 'PENDING_APPROVAL'
    `,
  )
  
  const listRes = await pool.query(
    `
      select 
        a.id as "approvalId",
        a.status as "approvalStatus",
        a.notes as "approvalNotes",
        a.created_at::text as "requestedAt",
        so.id as "salesOrderId",
        so.order_no as "orderNo",
        so.total_amount::text as "totalAmount",
        so.notes as "salesOrderNotes",
        so.customer_id as "customerId",
        c.name as "customerName",
        u.full_name as "requestedByName"
      from sales_order_approvals a
      join sales_orders so on so.id = a.sales_order_id
      join customers c on c.id = so.customer_id
      join users u on u.id = a.requested_by
      where a.status = 'PENDING'
        and so.status = 'PENDING_APPROVAL'
      order by a.created_at asc
      limit $1 offset $2
    `,
    [pageSize, offset]
  )

  const items = await Promise.all(
    (listRes.rows as Array<{
      approvalId: string
      approvalStatus: string
      approvalNotes: string
      requestedAt: string
      salesOrderId: string
      orderNo: string
      totalAmount: string
      salesOrderNotes?: string | null
      customerId: string
      customerName: string
      requestedByName: string
    }>).map(async (row) => {
      const currentCheck = await validateCreditOrThrow({
        customerId: row.customerId,
        newInvoiceAmount: Number(row.totalAmount),
        allowOverLimit: false,
        isDraft: true,
      })
      const liveContext = buildApprovalReasonContext(currentCheck, row.salesOrderNotes)
      return {
        ...row,
        requestSummary: row.approvalNotes,
        requestReasonTypes: inferReasonTypesFromText(row.approvalNotes),
        liveCheck: liveContext,
      }
    }),
  )

  return { items, total: Number(countRes.rows[0]?.c ?? 0) }
}

export async function processApproval(approvalId: string, action: 'APPROVED' | 'REJECTED', approverId: string, notes?: string) {
  return withTransaction(async (client) => {
    const approverNotes = notes?.trim()
    if (!approverNotes || approverNotes.length < 5) {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Catatan approver wajib diisi minimal 5 karakter',
      })
    }

    const approvalRes = await client.query(
      `
        select
          a.id,
          a.status,
          a.sales_order_id as "salesOrderId",
          so.status as "salesOrderStatus",
          so.customer_id as "customerId",
          so.total_amount::float as "totalAmount"
        from sales_order_approvals a
        join sales_orders so on so.id = a.sales_order_id
        where a.id = $1
        for update
      `,
      [approvalId],
    )
    const approval = approvalRes.rows[0] as
      | {
          id: string
          status: 'PENDING' | 'APPROVED' | 'REJECTED'
          salesOrderId: string
          salesOrderStatus: string
          customerId: string
          totalAmount: number
        }
      | undefined

    if (!approval) {
      throw new ApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Approval tidak ditemukan',
      })
    }
    if (approval.status !== 'PENDING') {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Approval sudah diproses sebelumnya',
      })
    }
    if (approval.salesOrderStatus !== 'PENDING_APPROVAL') {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: `Status SO tidak valid untuk approval (${approval.salesOrderStatus})`,
      })
    }

    const currentCheck = await validateCreditOrThrow({
      customerId: approval.customerId,
      newInvoiceAmount: Number(approval.totalAmount),
      allowOverLimit: false,
      isDraft: true,
    })

    const liveContext = buildApprovalReasonContext(currentCheck)
    const enrichedNotes = `Catatan Approver: ${approverNotes}\nKondisi Saat Diproses:\n${liveContext.liveSummary}`

    const apprRes = await client.query(
      `
        update sales_order_approvals
        set status = $2,
            approver_id = $3,
            notes = case
              when coalesce(notes, '') = '' then $4
              else notes || E'\n\n' || $4
            end,
            updated_at = now()
        where id = $1 and status = 'PENDING'
        returning sales_order_id
      `,
      [approvalId, action, approverId, enrichedNotes || null],
    )
    if (!apprRes.rowCount) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Approval sudah diproses sebelumnya',
      })
    }
    const soId = apprRes.rows[0].sales_order_id as string

    // 2. Update SO status
    const newSoStatus = action === 'APPROVED' ? 'CONFIRMED' : 'CANCELLED'
    const soUpdateRes = await client.query(
      `update sales_orders set status = $2, updated_at = now() where id = $1 and status = 'PENDING_APPROVAL'`,
      [soId, newSoStatus],
    )
    if (!soUpdateRes.rowCount) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Sales order sudah berubah status, approval dibatalkan',
      })
    }

    return {
      success: true,
      newSoStatus,
      creditSnapshot: liveContext,
    }
  })
}

export async function createDeliveryOrder(params: {
  salesOrderId: string
  createdBy: string
  actorRole: string
  deliveryDate: string
}) {
  return withTransaction(async (client) => {
    const hasApprovedOverride = async (salesOrderId: string) => {
      const approvedRes = await client.query(
        `
          select 1
          from sales_order_approvals
          where sales_order_id = $1
            and status = 'APPROVED'
          limit 1
        `,
        [salesOrderId],
      )
      return approvedRes.rowCount > 0
    }

    // 1. Get SO
    const so = assertSalesOrderAccess(await getSalesOrderAccessRecord(client, params.salesOrderId), {
      userId: params.createdBy,
      role: params.actorRole,
    })
    if (so.deliveryStatus !== 'PENDING') throw new Error('SO is already delivered or cancelled')
    if (!['CONFIRMED', 'DELIVERED'].includes(String(so.status))) {
      const approvedOverride = await hasApprovedOverride(params.salesOrderId)
      if (!approvedOverride) {
        throw new Error('SO belum disetujui/terkonfirmasi')
      }

      // Self-heal legacy inconsistent rows: approval is APPROVED but SO status is still DRAFT.
      await client.query(`update sales_orders set status = 'CONFIRMED' where id = $1`, [params.salesOrderId])
    }

    // 2. Get SO items
    const itemsRes = await client.query('select * from sales_order_items where sales_order_id = $1', [params.salesOrderId])
    const items = itemsRes.rows

    const dateKey = params.deliveryDate.replace(/-/g, '')
    const doNo = await generateNumber(client, 'DO', dateKey, 'delivery_orders', 'do_no')

    const warehouseId = await getDefaultWarehouseId(client)
    if (!warehouseId) {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Gudang default WH-01 belum tersedia untuk delivery order',
        details: {
          issue: 'WAREHOUSE_REQUIRED',
          warehouseCode: 'WH-01',
        },
      })
    }

    // 3. Insert Delivery Order
    const doRes = await client.query(
      `
        insert into delivery_orders(do_no, sales_order_id, delivery_date, created_by)
        values ($1, $2, $3, $4)
        returning *
      `,
      [doNo, params.salesOrderId, params.deliveryDate, params.createdBy]
    )
    const deliveryOrder = doRes.rows[0]

    // 4. Insert DO Items & Deduct Stock
    for (const it of items) {
      const qtyPcs = Number(it.qty_pcs ?? 0)
      const qtyBase = Number(it.qty_base ?? qtyPcs)
      const qty = Number(it.qty ?? 0)
      await client.query(
        `
          insert into delivery_order_items(
            delivery_order_id,
            product_id,
            qty,
            uom,
            uom_to_pcs,
            qty_pcs,
            qty_base,
            base_uom_id,
            conversion_source
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          deliveryOrder.id,
          it.product_id,
          Math.trunc(qty),
          it.uom ?? 'pcs',
          Number(it.uom_to_pcs ?? 1),
          Math.trunc(qtyPcs),
          qtyBase,
          it.base_uom_id ?? null,
          it.conversion_source ?? 'legacy',
        ],
      )

      await applyInventoryTransaction({
        warehouseId,
        productId: it.product_id,
        type: 'SALE_OUT',
        qtyDelta: -1 * qtyBase,
        createdBy: params.createdBy,
        refType: 'delivery_orders',
        refId: deliveryOrder.id,
        client,
      })
    }

    // 5. Update SO status
    await client.query("update sales_orders set delivery_status = 'DELIVERED' where id = $1", [params.salesOrderId])
    const invoice = await ensureInvoiceForSalesOrder(client, params.salesOrderId, params.deliveryDate)

    return { deliveryOrder, invoice }
  })
}

export async function listSalesOrders(params: {
  page?: number
  pageSize?: number
  q?: string
  customerId?: string
  salesId?: string
  createdBy?: string
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []

  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`)
    where.push('(lower(so.order_no) like $1)')
  }

  if (params.customerId) {
    values.push(params.customerId)
    where.push(`so.customer_id = $${values.length}`)
  }

  if (params.salesId) {
    values.push(params.salesId)
    where.push(`c.sales_id = $${values.length}`)
  }

  if (params.createdBy) {
    values.push(params.createdBy)
    where.push(`so.created_by = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `
      select count(*)::int as c 
      from sales_orders so
      join customers c on c.id = so.customer_id
      ${whereSql}
    `,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const listRes = await pool.query(
    `
      select
        so.id,
        so.order_no as "orderNo",
        so.customer_id as "customerId",
        c.name as "customerName",
        so.order_date::text as "orderDate",
        case
          when so.status = 'DRAFT'
            and exists (
              select 1
              from sales_order_approvals a
              where a.sales_order_id = so.id
                and a.status = 'APPROVED'
            )
            then 'CONFIRMED'
          else so.status
        end as status,
        so.delivery_status as "deliveryStatus",
        so.total_amount::text as "totalAmount"
      from sales_orders so
      join customers c on c.id = so.customer_id
      ${whereSql}
      order by so.order_date desc, so.order_no desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: listRes.rows, total }
}
