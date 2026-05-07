import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { ok } from '../../lib/http.js'
import { authenticate } from '../../middlewares/auth.js'
import {
  globalSearch,
  SEARCH_MODULES,
  type SearchModule,
} from '../../services/searchService.js'

const router = Router()

const modulePermissionMap: Record<SearchModule, string[]> = {
  customers: ['customers:read'],
  products: ['products:read'],
  suppliers: ['suppliers:read'],
  'sales-orders': ['sales_orders:read'],
  invoices: ['invoices:read'],
  'credit-notes': ['invoices:read', 'reports:read'],
}

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          q: z.string().trim().min(2),
          limit: z.coerce.number().int().min(1).max(10).default(5),
          modules: z.string().optional(),
        })
        .parse(req.query)

      const requestedModules = parseRequestedModules(query.modules)
      const allowedModules = requestedModules.filter((module) =>
        canReadModule(req.user?.permissions ?? [], module),
      )

      const items = await globalSearch({
        q: query.q,
        limitPerModule: query.limit,
        modules: allowedModules,
      })

      ok(res, items, {
        q: query.q,
        modules: allowedModules,
      })
    } catch (err) {
      next(err)
    }
  },
)

function parseRequestedModules(raw?: string): SearchModule[] {
  if (!raw?.trim()) {
    return [...SEARCH_MODULES]
  }
  const requested = raw
    .split(',')
    .map((m) => m.trim())
    .filter((m): m is SearchModule => SEARCH_MODULES.includes(m as SearchModule))
  return requested.length > 0 ? requested : [...SEARCH_MODULES]
}

function canReadModule(userPermissions: string[], module: SearchModule) {
  const required = modulePermissionMap[module] ?? []
  return required.some((perm) => userPermissions.includes(perm))
}

export default router
