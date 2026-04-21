import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { 
  listRoles, 
  listAllPermissions, 
  createRole, 
  updateRole, 
  deleteRole 
} from '../../services/userService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['users:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await listRoles())
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/permissions',
  authenticate,
  authorizeAny(['users:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await listAllPermissions())
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
      const body = z.object({
        name: z.string().min(1),
        permissions: z.array(z.string()).default([])
      }).parse(req.body)

      const created = await createRole(body.name, body.permissions)
      
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'ROLE_CREATE',
        entity: 'roles',
        entityId: created.id,
        payload: { name: body.name, permissions: body.permissions },
      })
      
      ok(res, created)
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/:id',
  authenticate,
  authorizeAny(['users:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({
        name: z.string().min(1),
        permissions: z.array(z.string()).default([])
      }).parse(req.body)

      const updated = await updateRole(req.params.id, body.name, body.permissions)
      
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'ROLE_UPDATE',
        entity: 'roles',
        entityId: updated.id,
        payload: { name: body.name, permissions: body.permissions },
      })
      
      ok(res, updated)
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/:id',
  authenticate,
  authorizeAny(['users:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteRole(req.params.id)
      
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'ROLE_DELETE',
        entity: 'roles',
        entityId: req.params.id,
      })
      
      ok(res, { success: true })
    } catch (err) {
      next(err)
    }
  },
)

export default router

