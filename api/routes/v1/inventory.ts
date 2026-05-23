import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ApiError, ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  applyInventoryTransaction,
  createInventoryTransferRequest,
  inferSuppliersForProducts,
  getDefaultWarehouseId,
  listReplenishmentSuggestions,
  listInventoryTransfers,
  listInventoryTransferApprovals,
  listInventorySummary,
  listInventoryTransactions,
  processInventoryTransferApproval,
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
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'Gudang default WH-01 belum tersedia untuk adjustment stok',
          details: {
            issue: 'WAREHOUSE_REQUIRED',
            warehouseCode: 'WH-01',
          },
        })
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
          supplierId: z.string().uuid().optional(),
          fallbackSupplierId: z.string().uuid().optional(),
          autoBySupplier: z.coerce.boolean().optional(),
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

      const normalizedItems = selected
        .map((it: any) => ({
          productId: it.productId as string,
          qty: Math.max(1, Math.ceil(Number(it.recommendedQtyBase ?? 0))),
          uom: 'pcs' as const,
          unitPrice: Number(it.purchasePrice ?? 0),
        }))
        .filter((it: any) => it.qty > 0)

      if (!normalizedItems.length) {
        ok(res, { created: false, message: 'Tidak ada item rekomendasi untuk dibuatkan PO' })
        return
      }

      if (body.autoBySupplier) {
        const inferredMap = await inferSuppliersForProducts(normalizedItems.map((it) => it.productId))
        const grouped = new Map<string, typeof normalizedItems>()
        const unresolved: string[] = []
        for (const item of normalizedItems) {
          const supplierId = inferredMap.get(item.productId) ?? body.fallbackSupplierId ?? body.supplierId
          if (!supplierId) {
            unresolved.push(item.productId)
            continue
          }
          const bucket = grouped.get(supplierId) ?? []
          bucket.push(item)
          grouped.set(supplierId, bucket)
        }

        if (!grouped.size) {
          ok(res, { created: false, message: 'Tidak ada supplier yang bisa ditentukan otomatis untuk rekomendasi ini' })
          return
        }

        const createdPos = []
        for (const [supplierId, supplierItems] of grouped.entries()) {
          const po = await createPurchaseOrder({
            supplierId,
            createdBy: req.user!.userId,
            orderDate: body.orderDate,
            notes: body.notes ?? 'Draft PO otomatis per supplier dari replenishment',
            items: supplierItems,
          })
          createdPos.push(po)
        }

        await writeAuditLog({
          actorUserId: req.user!.userId,
          action: 'REPLENISHMENT_DRAFT_PO_AUTO_BY_SUPPLIER',
          entity: 'purchase_orders',
          payload: {
            poCount: createdPos.length,
            itemCount: normalizedItems.length,
            unresolvedProducts: unresolved,
            warehouseId: body.warehouseId ?? null,
          },
        })

        ok(res, { created: true, autoBySupplier: true, poCount: createdPos.length, pos: createdPos, unresolvedProducts: unresolved })
        return
      }

      if (!body.supplierId) {
        ok(res, { created: false, message: 'Supplier wajib dipilih jika autoBySupplier tidak aktif' })
        return
      }

      const po = await createPurchaseOrder({
        supplierId: body.supplierId,
        createdBy: req.user!.userId,
        orderDate: body.orderDate,
        notes: body.notes ?? 'Draft PO dari rekomendasi replenishment',
        items: normalizedItems,
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'REPLENISHMENT_DRAFT_PO_CREATE',
        entity: 'purchase_orders',
        entityId: po.id,
        payload: { itemCount: normalizedItems.length, warehouseId: body.warehouseId ?? null },
      })

      ok(res, { created: true, autoBySupplier: false, po })
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

      const result = await createInventoryTransferRequest({
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
        action: 'INVENTORY_TRANSFER_REQUEST_CREATE',
        entity: 'inventory_transfer_requests',
        entityId: result.requestId,
        payload: body,
      })

      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/transfers/approvals',
  authenticate,
  authorizeAny(['inventory:approve_level1', 'inventory:approve_level2']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(50),
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
          level: z.coerce.number().int().min(1).max(2).optional(),
        })
        .parse(req.query)

      const canL1 = req.user!.permissions.includes('inventory:approve_level1')
      const canL2 = req.user!.permissions.includes('inventory:approve_level2')
      const resolvedLevel = query.level ?? (canL2 && !canL1 ? 2 : canL1 && !canL2 ? 1 : undefined)

      const result = await listInventoryTransferApprovals({
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        level: resolvedLevel as 1 | 2 | undefined,
      })
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/transfers/approvals/:id/process',
  authenticate,
  authorizeAny(['inventory:approve_level1', 'inventory:approve_level2']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          action: z.enum(['APPROVED', 'REJECTED']),
          notes: z.string().optional(),
        })
        .parse(req.body)

      const actorLevels: Array<1 | 2> = []
      if (req.user!.permissions.includes('inventory:approve_level1')) actorLevels.push(1)
      if (req.user!.permissions.includes('inventory:approve_level2')) actorLevels.push(2)

      const result = await processInventoryTransferApproval({
        approvalId: req.params.id,
        action: body.action,
        approverId: req.user!.userId,
        notes: body.notes,
        actorLevels,
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: body.action === 'APPROVED' ? 'INVENTORY_TRANSFER_APPROVE' : 'INVENTORY_TRANSFER_REJECT',
        entity: 'inventory_transfer_approvals',
        entityId: req.params.id,
        payload: result,
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
