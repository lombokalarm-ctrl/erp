import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { createReturn, listReturns, getReturnDetail } from '../../services/returnService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['inventory:read', 'sales_orders:read', 'purchasing:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          type: z.enum(['SALES_RETURN', 'PURCHASE_RETURN']).optional(),
          q: z.string().optional(),
        })
        .parse(req.query)

      const result = await listReturns(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id',
  authenticate,
  authorizeAny(['inventory:read', 'sales_orders:read', 'purchasing:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getReturnDetail(req.params.id)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['inventory:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          type: z.enum(['SALES_RETURN', 'PURCHASE_RETURN']),
          customerId: z.string().uuid().optional(),
          supplierId: z.string().uuid().optional(),
          referenceNo: z.string().optional(),
          returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          notes: z.string().optional(),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                qty: z.coerce.number().positive(),
                uom: z.enum(['pcs', 'pack', 'dus']),
                reason: z.string().optional(),
              })
            )
            .min(1),
        })
        .parse(req.body)

      const result = await createReturn({
        type: body.type,
        customerId: body.customerId,
        supplierId: body.supplierId,
        referenceNo: body.referenceNo,
        returnDate: body.returnDate,
        notes: body.notes,
        items: body.items as { productId: string; qty: number; uom: 'pcs' | 'pack' | 'dus'; reason?: string }[],
        createdBy: req.user!.userId,
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router