import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { ApiError } from '../../lib/http.js'
import {
  createSupplier,
  listSuppliers,
  updateSupplier,
  deleteSupplier,
  importSuppliers,
} from '../../services/supplierService.js'
import { writeAuditLog } from '../../services/auditService.js'

const router = Router()
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

function normalizeHeader(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '_')
}

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
          isActive: z.enum(['true', 'false', 'all']).optional(),
        })
        .parse(req.query)

      const result = await listSuppliers({
        ...query,
        isActive:
          query.isActive === 'all' ? 'all' : query.isActive === 'false' ? false : true,
      })
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
          isActive: z.boolean().optional(),
        })
        .parse(req.body)

      const created = await createSupplier({
        code: body.code,
        name: body.name,
        phone: body.phone,
        address: body.address,
        isActive: body.isActive,
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

router.post(
  '/import',
  authenticate,
  authorizeAny(['suppliers:write']),
  importUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'File wajib diunggah',
        })
      }

      const filename = req.file.originalname.toLowerCase()
      if (!filename.endsWith('.csv') && !filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'Format file harus .csv, .xlsx, atau .xls',
        })
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          status: 400,
          message: 'File tidak memiliki sheet',
        })
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
        defval: '',
      })

      const mappedRows = rows.map((raw) => {
        const normalized: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(raw)) {
          normalized[normalizeHeader(key)] = value
        }

        return {
          code: String(normalized.code ?? normalized.kode ?? '').trim(),
          name: String(normalized.name ?? normalized.nama ?? normalized.supplier ?? '').trim(),
        }
      })

      const result = await importSuppliers(mappedRows)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'SUPPLIER_IMPORT',
        entity: 'suppliers',
        payload: {
          filename: req.file.originalname,
          total: result.total,
          created: result.created,
          updated: result.updated,
          failed: result.failed,
        },
      })

      ok(res, {
        ...result,
        expectedColumns: ['Kode', 'Supplier'],
        acceptedAliases: {
          code: ['Kode', 'code'],
          name: ['Supplier', 'name', 'nama'],
        },
      })
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
          isActive: z.boolean().optional(),
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

