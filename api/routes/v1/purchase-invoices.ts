import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createPurchaseInvoice,
  deletePurchaseInvoice,
  getPurchaseInvoiceDetail,
  listPurchaseInvoices,
  postPurchaseInvoice,
  updatePurchaseInvoice,
} from '../../services/purchaseInvoiceService.js'
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
          supplierId: z.string().uuid().optional(),
          warehouseId: z.string().uuid().optional(),
          status: z.enum(['DRAFT', 'POSTED', 'CANCELLED']).optional(),
          fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
        .parse(req.query)

      const result = await listPurchaseInvoices(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id',
  authenticate,
  authorizeAny(['purchasing:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params)
      const result = await getPurchaseInvoiceDetail(params.id)
      ok(res, result)
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
          invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          warehouseId: z.string().uuid(),
          supplierId: z.string().uuid(),
          termDays: z.coerce.number().int().min(0).max(3650).optional(),
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          notes: z.string().optional(),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                uomCode: z.string().min(1),
                qty: z.coerce.number().positive(),
                basePrice: z.coerce.number().min(0),
                disc1Type: z.enum(['PERCENT', 'AMOUNT']).optional(),
                disc1Value: z.coerce.number().min(0).optional(),
                disc2Type: z.enum(['PERCENT', 'AMOUNT']).optional(),
                disc2Value: z.coerce.number().min(0).optional(),
              }),
            )
            .min(1),
        })
        .parse(req.body)

      const created = await createPurchaseInvoice({
        invoiceDate: body.invoiceDate,
        warehouseId: body.warehouseId,
        supplierId: body.supplierId,
        termDays: body.termDays,
        dueDate: body.dueDate,
        notes: body.notes,
        createdBy: req.user!.userId,
        items: body.items.map((i) => ({
          productId: i.productId,
          uomCode: i.uomCode,
          qty: i.qty,
          basePrice: i.basePrice,
          disc1Type: i.disc1Type,
          disc1Value: i.disc1Value,
          disc2Type: i.disc2Type,
          disc2Value: i.disc2Value,
        })),
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PURCHASE_INVOICE_CREATE',
        entity: 'purchase_invoices',
        entityId: created.id,
      })

      ok(res, created)
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/:id',
  authenticate,
  authorizeAny(['purchasing:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params)
      const body = z
        .object({
          invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          warehouseId: z.string().uuid().optional(),
          supplierId: z.string().uuid().optional(),
          termDays: z.coerce.number().int().min(0).max(3650).optional(),
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          notes: z.string().optional(),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                uomCode: z.string().min(1),
                qty: z.coerce.number().positive(),
                basePrice: z.coerce.number().min(0),
                disc1Type: z.enum(['PERCENT', 'AMOUNT']).optional(),
                disc1Value: z.coerce.number().min(0).optional(),
                disc2Type: z.enum(['PERCENT', 'AMOUNT']).optional(),
                disc2Value: z.coerce.number().min(0).optional(),
              }),
            )
            .min(1),
        })
        .parse(req.body)

      const updated = await updatePurchaseInvoice(params.id, {
        invoiceDate: body.invoiceDate,
        warehouseId: body.warehouseId,
        supplierId: body.supplierId,
        termDays: body.termDays,
        dueDate: body.dueDate,
        notes: body.notes,
        items: body.items.map((i) => ({
          productId: i.productId,
          uomCode: i.uomCode,
          qty: i.qty,
          basePrice: i.basePrice,
          disc1Type: i.disc1Type,
          disc1Value: i.disc1Value,
          disc2Type: i.disc2Type,
          disc2Value: i.disc2Value,
        })),
      })

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PURCHASE_INVOICE_UPDATE',
        entity: 'purchase_invoices',
        entityId: params.id,
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
  authorizeAny(['purchasing:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params)
      const result = await deletePurchaseInvoice(params.id)

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PURCHASE_INVOICE_DELETE',
        entity: 'purchase_invoices',
        entityId: params.id,
      })

      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:id/post',
  authenticate,
  authorizeAny(['purchasing:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params)
      const posted = await postPurchaseInvoice(params.id)

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PURCHASE_INVOICE_POST',
        entity: 'purchase_invoices',
        entityId: params.id,
      })

      ok(res, posted)
    } catch (err) {
      next(err)
    }
  },
)

export default router
