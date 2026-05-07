import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'
import { signAccessToken } from '../auth/jwt.js'
import { getEnv } from '../lib/env.js'
import { sendPasswordResetEmail } from './emailService.js'

export async function verifyLogin(email: string, password: string) {
  const pool = getPool()
  const userRes = await pool.query(
    `
      select
        u.id,
        u.email,
        u.password_hash,
        u.full_name,
        u.is_active,
        r.name as role
      from users u
      join roles r on r.id = u.role_id
      where lower(u.email) = lower($1)
      limit 1
    `,
    [email],
  )

  const user = userRes.rows[0] as
    | {
        id: string
        email: string
        password_hash: string
        full_name: string
        is_active: boolean
        role: string
      }
    | undefined

  if (!user || !user.is_active) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Email atau password salah',
    })
  }

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Email atau password salah',
    })
  }

  const permRes = await pool.query(
    `
      select p.code
      from role_permissions rp
      join permissions p on p.id = rp.permission_id
      where rp.role_id = (
        select role_id from users where id = $1
      )
    `,
    [user.id],
  )

  const permissions = permRes.rows.map((r) => String(r.code))

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    permissions,
  }
}

export async function getAuthUserById(userId: string) {
  const pool = getPool()
  const userRes = await pool.query(
    `
      select
        u.id,
        u.email,
        u.full_name,
        u.is_active,
        r.name as role
      from users u
      join roles r on r.id = u.role_id
      where u.id = $1
      limit 1
    `,
    [userId],
  )

  const user = userRes.rows[0] as
    | {
        id: string
        email: string
        full_name: string
        is_active: boolean
        role: string
      }
    | undefined

  if (!user || !user.is_active) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Pengguna tidak aktif',
    })
  }

  const permRes = await pool.query(
    `
      select p.code
      from role_permissions rp
      join permissions p on p.id = rp.permission_id
      where rp.role_id = (
        select role_id from users where id = $1
      )
    `,
    [user.id],
  )

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    permissions: permRes.rows.map((r) => String(r.code)),
  }
}

export async function createAuthSession(input: {
  userId: string
  role: string
  permissions: string[]
  ip?: string
  userAgent?: string
}) {
  const pool = getPool()
  const refreshToken = crypto.randomBytes(48).toString('hex')
  const refreshTokenHash = hashToken(refreshToken)
  const expiresAt = new Date(Date.now() + getRefreshExpiresMs())

  await pool.query(
    `
      insert into auth_refresh_tokens(user_id, token_hash, expires_at, created_ip, user_agent)
      values ($1, $2, $3, $4, $5)
    `,
    [input.userId, refreshTokenHash, expiresAt.toISOString(), input.ip ?? null, input.userAgent ?? null],
  )

  const accessToken = signAccessToken({
    userId: input.userId,
    role: input.role,
    permissions: input.permissions,
  })

  return { accessToken, refreshToken }
}

export async function rotateAuthSession(refreshToken: string, meta?: { ip?: string; userAgent?: string }) {
  const pool = getPool()
  const tokenHash = hashToken(refreshToken)
  const client = await pool.connect()

  try {
    await client.query('begin')
    const tokenRes = await client.query<{
      id: string
      user_id: string
      expires_at: string
      revoked_at: string | null
    }>(
      `
        select id, user_id, expires_at, revoked_at
        from auth_refresh_tokens
        where token_hash = $1
        limit 1
      `,
      [tokenHash],
    )

    const row = tokenRes.rows[0]
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new ApiError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: 'Refresh token tidak valid',
      })
    }

    await client.query(
      `update auth_refresh_tokens set revoked_at = now() where id = $1`,
      [row.id],
    )

    const user = await getAuthUserById(row.user_id)
    const newRefreshToken = crypto.randomBytes(48).toString('hex')
    const newHash = hashToken(newRefreshToken)
    const expiresAt = new Date(Date.now() + getRefreshExpiresMs())

    await client.query(
      `
        insert into auth_refresh_tokens(user_id, token_hash, expires_at, created_ip, user_agent)
        values ($1, $2, $3, $4, $5)
      `,
      [user.id, newHash, expiresAt.toISOString(), meta?.ip ?? null, meta?.userAgent ?? null],
    )

    await client.query('commit')
    const accessToken = signAccessToken({
      userId: user.id,
      role: user.role,
      permissions: user.permissions,
    })

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user,
    }
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

export async function revokeAllUserSessions(userId: string) {
  const pool = getPool()
  await pool.query(
    `
      update auth_refresh_tokens
      set revoked_at = now()
      where user_id = $1
        and revoked_at is null
    `,
    [userId],
  )
}

export async function requestPasswordReset(email: string) {
  const pool = getPool()
  const userRes = await pool.query<{
    id: string
    email: string
    full_name: string
    is_active: boolean
  }>(
    `
      select id, email, full_name, is_active
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [email],
  )

  const user = userRes.rows[0]
  if (!user || !user.is_active) {
    return
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `
        update password_reset_tokens
        set used_at = now()
        where user_id = $1
          and used_at is null
      `,
      [user.id],
    )

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + getResetExpiresMs())

    await client.query(
      `
        insert into password_reset_tokens(user_id, token_hash, expires_at)
        values ($1, $2, $3)
      `,
      [user.id, tokenHash, expiresAt.toISOString()],
    )

    await client.query('commit')

    const resetBase = getEnv('PASSWORD_RESET_URL_BASE', getEnv('APP_ORIGIN', 'http://localhost:5173'))
    const resetLink = `${resetBase.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`
    await sendPasswordResetEmail({
      to: user.email,
      fullName: user.full_name,
      resetLink,
    })
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

export async function resetPasswordByToken(token: string, newPassword: string) {
  const pool = getPool()
  const tokenHash = hashToken(token)
  const client = await pool.connect()

  try {
    await client.query('begin')
    const tokenRes = await client.query<{
      id: string
      user_id: string
      expires_at: string
      used_at: string | null
    }>(
      `
        select id, user_id, expires_at, used_at
        from password_reset_tokens
        where token_hash = $1
        limit 1
      `,
      [tokenHash],
    )

    const row = tokenRes.rows[0]
    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new ApiError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: 'Token reset password tidak valid atau kadaluarsa',
      })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await client.query(
      `
        update users
        set password_hash = $2, updated_at = now()
        where id = $1
      `,
      [row.user_id, passwordHash],
    )

    await client.query(
      `
        update password_reset_tokens
        set used_at = now()
        where id = $1
      `,
      [row.id],
    )

    await client.query(
      `
        update auth_refresh_tokens
        set revoked_at = now()
        where user_id = $1
          and revoked_at is null
      `,
      [row.user_id],
    )
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getRefreshExpiresMs() {
  const days = Number(getEnv('JWT_REFRESH_EXPIRES_DAYS', '7'))
  const value = Number.isFinite(days) && days > 0 ? days : 7
  return value * 24 * 60 * 60 * 1000
}

function getResetExpiresMs() {
  const minutes = Number(getEnv('PASSWORD_RESET_EXPIRES_MINUTES', '30'))
  const value = Number.isFinite(minutes) && minutes > 0 ? minutes : 30
  return value * 60 * 1000
}

