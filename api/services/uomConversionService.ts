import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { ApiError } from '../lib/http.js'

const DEFAULT_UOMS = [
  { code: 'pcs', name: 'Pcs' },
  { code: 'pack', name: 'Pack' },
  { code: 'dus', name: 'Dus' },
  { code: 'lusin', name: 'Lusin' },
  { code: 'bal', name: 'Bal' },
  { code: 'karung', name: 'Karung' },
  { code: 'kaleng', name: 'Kaleng' },
  { code: 'renteng', name: 'Renteng' },
]

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }>
}

export type ProductUomMapping = {
  uomId: string
  uomCode: string
  uomName: string
  toBaseFactor: number
  isSale: boolean
  isPurchase: boolean
  isDefaultSale: boolean
  isDefaultPurchase: boolean
}

export type ProductUomMappingInput = {
  uomCode: string
  toBaseFactor: number
  isSale?: boolean
  isPurchase?: boolean
  isDefaultSale?: boolean
  isDefaultPurchase?: boolean
}

function normalizeCode(code: string) {
  return code.trim().toLowerCase()
}

function toPositiveNumber(value: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Faktor konversi harus lebih besar dari 0',
    })
  }
  return parsed
}

function ensureSingleBase(items: ProductUomMappingInput[]) {
  const baseItems = items.filter((it) => Number(it.toBaseFactor) === 1)
  if (baseItems.length !== 1) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Setiap produk wajib memiliki tepat 1 unit base dengan faktor 1',
    })
  }
  return normalizeCode(baseItems[0].uomCode)
}

async function seedDefaultUoms(client: Queryable) {
  await client.query(
    `
      insert into uoms(code, name)
      values ${DEFAULT_UOMS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')}
      on conflict (code) do update
      set
        name = excluded.name,
        is_active = true,
        updated_at = now()
    `,
    DEFAULT_UOMS.flatMap((u) => [u.code, u.name]),
  )
}

async function getProductByIdOrThrow(productId: string, client: Queryable) {
  const productRes = await client.query(
    `
      select id, base_uom_id as "baseUomId", pack_size as "packSize", dus_size as "dusSize", pack_per_dus as "packPerDus"
      from products
      where id = $1
      limit 1
    `,
    [productId],
  )
  const product = productRes.rows[0]
  if (!product) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Produk tidak ditemukan' })
  }
  return product as {
    id: string
    baseUomId: string | null
    packSize: number
    dusSize: number
    packPerDus: number
  }
}

function toIntOrNull(value: number) {
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < 1) return null
  if (Math.abs(value - rounded) > 0.000001) return null
  return rounded
}

async function syncLegacyColumnsWhenPossible(
  productId: string,
  mappings: ProductUomMapping[],
  client: Queryable,
) {
  const base = mappings.find((it) => it.toBaseFactor === 1)
  if (!base || base.uomCode !== 'pcs') return

  const pack = mappings.find((it) => it.uomCode === 'pack')
  const dus = mappings.find((it) => it.uomCode === 'dus')

  const nextPackSize = pack ? toIntOrNull(pack.toBaseFactor) : null
  const nextDusSize = dus ? toIntOrNull(dus.toBaseFactor) : null
  if (!nextPackSize && !nextDusSize) return

  const derivedPackPerDus =
    nextPackSize && nextDusSize && nextDusSize >= nextPackSize
      ? Math.max(1, Math.round(nextDusSize / nextPackSize))
      : null

  await client.query(
    `
      update products
      set
        pack_size = coalesce($2, pack_size),
        dus_size = coalesce($3, dus_size),
        pack_per_dus = coalesce($4, pack_per_dus),
        updated_at = now()
      where id = $1
    `,
    [productId, nextPackSize, nextDusSize, derivedPackPerDus],
  )
}

export async function listProductUomMappings(productId: string, tx?: Queryable) {
  const client = tx ?? getPool()
  await getProductByIdOrThrow(productId, client)
  const mappingRes = await client.query(
    `
      select
        pu.uom_id as "uomId",
        u.code as "uomCode",
        u.name as "uomName",
        pu.to_base_factor::float as "toBaseFactor",
        pu.is_sale as "isSale",
        pu.is_purchase as "isPurchase",
        pu.is_default_sale as "isDefaultSale",
        pu.is_default_purchase as "isDefaultPurchase"
      from product_uoms pu
      join uoms u on u.id = pu.uom_id
      where pu.product_id = $1
      order by pu.to_base_factor asc, u.code asc
    `,
    [productId],
  )
  return mappingRes.rows as ProductUomMapping[]
}

async function replaceProductUomMappingsInternal(
  params: {
    productId: string
    mappings: ProductUomMappingInput[]
  },
  client: Queryable,
) {
  await seedDefaultUoms(client)
  await getProductByIdOrThrow(params.productId, client)

  const source = params.mappings.map((it) => ({
    uomCode: normalizeCode(it.uomCode),
    toBaseFactor: toPositiveNumber(it.toBaseFactor),
    isSale: it.isSale ?? true,
    isPurchase: it.isPurchase ?? true,
    isDefaultSale: it.isDefaultSale ?? false,
    isDefaultPurchase: it.isDefaultPurchase ?? false,
  }))

  if (!source.length) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Minimal satu mapping satuan harus dikirim',
    })
  }

  const duplicateCode = source.find(
    (it, idx) => source.findIndex((x) => x.uomCode === it.uomCode) !== idx,
  )
  if (duplicateCode) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: `Duplikasi satuan pada payload: ${duplicateCode.uomCode}`,
    })
  }

  const baseUomCode = ensureSingleBase(source)
  const requestedCodes = source.map((it) => it.uomCode)
  const uomRes = await client.query(
    `
      select id, code, name
      from uoms
      where code = any($1::text[])
        and is_active = true
    `,
    [requestedCodes],
  )
  if (uomRes.rows.length !== requestedCodes.length) {
    const foundCodes = new Set((uomRes.rows as Array<{ code: string }>).map((it) => it.code))
    const missing = requestedCodes.filter((code) => !foundCodes.has(code))
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: `Satuan tidak ditemukan/aktif: ${missing.join(', ')}`,
    })
  }

  const uomMap = new Map(
    (uomRes.rows as Array<{ id: string; code: string; name: string }>).map((it) => [it.code, it]),
  )

  const baseUom = uomMap.get(baseUomCode)!
  const defaultSaleCount = source.filter((it) => it.isDefaultSale).length
  const defaultPurchaseCount = source.filter((it) => it.isDefaultPurchase).length
  if (defaultSaleCount > 1 || defaultPurchaseCount > 1) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Default sale/purchase maksimal satu untuk setiap produk',
    })
  }

  await client.query(
    `
      update products
      set base_uom_id = $2, updated_at = now()
      where id = $1
    `,
    [params.productId, baseUom.id],
  )

  await client.query('delete from product_uoms where product_id = $1', [params.productId])

  for (const item of source) {
    const row = uomMap.get(item.uomCode)!
    const shouldDefaultSale =
      defaultSaleCount === 0 ? item.uomCode === baseUomCode && item.isSale : item.isDefaultSale
    const shouldDefaultPurchase =
      defaultPurchaseCount === 0
        ? item.uomCode === baseUomCode && item.isPurchase
        : item.isDefaultPurchase

    await client.query(
      `
        insert into product_uoms (
          product_id,
          uom_id,
          to_base_factor,
          is_sale,
          is_purchase,
          is_default_sale,
          is_default_purchase
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        params.productId,
        row.id,
        item.toBaseFactor,
        item.isSale,
        item.isPurchase,
        shouldDefaultSale,
        shouldDefaultPurchase,
      ],
    )
  }

  const saved = await listProductUomMappings(params.productId, client)
  await syncLegacyColumnsWhenPossible(params.productId, saved, client)
  return saved
}

export async function replaceProductUomMappings(
  params: {
  productId: string
  mappings: ProductUomMappingInput[]
  },
  tx?: Queryable,
) {
  if (tx) return replaceProductUomMappingsInternal(params, tx)
  return withTransaction(async (client) => replaceProductUomMappingsInternal(params, client))
}

export async function syncLegacyProductToUomMappings(params: {
  productId: string
  packSize: number
  dusSize: number
}) {
  const pool = getPool()
  const product = await getProductByIdOrThrow(params.productId, pool)
  const effectivePackSize =
    Number(params.packSize) > 0 ? Number(params.packSize) : Number(product.packSize) || 1
  const effectiveDusSize =
    Number(params.dusSize) > 0
      ? Number(params.dusSize)
      : Number(product.dusSize) || effectivePackSize

  const mappings: ProductUomMappingInput[] = [
    {
      uomCode: 'pcs',
      toBaseFactor: 1,
      isSale: true,
      isPurchase: true,
      isDefaultSale: true,
      isDefaultPurchase: true,
    },
    { uomCode: 'pack', toBaseFactor: effectivePackSize, isSale: true, isPurchase: true },
    { uomCode: 'dus', toBaseFactor: effectiveDusSize, isSale: true, isPurchase: true },
  ]

  return replaceProductUomMappings({ productId: params.productId, mappings })
}

export async function getToBaseFactorByCode(params: { productId: string; uomCode: string }) {
  const pool = getPool()
  const code = normalizeCode(params.uomCode)
  const res = await pool.query(
    `
      select pu.to_base_factor::float as "toBaseFactor"
      from product_uoms pu
      join uoms u on u.id = pu.uom_id
      where pu.product_id = $1
        and u.code = $2
      limit 1
    `,
    [params.productId, code],
  )
  const row = res.rows[0] as { toBaseFactor: number } | undefined
  if (!row) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: `Mapping satuan produk tidak ditemukan untuk ${code}`,
    })
  }
  return row.toBaseFactor
}
