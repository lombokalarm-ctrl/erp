import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  getActiveScoringRules,
  recalculateCustomerScore,
  storeAnalysis,
} from '../../services/scoringService.js'
import { getPool } from '../../db/pool.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/config',
  authenticate,
  authorizeAny(['scoring:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await getActiveScoringRules())
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/config',
  authenticate,
  authorizeAny(['scoring:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          rules: z
            .array(
              z.object({
                code: z.string().min(1),
                weight: z.coerce.number().min(-5).max(5),
              }),
            )
            .min(1),
        })
        .parse(req.body)

      const pool = getPool()
      const cfg = await getActiveScoringRules()
      if (!cfg.configId) {
        const created = await pool.query(
          `insert into scoring_configs(is_active, created_by) values (true, $1) returning id`,
          [req.user!.userId],
        )
        cfg.configId = created.rows[0].id
      }

      for (const r of body.rules) {
        await pool.query(
          `
            insert into scoring_rules(scoring_config_id, code, weight)
            values ($1,$2,$3)
            on conflict(scoring_config_id, code) do update set weight = excluded.weight
          `,
          [cfg.configId, r.code, r.weight],
        )
      }

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'SCORING_CONFIG_UPDATE',
        entity: 'scoring_configs',
        entityId: cfg.configId,
        payload: body.rules,
      })
      ok(res, await getActiveScoringRules())
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/recalculate',
  authenticate,
  authorizeAny(['scoring:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          customerId: z.string().uuid(),
        })
        .parse(req.body)

      const result = await recalculateCustomerScore(body.customerId)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'SCORING_RECALCULATE',
        entity: 'customer_scores',
        entityId: result.id,
        payload: { customerId: body.customerId, score: result.score, grade: result.grade },
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/store-analysis/:customerId',
  authenticate,
  authorizeAny(['customers:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await storeAnalysis(req.params.customerId))
    } catch (err) {
      next(err)
    }
  },
)

export default router
