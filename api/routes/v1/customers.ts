import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  deleteCustomer,
} from '../../services/customerService.js'
import {
  getCreditProfile,
  upsertCreditProfile,
} from '../../services/customerCreditService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['customers:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(20),
          q: z.string().optional(),
          salesId: z.string().uuid().optional(),
        })
        .parse(req.query)

      if (req.user?.role === 'Sales') {
        query.salesId = req.user.userId
      }

      const result = await listCustomers(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['customers:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          code: z.string().min(1),
          name: z.string().min(1),
          ownerName: z.string().optional(),
          ktpNo: z.string().optional(),
          npwpNo: z.string().optional(),
          category: z.string().min(1),
          phone: z.string().optional(),
          address: z.string().optional(),
          status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
          salesId: z.string().uuid().nullable().optional(),
        })
        .parse(req.body)

      let salesId = body.salesId
      if (req.user?.role === 'Sales') {
        salesId = req.user.userId
      }

      const created = await createCustomer({
        code: body.code,
        name: body.name,
        ownerName: body.ownerName,
        ktpNo: body.ktpNo,
        npwpNo: body.npwpNo,
        category: body.category,
        phone: body.phone,
        address: body.address,
        status: body.status,
        salesId: salesId ?? null,
      })
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'CUSTOMER_CREATE',
        entity: 'customers',
        entityId: created.id,
        payload: { code: created.code, name: created.name },
      })
      ok(res, created)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id',
  authenticate,
  authorizeAny(['customers:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await getCustomerById(req.params.id)
      ok(res, customer)
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/:id',
  authenticate,
  authorizeAny(['customers:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          code: z.string().min(1).optional(),
          name: z.string().min(1).optional(),
          ownerName: z.string().nullable().optional(),
          ktpNo: z.string().nullable().optional(),
          npwpNo: z.string().nullable().optional(),
          category: z.string().min(1).optional(),
          phone: z.string().nullable().optional(),
          address: z.string().nullable().optional(),
          status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
          salesId: z.string().uuid().nullable().optional(),
        })
        .parse(req.body)

      const updateData = { ...body }
      if (req.user?.role === 'Sales') {
        // Sales cannot reassign customer to someone else
        delete updateData.salesId
      }

      const updated = await updateCustomer(req.params.id, updateData)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'CUSTOMER_UPDATE',
        entity: 'customers',
        entityId: updated.id,
        payload: body,
      })
      ok(res, updated)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id/credit-profile',
  authenticate,
  authorizeAny(['customers:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await getCreditProfile(req.params.id)
      ok(res, profile ?? null)
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/:id/credit-profile',
  authenticate,
  authorizeAny(['customers:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          creditLimit: z.coerce.number().min(0),
          salesOrderLimit: z.coerce.number().min(0).optional(),
          paymentTermDays: z.coerce.number().int().min(0),
          maxOverdueDaysBeforeBlock: z.coerce.number().int().min(0).nullable().optional(),
        })
        .parse(req.body)

      const updated = await upsertCreditProfile({
        customerId: req.params.id,
        creditLimit: body.creditLimit,
        salesOrderLimit: body.salesOrderLimit ?? 0,
        paymentTermDays: body.paymentTermDays,
        maxOverdueDaysBeforeBlock: body.maxOverdueDaysBeforeBlock ?? null,
      })
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'CUSTOMER_CREDIT_PROFILE_UPSERT',
        entity: 'customer_credit_profiles',
        entityId: updated.customerId,
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
  authorizeAny(['customers:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteCustomer(req.params.id)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'CUSTOMER_DELETE',
        entity: 'customers',
        entityId: req.params.id,
        payload: { id: req.params.id },
      })
      ok(res, { deleted: true })
    } catch (err) {
      next(err)
    }
  },
)

export default router
