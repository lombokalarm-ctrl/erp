import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ApiError, ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createProduct,
  getProductById,
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
