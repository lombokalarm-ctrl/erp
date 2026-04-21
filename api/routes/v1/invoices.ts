import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { getInvoiceById, getInvoiceDetail, listInvoices, recalcInvoiceStatus } from '../../services/invoiceService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['invoices:read']),
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

      const result = await listInvoices(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id',
  authenticate,
  authorizeAny(['invoices:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoice = await getInvoiceById(req.params.id)
      const state = await recalcInvoiceStatus(invoice.id)
      ok(res, state)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id/detail',
  authenticate,
  authorizeAny(['invoices:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoice = await getInvoiceDetail(req.params.id)
      ok(res, invoice)
    } catch (err) {
      next(err)
    }
  },
)

export default router

