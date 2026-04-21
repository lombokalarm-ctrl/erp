import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { createPurchaseOrder, listPurchaseOrders } from '../../services/purchasingService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['purchasing:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
        })
        .parse(req.query)

      const result = await listPurchaseOrders(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['purchasing:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          supplierId: z.string().uuid(),
          orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          notes: z.string().optional(),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                qty: z.coerce.number().positive(),
                unitPrice: z.coerce.number().min(0),
              }),
            )
            .min(1),
        })
        .parse(req.body)

      const po = await createPurchaseOrder({
        supplierId: body.supplierId,
        createdBy: req.user!.userId,
        orderDate: body.orderDate,
        notes: body.notes,
        items: body.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PURCHASE_ORDER_CREATE',
        entity: 'purchase_orders',
        entityId: po.id,
      })

      ok(res, po)
    } catch (err) {
      next(err)
    }
  },
)

export default router

