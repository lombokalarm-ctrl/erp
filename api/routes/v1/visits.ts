import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { createVisit, type CreateVisitInput } from '../../services/visitService.js'

const router = Router()

router.post(
  '/',
  authenticate,
  authorizeAny(['sales_orders:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          customerId: z.string().uuid(),
          visitStatus: z.enum(['OPEN', 'CLOSED', 'NOT_FOUND', 'FOLLOW_UP']),
          note: z.string().max(2000).optional(),
          visitedAt: z.string().datetime(),
          location: z.object({
            latitude: z.number(),
            longitude: z.number(),
            accuracy: z.number().nullable(),
            capturedAt: z.string().datetime(),
          }),
          photos: z
            .array(
              z.object({
                name: z.string().min(1).max(255),
                previewUrl: z.string().min(1),
                capturedAt: z.string().datetime(),
              }),
            )
            .min(1)
            .max(3),
        })
        .parse(req.body) as CreateVisitInput

      const result = await createVisit(body, req.user!)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
