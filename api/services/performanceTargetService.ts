import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

type TargetStatus = 'DRAFT' | 'ACTIVE' | 'FINAL'
type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'

type UpdateSalesMonthlyTargetInput = {
  targetSalesAmount?: string | number
  targetSalesOrderCount?: number
  notes?: string | null
}

type SalesVisitScheduleInput = {
  regionId: string
  dayOfWeek: DayOfWeek
  targetVisitCount: number
  routeNotes?: string | null
}

type DeliveryScheduleInput = {
  regionId: string
  dayOfWeek: DayOfWeek
  targetDeliveryCount: number
  targetDeliveryPoints: number
  routeNotes?: string | null
}

function buildPeriodKey(month: number, year: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function buildMonthRange(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function calcAchievement(target: number, actual: number) {
  if (target <= 0) return actual > 0 ? 100 : 0
  return Number(((actual / target) * 100).toFixed(2))
}

function calcContribution(total: number, actual: number) {
  if (total <= 0) return 0
  return Number(((actual / total) * 100).toFixed(2))
}

function toDayNumber(day: DayOfWeek) {
  switch (day) {
    case 'MONDAY':
      return 1
    case 'TUESDAY':
      return 2
    case 'WEDNESDAY':
      return 3
    case 'THURSDAY':
      return 4
    case 'FRIDAY':
      return 5
    case 'SATURDAY':
      return 6
    case 'SUNDAY':
      return 0
  }
}

function countWeekdayOccurrences(month: number, year: number, day: DayOfWeek) {
  const target = toDayNumber(day)
  let count = 0
  const date = new Date(Date.UTC(year, month - 1, 1))
  while (date.getUTCMonth() === month - 1) {
    if (date.getUTCDay() === target) count += 1
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return count
}

function assertNoDuplicateKeys(keys: string[], message: string) {
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) {
      throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message })
    }
    seen.add(key)
  }
}

async function getPreferredPeriodId(month: number, year: number) {
  const pool = getPool()
  const periodKey = buildPeriodKey(month, year)
  const res = await pool.query(
    `
      select id
      from performance_target_periods
      where period_key = $1
      order by
        case status when 'FINAL' then 1 when 'ACTIVE' then 2 else 3 end,
        updated_at desc
      limit 1
    `,
    [periodKey],
  )
  return (res.rows[0]?.id as string | undefined) ?? null
}

async function assertPeriodExists(periodId: string) {
  const pool = getPool()
  const res = await pool.query(`select id from performance_target_periods where id = $1 limit 1`, [periodId])
  if (!res.rowCount) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Periode target tidak ditemukan' })
  }
}

async function getPeriodStatus(periodId: string) {
  const pool = getPool()
  const res = await pool.query(
    `select status from performance_target_periods where id = $1 limit 1`,
    [periodId],
  )
  const status = res.rows[0]?.status as TargetStatus | undefined
  if (!status) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Periode target tidak ditemukan' })
  }
  return status
}

async function assertPeriodEditable(periodId: string) {
  const status = await getPeriodStatus(periodId)
  if (status === 'FINAL') {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Periode target sudah final. Gunakan fitur buka edit terlebih dahulu.',
    })
  }
}

async function ensureDeliveryTargetPeriod(periodId: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into delivery_target_periods(period_id)
      values ($1)
      on conflict(period_id) do update
        set updated_at = now()
      returning id
    `,
    [periodId],
  )
  return String(res.rows[0].id)
}

export async function listTargetPeriods(params: {
  month?: number
  year?: number
  status?: TargetStatus
  regionId?: string
  page?: number
  pageSize?: number
}) {
  const pool = getPool()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: unknown[] = []

  if (params.month) {
    values.push(params.month)
    where.push(`p.period_month = $${values.length}`)
  }

  if (params.year) {
    values.push(params.year)
    where.push(`p.period_year = $${values.length}`)
  }

  if (params.status) {
    values.push(params.status)
    where.push(`p.status = $${values.length}`)
  }

  if (params.regionId) {
    values.push(params.regionId)
    where.push(
      `(
        exists (
          select 1
          from sales_visit_target_schedules svts
          join sales_monthly_targets smt on smt.id = svts.sales_target_id
          where smt.period_id = p.id
            and svts.region_id = $${values.length}
        )
        or exists (
          select 1
          from delivery_target_schedules dts
          join delivery_target_periods dtp on dtp.id = dts.delivery_target_period_id
          where dtp.period_id = p.id
            and dts.region_id = $${values.length}
        )
      )`,
    )
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as c from performance_target_periods p ${whereSql}`,
    values,
  )

  const rowsRes = await pool.query(
    `
      select
        p.id,
        p.period_month as month,
        p.period_year as year,
        p.period_key as "periodKey",
        p.status,
        p.notes,
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
        coalesce(st.sales_count, 0)::int as "salesCount",
        coalesce(st.total_sales_target, 0)::text as "totalSalesTarget",
        coalesce(st.total_sales_order_target, 0)::int as "totalSalesOrderTarget",
        coalesce(vs.total_visit_target, 0)::int as "totalVisitTarget",
        coalesce(ds.total_delivery_target, 0)::int as "totalDeliveryTarget",
        coalesce(ds.total_delivery_point_target, 0)::int as "totalDeliveryPointTarget"
      from performance_target_periods p
      left join lateral (
        select
          count(*)::int as sales_count,
          coalesce(sum(smt.target_sales_amount), 0)::numeric as total_sales_target,
          coalesce(sum(smt.target_sales_order_count), 0)::int as total_sales_order_target
        from sales_monthly_targets smt
        where smt.period_id = p.id
          and smt.is_active = true
      ) st on true
      left join lateral (
        select
          coalesce(
            sum(
              svts.target_visit_count *
              (
                select count(*)::int
                from generate_series(
                  make_date(p.period_year, p.period_month, 1),
                  (make_date(p.period_year, p.period_month, 1) + interval '1 month - 1 day')::date,
                  interval '1 day'
                ) as g(day)
                where extract(dow from g.day) =
                  case svts.day_of_week
                    when 'MONDAY' then 1
                    when 'TUESDAY' then 2
                    when 'WEDNESDAY' then 3
                    when 'THURSDAY' then 4
                    when 'FRIDAY' then 5
                    when 'SATURDAY' then 6
                    else 0
                  end
              )
            ),
            0
          )::int as total_visit_target
        from sales_visit_target_schedules svts
        join sales_monthly_targets smt on smt.id = svts.sales_target_id
        where smt.period_id = p.id
          and smt.is_active = true
          ${params.regionId ? `and svts.region_id = $${values.length}` : ''}
      ) vs on true
      left join lateral (
        select
          coalesce(
            sum(
              dts.target_delivery_count *
              (
                select count(*)::int
                from generate_series(
                  make_date(p.period_year, p.period_month, 1),
                  (make_date(p.period_year, p.period_month, 1) + interval '1 month - 1 day')::date,
                  interval '1 day'
                ) as g(day)
                where extract(dow from g.day) =
                  case dts.day_of_week
                    when 'MONDAY' then 1
                    when 'TUESDAY' then 2
                    when 'WEDNESDAY' then 3
                    when 'THURSDAY' then 4
                    when 'FRIDAY' then 5
                    when 'SATURDAY' then 6
                    else 0
                  end
              )
            ),
            0
          )::int as total_delivery_target,
          coalesce(
            sum(
              dts.target_delivery_points *
              (
                select count(*)::int
                from generate_series(
                  make_date(p.period_year, p.period_month, 1),
                  (make_date(p.period_year, p.period_month, 1) + interval '1 month - 1 day')::date,
                  interval '1 day'
                ) as g(day)
                where extract(dow from g.day) =
                  case dts.day_of_week
                    when 'MONDAY' then 1
                    when 'TUESDAY' then 2
                    when 'WEDNESDAY' then 3
                    when 'THURSDAY' then 4
                    when 'FRIDAY' then 5
                    when 'SATURDAY' then 6
                    else 0
                  end
              )
            ),
            0
          )::int as total_delivery_point_target
        from delivery_target_schedules dts
        join delivery_target_periods dtp on dtp.id = dts.delivery_target_period_id
        where dtp.period_id = p.id
          ${params.regionId ? `and dts.region_id = $${values.length}` : ''}
      ) ds on true
      ${whereSql}
      order by p.period_year desc, p.period_month desc, p.updated_at desc
      limit $${values.length + 1} offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  )

  return {
    items: rowsRes.rows,
    total: Number(totalRes.rows[0]?.c ?? 0),
  }
}

export async function createTargetPeriod(input: {
  month: number
  year: number
  notes?: string
  status?: TargetStatus
  createdBy: string
}) {
  const pool = getPool()
  const periodKey = buildPeriodKey(input.month, input.year)
  const res = await pool.query(
    `
      insert into performance_target_periods(
        period_month,
        period_year,
        period_key,
        status,
        notes,
        created_by
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict(period_key) do update
        set notes = excluded.notes,
            status = excluded.status,
            updated_at = now()
      returning
        id,
        period_month as month,
        period_year as year,
        period_key as "periodKey",
        status,
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [input.month, input.year, periodKey, input.status ?? 'DRAFT', input.notes ?? null, input.createdBy],
  )

  await ensureDeliveryTargetPeriod(String(res.rows[0].id))

  return res.rows[0]
}

export async function getTargetPeriodDetail(periodId: string) {
  const pool = getPool()
  const periodRes = await pool.query(
    `
      select
        p.id,
        p.period_month as month,
        p.period_year as year,
        p.period_key as "periodKey",
        p.status,
        p.notes,
        p.finalized_at as "finalizedAt",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt"
      from performance_target_periods p
      where p.id = $1
      limit 1
    `,
    [periodId],
  )

  const period = periodRes.rows[0]
  if (!period) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Periode target tidak ditemukan' })
  }

  const salesTargetsRes = await pool.query(
    `
      select
        smt.id,
        smt.sales_user_id as "salesUserId",
        u.full_name as "salesName",
        smt.target_sales_amount::text as "targetSalesAmount",
        smt.target_sales_order_count as "targetSalesOrderCount",
        smt.notes,
        smt.is_active as "isActive"
      from sales_monthly_targets smt
      join users u on u.id = smt.sales_user_id
      where smt.period_id = $1
      order by u.full_name asc
    `,
    [periodId],
  )

  const visitSchedulesRes = await pool.query(
    `
      select
        svts.id,
        svts.sales_target_id as "salesTargetId",
        svts.region_id as "regionId",
        rg.name as "regionName",
        svts.day_of_week as "dayOfWeek",
        svts.target_visit_count as "targetVisitCount",
        svts.route_notes as "routeNotes"
      from sales_visit_target_schedules svts
      join sales_monthly_targets smt on smt.id = svts.sales_target_id
      join regions rg on rg.id = svts.region_id
      where smt.period_id = $1
      order by rg.name asc, svts.day_of_week asc
    `,
    [periodId],
  )

  const deliverySchedulesRes = await pool.query(
    `
      select
        dts.id,
        dts.region_id as "regionId",
        rg.name as "regionName",
        dts.day_of_week as "dayOfWeek",
        dts.target_delivery_count as "targetDeliveryCount",
        dts.target_delivery_points as "targetDeliveryPoints",
        dts.route_notes as "routeNotes"
      from delivery_target_schedules dts
      join delivery_target_periods dtp on dtp.id = dts.delivery_target_period_id
      join regions rg on rg.id = dts.region_id
      where dtp.period_id = $1
      order by rg.name asc, dts.day_of_week asc
    `,
    [periodId],
  )

  const schedulesByTarget = visitSchedulesRes.rows.reduce<Record<string, any[]>>((acc, row) => {
    const salesTargetId = String(row.salesTargetId)
    if (!acc[salesTargetId]) acc[salesTargetId] = []
    acc[salesTargetId].push(row)
    return acc
  }, {})

  return {
    ...period,
    salesTargets: salesTargetsRes.rows.map((row) => ({
      ...row,
      visitSchedules: schedulesByTarget[String(row.id)] ?? [],
    })),
    deliverySchedules: deliverySchedulesRes.rows,
  }
}

export async function generateSalesTargetsFromActiveUsers(
  periodId: string,
  input?: { overwriteExisting?: boolean },
) {
  const pool = getPool()
  await assertPeriodExists(periodId)
  await assertPeriodEditable(periodId)

  const staffRes = await pool.query(
    `
      select u.id
      from users u
      join roles r on r.id = u.role_id
      where u.is_active = true
        and r.name = 'Sales'
      order by u.full_name asc
    `,
  )

  let generated = 0
  let skippedExisting = 0

  for (const row of staffRes.rows as Array<{ id: string }>) {
    const existsRes = await pool.query(
      `select id from sales_monthly_targets where period_id = $1 and sales_user_id = $2 limit 1`,
      [periodId, row.id],
    )

    if (existsRes.rowCount) {
      if (input?.overwriteExisting) {
        await pool.query(
          `
            update sales_monthly_targets
            set is_active = true,
                updated_at = now()
            where period_id = $1 and sales_user_id = $2
          `,
          [periodId, row.id],
        )
      } else {
        skippedExisting += 1
      }
      continue
    }

    await pool.query(
      `
        insert into sales_monthly_targets(period_id, sales_user_id)
        values ($1, $2)
      `,
      [periodId, row.id],
    )
    generated += 1
  }

  return { generated, skippedExisting }
}

export async function updateSalesMonthlyTarget(
  periodId: string,
  salesTargetId: string,
  input: UpdateSalesMonthlyTargetInput,
) {
  const pool = getPool()
  await assertPeriodEditable(periodId)
  const existingRes = await pool.query(
    `
      select
        id,
        target_sales_amount as "targetSalesAmount",
        target_sales_order_count as "targetSalesOrderCount",
        notes
      from sales_monthly_targets
      where id = $1 and period_id = $2
      limit 1
    `,
    [salesTargetId, periodId],
  )

  const existing = existingRes.rows[0] as
    | { id: string; targetSalesAmount: string; targetSalesOrderCount: number; notes?: string | null }
    | undefined

  if (!existing) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Target bulanan sales tidak ditemukan' })
  }

  await pool.query(
    `
      update sales_monthly_targets
      set
        target_sales_amount = $3,
        target_sales_order_count = $4,
        notes = $5,
        updated_at = now()
      where id = $1 and period_id = $2
    `,
    [
      salesTargetId,
      periodId,
      Number(input.targetSalesAmount ?? existing.targetSalesAmount ?? 0),
      input.targetSalesOrderCount ?? existing.targetSalesOrderCount ?? 0,
      input.notes ?? existing.notes ?? null,
    ],
  )

  return { id: salesTargetId, updated: true }
}

export async function replaceSalesVisitSchedules(
  periodId: string,
  salesTargetId: string,
  schedules: SalesVisitScheduleInput[],
) {
  const pool = getPool()
  await assertPeriodEditable(periodId)
  const targetRes = await pool.query(
    `
      select id
      from sales_monthly_targets
      where id = $1 and period_id = $2
      limit 1
    `,
    [salesTargetId, periodId],
  )

  if (!targetRes.rowCount) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Target sales tidak ditemukan' })
  }

  assertNoDuplicateKeys(
    schedules.map((item) => `${item.regionId}:${item.dayOfWeek}`),
    'Jadwal kunjungan sales tidak boleh duplikat pada wilayah dan hari yang sama',
  )

  await pool.query('delete from sales_visit_target_schedules where sales_target_id = $1', [salesTargetId])

  for (const schedule of schedules) {
    await pool.query(
      `
        insert into sales_visit_target_schedules(
          sales_target_id,
          region_id,
          day_of_week,
          target_visit_count,
          route_notes
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        salesTargetId,
        schedule.regionId,
        schedule.dayOfWeek,
        schedule.targetVisitCount,
        schedule.routeNotes ?? null,
      ],
    )
  }

  return { salesTargetId, updatedSchedules: schedules.length }
}

export async function replaceDeliverySchedules(periodId: string, schedules: DeliveryScheduleInput[]) {
  const pool = getPool()
  await assertPeriodExists(periodId)
  await assertPeriodEditable(periodId)

  assertNoDuplicateKeys(
    schedules.map((item) => `${item.regionId}:${item.dayOfWeek}`),
    'Jadwal pengantaran tidak boleh duplikat pada wilayah dan hari yang sama',
  )

  const deliveryTargetPeriodId = await ensureDeliveryTargetPeriod(periodId)

  await pool.query('delete from delivery_target_schedules where delivery_target_period_id = $1', [deliveryTargetPeriodId])

  for (const schedule of schedules) {
    await pool.query(
      `
        insert into delivery_target_schedules(
          delivery_target_period_id,
          region_id,
          day_of_week,
          target_delivery_count,
          target_delivery_points,
          route_notes
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        deliveryTargetPeriodId,
        schedule.regionId,
        schedule.dayOfWeek,
        schedule.targetDeliveryCount,
        schedule.targetDeliveryPoints,
        schedule.routeNotes ?? null,
      ],
    )
  }

  return { periodId, updatedSchedules: schedules.length }
}

export async function copyTargetsFromPreviousPeriod(input: {
  periodId: string
  sourcePeriodKey: string
  copySalesTargets?: boolean
  copyVisitSchedules?: boolean
  copyDeliverySchedules?: boolean
  overwriteExisting?: boolean
}) {
  const pool = getPool()
  await assertPeriodEditable(input.periodId)
  const sourceRes = await pool.query(
    `
      select id
      from performance_target_periods
      where period_key = $1
      limit 1
    `,
    [input.sourcePeriodKey],
  )

  const sourcePeriodId = sourceRes.rows[0]?.id as string | undefined
  if (!sourcePeriodId) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Periode sumber tidak ditemukan' })
  }

  let copiedSalesTargets = 0
  let copiedVisitSchedules = 0
  let copiedDeliverySchedules = 0

  if (input.copySalesTargets || input.copyVisitSchedules) {
    const sourceTargetsRes = await pool.query(
      `
        select
          id,
          sales_user_id,
          target_sales_amount,
          target_sales_order_count,
          notes,
          is_active
        from sales_monthly_targets
        where period_id = $1
      `,
      [sourcePeriodId],
    )

    const sourceSchedulesRes = await pool.query(
      `
        select
          svts.sales_target_id as "salesTargetId",
          svts.region_id as "regionId",
          svts.day_of_week as "dayOfWeek",
          svts.target_visit_count as "targetVisitCount",
          svts.route_notes as "routeNotes"
        from sales_visit_target_schedules svts
        join sales_monthly_targets smt on smt.id = svts.sales_target_id
        where smt.period_id = $1
      `,
      [sourcePeriodId],
    )

    const schedulesBySourceTarget = sourceSchedulesRes.rows.reduce<Record<string, any[]>>((acc, row) => {
      const sourceTargetId = String(row.salesTargetId)
      if (!acc[sourceTargetId]) acc[sourceTargetId] = []
      acc[sourceTargetId].push(row)
      return acc
    }, {})

    for (const sourceTarget of sourceTargetsRes.rows as Array<any>) {
      const targetExistingRes = await pool.query(
        `
          select id
          from sales_monthly_targets
          where period_id = $1 and sales_user_id = $2
          limit 1
        `,
        [input.periodId, sourceTarget.sales_user_id],
      )

      let targetSalesTargetId = targetExistingRes.rows[0]?.id as string | undefined

      if (targetSalesTargetId && !input.overwriteExisting) {
        continue
      }

      if (targetSalesTargetId) {
        await pool.query(
          `
            update sales_monthly_targets
            set
              target_sales_amount = $2,
              target_sales_order_count = $3,
              notes = $4,
              is_active = $5,
              updated_at = now()
            where id = $1
          `,
          [
            targetSalesTargetId,
            sourceTarget.target_sales_amount,
            sourceTarget.target_sales_order_count,
            sourceTarget.notes,
            sourceTarget.is_active,
          ],
        )
      } else {
        const insertRes = await pool.query(
          `
            insert into sales_monthly_targets(
              period_id,
              sales_user_id,
              target_sales_amount,
              target_sales_order_count,
              notes,
              is_active
            )
            values ($1, $2, $3, $4, $5, $6)
            returning id
          `,
          [
            input.periodId,
            sourceTarget.sales_user_id,
            sourceTarget.target_sales_amount,
            sourceTarget.target_sales_order_count,
            sourceTarget.notes,
            sourceTarget.is_active,
          ],
        )
        targetSalesTargetId = String(insertRes.rows[0].id)
      }

      copiedSalesTargets += 1

      if (input.copyVisitSchedules && targetSalesTargetId) {
        await pool.query('delete from sales_visit_target_schedules where sales_target_id = $1', [targetSalesTargetId])
        for (const schedule of schedulesBySourceTarget[String(sourceTarget.id)] ?? []) {
          await pool.query(
            `
              insert into sales_visit_target_schedules(
                sales_target_id,
                region_id,
                day_of_week,
                target_visit_count,
                route_notes
              )
              values ($1, $2, $3, $4, $5)
            `,
            [
              targetSalesTargetId,
              schedule.regionId,
              schedule.dayOfWeek,
              schedule.targetVisitCount,
              schedule.routeNotes ?? null,
            ],
          )
          copiedVisitSchedules += 1
        }
      }
    }
  }

  if (input.copyDeliverySchedules) {
    const sourceDeliveryPeriodRes = await pool.query(
      `select id from delivery_target_periods where period_id = $1 limit 1`,
      [sourcePeriodId],
    )
    const sourceDeliveryPeriodId = sourceDeliveryPeriodRes.rows[0]?.id as string | undefined

    if (sourceDeliveryPeriodId) {
      const targetDeliveryPeriodId = await ensureDeliveryTargetPeriod(input.periodId)
      const targetCountRes = await pool.query(
        `select count(*)::int as c from delivery_target_schedules where delivery_target_period_id = $1`,
        [targetDeliveryPeriodId],
      )
      const targetScheduleCount = Number(targetCountRes.rows[0]?.c ?? 0)

      if (input.overwriteExisting || targetScheduleCount === 0) {
        await pool.query('delete from delivery_target_schedules where delivery_target_period_id = $1', [targetDeliveryPeriodId])

        const sourceDeliverySchedulesRes = await pool.query(
          `
            select
              region_id,
              day_of_week,
              target_delivery_count,
              target_delivery_points,
              route_notes
            from delivery_target_schedules
            where delivery_target_period_id = $1
          `,
          [sourceDeliveryPeriodId],
        )

        for (const schedule of sourceDeliverySchedulesRes.rows as Array<any>) {
          await pool.query(
            `
              insert into delivery_target_schedules(
                delivery_target_period_id,
                region_id,
                day_of_week,
                target_delivery_count,
                target_delivery_points,
                route_notes
              )
              values ($1, $2, $3, $4, $5, $6)
            `,
            [
              targetDeliveryPeriodId,
              schedule.region_id,
              schedule.day_of_week,
              schedule.target_delivery_count,
              schedule.target_delivery_points,
              schedule.route_notes,
            ],
          )
          copiedDeliverySchedules += 1
        }
      }
    }
  }

  return { copiedSalesTargets, copiedVisitSchedules, copiedDeliverySchedules }
}

export async function finalizeTargetPeriod(input: {
  periodId: string
  userId: string
  notes?: string
}) {
  const pool = getPool()
  const currentStatus = await getPeriodStatus(input.periodId)
  if (currentStatus === 'FINAL') {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Periode target sudah final. Gunakan buka edit jika ingin mengubah lagi.',
    })
  }
  const salesCountRes = await pool.query(
    `
      select count(*)::int as c
      from sales_monthly_targets
      where period_id = $1
        and is_active = true
    `,
    [input.periodId],
  )
  const deliveryCountRes = await pool.query(
    `
      select count(*)::int as c
      from delivery_target_schedules dts
      join delivery_target_periods dtp on dtp.id = dts.delivery_target_period_id
      where dtp.period_id = $1
    `,
    [input.periodId],
  )

  const salesCount = Number(salesCountRes.rows[0]?.c ?? 0)
  const deliveryCount = Number(deliveryCountRes.rows[0]?.c ?? 0)

  if (salesCount <= 0 && deliveryCount <= 0) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Periode target belum memiliki target sales atau jadwal pengantaran',
    })
  }

  const res = await pool.query(
    `
      update performance_target_periods
      set
        status = 'FINAL',
        notes = coalesce($3, notes),
        finalized_by = $2,
        finalized_at = now(),
        updated_at = now()
      where id = $1
      returning
        id,
        status,
        finalized_at as "finalizedAt"
    `,
    [input.periodId, input.userId, input.notes ?? null],
  )

  if (!res.rowCount) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Periode target tidak ditemukan' })
  }

  return res.rows[0]
}

export async function reopenTargetPeriod(input: {
  periodId: string
  notes?: string
}) {
  const pool = getPool()
  const currentStatus = await getPeriodStatus(input.periodId)
  if (currentStatus !== 'FINAL') {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Periode target belum final sehingga tidak perlu dibuka edit.',
    })
  }

  const res = await pool.query(
    `
      update performance_target_periods
      set
        status = 'DRAFT',
        notes = coalesce($2, notes),
        finalized_by = null,
        finalized_at = null,
        updated_at = now()
      where id = $1
      returning
        id,
        status,
        finalized_at as "finalizedAt"
    `,
    [input.periodId, input.notes ?? null],
  )

  if (!res.rowCount) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Periode target tidak ditemukan' })
  }

  return res.rows[0]
}

export async function getSalesPerformanceTargetReport(params: {
  month: number
  year: number
  regionId?: string
  salesUserId?: string
}) {
  const pool = getPool()
  const periodId = await getPreferredPeriodId(params.month, params.year)
  if (!periodId) return []

  const { start, end } = buildMonthRange(params.month, params.year)
  const values: unknown[] = [periodId]
  let salesFilterSql = ''
  let regionFilterExistsSql = ''

  if (params.salesUserId) {
    values.push(params.salesUserId)
    salesFilterSql += ` and smt.sales_user_id = $${values.length}`
  }

  if (params.regionId) {
    values.push(params.regionId)
    regionFilterExistsSql = `and exists (
      select 1 from sales_visit_target_schedules svts
      where svts.sales_target_id = smt.id
        and svts.region_id = $${values.length}
    )`
  }

  const salesTargetsRes = await pool.query(
    `
      select
        smt.id,
        smt.sales_user_id as "salesUserId",
        u.full_name as "salesName",
        smt.target_sales_amount::text as "targetSalesAmount",
        smt.target_sales_order_count as "targetSalesOrderCount"
      from sales_monthly_targets smt
      join users u on u.id = smt.sales_user_id
      where smt.period_id = $1
        and smt.is_active = true
        ${salesFilterSql}
        ${regionFilterExistsSql}
      order by u.full_name asc
    `,
    values,
  )

  const salesTargetIds = salesTargetsRes.rows.map((row) => String(row.id))
  if (!salesTargetIds.length) return []

  const scheduleValues: unknown[] = [salesTargetIds]
  let scheduleRegionSql = ''
  if (params.regionId) {
    scheduleValues.push(params.regionId)
    scheduleRegionSql = `and svts.region_id = $${scheduleValues.length}`
  }

  const schedulesRes = await pool.query(
    `
      select
        svts.id,
        svts.sales_target_id as "salesTargetId",
        svts.region_id as "regionId",
        rg.name as "regionName",
        svts.day_of_week as "dayOfWeek",
        svts.target_visit_count as "targetVisitCountPerDay",
        svts.route_notes as "routeNotes"
      from sales_visit_target_schedules svts
      join regions rg on rg.id = svts.region_id
      where svts.sales_target_id = any($1::uuid[])
        ${scheduleRegionSql}
      order by rg.name asc, svts.day_of_week asc
    `,
    scheduleValues,
  )

  const actualVisitValues: unknown[] = [start, end]
  let actualVisitSql = ''
  if (params.regionId) {
    actualVisitValues.push(params.regionId)
    actualVisitSql += ` and c.region_id = $${actualVisitValues.length}`
  }
  if (params.salesUserId) {
    actualVisitValues.push(params.salesUserId)
    actualVisitSql += ` and sv.visited_by = $${actualVisitValues.length}`
  }

  const actualVisitsRes = await pool.query(
    `
      select
        sv.visited_by as "salesUserId",
        c.region_id as "regionId",
        case extract(dow from sv.visited_at)
          when 1 then 'MONDAY'
          when 2 then 'TUESDAY'
          when 3 then 'WEDNESDAY'
          when 4 then 'THURSDAY'
          when 5 then 'FRIDAY'
          when 6 then 'SATURDAY'
          else 'SUNDAY'
        end as "dayOfWeek",
        count(*)::int as "actualVisitCount"
      from sales_visits sv
      join customers c on c.id = sv.customer_id
      where sv.visited_at >= $1::date
        and sv.visited_at < $2::date
        ${actualVisitSql}
      group by sv.visited_by, c.region_id, extract(dow from sv.visited_at)
    `,
    actualVisitValues,
  )

  const actualSalesValues: unknown[] = [start, end]
  let actualSalesSql = ''
  if (params.regionId) {
    actualSalesValues.push(params.regionId)
    actualSalesSql += ` and c.region_id = $${actualSalesValues.length}`
  }
  if (params.salesUserId) {
    actualSalesValues.push(params.salesUserId)
    actualSalesSql += ` and so.created_by = $${actualSalesValues.length}`
  }

  const actualSalesRes = await pool.query(
    `
      select
        so.created_by as "salesUserId",
        count(*)::int as "actualSalesOrderCount",
        coalesce(sum(so.total_amount), 0)::text as "actualSalesAmount"
      from sales_orders so
      join customers c on c.id = so.customer_id
      where so.status <> 'CANCELLED'
        and so.order_date >= $1::date
        and so.order_date < $2::date
        ${actualSalesSql}
      group by so.created_by
    `,
    actualSalesValues,
  )

  const schedulesByTarget = schedulesRes.rows.reduce<Record<string, any[]>>((acc, row) => {
    const salesTargetId = String(row.salesTargetId)
    if (!acc[salesTargetId]) acc[salesTargetId] = []
    acc[salesTargetId].push(row)
    return acc
  }, {})

  const actualVisitMap = new Map<string, number>()
  for (const row of actualVisitsRes.rows as Array<any>) {
    actualVisitMap.set(`${row.salesUserId}:${row.regionId}:${row.dayOfWeek}`, Number(row.actualVisitCount ?? 0))
  }

  const actualSalesMap = new Map<string, { actualSalesOrderCount: number; actualSalesAmount: number }>()
  for (const row of actualSalesRes.rows as Array<any>) {
    actualSalesMap.set(String(row.salesUserId), {
      actualSalesOrderCount: Number(row.actualSalesOrderCount ?? 0),
      actualSalesAmount: Number(row.actualSalesAmount ?? 0),
    })
  }

  return salesTargetsRes.rows.map((target: any) => {
    const schedules = (schedulesByTarget[String(target.id)] ?? []).map((schedule) => {
      const occurrenceCount = countWeekdayOccurrences(params.month, params.year, schedule.dayOfWeek)
      const targetVisitCount = Number(schedule.targetVisitCountPerDay ?? 0) * occurrenceCount
      const actualVisitCount = Number(
        actualVisitMap.get(`${target.salesUserId}:${schedule.regionId}:${schedule.dayOfWeek}`) ?? 0,
      )
      return {
        id: schedule.id,
        regionId: schedule.regionId,
        regionName: schedule.regionName,
        dayOfWeek: schedule.dayOfWeek,
        targetVisitCountPerDay: Number(schedule.targetVisitCountPerDay ?? 0),
        targetVisitCount,
        actualVisitCount,
        achievementPct: calcAchievement(targetVisitCount, actualVisitCount),
        routeNotes: schedule.routeNotes ?? null,
      }
    })

    const targetVisitCount = schedules.reduce((sum, schedule) => sum + schedule.targetVisitCount, 0)
    const actualVisitCount = schedules.reduce((sum, schedule) => sum + schedule.actualVisitCount, 0)
    const actualSales = actualSalesMap.get(String(target.salesUserId)) ?? {
      actualSalesOrderCount: 0,
      actualSalesAmount: 0,
    }
    const targetSalesAmount = Number(target.targetSalesAmount ?? 0)
    const targetSalesOrderCount = Number(target.targetSalesOrderCount ?? 0)

    return {
      salesTargetId: target.id,
      salesUserId: target.salesUserId,
      salesName: target.salesName,
      targetVisitCount,
      actualVisitCount,
      visitAchievementPct: calcAchievement(targetVisitCount, actualVisitCount),
      targetSalesOrderCount,
      actualSalesOrderCount: actualSales.actualSalesOrderCount,
      salesOrderAchievementPct: calcAchievement(targetSalesOrderCount, actualSales.actualSalesOrderCount),
      targetSalesAmount: String(target.targetSalesAmount ?? '0'),
      actualSalesAmount: String(actualSales.actualSalesAmount ?? 0),
      salesAchievementPct: calcAchievement(targetSalesAmount, actualSales.actualSalesAmount),
      scheduleBreakdown: schedules,
    }
  })
}

export async function getDriverPerformanceTargetReport(params: {
  month: number
  year: number
  regionId?: string
  driverUserId?: string
}) {
  const pool = getPool()
  const periodId = await getPreferredPeriodId(params.month, params.year)
  const { start, end } = buildMonthRange(params.month, params.year)

  let plannedDeliveryCount = 0
  let plannedDeliveryPoints = 0

  if (periodId) {
    const plannedValues: unknown[] = [periodId]
    let plannedRegionSql = ''
    if (params.regionId) {
      plannedValues.push(params.regionId)
      plannedRegionSql = `and dts.region_id = $${plannedValues.length}`
    }

    const plannedRes = await pool.query(
      `
        select
          dts.day_of_week as "dayOfWeek",
          dts.target_delivery_count as "targetDeliveryCount",
          dts.target_delivery_points as "targetDeliveryPoints"
        from delivery_target_schedules dts
        join delivery_target_periods dtp on dtp.id = dts.delivery_target_period_id
        where dtp.period_id = $1
          ${plannedRegionSql}
      `,
      plannedValues,
    )

    for (const row of plannedRes.rows as Array<any>) {
      const occurrenceCount = countWeekdayOccurrences(params.month, params.year, row.dayOfWeek)
      plannedDeliveryCount += Number(row.targetDeliveryCount ?? 0) * occurrenceCount
      plannedDeliveryPoints += Number(row.targetDeliveryPoints ?? 0) * occurrenceCount
    }
  }

  const actualValues: unknown[] = [start, end]
  let actualSql = ''
  if (params.regionId) {
    actualValues.push(params.regionId)
    actualSql += ` and c.region_id = $${actualValues.length}`
  }
  if (params.driverUserId) {
    actualValues.push(params.driverUserId)
    actualSql += ` and d.created_by = $${actualValues.length}`
  }

  const actualRes = await pool.query(
    `
      select
        d.created_by as "driverUserId",
        u.full_name as "driverName",
        count(distinct d.id)::int as "actualDeliveryCount",
        count(distinct so.customer_id)::int as "actualDeliveryPoints"
      from delivery_orders d
      join users u on u.id = d.created_by
      join sales_orders so on so.id = d.sales_order_id
      join customers c on c.id = so.customer_id
      where d.delivery_date >= $1::date
        and d.delivery_date < $2::date
        and d.status = 'DELIVERED'
        ${actualSql}
      group by d.created_by, u.full_name
      order by u.full_name asc
    `,
    actualValues,
  )

  const totalActualDeliveryCount = actualRes.rows.reduce(
    (sum: number, row: any) => sum + Number(row.actualDeliveryCount ?? 0),
    0,
  )
  const totalActualDeliveryPoints = actualRes.rows.reduce(
    (sum: number, row: any) => sum + Number(row.actualDeliveryPoints ?? 0),
    0,
  )

  return {
    data: actualRes.rows.map((row: any) => ({
      driverUserId: row.driverUserId,
      driverName: row.driverName,
      actualDeliveryCount: Number(row.actualDeliveryCount ?? 0),
      actualDeliveryPoints: Number(row.actualDeliveryPoints ?? 0),
      deliveryContributionPct: calcContribution(totalActualDeliveryCount, Number(row.actualDeliveryCount ?? 0)),
      pointContributionPct: calcContribution(totalActualDeliveryPoints, Number(row.actualDeliveryPoints ?? 0)),
    })),
    meta: {
      plannedDeliveryCount,
      plannedDeliveryPoints,
      actualDeliveryCount: totalActualDeliveryCount,
      actualDeliveryPoints: totalActualDeliveryPoints,
      plannedAchievementPct: calcAchievement(plannedDeliveryCount, totalActualDeliveryCount),
    },
  }
}
