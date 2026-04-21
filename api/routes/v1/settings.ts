import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate, authorizeAny } from '../../middlewares/auth.js'
import { getCompanySettings, updateCompanySettings } from '../../services/settingService.js'

const router = Router()

router.get(
  '/company',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getCompanySettings()
      ok(res, data)
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  '/company',
  authenticate,
  authorizeAny(['users:write']), // Hanya yang bisa manage users/admin yang bisa ubah setting perusahaan
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          name: z.string().min(1),
          address: z.string().default(''),
          phone: z.string().default(''),
          email: z.string().default(''),
          taxNumber: z.string().default(''),
          website: z.string().default(''),
        })
        .parse(req.body)

      const updated = await updateCompanySettings({
        name: body.name,
        address: body.address,
        phone: body.phone,
        email: body.email,
        taxNumber: body.taxNumber,
        website: body.website,
      })
      ok(res, updated)
    } catch (err) {
      next(err)
    }
  },
)

export default router
