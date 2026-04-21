import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../lib/http.js'
import { verifyAccessToken, type JwtUser } from '../auth/jwt.js'

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtUser
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next(
      new ApiError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: 'Unauthorized',
      }),
    )
    return
  }

  const token = header.slice('Bearer '.length).trim()

  try {
    req.user = verifyAccessToken(token)
    next()
  } catch {
    next(
      new ApiError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: 'Unauthorized',
      }),
    )
  }
}

export function authorizeAny(required: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user
    if (!user) {
      next(
        new ApiError({
          code: 'UNAUTHORIZED',
          status: 401,
          message: 'Unauthorized',
        }),
      )
      return
    }

    const ok = required.some((p) => user.permissions.includes(p))
    if (!ok) {
      next(
        new ApiError({
          code: 'FORBIDDEN',
          status: 403,
          message: 'Forbidden',
        }),
      )
      return
    }

    next()
  }
}
