import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

const OVERDUE_SWEEP_LOCK_KEY = 96214017

type ListNotificationParams = {
  userId: string
  page?: number
  pageSize?: number
  unreadOnly?: boolean
}

type OverdueInvoiceRow = {
  invoiceId: string
  invoiceNo: string
  customerName: string
  dueDate: string
  remainingAmount: string
  overdueDays: number
}

export async function listNotifications(params: ListNotificationParams) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize
  const unreadOnly = params.unreadOnly ?? false

  const totalRes = await pool.query(
    `
      select count(*)::int as c
      from notifications n
      left join notification_reads nr
        on nr.notification_id = n.id
       and nr.user_id = $1
      where n.status = 'OPEN'
        and ($2::boolean = false or nr.notification_id is null)
    `,
    [params.userId, unreadOnly],
  )

  const listRes = await pool.query(
    `
      select
        n.id,
        n.type,
        n.title,
        n.message,
        n.severity,
        n.entity_type as "entityType",
        n.entity_id as "entityId",
        n.payload,
        n.created_at as "createdAt",
        nr.read_at as "readAt",
        (nr.notification_id is not null) as "isRead"
      from notifications n
      left join notification_reads nr
        on nr.notification_id = n.id
       and nr.user_id = $1
      where n.status = 'OPEN'
        and ($2::boolean = false or nr.notification_id is null)
      order by n.created_at desc
      limit $3 offset $4
    `,
    [params.userId, unreadOnly, pageSize, offset],
  )

  const unreadRes = await pool.query(
    `
      select count(*)::int as c
      from notifications n
      left join notification_reads nr
        on nr.notification_id = n.id
       and nr.user_id = $1
      where n.status = 'OPEN'
        and nr.notification_id is null
    `,
    [params.userId],
  )

  return {
    items: listRes.rows,
    total: Number(totalRes.rows[0]?.c ?? 0),
    unreadCount: Number(unreadRes.rows[0]?.c ?? 0),
  }
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const pool = getPool()
  const existsRes = await pool.query('select id from notifications where id = $1 limit 1', [
    notificationId,
  ])
  if (!existsRes.rowCount) {
    throw new ApiError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Notifikasi tidak ditemukan',
    })
  }

  await pool.query(
    `
      insert into notification_reads(notification_id, user_id)
      values ($1, $2)
      on conflict (notification_id, user_id) do nothing
    `,
    [notificationId, userId],
  )
}

export async function markAllNotificationsRead(userId: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into notification_reads(notification_id, user_id)
      select n.id, $1
      from notifications n
      left join notification_reads nr
        on nr.notification_id = n.id
       and nr.user_id = $1
      where n.status = 'OPEN'
        and nr.notification_id is null
    `,
    [userId],
  )
  return { marked: res.rowCount ?? 0 }
}

export async function sweepOverdueInvoiceNotifications() {
  const pool = getPool()
  const client = await pool.connect()
  let insertedOrUpdated = 0
  let resolved = 0

  try {
    await client.query('begin')
    const lockRes = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_xact_lock($1) as locked',
      [OVERDUE_SWEEP_LOCK_KEY],
    )

    if (!lockRes.rows[0]?.locked) {
      await client.query('rollback')
      return { insertedOrUpdated: 0, resolved: 0, skippedByLock: true }
    }

    const overdueRes = await client.query<OverdueInvoiceRow>(
      `
        with overdue as (
          select
            i.id as "invoiceId",
            i.invoice_no as "invoiceNo",
            c.name as "customerName",
            i.due_date::text as "dueDate",
            greatest(
              0,
              i.total_amount
              - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
              - coalesce((select sum(cna.amount) from credit_note_applies cna where cna.invoice_id = i.id), 0)
            )::numeric(14,2)::text as "remainingAmount",
            (current_date - i.due_date)::int as "overdueDays"
          from invoices i
          join customers c on c.id = i.customer_id
          where i.due_date < current_date
        )
        select *
        from overdue
        where "remainingAmount"::numeric > 0
      `,
    )

    for (const row of overdueRes.rows) {
      const payload = {
        invoiceId: row.invoiceId,
        invoiceNo: row.invoiceNo,
        customerName: row.customerName,
        dueDate: row.dueDate,
        remainingAmount: row.remainingAmount,
        overdueDays: row.overdueDays,
      }

      const title = `Invoice overdue: ${row.invoiceNo}`
      const message = `${row.customerName} terlambat ${row.overdueDays} hari. Sisa tagihan ${row.remainingAmount}.`
      const dedupeKey = `OVERDUE_INVOICE:${row.invoiceId}`

      await client.query(
        `
          insert into notifications(
            type, title, message, severity, entity_type, entity_id, dedupe_key, payload, status
          ) values (
            'OVERDUE_INVOICE', $1, $2, 'warning', 'invoice', $3, $4, $5::jsonb, 'OPEN'
          )
          on conflict (dedupe_key) do update
          set
            title = excluded.title,
            message = excluded.message,
            severity = excluded.severity,
            payload = excluded.payload,
            status = 'OPEN',
            resolved_at = null,
            updated_at = now()
        `,
        [title, message, row.invoiceId, dedupeKey, JSON.stringify(payload)],
      )
      insertedOrUpdated += 1
    }

    const overdueIds = overdueRes.rows.map((row) => row.invoiceId)
    if (overdueIds.length > 0) {
      const resolveRes = await client.query(
        `
          update notifications
          set
            status = 'RESOLVED',
            resolved_at = now(),
            updated_at = now()
          where type = 'OVERDUE_INVOICE'
            and status = 'OPEN'
            and entity_type = 'invoice'
            and entity_id is not null
            and not (entity_id = any($1::uuid[]))
        `,
        [overdueIds],
      )
      resolved = resolveRes.rowCount ?? 0
    } else {
      const resolveRes = await client.query(
        `
          update notifications
          set
            status = 'RESOLVED',
            resolved_at = now(),
            updated_at = now()
          where type = 'OVERDUE_INVOICE'
            and status = 'OPEN'
            and entity_type = 'invoice'
        `,
      )
      resolved = resolveRes.rowCount ?? 0
    }

    await client.query('commit')
    return { insertedOrUpdated, resolved, skippedByLock: false }
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}
