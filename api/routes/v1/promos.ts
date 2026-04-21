import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { listPromos, createPromo, updatePromo, deletePromo, calculateBestPromo } from '../../services/promoService.js'

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
          productId: z.string().uuid().optional(),
        })
        .parse(req.query)

      const result = await listPromos(query)
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
          productId: z.string().uuid(),
          name: z.string().min(1),
          promoType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
          discountValue: z.coerce.number().min(0),
          minQty: z.coerce.number().int().min(1).default(1),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          isActive: z.boolean().default(true),
        })
        .parse(req.body)

      const created = await createPromo({
        productId: body.productId,
        name: body.name,
        promoType: body.promoType,
        discountValue: body.discountValue,
        minQty: body.minQty,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        isActive: body.isActive,
      })
      ok(res, created)
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/:id',
  authenticate,
  authorizeAny(['products:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          productId: z.string().uuid().optional(),
          name: z.string().min(1).optional(),
          promoType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
          discountValue: z.coerce.number().min(0).optional(),
          minQty: z.coerce.number().int().min(1).optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body)

      const updated = await updatePromo(req.params.id, body)
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
      await deletePromo(req.params.id)
      ok(res, { success: true })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/calculate',
  authenticate,
  authorizeAny(['sales_orders:write', 'products:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          productId: z.string().uuid(),
          qty: z.coerce.number().positive(),
          unitPrice: z.coerce.number().positive(),
        })
        .parse(req.body)

      const discountAmount = await calculateBestPromo(body.productId, body.qty, body.unitPrice)
      ok(res, { discountAmount })
    } catch (err) {
      next(err)
    }
  },
)

export default router
