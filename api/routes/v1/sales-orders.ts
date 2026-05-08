import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createSalesOrder,
  createDeliveryOrder,
  deleteSalesOrder,
  getDeliveryOrderBySoId,
  getSalesOrderDetail,
  listSalesOrders,
  getApprovalList,
  processApproval,
  updateSalesOrder,
} from '../../services/salesService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['sales_orders:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          q: z.string().optional(),
          customerId: z.string().uuid().optional(),
          salesId: z.string().uuid().optional(),
        })
        .parse(req.query)

      if (req.user?.role === 'Sales') {
        query.salesId = req.user.userId
      }

      const result = await listSalesOrders(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['sales_orders:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          customerId: z.string().uuid(),
          orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          discountAmount: z.coerce.number().min(0).optional(),
          notes: z.string().optional(),
          allowOverLimit: z.boolean().optional(),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                qty: z.coerce.number().int().positive(),
                uom: z.string().min(1).default('pcs'),
                unitPrice: z.coerce.number().min(0),
                discountAmount: z.coerce.number().min(0).optional(),
              }),
            )
            .min(1),
        })
        .parse(req.body)

      const allowOverLimit =
        body.allowOverLimit === true &&
        req.user?.permissions.includes('sales_orders:override_credit')

      const result = await createSalesOrder({
        customerId: body.customerId,
        createdBy: req.user!.userId,
        orderDate: body.orderDate,
        discountAmount: body.discountAmount,
        notes: body.notes,
        items: body.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          uom: i.uom,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
        })),
        allowOverLimit,
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: allowOverLimit ? 'SALES_ORDER_CREATE_OVERRIDE' : 'SALES_ORDER_CREATE',
        entity: 'sales_orders',
        entityId: result.salesOrder.id,
        payload: { orderNo: result.salesOrder.order_no },
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id([0-9a-fA-F-]{36})',
  authenticate,
  authorizeAny(['sales_orders:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getSalesOrderDetail(req.params.id)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/:id([0-9a-fA-F-]{36})',
  authenticate,
  authorizeAny(['sales_orders:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          customerId: z.string().uuid(),
          orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          discountAmount: z.coerce.number().min(0).optional(),
          notes: z.string().optional(),
          allowOverLimit: z.boolean().optional(),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                qty: z.coerce.number().int().positive(),
                uom: z.string().min(1).default('pcs'),
                unitPrice: z.coerce.number().min(0),
                discountAmount: z.coerce.number().min(0).optional(),
              }),
            )
            .min(1),
        })
        .parse(req.body)

      const allowOverLimit =
        body.allowOverLimit === true &&
        req.user?.permissions.includes('sales_orders:override_credit')

      const result = await updateSalesOrder({
        salesOrderId: req.params.id,
        customerId: body.customerId,
        orderDate: body.orderDate,
        discountAmount: body.discountAmount,
        notes: body.notes,
        items: body.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          uom: i.uom,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
        })),
        updatedBy: req.user!.userId,
        allowOverLimit,
      })
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'SALES_ORDER_UPDATE',
        entity: 'sales_orders',
        entityId: req.params.id,
        payload: { orderDate: body.orderDate, itemCount: body.items.length },
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/:id([0-9a-fA-F-]{36})',
  authenticate,
  authorizeAny(['sales_orders:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await deleteSalesOrder(req.params.id)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'SALES_ORDER_DELETE',
        entity: 'sales_orders',
        entityId: req.params.id,
        payload: result,
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:id([0-9a-fA-F-]{36})/deliver',
  authenticate,
  authorizeAny(['sales_orders:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(req.body)

      const result = await createDeliveryOrder({
        salesOrderId: req.params.id,
        createdBy: req.user!.userId,
        deliveryDate: body.deliveryDate,
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'DELIVERY_ORDER_CREATE',
        entity: 'delivery_orders',
        entityId: result.deliveryOrder.id,
        payload: { doNo: result.deliveryOrder.do_no, invoiceNo: result.invoice?.invoiceNo ?? null },
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id([0-9a-fA-F-]{36})/delivery-order',
  authenticate,
  authorizeAny(['sales_orders:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getDeliveryOrderBySoId(req.params.id)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/approvals',
  authenticate,
  authorizeAny(['sales_orders:approve']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
        })
        .parse(req.query)

      const result = await getApprovalList(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/approvals/:id/process',
  authenticate,
  authorizeAny(['sales_orders:approve']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          action: z.enum(['APPROVED', 'REJECTED']),
          notes: z.string().optional(),
        })
        .parse(req.body)

      const result = await processApproval(req.params.id, body.action, req.user!.userId, body.notes)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: body.action === 'APPROVED' ? 'SALES_ORDER_APPROVE' : 'SALES_ORDER_REJECT',
        entity: 'sales_order_approvals',
        entityId: req.params.id,
        payload: {
          action: body.action,
          salesOrderId: (result as { invoice?: { salesOrderId?: string } }).invoice?.salesOrderId ?? null,
          newSoStatus: (result as { newSoStatus?: string }).newSoStatus ?? null,
          notes: body.notes ?? null,
          creditSnapshot: (result as { creditSnapshot?: unknown }).creditSnapshot ?? null,
        },
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
