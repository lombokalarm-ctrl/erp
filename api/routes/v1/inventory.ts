import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  applyInventoryTransaction,
  getDefaultWarehouseId,
  listInventorySummary,
  listInventoryTransactions,
} from '../../services/inventoryService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/summary',
  authenticate,
  authorizeAny(['inventory:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z.object({ q: z.string().optional() }).parse(req.query)
      ok(res, await listInventorySummary(query))
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/transactions',
  authenticate,
  authorizeAny(['inventory:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(req.query)

      const result = await listInventoryTransactions(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/adjustments',
  authenticate,
  authorizeAny(['inventory:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          productId: z.string().uuid(),
          qtyDelta: z.coerce.number(),
          note: z.string().optional(),
        })
        .parse(req.body)

      const warehouseId = await getDefaultWarehouseId()
      if (!warehouseId) {
        ok(res, null)
        return
      }

      await applyInventoryTransaction({
        warehouseId,
        productId: body.productId,
        type: 'ADJUSTMENT',
        qtyDelta: body.qtyDelta,
        note: body.note,
        createdBy: req.user!.userId,
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'INVENTORY_ADJUSTMENT',
        entity: 'inventory_transactions',
        payload: body,
      })

      ok(res, { ok: true })
    } catch (err) {
      next(err)
    }
  },
)

export default router

