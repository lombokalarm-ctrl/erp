import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { ApiError, ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createProduct,
  getProductById,
  importProducts,
  listProducts,
  updateProduct,
  deleteProduct,
} from '../../services/productService.js'
import {
  listProductUomMappings,
  replaceProductUomMappings,
} from '../../services/uomConversionService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

function normalizeHeader(input: unknown) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function sheetToObjects(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' })
  const headerRow = (rows[0] ?? []) as unknown[]
  const seen = new Map<string, number>()
  const headers = headerRow.map((h) => {
    const base = normalizeHeader(h)
    if (!base) return ''
    const next = (seen.get(base) ?? 0) + 1
    seen.set(base, next)
    return next === 1 ? base : `${base}_${next}`
  })

  return rows.slice(1).map((row, idx) => {
    const source = row as unknown[]
    const out: Record<string, unknown> = { __row: idx + 2 }
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i]
      if (!key) continue
      out[key] = source[i]
    }
    return out
  })
}

function toStringCell(value: unknown) {
  return String(value ?? '').trim()
}

router.get(
  '/',
  authenticate,
  authorizeAny(['products:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          q: z.string().optional(),
        })
        .parse(req.query)

      const result = await listProducts(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['products:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          sku: z.string().min(1),
          name: z.string().min(1),
          unit: z.string().min(1).default('pcs'),
          purchasePrice: z.coerce.number().min(0),
          salePrice: z.coerce.number().min(0),
          categoryPrices: z.record(z.record(z.coerce.number().min(0))).optional(),
          unitPrices: z.record(z.coerce.number().min(0)).optional(),
          packSize: z.coerce.number().int().min(1).default(1).optional(),
          packPerDus: z.coerce.number().int().min(1).default(1).optional(),
          dusSize: z.coerce.number().int().min(1).optional(),
          minStockBase: z.coerce.number().min(0).optional(),
          reorderQtyBase: z.coerce.number().min(0).optional(),
          leadTimeDays: z.coerce.number().int().min(0).optional(),
          bufferDays: z.coerce.number().int().min(0).optional(),
        })
        .parse(req.body)

      const created = await createProduct({
        sku: body.sku,
        name: body.name,
        unit: body.unit ?? 'pcs',
        purchasePrice: body.purchasePrice,
        salePrice: body.salePrice,
        categoryPrices: body.categoryPrices,
        unitPrices: body.unitPrices ?? { pcs: body.salePrice, pack: 0, dus: 0 },
        packSize: body.packSize ?? 1,
        packPerDus: body.packPerDus ?? 1,
        dusSize: body.dusSize,
        minStockBase: body.minStockBase ?? 0,
        reorderQtyBase: body.reorderQtyBase ?? 0,
        leadTimeDays: body.leadTimeDays ?? 0,
        bufferDays: body.bufferDays ?? 0,
      } as any)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PRODUCT_CREATE',
        entity: 'products',
        entityId: created.id,
        payload: { sku: created.sku, name: created.name },
      })
      ok(res, created)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/import',
  authenticate,
  authorizeAny(['products:write']),
  importUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'File wajib diunggah',
        })
      }

      const filename = req.file.originalname.toLowerCase()
      if (!filename.endsWith('.csv') && !filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'Format file harus .csv, .xlsx, atau .xls',
        })
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'File tidak memiliki sheet',
        })
      }

      const rows = sheetToObjects(workbook.Sheets[sheetName]).map((raw) => ({
        row: Number(raw.__row ?? 0) || undefined,
        sku: toStringCell(raw.kode_barcode ?? raw.sku ?? raw.kode),
        supplierName: toStringCell(raw.supplier),
        name: toStringCell(raw.nama_barang ?? raw.name ?? raw.nama),
        bigUnit: toStringCell(raw.unit ?? raw.unit_besar),
        purchasePrice: (raw.harga_beli ?? raw.purchase_price ?? raw.harga_beli_dasar ?? 0) as
          | string
          | number,
        salePrice: (raw.harga_jual ?? raw.sale_price ?? raw.harga_jual_dasar ?? 0) as string | number,
        conversion: (raw.konversi ?? raw.conversion ?? raw.faktor ?? 0) as string | number,
        baseUnit: toStringCell(raw.unit_2 ?? raw.unit_kecil ?? raw.base_unit),
      }))

      const result = await importProducts(rows)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PRODUCT_IMPORT',
        entity: 'products',
        payload: {
          filename: req.file.originalname,
          total: result.total,
          created: result.created,
          updated: result.updated,
          failed: result.failed,
        },
      })

      ok(res, {
        ...result,
        expectedColumns: [
          'Kode / Barcode',
          'Supplier',
          'Nama Barang',
          'Unit',
          'Harga beli',
          'Harga Jual',
          'Konversi',
          'Unit',
        ],
      })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id/uoms',
  authenticate,
  authorizeAny(['products:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mappings = await listProductUomMappings(req.params.id)
      ok(res, mappings)
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/:id/uoms',
  authenticate,
  authorizeAny(['products:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z
        .object({
          mappings: z
            .array(
              z.object({
                uomCode: z.string().min(1),
                toBaseFactor: z.coerce.number().positive(),
                isSale: z.coerce.boolean().optional(),
                isPurchase: z.coerce.boolean().optional(),
                isDefaultSale: z.coerce.boolean().optional(),
                isDefaultPurchase: z.coerce.boolean().optional(),
              }),
            )
            .min(1),
        })
      const bodyParsed = bodySchema.safeParse(req.body)
      if (!bodyParsed.success) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'Payload mapping UOM tidak valid',
          details: bodyParsed.error.issues,
        })
      }
      const body = bodyParsed.data

      const mappings = await replaceProductUomMappings({
        productId: req.params.id,
        mappings: body.mappings.map((item) => ({
          uomCode: item.uomCode,
          toBaseFactor: item.toBaseFactor,
          isSale: item.isSale,
          isPurchase: item.isPurchase,
          isDefaultSale: item.isDefaultSale,
          isDefaultPurchase: item.isDefaultPurchase,
        })),
      })
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PRODUCT_UOMS_UPDATE',
        entity: 'products',
        entityId: req.params.id,
        payload: { mappings: body.mappings },
      })
      ok(res, mappings)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id',
  authenticate,
  authorizeAny(['products:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await getProductById(req.params.id)
      ok(res, product)
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/:id',
  authenticate,
  authorizeAny(['products:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          sku: z.string().min(1).optional(),
          name: z.string().min(1).optional(),
          unit: z.string().min(1).optional(),
          purchasePrice: z.coerce.number().min(0).optional(),
          salePrice: z.coerce.number().min(0).optional(),
          categoryPrices: z.record(z.record(z.coerce.number().min(0))).optional(),
          unitPrices: z.record(z.coerce.number().min(0)).optional(),
          packSize: z.coerce.number().int().min(1).optional(),
          packPerDus: z.coerce.number().int().min(1).optional(),
          dusSize: z.coerce.number().int().min(1).optional(),
          minStockBase: z.coerce.number().min(0).optional(),
          reorderQtyBase: z.coerce.number().min(0).optional(),
          leadTimeDays: z.coerce.number().int().min(0).optional(),
          bufferDays: z.coerce.number().int().min(0).optional(),
        })
        .parse(req.body)

      const updated = await updateProduct(req.params.id, body as any)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PRODUCT_UPDATE',
        entity: 'products',
        entityId: updated.id,
        payload: body,
      })
      ok(res, updated)
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/:id',
  authenticate,
  authorizeAny(['products:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteProduct(req.params.id)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PRODUCT_DELETE',
        entity: 'products',
        entityId: req.params.id,
        payload: { id: req.params.id },
      })
      ok(res, { deleted: true })
    } catch (err) {
      next(err)
    }
  },
)

export default router
