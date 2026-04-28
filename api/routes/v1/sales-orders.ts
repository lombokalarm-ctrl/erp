import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createSalesOrder,
  createDeliveryOrder,
  getDeliveryOrderBySoId,
  listSalesOrders,
  getApprovalList,
  processApproval,
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
                uom: z.enum(['pcs', 'pack', 'dus']).default('pcs'),
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

router.post(
  '/:id/deliver',
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
        payload: { doNo: result.deliveryOrder.do_no, invoiceNo: result.invoice.invoiceNo },
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id/delivery-order',
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
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
