import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { createSupplier, listSuppliers, updateSupplier, deleteSupplier } from '../../services/supplierService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['suppliers:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          q: z.string().optional(),
        })
        .parse(req.query)

      const result = await listSuppliers(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['suppliers:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          code: z.string().min(1),
          name: z.string().min(1),
          phone: z.string().optional(),
          address: z.string().optional(),
        })
        .parse(req.body)

      const created = await createSupplier({
        code: body.code,
        name: body.name,
        phone: body.phone,
        address: body.address,
      })
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'SUPPLIER_CREATE',
        entity: 'suppliers',
        entityId: created.id,
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
  authorizeAny(['suppliers:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          code: z.string().min(1).optional(),
          name: z.string().min(1).optional(),
          phone: z.string().nullable().optional(),
          address: z.string().nullable().optional(),
        })
        .parse(req.body)

      const updated = await updateSupplier(req.params.id, body)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'SUPPLIER_UPDATE',
        entity: 'suppliers',
        entityId: updated.id,
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
  authorizeAny(['suppliers:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteSupplier(req.params.id)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'SUPPLIER_DELETE',
        entity: 'suppliers',
        entityId: req.params.id,
      })
      ok(res, { deleted: true })
    } catch (err) {
      next(err)
    }
  },
)

export default router

