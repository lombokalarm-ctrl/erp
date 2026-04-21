import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import type { PoolClient } from 'pg'
import { getEnv } from '../lib/env.js'
import { getPool } from '../db/pool.js'

dotenv.config()

const ROLE_ADMIN = 'Admin'
const ROLE_MANAGER = 'Manager'
const ROLE_SALES = 'Sales'
const ROLE_GUDANG = 'Gudang'

const permissions = [
  { code: 'users:read', description: 'Read users' },
  { code: 'users:write', description: 'Write users' },
  { code: 'suppliers:read', description: 'Read suppliers' },
  { code: 'suppliers:write', description: 'Write suppliers' },
  { code: 'customers:read', description: 'Read customers' },
  { code: 'customers:write', description: 'Write customers' },
  { code: 'products:read', description: 'Read products' },
  { code: 'products:write', description: 'Write products' },
  { code: 'inventory:read', description: 'Read inventory' },
  { code: 'inventory:write', description: 'Write inventory' },
  { code: 'purchasing:read', description: 'Read purchasing' },
  { code: 'purchasing:write', description: 'Write purchasing' },
  { code: 'sales_orders:read', description: 'Read sales orders' },
  { code: 'sales_orders:write', description: 'Write sales orders' },
  { code: 'sales_orders:override_credit', description: 'Override credit validation' },
  { code: 'sales_orders:approve', description: 'Persetujuan Sales Order (Override Credit)' },
  { code: 'invoices:read', description: 'Read invoices' },
  { code: 'invoices:write', description: 'Write invoices' },
  { code: 'payments:read', description: 'Read payments' },
  { code: 'payments:write', description: 'Write payments' },
  { code: 'reports:read', description: 'Read reports' },
  { code: 'scoring:write', description: 'Write scoring config' },
]

const rolePermissionMap: Record<string, string[]> = {
  [ROLE_ADMIN]: permissions.map((p) => p.code),
  [ROLE_MANAGER]: [
    'customers:read',
    'customers:write',
    'products:read',
    'products:write',
    'suppliers:read',
    'suppliers:write',
    'inventory:read',
    'inventory:write',
    'purchasing:read',
    'purchasing:write',
    'sales_orders:read',
    'sales_orders:write',
    'sales_orders:override_credit',
    'sales_orders:approve',
    'invoices:read',
    'invoices:write',
    'payments:read',
    'payments:write',
    'reports:read',
    'scoring:write',
  ],
  [ROLE_SALES]: [
    'customers:read',
    'products:read',
    'sales_orders:read',
    'sales_orders:write',
    'invoices:read',
  ],
  [ROLE_GUDANG]: [
    'products:read',
    'inventory:read',
    'inventory:write',
    'purchasing:read',
    'purchasing:write',
    'sales_orders:read',
    'invoices:read',
  ],
}

async function upsertRole(q: Pick<PoolClient, 'query'>, name: string) {
  const res = await q.query(
    `
      insert into roles(name)
      values ($1)
      on conflict(name) do update set name = excluded.name
      returning id
    `,
    [name],
  )
  return String(res.rows[0].id)
}

async function upsertPermission(
  q: Pick<PoolClient, 'query'>,
  p: { code: string; description?: string },
) {
  const res = await q.query(
    `
      insert into permissions(code, description)
      values ($1, $2)
      on conflict(code) do update set description = excluded.description
      returning id
    `,
    [p.code, p.description ?? null],
  )
  return String(res.rows[0].id)
}

async function main() {
  const pool = getPool()
  const client = await pool.connect()
  await client.query('begin')
  try {
    const roleIds: Record<string, string> = {}
    for (const roleName of [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES, ROLE_GUDANG]) {
      roleIds[roleName] = await upsertRole(client, roleName)
    }

    const permIds: Record<string, string> = {}
    for (const p of permissions) {
      permIds[p.code] = await upsertPermission(client, p)
    }

    await client.query('delete from role_permissions')
    for (const [roleName, codes] of Object.entries(rolePermissionMap)) {
      for (const code of codes) {
        await client.query(
          'insert into role_permissions(role_id, permission_id) values ($1, $2) on conflict do nothing',
          [roleIds[roleName], permIds[code]],
        )
      }
    }

    const adminEmail = getEnv('SEED_ADMIN_EMAIL', 'admin@local.test')
    const adminPassword = getEnv('SEED_ADMIN_PASSWORD', 'admin123')
    const hash = await bcrypt.hash(adminPassword, 12)

    await client.query(
      `
        insert into users(role_id, email, password_hash, full_name, is_active)
        values ($1, $2, $3, $4, true)
        on conflict(email) do update
          set role_id = excluded.role_id,
              password_hash = excluded.password_hash,
              full_name = excluded.full_name,
              is_active = true
      `,
      [roleIds[ROLE_ADMIN], adminEmail, hash, 'Administrator'],
    )

    const scoringConfig = await client.query(
      `
        insert into scoring_configs(is_active)
        values (true)
        returning id
      `,
    )
    const scoringConfigId = scoringConfig.rows[0]?.id
    if (scoringConfigId) {
      const rules = [
        { code: 'purchase_volume', weight: 0.35 },
        { code: 'purchase_frequency', weight: 0.15 },
        { code: 'late_payment_days', weight: -0.25 },
        { code: 'late_payment_ratio', weight: -0.15 },
        { code: 'active_debt', weight: -0.1 },
        { code: 'customer_tenure', weight: 0.1 },
      ]
      for (const r of rules) {
        await client.query(
          `
            insert into scoring_rules(scoring_config_id, code, weight)
            values ($1, $2, $3)
            on conflict(scoring_config_id, code) do update set weight = excluded.weight
          `,
          [scoringConfigId, r.code, r.weight],
        )
      }
    }

    await client.query(
      `
        insert into warehouses(code, name)
        values ('WH-01', 'Gudang Utama')
        on conflict(code) do update set name = excluded.name
      `,
    )

    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
    if ((pool as any).end) await (pool as any).end()
    process.exit(0)
  }
}

main().catch((err) => {
  process.stderr.write(String(err))
  process.exit(1)
})
