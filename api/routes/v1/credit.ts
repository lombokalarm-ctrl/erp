import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { validateCreditOrThrow } from '../../services/creditService.js'

const router = Router()

router.get(
  '/validate',
  authenticate,
  authorizeAny(['sales_orders:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          customerId: z.string().uuid(),
          amount: z.coerce.number().min(0),
        })
        .parse(req.query)

      const allowOverLimit = req.user?.permissions.includes('sales_orders:override_credit') ?? false
      const result = await validateCreditOrThrow({
        customerId: query.customerId,
        newInvoiceAmount: query.amount,
        allowOverLimit,
      })

      ok(res, { ok: true, ...result })
    } catch (err) {
      next(err)
    }
  },
)

export default router

