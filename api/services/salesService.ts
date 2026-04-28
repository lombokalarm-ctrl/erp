import type { PoolClient } from 'pg'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { getCustomerCreditProfile, validateCreditOrThrow } from './creditService.js'
import { applyInventoryTransaction, getDefaultWarehouseId } from './inventoryService.js'
import { calculateBestPromo } from './promoService.js'

export type SalesOrderItemInput = {
  productId: string
  qty: number
  uom: 'pcs' | 'pack' | 'dus'
  unitPrice: number
  discountAmount?: number
}

function pad4(n: number) {
  return String(n).padStart(4, '0')
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
          unit_price,
          discount_amount,
          line_total
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        invoice.id,
        it.product_id,
        Math.trunc(Number(it.qty)),
        it.uom ?? 'pcs',
        Number(it.uom_to_pcs ?? 1),
        Math.trunc(Number(it.qty_pcs ?? 0)),
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

  const resolvedItems = []
  for (const it of params.items) {
    const pRes = await getPool().query(
      `select pack_size as "packSize", dus_size as "dusSize", pack_per_dus as "packPerDus" from products where id = $1 limit 1`,
      [it.productId],
    )
    const p = pRes.rows[0] as { packSize?: number; dusSize?: number; packPerDus?: number } | undefined
    if (!p) throw new Error('Produk tidak ditemukan')

    const qty = Math.trunc(it.qty)
    const packSize = Number(p.packSize ?? 0)
    const packPerDus = Number(p.packPerDus ?? 0)
    const dusSize = Number(p.dusSize ?? 0) || (packSize > 0 && packPerDus > 0 ? packSize * packPerDus : 0)

    const uomToPcs = it.uom === 'pcs' ? 1 : it.uom === 'pack' ? packSize : dusSize
    if (!Number.isFinite(uomToPcs) || uomToPcs < 1) {
      throw new Error('Konversi satuan produk belum diatur (pack/dus)')
    }
    const qtyPcs = qty * uomToPcs

    const promoDiscount = await calculateBestPromo(it.productId, it.qty, it.unitPrice)
    const manualDiscount = it.discountAmount ?? 0
    const finalDiscount = Math.max(promoDiscount, manualDiscount)
    
    resolvedItems.push({
      ...it,
      qty,
      uomToPcs,
      qtyPcs,
      discountAmount: finalDiscount,
      lineTotal: it.qty * it.unitPrice - finalDiscount,
    })
  }

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

    if (status === 'PENDING_APPROVAL') {
      const reasons: string[] = []
      if (creditCheck.exceedsLimit) reasons.push(`Limit Kredit: ${creditCheck.creditLimit}, Proyeksi Tagihan: ${creditCheck.projected}`)
      if (creditCheck.exceedsSalesOrderLimit) reasons.push(`Limit SO per Pelanggan: ${creditCheck.salesOrderLimit}, Total SO: ${totalAmount}`)
      await client.query(
        `insert into sales_order_approvals(sales_order_id, requested_by, status, notes) values ($1, $2, 'PENDING', $3)`,
        [salesOrder.id, params.createdBy, `Overlimit (${reasons.join(' | ')})`]
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
            unit_price,
            discount_amount,
            line_total
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          salesOrder.id,
          it.productId,
          it.qty,
          it.uom,
          it.uomToPcs,
          it.qtyPcs,
          it.unitPrice,
          it.discountAmount,
          it.lineTotal,
        ],
      )
    }

    if (status !== 'PENDING_APPROVAL') {
      await client.query(`update sales_orders set status = 'CONFIRMED' where id = $1`, [salesOrder.id])
      salesOrder.status = 'CONFIRMED'
      const invoice = await ensureInvoiceForSalesOrder(client as any, salesOrder.id, params.orderDate)
      return { salesOrder, invoice }
    }

    return { salesOrder }
  })
}

export async function getDeliveryOrderBySoId(soId: string) {
  const pool = getPool()
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
    [soId],
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
        doi.qty_pcs as "qtyPcs"
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

  const countRes = await pool.query(`select count(*)::int as c from sales_order_approvals where status = 'PENDING'`)
  
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
        c.name as "customerName",
        u.full_name as "requestedByName"
      from sales_order_approvals a
      join sales_orders so on so.id = a.sales_order_id
      join customers c on c.id = so.customer_id
      join users u on u.id = a.requested_by
      where a.status = 'PENDING'
      order by a.created_at asc
      limit $1 offset $2
    `,
    [pageSize, offset]
  )

  return { items: listRes.rows, total: Number(countRes.rows[0]?.c ?? 0) }
}

export async function processApproval(approvalId: string, action: 'APPROVED' | 'REJECTED', approverId: string, notes?: string) {
  return withTransaction(async (client) => {
    // 1. Update approval status
    const apprRes = await client.query(
      `
        update sales_order_approvals 
        set status = $2, approver_id = $3, updated_at = now()
        where id = $1 and status = 'PENDING'
        returning sales_order_id
      `,
      [approvalId, action, approverId]
    )

    if (!apprRes.rowCount) throw new Error('Approval tidak ditemukan atau sudah diproses')
    const soId = apprRes.rows[0].sales_order_id

    // 2. Update SO status
    const newSoStatus = action === 'APPROVED' ? 'CONFIRMED' : 'CANCELLED'
    await client.query(
      `update sales_orders set status = $2 where id = $1`,
      [soId, newSoStatus]
    )

    if (action === 'APPROVED') {
      const soRes = await client.query(`select order_date::text as "orderDate" from sales_orders where id = $1 limit 1`, [soId])
      const orderDate = String(soRes.rows[0]?.orderDate ?? new Date().toISOString().slice(0, 10))
      const invoice = await ensureInvoiceForSalesOrder(client as any, soId, orderDate)
      return { success: true, newSoStatus, invoice }
    }

    return { success: true, newSoStatus }
  })
}

export async function createDeliveryOrder(params: {
  salesOrderId: string
  createdBy: string
  deliveryDate: string
}) {
  return withTransaction(async (client) => {
    // 1. Get SO
    const soRes = await client.query('select * from sales_orders where id = $1', [params.salesOrderId])
    const so = soRes.rows[0]
    if (!so) throw new Error('SO not found')
    if (so.delivery_status !== 'PENDING') throw new Error('SO is already delivered or cancelled')
    if (!['CONFIRMED', 'DELIVERED'].includes(String(so.status))) {
      throw new Error('SO belum disetujui/terkonfirmasi')
    }

    const invoice = await getExistingInvoiceBySalesOrderId(client as any, params.salesOrderId)
    if (!invoice) {
      throw new Error('Invoice belum terbit. Setujui/konfirmasi SO terlebih dahulu.')
    }

    // 2. Get SO items
    const itemsRes = await client.query('select * from sales_order_items where sales_order_id = $1', [params.salesOrderId])
    const items = itemsRes.rows

    const dateKey = params.deliveryDate.replace(/-/g, '')
    const doNo = await generateNumber(client as any, 'DO', dateKey, 'delivery_orders', 'do_no')

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
    const warehouseId = await getDefaultWarehouseId(client as any)
    for (const it of items) {
      const qtyPcs = Number(it.qty_pcs ?? 0)
      const qty = Number(it.qty ?? 0)
      await client.query(
        'insert into delivery_order_items(delivery_order_id, product_id, qty, uom, uom_to_pcs, qty_pcs) values ($1, $2, $3, $4, $5, $6)',
        [
          deliveryOrder.id,
          it.product_id,
          Math.trunc(qty),
          it.uom ?? 'pcs',
          Number(it.uom_to_pcs ?? 1),
          Math.trunc(qtyPcs),
        ],
      )

      if (warehouseId) {
        await applyInventoryTransaction({
          warehouseId,
          productId: it.product_id,
          type: 'SALE_OUT',
          qtyDelta: -1 * Math.trunc(qtyPcs),
          createdBy: params.createdBy,
          refType: 'delivery_orders',
          refId: deliveryOrder.id,
          client: client as any,
        })
      }
    }

    // 5. Update SO status
    await client.query("update sales_orders set delivery_status = 'DELIVERED' where id = $1", [params.salesOrderId])

    return { deliveryOrder, invoice }
  })
}

export async function listSalesOrders(params: {
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
        so.status,
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
