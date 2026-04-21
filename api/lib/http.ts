import type { NextFunction, Request, Response } from 'express'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'FOREIGN_KEY_VIOLATION'

export class ApiError extends Error {
  code: ApiErrorCode
  status: number
  details?: unknown

  constructor(params: {
    code: ApiErrorCode
    message: string
    status: number
    details?: unknown
  }) {
    super(params.message)
    this.code = params.code
    this.status = params.status
    this.details = params.details
  }
}

export function ok<T>(res: Response, data: T, meta?: unknown) {
  res.json(meta ? { data, meta } : { data })
}

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error('[API ERROR]', err)
  void _next
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    })
    return
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Server internal error',
    },
  })
}
