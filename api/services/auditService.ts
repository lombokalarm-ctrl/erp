import { getPool } from '../db/pool.js'

export async function writeAuditLog(input: {
  actorUserId: string | null
  action: string
  entity: string
  entityId?: string | null
  payload?: unknown
}) {
  const pool = getPool()
  await pool.query(
    `
      insert into audit_logs(actor_user_id, action, entity, entity_id, payload)
      values ($1,$2,$3,$4,$5)
    `,
    [
      input.actorUserId,
      input.action,
      input.entity,
      input.entityId ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
    ],
  )
}

export async function listAuditLogs(params: {
  page?: number
  pageSize?: number
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50
  const offset = (page - 1) * pageSize

  const totalRes = await pool.query(`select count(*)::int as c from audit_logs`)
  const total = Number(totalRes.rows[0]?.c ?? 0)

  const res = await pool.query(
    `
      select
        al.id,
        al.actor_user_id as "actorUserId",
        u.email as "actorEmail",
        al.action,
        al.entity,
        al.entity_id as "entityId",
        al.payload,
        al.created_at as "createdAt"
      from audit_logs al
      left join users u on u.id = al.actor_user_id
      order by al.created_at desc
      limit $1 offset $2
    `,
    [pageSize, offset],
  )

  return { items: res.rows, total }
}

