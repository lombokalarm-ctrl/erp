import { Router, type Request, type Response, type NextFunction } from 'express'
import { ok } from '../../lib/http.js'
import { authenticate } from '../../middlewares/auth.js'
import { getDashboardMetrics } from '../../services/dashboardService.js'

const router = Router()

router.get(
  '/metrics',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getDashboardMetrics()
      ok(res, data)
    } catch (err) {
      next(err)
    }
  },
)

export default router
