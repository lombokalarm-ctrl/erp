import bcrypt from 'bcryptjs'
import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export async function listRoles() {
  const pool = getPool()
  const res = await pool.query(`select id, name from roles order by name asc`)
  const roles = res.rows as { id: string; name: string; permissions?: string[] }[]
  
  for (const role of roles) {
    role.permissions = await getRolePermissions(role.id)
  }
  
  return roles
}

export async function getRolePermissions(roleId: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select p.code 
      from role_permissions rp
      join permissions p on p.id = rp.permission_id
      where rp.role_id = $1
    `,
    [roleId]
  )
  return res.rows.map(r => r.code)
}

export async function listAllPermissions() {
  const pool = getPool()
  const res = await pool.query(`select id, code, description from permissions order by code asc`)
  return res.rows as { id: string; code: string; description: string }[]
}

export async function getRoleWithPermissions(roleId: string) {
  const pool = getPool()
  const roleRes = await pool.query(`select id, name from roles where id = $1`, [roleId])
  if (!roleRes.rowCount) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Role tidak ditemukan' })
  
  const permissions = await getRolePermissions(roleId)
  return { ...roleRes.rows[0], permissions }
}

export async function createRole(name: string, permissions: string[]) {
  const pool = getPool()
  const roleRes = await pool.query(`insert into roles(name) values ($1) returning id, name`, [name])
  const roleId = roleRes.rows[0].id

  if (permissions.length > 0) {
    const permIdsRes = await pool.query(`select id, code from permissions where code = any($1)`, [permissions])
    const permIds = permIdsRes.rows.map(r => r.id)
    
    for (const pid of permIds) {
      await pool.query(`insert into role_permissions(role_id, permission_id) values ($1, $2)`, [roleId, pid])
    }
  }

  return getRoleWithPermissions(roleId)
}

export async function updateRole(roleId: string, name: string, permissions: string[]) {
  const pool = getPool()
  
  // check if role exists and prevent updating super admin
  const check = await pool.query(`select name from roles where id = $1`, [roleId])
  if (!check.rowCount) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Role tidak ditemukan' })
  if (check.rows[0].name === 'Admin') {
    throw new ApiError({ code: 'FORBIDDEN', status: 403, message: 'Role Admin tidak dapat diubah' })
  }

  await pool.query(`update roles set name = $2 where id = $1`, [roleId, name])
  
  await pool.query(`delete from role_permissions where role_id = $1`, [roleId])
  
  if (permissions.length > 0) {
    const permIdsRes = await pool.query(`select id, code from permissions where code = any($1)`, [permissions])
    const permIds = permIdsRes.rows.map(r => r.id)
    
    for (const pid of permIds) {
      await pool.query(`insert into role_permissions(role_id, permission_id) values ($1, $2)`, [roleId, pid])
    }
  }

  return getRoleWithPermissions(roleId)
}

export async function deleteRole(roleId: string) {
  const pool = getPool()
  const check = await pool.query(`select name from roles where id = $1`, [roleId])
  if (!check.rowCount) throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Role tidak ditemukan' })
  if (check.rows[0].name === 'Admin' || check.rows[0].name === 'Manager' || check.rows[0].name === 'Sales') {
    throw new ApiError({ code: 'FORBIDDEN', status: 403, message: 'Role bawaan sistem tidak dapat dihapus' })
  }

  const usersCheck = await pool.query(`select id from users where role_id = $1 limit 1`, [roleId])
  if (usersCheck.rowCount && usersCheck.rowCount > 0) {
    throw new ApiError({ code: 'CONFLICT', status: 409, message: 'Role masih digunakan oleh user aktif' })
  }

  await pool.query(`delete from roles where id = $1`, [roleId])
}

export async function listUsers(params: { page?: number; pageSize?: number; q?: string; role?: string }) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize
  const q = params.q?.trim()

  const where: string[] = []
  const values: unknown[] = []
  if (q) {
    values.push(`%${q.toLowerCase()}%`)
    where.push('(lower(u.email) like $1 or lower(u.full_name) like $1)')
  }
  
  if (params.role) {
    values.push(params.role)
    where.push(`r.name = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `
      select count(*)::int as c 
      from users u
      join roles r on r.id = u.role_id
      ${whereSql}
    `,
    values,
  )
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select
        u.id,
        u.email,
        u.full_name as "fullName",
        r.name as role,
        u.is_active as "isActive",
        u.created_at as "createdAt"
      from users u
      join roles r on r.id = u.role_id
      ${whereSql}
      order by u.created_at desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return { items: res.rows, total }
}

export async function createUser(input: {
  email: string
  fullName: string
  password: string
  roleId: string
}) {
  const pool = getPool()
  const roleRes = await pool.query('select id from roles where id = $1', [input.roleId])
  if (!roleRes.rowCount) {
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Role tidak valid' })
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const res = await pool.query(
    `
      insert into users(role_id, email, password_hash, full_name, is_active)
      values ($1,$2,$3,$4,true)
      returning id, email, full_name as "fullName"
    `,
    [input.roleId, input.email, passwordHash, input.fullName],
  )
  return res.rows[0]
}

export async function setUserActive(userId: string, isActive: boolean) {
  const pool = getPool()
  const res = await pool.query(
    `
      update users
      set is_active = $2, updated_at = now()
      where id = $1
      returning id, email, full_name as "fullName", is_active as "isActive"
    `,
    [userId, isActive],
  )
  if (!res.rowCount) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'User tidak ditemukan' })
  }
  return res.rows[0]
}

export async function resetUserPassword(userId: string, newPassword: string) {
  const pool = getPool()
  const hash = await bcrypt.hash(newPassword, 12)
  const res = await pool.query(
    `
      update users
      set password_hash = $2, updated_at = now()
      where id = $1
      returning id
    `,
    [userId, hash],
  )
  if (!res.rowCount) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'User tidak ditemukan' })
  }
  return { id: userId }
}

