import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserActive,
} from '../../services/userService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['users:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          q: z.string().optional(),
          role: z.string().optional(),
        })
        .parse(req.query)

      const result = await listUsers(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['users:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          fullName: z.string().min(1),
          password: z.string().min(6),
          roleId: z.string().uuid(),
        })
        .parse(req.body)

      const created = await createUser({
        email: body.email,
        fullName: body.fullName,
        password: body.password,
        roleId: body.roleId,
      })
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'USER_CREATE',
        entity: 'users',
        entityId: created.id,
        payload: { email: created.email, fullName: created.fullName, roleId: body.roleId },
      })
      ok(res, created)
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/:id/active',
  authenticate,
  authorizeAny(['users:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ isActive: z.boolean() }).parse(req.body)
      const updated = await setUserActive(req.params.id, body.isActive)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'USER_SET_ACTIVE',
        entity: 'users',
        entityId: updated.id,
        payload: body,
      })
      ok(res, updated)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:id/reset-password',
  authenticate,
  authorizeAny(['users:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ newPassword: z.string().min(6) }).parse(req.body)
      const updated = await resetUserPassword(req.params.id, body.newPassword)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'USER_RESET_PASSWORD',
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
