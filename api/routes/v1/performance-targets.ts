import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  copyTargetsFromPreviousPeriod,
  createTargetPeriod,
  finalizeTargetPeriod,
  generateSalesTargetsFromActiveUsers,
  getTargetPeriodDetail,
  listTargetPeriods,
  reopenTargetPeriod,
  replaceDeliverySchedules,
  replaceSalesVisitSchedules,
  updateSalesMonthlyTarget,
} from '../../services/performanceTargetService.js'

const router = Router()

type CreateTargetPeriodBody = {
  month: number
  year: number
  notes?: string
  status?: 'DRAFT' | 'ACTIVE' | 'FINAL'
}

type UpdateSalesMonthlyTargetBody = {
  targetSalesAmount?: string | number
  targetSalesOrderCount?: number
  notes?: string | null
}

type SalesVisitScheduleBody = {
  schedules: Array<{
    regionId: string
    dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
    targetVisitCount: number
    routeNotes?: string | null
  }>
}

type DeliveryScheduleBody = {
  schedules: Array<{
    regionId: string
    dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
    targetDeliveryCount: number
    targetDeliveryPoints: number
    routeNotes?: string | null
  }>
}

const visitScheduleSchema = z.object({
  regionId: z.string().uuid(),
  dayOfWeek: z.enum([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ]),
  targetVisitCount: z.coerce.number().int().min(0),
  routeNotes: z.string().nullable().optional(),
})

const deliveryScheduleSchema = z.object({
  regionId: z.string().uuid(),
  dayOfWeek: z.enum([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ]),
  targetDeliveryCount: z.coerce.number().int().min(0),
  targetDeliveryPoints: z.coerce.number().int().min(0),
  routeNotes: z.string().nullable().optional(),
})

router.get(
  '/',
  authenticate,
  authorizeAny(['performance_targets:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          month: z.coerce.number().int().min(1).max(12).optional(),
          year: z.coerce.number().int().min(2000).max(2100).optional(),
          status: z.enum(['DRAFT', 'ACTIVE', 'FINAL']).optional(),
          regionId: z.string().uuid().optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query)

      const result = await listTargetPeriods(query)
      ok(res, result.items, { total: result.total })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['performance_targets:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = z
        .object({
          month: z.coerce.number().int().min(1).max(12),
          year: z.coerce.number().int().min(2000).max(2100),
          notes: z.string().optional(),
          status: z.enum(['DRAFT', 'ACTIVE', 'FINAL']).optional(),
        })
        .parse(req.body)
      const body: CreateTargetPeriodBody = {
        month: parsed.month,
        year: parsed.year,
        notes: parsed.notes,
        status: parsed.status,
      }

      const created = await createTargetPeriod({
        ...body,
        createdBy: req.user!.userId,
      })
      ok(res, created)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:periodId',
  authenticate,
  authorizeAny(['performance_targets:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getTargetPeriodDetail(req.params.periodId)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:periodId/generate-sales',
  authenticate,
  authorizeAny(['performance_targets:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          overwriteExisting: z.boolean().optional(),
        })
        .parse(req.body)

      const result = await generateSalesTargetsFromActiveUsers(req.params.periodId, body)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/:periodId/sales-targets/:salesTargetId',
  authenticate,
  authorizeAny(['performance_targets:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = z
        .object({
          targetSalesAmount: z.union([z.string(), z.number()]).optional(),
          targetSalesOrderCount: z.coerce.number().int().min(0).optional(),
          notes: z.string().nullable().optional(),
        })
        .parse(req.body)
      const body: UpdateSalesMonthlyTargetBody = {
        targetSalesAmount: parsed.targetSalesAmount,
        targetSalesOrderCount: parsed.targetSalesOrderCount,
        notes: parsed.notes,
      }

      const result = await updateSalesMonthlyTarget(req.params.periodId, req.params.salesTargetId, body)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/:periodId/sales-targets/:salesTargetId/visit-schedules',
  authenticate,
  authorizeAny(['performance_targets:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = z
        .object({
          schedules: z.array(visitScheduleSchema),
        })
        .parse(req.body)
      const body: SalesVisitScheduleBody = {
        schedules: parsed.schedules.map((schedule) => ({
          regionId: schedule.regionId,
          dayOfWeek: schedule.dayOfWeek,
          targetVisitCount: schedule.targetVisitCount,
          routeNotes: schedule.routeNotes,
        })),
      }

      const result = await replaceSalesVisitSchedules(req.params.periodId, req.params.salesTargetId, body.schedules)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/:periodId/delivery-schedules',
  authenticate,
  authorizeAny(['performance_targets:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = z
        .object({
          schedules: z.array(deliveryScheduleSchema),
        })
        .parse(req.body)
      const body: DeliveryScheduleBody = {
        schedules: parsed.schedules.map((schedule) => ({
          regionId: schedule.regionId,
          dayOfWeek: schedule.dayOfWeek,
          targetDeliveryCount: schedule.targetDeliveryCount,
          targetDeliveryPoints: schedule.targetDeliveryPoints,
          routeNotes: schedule.routeNotes,
        })),
      }

      const result = await replaceDeliverySchedules(req.params.periodId, body.schedules)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:periodId/copy-from-previous',
  authenticate,
  authorizeAny(['performance_targets:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          sourcePeriodKey: z.string().regex(/^\d{4}-\d{2}$/),
          copySalesTargets: z.boolean().optional(),
          copyVisitSchedules: z.boolean().optional(),
          copyDeliverySchedules: z.boolean().optional(),
          overwriteExisting: z.boolean().optional(),
        })
        .parse(req.body)

      const result = await copyTargetsFromPreviousPeriod({
        periodId: req.params.periodId,
        sourcePeriodKey: body.sourcePeriodKey,
        copySalesTargets: body.copySalesTargets,
        copyVisitSchedules: body.copyVisitSchedules,
        copyDeliverySchedules: body.copyDeliverySchedules,
        overwriteExisting: body.overwriteExisting,
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:periodId/finalize',
  authenticate,
  authorizeAny(['performance_targets:finalize']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ notes: z.string().optional() }).parse(req.body)
      const result = await finalizeTargetPeriod({
        periodId: req.params.periodId,
        userId: req.user!.userId,
        notes: body.notes,
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:periodId/reopen',
  authenticate,
  authorizeAny(['performance_targets:finalize']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          notes: z.string().optional(),
        })
        .parse(req.body)

      const result = await reopenTargetPeriod({
        periodId: req.params.periodId,
        notes: body.notes,
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
