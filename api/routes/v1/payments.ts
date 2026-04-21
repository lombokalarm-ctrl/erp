import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { upload } from '../../lib/upload.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { createPayment, getPaymentDetail } from '../../services/paymentService.js'
import { getPool } from '../../db/pool.js'
import { createFileRecord } from '../../services/fileService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()

router.get(
  '/',
  authenticate,
  authorizeAny(['payments:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          invoiceId: z.string().uuid().optional(),
        })
        .parse(req.query)

      const pool = getPool()
      const values: unknown[] = []
      const where: string[] = []
      if (query.invoiceId) {
        values.push(query.invoiceId)
        where.push(`p.invoice_id = $1`)
      }
      const whereSql = where.length ? `where ${where.join(' and ')}` : ''

      const resDb = await pool.query(
        `
          select
            p.id,
            p.invoice_id as "invoiceId",
            p.method,
            p.amount::text as amount,
            p.paid_at as "paidAt",
            p.note,
            p.proof_file_id as "proofFileId",
            p.created_at as "createdAt"
          from payments p
          ${whereSql}
          order by p.paid_at desc
        `,
        values,
      )
      ok(res, resDb.rows)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  authorizeAny(['payments:write']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          invoiceId: z.string().uuid(),
          method: z.enum(['CASH', 'TRANSFER', 'TERM']),
          amount: z.coerce.number().positive(),
          paidAt: z.string().datetime(),
          note: z.string().optional(),
        })
        .parse(req.body)

      const result = await createPayment({
        invoiceId: body.invoiceId,
        method: body.method,
        amount: body.amount,
        paidAt: body.paidAt,
        note: body.note,
        createdBy: req.user!.userId,
      })
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PAYMENT_CREATE',
        entity: 'payments',
        entityId: result.payment.id,
        payload: { invoiceId: body.invoiceId, method: body.method, amount: body.amount },
      })
      ok(res, result)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:id/proof',
  authenticate,
  authorizeAny(['payments:write']),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        ok(res, null)
        return
      }

      const fileId = await createFileRecord({
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        storagePath: req.file.path,
      })

      const pool = getPool()
      await pool.query('update payments set proof_file_id = $2 where id = $1', [
        req.params.id,
        fileId,
      ])

      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'PAYMENT_PROOF_UPLOAD',
        entity: 'payments',
        entityId: req.params.id,
        payload: { fileId },
      })
      ok(res, { fileId })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/:id/detail',
  authenticate,
  authorizeAny(['payments:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await getPaymentDetail(req.params.id)
      ok(res, payment)
    } catch (err) {
      next(err)
    }
  },
)

export default router
