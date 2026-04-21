import { Router, type Request, type Response, type NextFunction } from 'express'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { listWarehouses } from '../../services/warehouseService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['inventory:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await listWarehouses())
    } catch (err) {
      next(err)
    }
  },
)

export default router

