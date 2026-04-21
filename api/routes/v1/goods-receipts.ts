import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { createGoodsReceipt, listGoodsReceipts } from '../../services/purchasingService.js'
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

      const result = await listGoodsReceipts(query)
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
          purchaseOrderId: z.string().uuid().optional(),
          warehouseId: z.string().uuid(),
          receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          notes: z.string().optional(),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                qty: z.coerce.number().positive(),
              }),
            )
            .min(1),
        })
        .parse(req.body)

      const grn = await createGoodsReceipt({
        purchaseOrderId: body.purchaseOrderId,
        warehouseId: body.warehouseId,
        receivedDate: body.receivedDate,
        createdBy: req.user!.userId,
        notes: body.notes,
        items: body.items.map((i) => ({ productId: i.productId, qty: i.qty })),
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'GOODS_RECEIPT_CREATE',
        entity: 'goods_receipts',
        entityId: grn.id,
      })

      ok(res, grn)
    } catch (err) {
      next(err)
    }
  },
)

export default router

