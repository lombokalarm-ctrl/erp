import bcrypt from 'bcryptjs'
import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

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

