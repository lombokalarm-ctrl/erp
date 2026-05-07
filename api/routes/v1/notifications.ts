import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate } from '../../middlewares/auth.js'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sweepOverdueInvoiceNotifications,
} from '../../services/notificationService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          unreadOnly: z.coerce.boolean().default(false),
        })
        .parse(req.query)

      const result = await listNotifications({
        userId: req.user!.userId,
        page: query.page,
        pageSize: query.pageSize,
        unreadOnly: query.unreadOnly,
      })
      ok(res, result.items, { total: result.total, unreadCount: result.unreadCount })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:id/read',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params)
      await markNotificationRead(params.id, req.user!.userId)
      ok(res, { success: true })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/read-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await markAllNotificationsRead(req.user!.userId)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/sweep-overdue',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sweepOverdueInvoiceNotifications()
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
