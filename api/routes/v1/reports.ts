import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { getCollectionReport, getSalesPerformance, getSalesReport, getPromoReport, getProfitLossReport, getReturnReport } from '../../services/reportService.js'

const router = Router()

router.get(
  '/sales-performance',
  authenticate,
  authorizeAny(['reports:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
        .parse(req.query)

      const result = await getSalesPerformance(query)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/sales',
  authenticate,
  authorizeAny(['reports:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
        .parse(req.query)

      const result = await getSalesReport(query)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/collections',
  authenticate,
  authorizeAny(['reports:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
        .parse(req.query)

      const result = await getCollectionReport(query)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/promos',
  authenticate,
  authorizeAny(['reports:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
        .parse(req.query)

      const result = await getPromoReport(query)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/profit-loss',
  authenticate,
  authorizeAny(['reports:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
        .parse(req.query)

      const result = await getProfitLossReport(query)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/returns',
  authenticate,
  authorizeAny(['reports:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          type: z.enum(['SALES_RETURN', 'PURCHASE_RETURN']).optional(),
        })
        .parse(req.query)

      const result = await getReturnReport(query)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
