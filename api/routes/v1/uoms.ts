import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { writeAuditLog } from '../../services/auditService.js'
import { createUom, deleteUom, listUoms, updateUom } from '../../services/uomService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['products:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          q: z.string().optional(),
          isActive: z
            .enum(['true', 'false'])
            .optional()
            .transform((v) => (typeof v === 'string' ? v === 'true' : undefined)),
        })
        .parse(req.query)
      const result = await listUoms(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['products:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          code: z.string().min(1),
          name: z.string().min(1),
          isActive: z.coerce.boolean().optional(),
        })
        .parse(req.body)
      const created = await createUom({
        code: body.code,
        name: body.name,
        isActive: body.isActive,
      })
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'UOM_CREATE',
        entity: 'uoms',
        entityId: created.id,
        payload: body,
      })
      ok(res, created)
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/:id',
  authenticate,
  authorizeAny(['products:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          code: z.string().min(1).optional(),
          name: z.string().min(1).optional(),
          isActive: z.coerce.boolean().optional(),
        })
        .parse(req.body)
      const updated = await updateUom(req.params.id, body)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'UOM_UPDATE',
        entity: 'uoms',
        entityId: updated.id,
        payload: body,
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
  authorizeAny(['products:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteUom(req.params.id)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'UOM_DELETE',
        entity: 'uoms',
        entityId: req.params.id,
      })
      ok(res, { deleted: true })
    } catch (err) {
      next(err)
    }
  },
)

export default router
