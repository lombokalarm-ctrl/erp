import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { applyCreditNoteToInvoice, getCreditNoteDetail, listCreditNotes } from '../../services/creditNoteService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['invoices:read', 'reports:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          q: z.string().optional(),
          customerId: z.string().uuid().optional(),
          status: z.enum(['DRAFT', 'POSTED', 'PARTIALLY_APPLIED', 'FULLY_APPLIED', 'CANCELLED']).optional(),
        })
        .parse(req.query)
      const result = await listCreditNotes(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id',
  authenticate,
  authorizeAny(['invoices:read', 'reports:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getCreditNoteDetail(req.params.id)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:id/apply',
  authenticate,
  authorizeAny(['invoices:write', 'payments:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          invoiceId: z.string().uuid(),
          amount: z.coerce.number().positive().optional(),
        })
        .parse(req.body)
      const result = await applyCreditNoteToInvoice({
        creditNoteId: req.params.id,
        invoiceId: body.invoiceId,
        amount: body.amount,
        createdBy: req.user!.userId,
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
