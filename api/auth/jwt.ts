import jwt from 'jsonwebtoken'
import type { Secret, SignOptions } from 'jsonwebtoken'
import { getEnv, mustGetEnv } from '../lib/env.js'

export type JwtUser = {
  userId: string
  role: string
  permissions: string[]
}

export function signAccessToken(payload: JwtUser) {
  const secret = mustGetEnv('JWT_ACCESS_SECRET')
  const expiresInRaw = getEnv('JWT_ACCESS_EXPIRES_IN', '1h')
  const expiresIn = expiresInRaw as SignOptions['expiresIn']
  const options: SignOptions = { expiresIn }
  return jwt.sign(payload, secret as Secret, options)
}

export function verifyAccessToken(token: string): JwtUser {
  const secret = mustGetEnv('JWT_ACCESS_SECRET')
  const decoded = jwt.verify(token, secret as Secret)
  if (!isJwtUser(decoded)) {
    throw new Error('Invalid token payload')
  }
  return decoded
}

function isJwtUser(v: unknown): v is JwtUser {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  if (typeof obj.userId !== 'string') return false
  if (typeof obj.role !== 'string') return false
  if (!Array.isArray(obj.permissions)) return false
  return obj.permissions.every((p) => typeof p === 'string')
}
