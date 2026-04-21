import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deleteProduct,
} from '../../services/productService.js'
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
          categoryPrices: z.record(z.coerce.number().min(0)).optional(),
        })
        .parse(req.body)

      const created = await createProduct({
        sku: body.sku,
        name: body.name,
        unit: body.unit ?? 'pcs',
        purchasePrice: body.purchasePrice,
        salePrice: body.salePrice,
        categoryPrices: body.categoryPrices,
      })
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
          categoryPrices: z.record(z.coerce.number().min(0)).optional(),
        })
        .parse(req.body)

      const updated = await updateProduct(req.params.id, body)
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
