import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { ApiError, ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import {
  createCustomer,
  getCustomerById,
  importCustomers,
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
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

function normalizeHeader(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '_')
}

function toNullableString(value: unknown) {
  if (value == null) return null
  const str = String(value).trim()
  return str ? str : null
}

function toNullableNumber(value: unknown) {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const normalized = raw.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

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
          regionId: z.string().uuid().optional(),
          isActive: z.enum(['true', 'false', 'all']).optional(),
          includeUnassigned: z
            .enum(['true', 'false'])
            .optional()
            .transform((value) => value === 'true'),
        })
        .parse(req.query)

      if (req.user?.role === 'Sales') {
        query.salesId = req.user.userId
      }

      const result = await listCustomers({
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
          category: z.enum(['RETAIL', 'GROSIR', 'MODERN RETAIL', 'HOREKA', 'NASIONAL MODERN RETAIL']),
          phone: z.string().optional(),
          email: z.string().optional(),
          address: z.string().optional(),
          regionId: z.string().uuid().nullable().optional(),
          status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
          isActive: z.boolean().optional(),
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
        email: body.email,
        address: body.address,
        regionId: body.regionId,
        status: body.status,
        isActive: body.isActive,
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

router.post(
  '/import',
  authenticate,
  authorizeAny(['customers:write']),
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
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      })

      const mappedRows = rows.map((raw) => {
        const normalized: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(raw)) {
          normalized[normalizeHeader(key)] = value
        }
        return {
          code: String(normalized.code ?? '').trim(),
          name: String(normalized.name ?? normalized.nama ?? '').trim(),
          ownerName: toNullableString(
            normalized.owner_name ?? normalized.nama_pemilik ?? normalized.ownername,
          ),
          ktpNo: toNullableString(normalized.ktp_no ?? normalized.no_ktp ?? normalized.ktpno),
          npwpNo: toNullableString(normalized.npwp_no ?? normalized.no_npwp ?? normalized.npwpno),
          category: toNullableString(normalized.category ?? normalized.kategori),
          phone: toNullableString(normalized.phone ?? normalized.no_telp ?? normalized.no_hp),
          email: toNullableString(normalized.email),
          address: toNullableString(normalized.address ?? normalized.alamat),
          regionId: toNullableString(normalized.region_id),
          regionName: toNullableString(normalized.region_name ?? normalized.wilayah),
          status: toNullableString(normalized.status),
          salesId: toNullableString(normalized.sales_id),
          salesEmail: toNullableString(normalized.sales_email),
          creditLimit: toNullableNumber(normalized.credit_limit),
          salesOrderLimit: toNullableNumber(normalized.sales_order_limit),
          paymentTermDays: toNullableNumber(
            normalized.payment_term_days ?? normalized.tempo_hari,
          ),
        }
      })

      const result = await importCustomers(mappedRows)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'CUSTOMER_IMPORT',
        entity: 'customers',
        payload: {
          filename: req.file.originalname,
          total: result.total,
          created: result.created,
          updated: result.updated,
          failed: result.failed,
        },
      })
      ok(
        res,
        {
          ...result,
          expectedColumns: [
            'code',
            'name',
            'owner_name',
            'ktp_no',
            'npwp_no',
            'category',
            'phone',
            'email',
            'address',
            'region_id',
            'region_name',
            'status',
            'sales_id',
            'sales_email',
            'credit_limit',
            'sales_order_limit',
            'payment_term_days',
          ],
        },
      )
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
          category: z.enum(['RETAIL', 'GROSIR', 'MODERN RETAIL', 'HOREKA', 'NASIONAL MODERN RETAIL']).optional(),
          phone: z.string().nullable().optional(),
          email: z.string().nullable().optional(),
          address: z.string().nullable().optional(),
          regionId: z.string().uuid().nullable().optional(),
          status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
          isActive: z.boolean().optional(),
          salesId: z.string().uuid().nullable().optional(),
        })
        .parse(req.body)

      const updateData = { ...body }
      if (req.user?.role === 'Sales') {
        // Sales cannot reassign customer to someone else
        delete updateData.salesId
      }

      await updateCustomer(req.params.id, updateData)
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'CUSTOMER_UPDATE',
        entity: 'customers',
        entityId: req.params.id,
        payload: body,
      })
      ok(res, { id: req.params.id })
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
