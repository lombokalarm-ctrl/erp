import { getPool } from '../db/pool.js'
import type { PoolClient } from 'pg'
import { withTransaction } from '../db/tx.js'
import { ApiError } from '../lib/http.js'
import { writeAuditLog } from './auditService.js'
import { createCreditNoteFromSalesReturn } from './creditNoteService.js'
import { applyInventoryTransaction, getDefaultWarehouseId } from './inventoryService.js'

export type ReturnInputItem = {
  productId: string
  qty: number
  uom: 'pcs' | 'pack' | 'dus'
  reason?: string
}

export type ReturnInput = {
  type: 'SALES_RETURN' | 'PURCHASE_RETURN'
  customerId?: string
  supplierId?: string
  sourceInvoiceId?: string
  referenceNo?: string
  warehouseId?: string
  returnDate: string
  notes?: string
  createdBy: string
  items: ReturnInputItem[]
}

function pad4(n: number) {
  return String(n).padStart(4, '0')
}

export async function createReturn(input: ReturnInput) {
  if (!input.items || input.items.length === 0) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Minimal 1 item barang retur' })
  }

  if (input.type === 'SALES_RETURN' && !input.customerId) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Customer wajib diisi untuk Sales Return' })
  }
  if (input.type === 'SALES_RETURN' && !input.sourceInvoiceId) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Invoice sumber wajib diisi untuk Sales Return' })
  }
  if (input.type === 'PURCHASE_RETURN' && !input.supplierId) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Supplier wajib diisi untuk Purchase Return' })
  }

  return withTransaction(async (client) => {
    // Resolve UOM conversion for all items
    const resolvedItems = []
    for (const it of input.items) {
      const pRes = await client.query(
        `select pack_size as "packSize", pack_per_dus as "packPerDus", dus_size as "dusSize" from products where id = $1 limit 1`,
        [it.productId],
      )
      const p = pRes.rows[0] as { packSize?: number; packPerDus?: number; dusSize?: number } | undefined
      if (!p) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Produk tidak ditemukan' })

      const packSize = Number(p.packSize ?? 0)
      const packPerDus = Number(p.packPerDus ?? 0)
      const dusSize = Number(p.dusSize ?? 0) || (packSize > 0 && packPerDus > 0 ? packSize * packPerDus : 0)

      const uomToPcs = it.uom === 'pcs' ? 1 : it.uom === 'pack' ? packSize : dusSize
      if (!Number.isFinite(uomToPcs) || uomToPcs < 1) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'Konversi satuan produk belum diatur (pack/dus)',
        })
      }
      
      const qty = Math.trunc(it.qty)
      const qtyPcs = qty * uomToPcs

      resolvedItems.push({
        ...it,
        qty,
        uomToPcs,
        qtyPcs,
      })
    }

    // Generate nomor retur
    const prefix = input.type === 'SALES_RETURN' ? 'SR' : 'PR'
    const dateKey = input.returnDate.replace(/-/g, '')
    const like = `${prefix}-${dateKey}-%`
    
    const seqRes = await client.query(
      `select return_no from returns where return_no like $1 order by return_no desc limit 1`,
      [like]
    )
    const last = seqRes.rows[0]?.return_no as string | undefined
    const nextSeq = last ? Number(last.split('-').pop()) + 1 : 1
    const returnNo = `${prefix}-${dateKey}-${pad4(nextSeq)}`

    // Warehouse default
    let whId = input.warehouseId
    if (!whId) {
      whId = await getDefaultWarehouseId(client)
      if (!whId) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Warehouse tidak ditemukan' })
    }

    if (input.type === 'SALES_RETURN') {
      const invRes = await client.query(
        `
          select id, sales_order_id as "salesOrderId"
          from invoices
          where id = $1 and customer_id = $2
          limit 1
        `,
        [input.sourceInvoiceId, input.customerId],
      )
      if (!invRes.rows[0]) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'Invoice sumber tidak valid untuk customer ini',
        })
      }
    }

    // Insert Returns header
    const retRes = await client.query(
      `
        insert into returns (
          return_no, type, customer_id, supplier_id, reference_no,
          warehouse_id, return_date, status, notes, source_invoice_id, financial_status, created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $9, 'NONE', $10)
        returning id
      `,
      [
        returnNo,
        input.type,
        input.customerId ?? null,
        input.supplierId ?? null,
        input.referenceNo ?? null,
        whId,
        input.returnDate,
        input.notes ?? null,
        input.sourceInvoiceId ?? null,
        input.createdBy,
      ]
    )
    const returnId = retRes.rows[0].id

    // Insert items only (adjust stok saat posted)
    for (const it of resolvedItems) {
      await client.query(
        `insert into return_items (return_id, product_id, qty, uom, uom_to_pcs, qty_pcs, reason) values ($1, $2, $3, $4, $5, $6, $7)`,
        [returnId, it.productId, it.qty, it.uom, it.uomToPcs, it.qtyPcs, it.reason ?? null]
      )
    }

    await writeAuditLog({
      actorUserId: input.createdBy,
      action: 'RETURN_CREATED',
      entity: 'returns',
      entityId: returnId,
      payload: { returnNo, type: input.type, status: 'DRAFT' },
    })

    return { id: returnId, returnNo }
  })
}

async function validateSalesReturnQty(client: PoolClient, args: {
  returnId: string
  sourceInvoiceId: string
}) {
  const invoiceQtyRes = await client.query(
    `
      select
        ii.product_id as "productId",
        coalesce(sum(ii.qty_pcs), 0)::float as "invoiceQtyPcs"
      from invoice_items ii
      where ii.invoice_id = $1
      group by ii.product_id
    `,
    [args.sourceInvoiceId],
  )
  const invoiceMap = new Map<string, number>()
  for (const row of invoiceQtyRes.rows as Array<{ productId: string; invoiceQtyPcs: number }>) {
    invoiceMap.set(row.productId, Number(row.invoiceQtyPcs))
  }

  const postedReturnRes = await client.query(
    `
      select
        ri.product_id as "productId",
        coalesce(sum(ri.qty_pcs), 0)::float as "returnedQtyPcs"
      from returns r
      join return_items ri on ri.return_id = r.id
      where r.type = 'SALES_RETURN'
        and r.source_invoice_id = $1
        and r.status in ('POSTED', 'COMPLETED')
        and r.id <> $2
      group by ri.product_id
    `,
    [args.sourceInvoiceId, args.returnId],
  )
  const returnedMap = new Map<string, number>()
  for (const row of postedReturnRes.rows as Array<{ productId: string; returnedQtyPcs: number }>) {
    returnedMap.set(row.productId, Number(row.returnedQtyPcs))
  }

  const thisReturnRes = await client.query(
    `
      select product_id as "productId", coalesce(sum(qty_pcs),0)::float as "qtyPcs"
      from return_items
      where return_id = $1
      group by product_id
    `,
    [args.returnId],
  )

  for (const row of thisReturnRes.rows as Array<{ productId: string; qtyPcs: number }>) {
    const delivered = Number(invoiceMap.get(row.productId) ?? 0)
    const alreadyReturned = Number(returnedMap.get(row.productId) ?? 0)
    const remaining = delivered - alreadyReturned
    if (delivered <= 0 || Number(row.qtyPcs) > remaining + 0.00001) {
      throw new ApiError({
        code: 'CONFLICT',
        status: 409,
        message: 'Qty retur melebihi qty invoice yang belum pernah diretur',
      })
    }
  }
}

export async function postReturn(input: { id: string; actorUserId: string }) {
  return withTransaction(async (client) => {
    const headerRes = await client.query(
      `
        select
          r.id,
          r.return_no as "returnNo",
          r.type,
          r.customer_id as "customerId",
          r.supplier_id as "supplierId",
          r.reference_no as "referenceNo",
          r.warehouse_id as "warehouseId",
          r.return_date::text as "returnDate",
          r.status,
          r.source_invoice_id as "sourceInvoiceId",
          r.financial_status as "financialStatus",
          r.notes
        from returns r
        where r.id = $1
        limit 1
      `,
      [input.id],
    )
    const header = headerRes.rows[0] as
      | {
          id: string
          returnNo: string
          type: 'SALES_RETURN' | 'PURCHASE_RETURN'
          customerId?: string
          supplierId?: string
          referenceNo?: string
          warehouseId: string
          returnDate: string
          status: string
          sourceInvoiceId?: string
          financialStatus: string
          notes?: string
        }
      | undefined
    if (!header) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Data retur tidak ditemukan' })
    if (header.status === 'POSTED' || header.status === 'COMPLETED') {
      throw new ApiError({ code: 'CONFLICT', status: 409, message: 'Retur sudah diposting' })
    }
    if (header.status === 'CANCELLED') {
      throw new ApiError({ code: 'CONFLICT', status: 409, message: 'Retur dibatalkan, tidak bisa diposting' })
    }

    const itemsRes = await client.query(
      `
        select
          ri.id,
          ri.product_id as "productId",
          ri.qty::float as qty,
          ri.uom,
          ri.uom_to_pcs as "uomToPcs",
          ri.qty_pcs::float as "qtyPcs",
          ri.reason
        from return_items ri
        where ri.return_id = $1
      `,
      [input.id],
    )
    const items = itemsRes.rows as Array<{
      id: string
      productId: string
      qty: number
      uom: 'pcs' | 'pack' | 'dus'
      uomToPcs: number
      qtyPcs: number
      reason?: string
    }>
    if (!items.length) {
      throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Retur tidak memiliki item' })
    }

    if (header.type === 'SALES_RETURN') {
      if (!header.sourceInvoiceId || !header.customerId) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'Sales retur wajib memiliki invoice sumber dan customer',
        })
      }
      await validateSalesReturnQty(client, { returnId: header.id, sourceInvoiceId: header.sourceInvoiceId })
    }

    for (const it of items) {
      const qtyDelta = header.type === 'SALES_RETURN' ? Number(it.qtyPcs) : -Math.abs(Number(it.qtyPcs))
      await applyInventoryTransaction({
        warehouseId: header.warehouseId,
        productId: it.productId,
        type: header.type,
        qtyDelta,
        refType: 'returns',
        refId: header.id,
        note: `Retur ${header.returnNo} - ${it.reason || 'Tanpa keterangan'}`,
        createdBy: input.actorUserId,
        client,
      })
    }

    let creditNote:
      | { id: string; creditNo: string; totalAmount: number; appliedAmount: number; remainingAmount: number; autoAppliedAmount: number }
      | undefined

    if (header.type === 'SALES_RETURN' && header.customerId && header.sourceInvoiceId) {
      const invItemRes = await client.query(
        `
          select
            ii.id,
            ii.product_id as "productId",
            coalesce(sum(ii.qty_pcs), 0)::float as "qtyPcs",
            coalesce(sum(ii.qty * ii.unit_price), 0)::float as "grossAmount",
            coalesce(sum(ii.discount_amount), 0)::float as "discountAmount"
          from invoice_items ii
          where ii.invoice_id = $1
          group by ii.id, ii.product_id
          order by ii.id asc
        `,
        [header.sourceInvoiceId],
      )

      const invByProduct = new Map<
        string,
        Array<{ invoiceItemId: string; qtyPcs: number; grossAmount: number; discountAmount: number }>
      >()
      for (const row of invItemRes.rows as Array<{
        id: string
        productId: string
        qtyPcs: number
        grossAmount: number
        discountAmount: number
      }>) {
        const arr = invByProduct.get(row.productId) ?? []
        arr.push({
          invoiceItemId: row.id,
          qtyPcs: Number(row.qtyPcs),
          grossAmount: Number(row.grossAmount),
          discountAmount: Number(row.discountAmount),
        })
        invByProduct.set(row.productId, arr)
      }

      const creditItems: Array<{
        sourceReturnItemId?: string
        sourceInvoiceItemId?: string
        productId: string
        qty: number
        uom: string
        uomToPcs: number
        qtyPcs: number
        unitPrice: number
        discountAmount: number
        lineTotal: number
        reason?: string
      }> = []

      for (const it of items) {
        const refs = invByProduct.get(it.productId) ?? []
        if (!refs.length) {
          throw new ApiError({
            code: 'CONFLICT',
            status: 409,
            message: 'Produk retur tidak ditemukan pada invoice sumber',
          })
        }
        const totalQtyPcs = refs.reduce((a, r) => a + r.qtyPcs, 0)
        const totalGross = refs.reduce((a, r) => a + r.grossAmount, 0)
        const totalDiscount = refs.reduce((a, r) => a + r.discountAmount, 0)
        const unitPricePerPcs = totalQtyPcs > 0 ? totalGross / totalQtyPcs : 0
        const discountPerPcs = totalQtyPcs > 0 ? totalDiscount / totalQtyPcs : 0
        const unitPrice = unitPricePerPcs * Number(it.uomToPcs)
        const discountPerUnit = discountPerPcs * Number(it.uomToPcs)
        const lineGross = Number(it.qty) * unitPrice
        const lineDiscount = Number(it.qty) * discountPerUnit
        const lineTotal = Math.max(0, lineGross - lineDiscount)
        creditItems.push({
          sourceReturnItemId: it.id,
          sourceInvoiceItemId: refs[0]?.invoiceItemId,
          productId: it.productId,
          qty: it.qty,
          uom: it.uom,
          uomToPcs: it.uomToPcs,
          qtyPcs: Number(it.qtyPcs),
          unitPrice,
          discountAmount: lineDiscount,
          lineTotal,
          reason: it.reason,
        })
      }

      const soRes = await client.query(
        `select sales_order_id as "salesOrderId" from invoices where id = $1 limit 1`,
        [header.sourceInvoiceId],
      )
      const salesOrderId = soRes.rows[0]?.salesOrderId as string | undefined

      creditNote = await createCreditNoteFromSalesReturn({
        returnId: header.id,
        sourceInvoiceId: header.sourceInvoiceId,
        salesOrderId,
        customerId: header.customerId,
        creditDate: header.returnDate,
        reason: `Retur ${header.returnNo}`,
        notes: header.notes,
        createdBy: input.actorUserId,
        items: creditItems,
      })
    }

    await client.query(
      `
        update returns
        set status = 'POSTED',
            updated_at = now()
        where id = $1
      `,
      [header.id],
    )

    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: 'RETURN_POSTED',
      entity: 'returns',
      entityId: header.id,
      payload: {
        returnNo: header.returnNo,
        creditNoteNo: creditNote?.creditNo ?? null,
      },
    })

    return {
      id: header.id,
      returnNo: header.returnNo,
      status: 'POSTED',
      creditNote,
    }
  })
}

export async function listReturns(params: {
  page?: number
  pageSize?: number
  type?: 'SALES_RETURN' | 'PURCHASE_RETURN'
  q?: string
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []

  if (params.type) {
    values.push(params.type)
    where.push(`r.type = $${values.length}`)
  }

  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`)
    where.push(`(lower(r.return_no) like $${values.length} or lower(r.reference_no) like $${values.length})`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from returns r ${whereSql}`,
    values
  )

  const listRes = await pool.query(
    `
      select 
        r.id,
        r.return_no as "returnNo",
        r.type,
        r.status,
        r.financial_status as "financialStatus",
        r.credit_note_id as "creditNoteId",
        cn.credit_no as "creditNoteNo",
        r.source_invoice_id as "sourceInvoiceId",
        i.invoice_no as "sourceInvoiceNo",
        r.reference_no as "referenceNo",
        r.return_date::text as "returnDate",
        r.notes,
        c.name as "customerName",
        s.name as "supplierName"
      from returns r
      left join credit_notes cn on cn.id = r.credit_note_id
      left join invoices i on i.id = r.source_invoice_id
      left join customers c on c.id = r.customer_id
      left join suppliers s on s.id = r.supplier_id
      ${whereSql}
      order by r.created_at desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset]
  )

  return { items: listRes.rows, total: Number(totalRes.rows[0]?.c ?? 0) }
}

export async function getReturnDetail(id: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select 
        r.id,
        r.return_no as "returnNo",
        r.type,
        r.status,
        r.financial_status as "financialStatus",
        r.credit_note_id as "creditNoteId",
        cn.credit_no as "creditNoteNo",
        r.source_invoice_id as "sourceInvoiceId",
        i.invoice_no as "sourceInvoiceNo",
        r.reference_no as "referenceNo",
        r.return_date::text as "returnDate",
        r.notes,
        c.name as "customerName",
        s.name as "supplierName",
        u.full_name as "createdBy"
      from returns r
      left join credit_notes cn on cn.id = r.credit_note_id
      left join invoices i on i.id = r.source_invoice_id
      left join customers c on c.id = r.customer_id
      left join suppliers s on s.id = r.supplier_id
      join users u on u.id = r.created_by
      where r.id = $1
    `,
    [id]
  )

  if (!res.rows[0]) throw new Error('Data retur tidak ditemukan')
  const returnHeader = res.rows[0]

  const itemsRes = await pool.query(
    `
      select 
        ri.id,
        ri.qty::float as "qty",
        ri.uom,
        ri.qty_pcs::float as "qtyPcs",
        ri.reason,
        p.sku,
        p.name as "productName"
      from return_items ri
      join products p on p.id = ri.product_id
      where ri.return_id = $1
    `,
    [id]
  )

  return { ...returnHeader, items: itemsRes.rows }
}
