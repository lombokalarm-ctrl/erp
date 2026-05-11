import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  applyInventoryTransaction,
  createInventoryTransfer,
  getDefaultWarehouseId,
  listReplenishmentSuggestions,
  listInventoryTransfers,
  listInventorySummary,
  listInventoryTransactions,
} from '../../services/inventoryService.js'
import { writeAuditLog } from '../../services/auditService.js'
import { createPurchaseOrder } from '../../services/purchasingService.js'

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

router.get(
  '/replenishment/suggestions',
  authenticate,
  authorizeAny(['inventory:read', 'purchasing:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          warehouseId: z.string().uuid().optional(),
          q: z.string().optional(),
          lookbackDays: z.coerce.number().int().min(1).max(180).optional(),
        })
        .parse(req.query)
      const result = await listReplenishmentSuggestions(query)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/replenishment/draft-po',
  authenticate,
  authorizeAny(['inventory:write', 'purchasing:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          supplierId: z.string().uuid(),
          orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          warehouseId: z.string().uuid().optional(),
          notes: z.string().optional(),
          q: z.string().optional(),
          lookbackDays: z.coerce.number().int().min(1).max(180).optional(),
          productIds: z.array(z.string().uuid()).optional(),
        })
        .parse(req.body)

      const suggestions = await listReplenishmentSuggestions({
        warehouseId: body.warehouseId,
        q: body.q,
        lookbackDays: body.lookbackDays,
      })
      const selected = body.productIds?.length
        ? suggestions.items.filter((it: any) => body.productIds!.includes(it.productId))
        : suggestions.items

      const items = selected
        .map((it: any) => ({
          productId: it.productId as string,
          qty: Math.max(1, Math.ceil(Number(it.recommendedQtyBase ?? 0))),
          uom: 'pcs' as const,
          unitPrice: Number(it.purchasePrice ?? 0),
        }))
        .filter((it: any) => it.qty > 0)

      if (!items.length) {
        ok(res, { created: false, message: 'Tidak ada item rekomendasi untuk dibuatkan PO' })
        return
      }

      const po = await createPurchaseOrder({
        supplierId: body.supplierId,
        createdBy: req.user!.userId,
        orderDate: body.orderDate,
        notes: body.notes ?? 'Draft PO dari rekomendasi replenishment',
        items,
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'REPLENISHMENT_DRAFT_PO_CREATE',
        entity: 'purchase_orders',
        entityId: po.id,
        payload: { itemCount: items.length, warehouseId: body.warehouseId ?? null },
      })

      ok(res, { created: true, po })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/transfers',
  authenticate,
  authorizeAny(['inventory:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          sourceWarehouseId: z.string().uuid(),
          targetWarehouseId: z.string().uuid(),
          transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          clientRef: z.string().min(3).max(100).optional(),
          note: z.string().optional(),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                qtyBase: z.coerce.number().positive(),
              }),
            )
            .min(1),
        })
        .parse(req.body)

      const result = await createInventoryTransfer({
        sourceWarehouseId: body.sourceWarehouseId,
        targetWarehouseId: body.targetWarehouseId,
        transferDate: body.transferDate,
        clientRef: body.clientRef,
        note: body.note,
        createdBy: req.user!.userId,
        items: body.items.map((it) => ({ productId: it.productId, qtyBase: it.qtyBase })),
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'INVENTORY_TRANSFER_CREATE',
        entity: 'inventory_transactions',
        entityId: result.transferRefId,
        payload: body,
      })

      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/transfers',
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

      const result = await listInventoryTransfers(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

export default router

