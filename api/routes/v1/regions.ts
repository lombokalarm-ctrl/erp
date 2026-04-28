import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { listRegions, createRegion } from '../../services/regionService.js'

const router = Router()

router.get('/', authenticate, authorizeAny(['customers:read']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await listRegions()
    ok(res, items)
  } catch (err) {
    next(err)
  }
})

router.post('/', authenticate, authorizeAny(['customers:write']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ name: z.string().min(1) }).parse(req.body)
    const created = await createRegion(body.name)
    ok(res, created)
  } catch (err) {
    next(err)
  }
})

export default router
