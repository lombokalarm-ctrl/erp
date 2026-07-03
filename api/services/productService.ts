import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { ApiError } from '../lib/http.js'
import {
  listProductUomMappings,
  replaceProductUomMappings,
  syncLegacyProductToUomMappings,
  type ProductUomMapping,
} from './uomConversionService.js'

export type Product = {
  id: string
  sku: string
  name: string
  unit: string
  isActive: boolean
  supplierId?: string | null
  supplierName?: string | null
  purchasePrice: string
  salePrice: string
  categoryPrices?: Record<string, Record<string, number>>
  unitPrices?: Record<string, number>
  packSize: number
  dusSize: number
  packPerDus: number
  baseUomId?: string | null
  minStockBase?: string
  reorderQtyBase?: string
  leadTimeDays?: number
  bufferDays?: number
  currentStockBase?: string
  uomMappings?: ProductUomMapping[]
}

export type ProductImportRow = {
  row?: number
  sku?: string
  supplierName?: string
  name?: string
  bigUnit?: string
  baseUnit?: string
  purchasePrice?: number | string
  salePrice?: number | string
  conversion?: number | string
}

const PRODUCT_IMPORT_CATEGORIES = [
  'RETAIL',
  'GROSIR',
  'MODERN RETAIL',
  'HOREKA',
  'NASIONAL MODERN RETAIL',
]

const UNIT_SYNONYMS: Record<string, string> = {
  BALL: 'BAL',
  PIECE: 'PCS',
  RENCENG: 'RENTENG',
  RENCENGS: 'RENTENG',
}

function toNullableString(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function toNonNegativeNumber(value: unknown, label: string) {
  const normalized =
    typeof value === 'number'
      ? value
      : Number(String(value ?? '').trim().replace(/\./g, '').replace(/,/g, '.'))
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label} harus berupa angka >= 0`)
  }
  return normalized
}

function toPositiveNumber(value: unknown, label: string) {
  const normalized =
    typeof value === 'number'
      ? value
      : Number(String(value ?? '').trim().replace(/\./g, '').replace(/,/g, '.'))
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${label} harus berupa angka > 0`)
  }
  return normalized
}

function toUomNameFromCode(code: string) {
  const normalized = code.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'pcs') return 'Pcs'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function normalizeUnit(raw: unknown) {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!cleaned) return null
  const upper = cleaned.toUpperCase()
  const canonical = UNIT_SYNONYMS[upper] ?? upper
  const code = canonical.toLowerCase()
  return {
    code,
    name: toUomNameFromCode(code),
  }
}

function buildImportedUnitPrices(baseUnitCode: string, bigUnitCode: string, salePrice: number, factor: number) {
  const prices: Record<string, number> = {
    [baseUnitCode]: salePrice,
  }
  if (bigUnitCode !== baseUnitCode) {
    prices[bigUnitCode] = salePrice * factor
  }
  return prices
}

function buildImportedCategoryPrices(unitPrices: Record<string, number>) {
  return PRODUCT_IMPORT_CATEGORIES.reduce(
    (acc, category) => ({
      ...acc,
      [category]: { ...unitPrices },
    }),
    {} as Record<string, Record<string, number>>,
  )
}

async function ensureImportUoms(codes: Array<{ code: string; name: string }>) {
  const pool = getPool()
  const unique = Array.from(
    new Map(
      codes
        .filter((it) => it.code && it.name)
        .map((it) => [it.code.trim().toLowerCase(), { code: it.code.trim().toLowerCase(), name: it.name.trim() }]),
    ).values(),
  )

  if (!unique.length) return new Map<string, { id: string; code: string }>()

  const valuesSql = unique.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, true)`).join(', ')
  const params = unique.flatMap((it) => [it.code, it.name])
  await pool.query(
    `
      insert into uoms(code, name, is_active)
      values ${valuesSql}
      on conflict (code) do update
      set
        name = excluded.name,
        is_active = true,
        updated_at = now()
    `,
    params,
  )

  const res = await pool.query(
    `
      select id, code
      from uoms
      where code = any($1::text[])
    `,
    [unique.map((it) => it.code)],
  )
  return new Map(
    (res.rows as Array<{ id: string; code: string }>).map((row) => [row.code.toLowerCase(), row]),
  )
}

async function upsertImportedProduct(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  input: {
    sku: string
    name: string
    unit: string
    supplierId?: string | null
    purchasePrice: number
    salePrice: number
    unitPrices: Record<string, number>
    categoryPrices: Record<string, Record<string, number>>
  },
) {
  const existingRes = await client.query(`select id from products where lower(sku) = lower($1) limit 1`, [
    input.sku,
  ])
  const existingId = existingRes.rows[0]?.id as string | undefined

  if (existingId) {
    const updatedRes = await client.query(
      `
        update products
        set sku = $2,
            name = $3,
            unit = $4,
            supplier_id = $5,
            purchase_price = $6,
            sale_price = $7,
            category_prices = $8,
            unit_prices = $9,
            min_stock_base = 0,
            reorder_qty_base = 0,
            lead_time_days = 0,
            buffer_days = 0,
            updated_at = now()
        where id = $1
        returning id
      `,
      [
        existingId,
        input.sku,
        input.name,
        input.unit,
        input.supplierId ?? null,
        input.purchasePrice,
        input.salePrice,
        JSON.stringify(input.categoryPrices),
        JSON.stringify(input.unitPrices),
      ],
    )
    return { id: String(updatedRes.rows[0].id), mode: 'updated' as const }
  }

  const createdRes = await client.query(
    `
      insert into products(
        sku, name, unit, supplier_id, purchase_price, sale_price, category_prices, unit_prices,
        pack_size, pack_per_dus, dus_size, min_stock_base, reorder_qty_base, lead_time_days, buffer_days
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, 1, 1, 1, 0, 0, 0, 0)
      returning id
    `,
    [
      input.sku,
      input.name,
      input.unit,
      input.supplierId ?? null,
      input.purchasePrice,
      input.salePrice,
      JSON.stringify(input.categoryPrices),
      JSON.stringify(input.unitPrices),
    ],
  )
  return { id: String(createdRes.rows[0].id), mode: 'created' as const }
}

export async function listProducts(params: {
  page?: number
  pageSize?: number
  q?: string
  isActive?: boolean | 'all'
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize
  const q = params.q?.trim()

  const where: string[] = []
  const values: unknown[] = []

  if (params.isActive !== 'all') {
    values.push(params.isActive ?? true)
    where.push(`p.is_active = $${values.length}`)
  }

  if (q) {
    values.push(`%${q.toLowerCase()}%`)
    where.push(`(lower(p.sku) like $${values.length} or lower(p.name) like $${values.length})`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from products p ${whereSql}`,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const listRes = await pool.query(
    `
      with stock_wh01 as (
        select
          b.product_id as "productId",
          coalesce(sum(b.qty), 0)::text as "currentStockBase"
        from inventory_balances b
        join warehouses w on w.id = b.warehouse_id
        where w.code = 'WH-01'
        group by b.product_id
      )
      select
        p.id,
        p.sku,
        p.name,
        p.unit,
        p.is_active as "isActive",
        p.supplier_id as "supplierId",
        sp.name as "supplierName",
        p.purchase_price::text as "purchasePrice",
        p.sale_price::text as "salePrice",
        p.category_prices as "categoryPrices",
        p.unit_prices as "unitPrices",
        p.pack_size as "packSize",
        p.dus_size as "dusSize",
        p.pack_per_dus as "packPerDus",
        p.base_uom_id as "baseUomId",
        p.min_stock_base::text as "minStockBase",
        p.reorder_qty_base::text as "reorderQtyBase",
        p.lead_time_days as "leadTimeDays",
        p.buffer_days as "bufferDays",
        coalesce(st."currentStockBase", '0') as "currentStockBase"
      from products p
      left join suppliers sp on sp.id = p.supplier_id
      left join stock_wh01 st on st."productId" = p.id
      ${whereSql}
      order by
        case when sp.name is null or trim(sp.name) = '' then 1 else 0 end asc,
        lower(coalesce(sp.name, '')) asc,
        lower(p.name) asc,
        lower(p.sku) asc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return {
    items: listRes.rows as Product[],
    total,
  }
}

export async function getProductById(id: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        p.id,
        p.sku,
        p.name,
        p.unit,
        p.is_active as "isActive",
        p.supplier_id as "supplierId",
        s.name as "supplierName",
        p.purchase_price::text as "purchasePrice",
        p.sale_price::text as "salePrice",
        p.category_prices as "categoryPrices",
        p.unit_prices as "unitPrices",
        p.pack_size as "packSize",
        p.dus_size as "dusSize",
        p.pack_per_dus as "packPerDus",
        p.base_uom_id as "baseUomId",
        p.min_stock_base::text as "minStockBase",
        p.reorder_qty_base::text as "reorderQtyBase",
        p.lead_time_days as "leadTimeDays",
        p.buffer_days as "bufferDays"
      from products p
      left join suppliers s on s.id = p.supplier_id
      where p.id = $1
      limit 1
    `,
    [id],
  )
  const row = res.rows[0] as Product | undefined
  if (!row) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Produk tidak ditemukan' })
  }
  row.uomMappings = await listProductUomMappings(id).catch(() => [])
  return row
}

export async function createProduct(input: {
  sku: string
  name: string
  unit: string
  supplierId?: string | null
  isActive?: boolean
  purchasePrice: number
  salePrice: number
  categoryPrices?: Record<string, Record<string, number>>
  unitPrices?: Record<string, number>
  packSize?: number
  packPerDus?: number
  dusSize?: number
  minStockBase?: number
  reorderQtyBase?: number
  leadTimeDays?: number
  bufferDays?: number
}) {
  const packSize = input.packSize ?? 1
  const packPerDus = input.packPerDus ?? 1
  const dusSize = input.dusSize ?? packSize * packPerDus
  const normalizedUnit = String(input.unit || 'pcs').trim().toLowerCase() || 'pcs'
  const createdId = await withTransaction(async (client) => {
    const res = await client.query(
      `
        insert into products(
          sku, name, unit, supplier_id, purchase_price, sale_price, category_prices, unit_prices, pack_size, pack_per_dus, dus_size,
          min_stock_base, reorder_qty_base, lead_time_days, buffer_days, is_active
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        returning id
      `,
      [
        input.sku,
        input.name,
        normalizedUnit,
        input.supplierId ?? null,
        input.purchasePrice,
        input.salePrice,
        JSON.stringify(input.categoryPrices || {}),
        JSON.stringify(input.unitPrices || { [normalizedUnit]: input.salePrice }),
        packSize,
        packPerDus,
        dusSize,
        input.minStockBase ?? 0,
        input.reorderQtyBase ?? 0,
        input.leadTimeDays ?? 0,
        input.bufferDays ?? 0,
        input.isActive ?? true,
      ],
    )
    const created = res.rows[0] as { id: string }
    await syncLegacyProductToUomMappings(
      {
        productId: created.id,
        baseUomCode: normalizedUnit,
        packSize,
        dusSize,
      },
      client,
    )
    return created.id
  })
  return getProductById(createdId)
}

export async function deleteProduct(id: string) {
  const pool = getPool()
  try {
    const res = await pool.query('delete from products where id = $1 returning id', [id])
    if (res.rowCount === 0) {
      throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Produk tidak ditemukan' })
    }
  } catch (err: any) {
    if (err.code === '23503') {
      throw new ApiError({ code: 'FOREIGN_KEY_VIOLATION', status: 400, message: 'Tidak dapat menghapus produk karena data sudah digunakan pada transaksi' })
    }
    throw err
  }
}

export async function updateProduct(
  id: string,
  input: Partial<{
    sku: string
    name: string
    unit: string
    supplierId: string | null
    isActive: boolean
    purchasePrice: number
    salePrice: number
    categoryPrices: Record<string, Record<string, number>>
    unitPrices: Record<string, number>
    packSize: number
    packPerDus: number
    dusSize: number
    minStockBase: number
    reorderQtyBase: number
    leadTimeDays: number
    bufferDays: number
  }>,
) {
  const pool = getPool()
  const current = await getProductById(id)
  const nextUnitPrices = input.unitPrices
    ? { ...(current.unitPrices || {}), ...input.unitPrices }
    : current.unitPrices || {}
  const nextPackSize = input.packSize ?? current.packSize ?? 1
  const nextPackPerDus = input.packPerDus ?? current.packPerDus ?? 1
  const nextDusSize = input.dusSize ?? nextPackSize * nextPackPerDus

  const res = await pool.query(
    `
      update products
      set sku = $2,
          name = $3,
          unit = $4,
          supplier_id = $5,
          is_active = $6,
          purchase_price = $7,
          sale_price = $8,
          category_prices = $9,
          unit_prices = $10,
          pack_size = $11,
          pack_per_dus = $12,
          dus_size = $13,
          min_stock_base = $14,
          reorder_qty_base = $15,
          lead_time_days = $16,
          buffer_days = $17,
          updated_at = now()
      where id = $1
      returning
        id,
        sku,
        name,
        unit,
        is_active as "isActive",
        supplier_id as "supplierId",
        purchase_price::text as "purchasePrice",
        sale_price::text as "salePrice",
        category_prices as "categoryPrices",
        unit_prices as "unitPrices",
        pack_size as "packSize",
        dus_size as "dusSize",
        pack_per_dus as "packPerDus",
        base_uom_id as "baseUomId",
        min_stock_base::text as "minStockBase",
        reorder_qty_base::text as "reorderQtyBase",
        lead_time_days as "leadTimeDays",
        buffer_days as "bufferDays"
    `,
    [
      id,
      input.sku ?? current.sku,
      input.name ?? current.name,
      input.unit ?? current.unit,
      input.supplierId ?? current.supplierId ?? null,
      input.isActive ?? current.isActive,
      input.purchasePrice ?? Number(current.purchasePrice),
      input.salePrice ?? Number(current.salePrice),
      input.categoryPrices ? JSON.stringify(input.categoryPrices) : JSON.stringify(current.categoryPrices || {}),
      JSON.stringify(nextUnitPrices),
      nextPackSize,
      nextPackPerDus,
      nextDusSize,
      input.minStockBase ?? Number(current.minStockBase ?? 0),
      input.reorderQtyBase ?? Number(current.reorderQtyBase ?? 0),
      input.leadTimeDays ?? Number(current.leadTimeDays ?? 0),
      input.bufferDays ?? Number(current.bufferDays ?? 0),
    ],
  )

  const updated = res.rows[0] as Product
  return getProductById(updated.id)
}

export async function importProducts(rows: ProductImportRow[]) {
  const prepared = rows.filter((row) =>
    [row.sku, row.supplierName, row.name, row.bigUnit, row.baseUnit].some((value) => String(value ?? '').trim()),
  )

  const neededUoms = prepared.flatMap((row) => {
    const base = normalizeUnit(row.baseUnit)
    const big = normalizeUnit(row.bigUnit)
    return [base, big].filter(Boolean) as Array<{ code: string; name: string }>
  })
  const uomByCode = await ensureImportUoms(neededUoms)

  let created = 0
  let updated = 0
  const errors: Array<{ row: number; message: string; sku?: string }> = []

  for (let i = 0; i < prepared.length; i++) {
    const row = prepared[i]
    const rowNo = row.row ?? i + 2
    try {
      const sku = toNullableString(row.sku)
      const supplierName = toNullableString(row.supplierName)
      const name = toNullableString(row.name)
      if (!sku || !supplierName || !name) {
        throw new Error('Kolom SKU, Supplier, dan Nama Barang wajib diisi')
      }

      const baseUnit = normalizeUnit(row.baseUnit)
      const bigUnit = normalizeUnit(row.bigUnit)
      if (!baseUnit || !bigUnit) {
        throw new Error('Unit besar dan unit kecil wajib diisi')
      }

      const purchasePrice = toNonNegativeNumber(row.purchasePrice, 'Harga beli')
      const salePrice = toNonNegativeNumber(row.salePrice, 'Harga jual')
      const conversion = toPositiveNumber(row.conversion, 'Konversi')

      const supplierRes = await getPool().query(
        `
          select id
          from suppliers
          where (lower(code) = lower($1) or lower(name) = lower($1))
            and is_active = true
          limit 1
        `,
        [supplierName],
      )
      if (!supplierRes.rows[0]?.id) {
        throw new Error(`Supplier "${supplierName}" tidak ditemukan di master supplier`)
      }
      const supplierId = String(supplierRes.rows[0].id)

      const baseUom = uomByCode.get(baseUnit.code)
      const bigUom = uomByCode.get(bigUnit.code)
      if (!baseUom || !bigUom) {
        throw new Error(`UOM tidak ditemukan/aktif: ${!baseUom ? baseUnit.code : bigUnit.code}`)
      }

      const unitPrices = buildImportedUnitPrices(baseUnit.code, bigUnit.code, salePrice, conversion)
      const categoryPrices = buildImportedCategoryPrices(unitPrices)

      const result = await withTransaction(async (client) => {
        const product = await upsertImportedProduct(client, {
          sku,
          name,
          unit: baseUnit.code,
          supplierId,
          purchasePrice,
          salePrice,
          unitPrices,
          categoryPrices,
        })

        await replaceProductUomMappings(
          {
            productId: product.id,
            mappings: [
              {
                uomCode: baseUnit.code,
                toBaseFactor: 1,
                isSale: true,
                isPurchase: true,
                isDefaultSale: true,
                isDefaultPurchase: true,
              },
              ...(bigUnit.code === baseUnit.code
                ? []
                : [
                    {
                      uomCode: bigUnit.code,
                      toBaseFactor: conversion,
                      isSale: true,
                      isPurchase: true,
                    },
                  ]),
            ],
          },
          client,
        )

        return product
      })

      if (result.mode === 'created') created += 1
      else updated += 1
    } catch (err: any) {
      errors.push({
        row: rowNo,
        sku: row.sku ? String(row.sku) : undefined,
        message: err instanceof ApiError ? err.message : String(err?.message ?? err),
      })
    }
  }

  return {
    total: prepared.length,
    created,
    updated,
    failed: errors.length,
    errors,
  }
}
