import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
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
    throw new Error('Minimal 1 item barang retur')
  }

  if (input.type === 'SALES_RETURN' && !input.customerId) {
    throw new Error('Customer wajib diisi untuk Sales Return')
  }
  if (input.type === 'PURCHASE_RETURN' && !input.supplierId) {
    throw new Error('Supplier wajib diisi untuk Purchase Return')
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
      if (!whId) throw new Error('Warehouse tidak ditemukan')
    }

    // Insert Returns header
    const retRes = await client.query(
      `
        insert into returns (
          return_no, type, customer_id, supplier_id, reference_no,
          warehouse_id, return_date, status, notes, created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', $8, $9)
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
        input.createdBy
      ]
    )
    const returnId = retRes.rows[0].id

    // Insert Items and Adjust Inventory
    for (const it of resolvedItems) {
      await client.query(
        `insert into return_items (return_id, product_id, qty, uom, uom_to_pcs, qty_pcs, reason) values ($1, $2, $3, $4, $5, $6, $7)`,
        [returnId, it.productId, it.qty, it.uom, it.uomToPcs, it.qtyPcs, it.reason ?? null]
      )

      // Logic Inventory:
      // Sales Return (Pelanggan balikin ke kita) -> Stok Bertambah
      // Purchase Return (Kita balikin ke Supplier) -> Stok Berkurang
      const qtyDelta = input.type === 'SALES_RETURN' ? it.qtyPcs : -Math.abs(it.qtyPcs)
      
      await applyInventoryTransaction({
        warehouseId: whId,
        productId: it.productId,
        type: input.type,
        qtyDelta,
        refType: 'returns',
        refId: returnId,
        note: `Retur ${returnNo} - ${it.reason || 'Tanpa keterangan'}`,
        createdBy: input.createdBy,
        client
      })
    }

    return { id: returnId, returnNo }
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
        r.reference_no as "referenceNo",
        r.return_date::text as "returnDate",
        r.notes,
        c.name as "customerName",
        s.name as "supplierName"
      from returns r
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
        r.reference_no as "referenceNo",
        r.return_date::text as "returnDate",
        r.notes,
        c.name as "customerName",
        s.name as "supplierName",
        u.full_name as "createdBy"
      from returns r
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