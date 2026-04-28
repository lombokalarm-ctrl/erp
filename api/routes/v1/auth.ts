import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { signAccessToken } from '../../auth/jwt.js'
import { ok } from '../../lib/http.js'
import { authenticate } from '../../middlewares/auth.js'
import { verifyLogin } from '../../services/authService.js'
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
      const token = signAccessToken({
        userId: user.id,
        role: user.role,
        permissions: user.permissions,
      })

      ok(res, {
        token,
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
