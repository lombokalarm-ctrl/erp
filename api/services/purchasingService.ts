import type { PoolClient } from 'pg'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { applyInventoryTransaction } from './inventoryService.js'
import { ApiError } from '../lib/http.js'
import { getToBaseFactorByCode } from './uomConversionService.js'

function pad4(n: number) {
  return String(n).padStart(4, '0')
}

async function generateNumber(
  client: PoolClient,
  prefix: string,
  dateKey: string,
  table: 'purchase_orders' | 'goods_receipts',
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

export async function listPurchaseOrders(params: { page?: number; pageSize?: number }) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const totalRes = await pool.query(`select count(*)::int as c from purchase_orders`)
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select
        po.id,
        po.po_no as "poNo",
        po.order_date::text as "orderDate",
        po.status,
        po.total_amount::text as "totalAmount",
        s.name as "supplierName"
      from purchase_orders po
      join suppliers s on s.id = po.supplier_id
      order by po.order_date desc, po.po_no desc
      limit $1 offset $2
    `,
    [pageSize, offset],
  )

  return { items: res.rows, total }
}

export async function createPurchaseOrder(params: {
  supplierId: string
  createdBy: string
  orderDate: string
  notes?: string
  items: { productId: string; qty: number; uom: 'pcs' | 'pack' | 'dus'; unitPrice: number }[]
}) {
  const pool = getPool()
  const resolvedItems = []
  
  for (const it of params.items) {
    const pRes = await pool.query(
      `select pack_size as "packSize", pack_per_dus as "packPerDus", dus_size as "dusSize" from products where id = $1 limit 1`,
      [it.productId],
    )
    const p = pRes.rows[0] as { packSize?: number; packPerDus?: number; dusSize?: number } | undefined
    if (!p) throw new Error('Produk tidak ditemukan')

    const packSize = Number(p.packSize ?? 0)
    const packPerDus = Number(p.packPerDus ?? 0)
    const dusSize = Number(p.dusSize ?? 0) || (packSize > 0 && packPerDus > 0 ? packSize * packPerDus : 0)

    const uomToPcs = it.uom === 'pcs' ? 1 : it.uom === 'pack' ? packSize : dusSize
    if (!Number.isFinite(uomToPcs) || uomToPcs < 1) {
      throw new Error('Konversi satuan produk belum diatur (pack/dus)')
    }
    
    const qty = Math.trunc(it.qty)
    const qtyPcs = qty * uomToPcs

    resolvedItems.push({
      ...it,
      qty,
      uomToPcs,
      qtyPcs,
      lineTotal: qty * it.unitPrice,
    })
  }

  const subtotal = resolvedItems.reduce((a, it) => a + it.lineTotal, 0)
  const totalAmount = subtotal
  const dateKey = params.orderDate.replace(/-/g, '')

  return withTransaction(async (client) => {
    const poNo = await generateNumber(client, 'PO', dateKey, 'purchase_orders', 'po_no')
    const poRes = await client.query(
      `
        insert into purchase_orders(
          po_no, supplier_id, created_by, order_date, status, subtotal, total_amount, notes
        )
        values ($1,$2,$3,$4,'CONFIRMED',$5,$6,$7)
        returning *
      `,
      [
        poNo,
        params.supplierId,
        params.createdBy,
        params.orderDate,
        subtotal,
        totalAmount,
        params.notes ?? null,
      ],
    )
    const po = poRes.rows[0]

    for (const it of resolvedItems) {
      await client.query(
        `
          insert into purchase_order_items(purchase_order_id, product_id, qty, uom, uom_to_pcs, qty_pcs, unit_price, line_total)
          values ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [po.id, it.productId, it.qty, it.uom, it.uomToPcs, it.qtyPcs, it.unitPrice, it.lineTotal],
      )
    }

    return po
  })
}

export async function createGoodsReceipt(params: {
  purchaseOrderId?: string
  warehouseId: string
  receivedDate: string
  createdBy: string
  notes?: string
  items: { productId: string; qty: number; uom: string }[]
}) {
  const pool = getPool()
  const resolvedItems = []
  
  for (const it of params.items) {
    const pRes = await pool.query(
      `
        select
          pack_size as "packSize",
          pack_per_dus as "packPerDus",
          dus_size as "dusSize",
          base_uom_id as "baseUomId"
        from products
        where id = $1
        limit 1
      `,
      [it.productId],
    )
    const p = pRes.rows[0] as
      | { packSize?: number; packPerDus?: number; dusSize?: number; baseUomId?: string | null }
      | undefined
    if (!p) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Produk tidak ditemukan' })
    }

    const uomCode = String(it.uom || '').trim().toLowerCase()
    const packSize = Number(p.packSize ?? 0)
    const packPerDus = Number(p.packPerDus ?? 0)
    const dusSize = Number(p.dusSize ?? 0) || (packSize > 0 && packPerDus > 0 ? packSize * packPerDus : 0)

    let uomToPcs = uomCode === 'pcs' ? 1 : uomCode === 'pack' ? packSize : uomCode === 'dus' ? dusSize : 0
    let qtyBase = Number(it.qty) * uomToPcs
    let conversionSource: 'legacy' | 'product_uom_v2' = 'legacy'

    try {
      const toBaseFactor = await getToBaseFactorByCode({
        productId: it.productId,
        uomCode,
      })
      if (Number.isFinite(toBaseFactor) && toBaseFactor > 0) {
        uomToPcs = Number(toBaseFactor)
        qtyBase = Number(it.qty) * Number(toBaseFactor)
        conversionSource = 'product_uom_v2'
      }
    } catch {
      // Fallback ke kolom legacy agar produk lama tetap bisa diproses.
    }

    if (!Number.isFinite(uomToPcs) || uomToPcs < 1) {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: `Konversi satuan produk belum diatur untuk unit ${uomCode}`,
      })
    }
    
    const qty = Number(it.qty)
    const qtyPcs = Math.round(qty * uomToPcs)

    resolvedItems.push({
      ...it,
      qty,
      uom: uomCode,
      uomToPcs,
      qtyPcs,
      qtyBase,
      baseUomId: p.baseUomId ?? null,
      conversionSource,
    })
  }

  const dateKey = params.receivedDate.replace(/-/g, '')

  return withTransaction(async (client) => {
    const grnNo = await generateNumber(client, 'GRN', dateKey, 'goods_receipts', 'grn_no')
    const grnRes = await client.query(
      `
        insert into goods_receipts(
          grn_no, purchase_order_id, warehouse_id, received_date, created_by, notes
        )
        values ($1,$2,$3,$4,$5,$6)
        returning *
      `,
      [
        grnNo,
        params.purchaseOrderId ?? null,
        params.warehouseId,
        params.receivedDate,
        params.createdBy,
        params.notes ?? null,
      ],
    )
    const grn = grnRes.rows[0]

    for (const it of resolvedItems) {
      await client.query(
        `
          insert into goods_receipt_items(
            goods_receipt_id,
            product_id,
            qty,
            uom,
            uom_to_pcs,
            qty_pcs,
            qty_base,
            base_uom_id,
            conversion_source
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          grn.id,
          it.productId,
          it.qty,
          it.uom,
          it.uomToPcs,
          it.qtyPcs,
          it.qtyBase,
          it.baseUomId,
          it.conversionSource,
        ],
      )

      await applyInventoryTransaction({
        warehouseId: params.warehouseId,
        productId: it.productId,
        type: 'PURCHASE_IN',
        qtyDelta: it.qtyPcs,
        createdBy: params.createdBy,
        refType: 'goods_receipts',
        refId: grn.id,
        client,
      })
    }

    return grn
  })
}

export async function listGoodsReceipts(params: { page?: number; pageSize?: number }) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const totalRes = await pool.query(`select count(*)::int as c from goods_receipts`)
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select
        grn.id,
        grn.grn_no as "grnNo",
        grn.received_date::text as "receivedDate",
        w.code as "warehouseCode",
        grn.purchase_order_id as "purchaseOrderId"
      from goods_receipts grn
      join warehouses w on w.id = grn.warehouse_id
      order by grn.received_date desc, grn.grn_no desc
      limit $1 offset $2
    `,
    [pageSize, offset],
  )

  return { items: res.rows, total }
}

