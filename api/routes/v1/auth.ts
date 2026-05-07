import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate } from '../../middlewares/auth.js'
import {
  createAuthSession,
  requestPasswordReset,
  resetPasswordByToken,
  revokeAllUserSessions,
  rotateAuthSession,
  verifyLogin,
} from '../../services/authService.js'
import { writeAuditLog } from '../../services/auditService.js'
import { changeMyPassword } from '../../services/userService.js'

const router = Router()

router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          password: z.string().min(1),
        })
        .parse(req.body)

      const user = await verifyLogin(body.email, body.password)
      const session = await createAuthSession({
        userId: user.id,
        role: user.role,
        permissions: user.permissions,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      })

      ok(res, {
        token: session.accessToken,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          permissions: user.permissions,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

router.get('/me', authenticate, (req: Request, res: Response) => {
  ok(res, { user: req.user })
})

router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          refreshToken: z.string().min(1),
        })
        .parse(req.body)
      const rotated = await rotateAuthSession(body.refreshToken, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      })
      ok(res, {
        token: rotated.accessToken,
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
        user: rotated.user,
      })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await revokeAllUserSessions(req.user!.userId)
      ok(res, { success: true })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/forgot-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
        })
        .parse(req.body)
      await requestPasswordReset(body.email)
      ok(res, {
        success: true,
        message: 'Jika email terdaftar, link reset password telah dikirim.',
      })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/reset-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          token: z.string().min(1),
          newPassword: z.string().min(6),
        })
        .parse(req.body)
      await resetPasswordByToken(body.token, body.newPassword)
      ok(res, { success: true })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/change-password',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(6),
        })
        .parse(req.body)

      const updated = await changeMyPassword(
        req.user!.userId,
        body.currentPassword,
        body.newPassword,
      )
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'USER_CHANGE_PASSWORD',
        entity: 'users',
        entityId: updated.id,
      })
      ok(res, updated)
    } catch (err) {
      next(err)
    }
  },
)

export default router
