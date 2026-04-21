import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { agingSummary, listReceivables } from '../../services/receivablesService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['reports:read', 'invoices:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          customerId: z.string().uuid().optional(),
        })
        .parse(req.query)

      const result = await listReceivables(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/aging',
  authenticate,
  authorizeAny(['reports:read', 'invoices:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          customerId: z.string().uuid().optional(),
        })
        .parse(req.query)

      const result = await agingSummary(query)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router

