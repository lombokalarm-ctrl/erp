import { getPool } from '../db/pool.js'
import { getCustomerCreditProfile, getCustomerOutstanding } from './creditService.js'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function normalizeLinear(value: number, min: number, max: number) {
  if (max <= min) return 0
  return clamp(((value - min) / (max - min)) * 100, 0, 100)
}

function normalizeInverse(value: number, min: number, max: number) {
  return 100 - normalizeLinear(value, min, max)
}

function grade(score: number) {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 50) return 'C'
  return 'D'
}

export async function getActiveScoringRules() {
  const pool = getPool()
  const cfgRes = await pool.query(
    `select id from scoring_configs where is_active = true order by created_at desc limit 1`,
  )
  const cfgId = cfgRes.rows[0]?.id as string | undefined
  if (!cfgId) return { configId: null as string | null, rules: [] as { code: string; weight: number }[] }

  const rulesRes = await pool.query(
    `select code, weight::float as weight from scoring_rules where scoring_config_id = $1 order by code asc`,
    [cfgId],
  )
  return { configId: cfgId, rules: rulesRes.rows as { code: string; weight: number }[] }
}

async function computeMetrics(customerId: string) {
  const pool = getPool()
  const now = new Date()
  const last30 = new Date(now)
  last30.setDate(last30.getDate() - 30)
  const last90 = new Date(now)
  last90.setDate(last90.getDate() - 90)

  const invoice30Res = await pool.query(
    `
      select
        coalesce(sum(total_amount), 0) as total,
        count(*)::int as cnt
      from invoices
      where customer_id = $1 and invoice_date >= $2
    `,
    [customerId, last30.toISOString().slice(0, 10)],
  )
  const purchaseVolume30 = Number(invoice30Res.rows[0]?.total ?? 0)
  const purchaseCount30 = Number(invoice30Res.rows[0]?.cnt ?? 0)

  const paidInvoicesRes = await pool.query(
    `
      select
        i.id,
        i.due_date,
        max(p.paid_at) as last_paid_at
      from invoices i
      join payments p on p.invoice_id = i.id
      where i.customer_id = $1 and i.invoice_date >= $2
      group by i.id, i.due_date
    `,
    [customerId, last90.toISOString().slice(0, 10)],
  )

  let lateCount = 0
  let lateDaysSum = 0
  for (const r of paidInvoicesRes.rows) {
    const due = new Date(r.due_date)
    const lastPaid = new Date(r.last_paid_at)
    const lateDays = Math.max(
      0,
      Math.floor((lastPaid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)),
    )
    if (lateDays > 0) {
      lateCount += 1
      lateDaysSum += lateDays
    }
  }

  const paidInvoiceCount = paidInvoicesRes.rowCount
  const avgLateDays = paidInvoiceCount ? lateDaysSum / Math.max(1, lateCount) : 0
  const lateRatio = paidInvoiceCount ? lateCount / paidInvoiceCount : 0

  const ar = await getCustomerOutstanding(customerId)
  const profile = await getCustomerCreditProfile(customerId)
  const activeDebtRatio = profile.creditLimit > 0 ? ar.outstanding / profile.creditLimit : 0

  const customerRes = await pool.query(
    `select created_at from customers where id = $1 limit 1`,
    [customerId],
  )
  const createdAt = customerRes.rows[0]?.created_at
    ? new Date(customerRes.rows[0].created_at)
    : now
  const tenureDays = Math.max(
    0,
    Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)),
  )

  return {
    purchaseVolume30,
    purchaseCount30,
    avgLateDays,
    lateRatio,
    activeDebtRatio,
    outstanding: ar.outstanding,
    creditLimit: profile.creditLimit,
    tenureDays,
  }
}

export async function recalculateCustomerScore(customerId: string) {
  const { rules } = await getActiveScoringRules()
  const metrics = await computeMetrics(customerId)

  const metricValues: Record<string, number> = {
    purchase_volume: normalizeLinear(metrics.purchaseVolume30, 0, 50_000_000),
    purchase_frequency: normalizeLinear(metrics.purchaseCount30, 0, 20),
    late_payment_days: normalizeInverse(metrics.avgLateDays, 0, 60),
    late_payment_ratio: normalizeInverse(metrics.lateRatio * 100, 0, 100),
    active_debt: normalizeInverse(metrics.activeDebtRatio * 100, 0, 100),
    customer_tenure: normalizeLinear(metrics.tenureDays, 0, 365),
  }

  const weighted = rules.reduce((sum, r) => {
    const v = metricValues[r.code] ?? 0
    return sum + (v / 100) * r.weight
  }, 0)

  const score = clamp(Math.round(50 + weighted * 50), 0, 100)
  const g = grade(score)

  const pool = getPool()
  const res = await pool.query(
    `
      insert into customer_scores(customer_id, score, grade)
      values ($1, $2, $3)
      returning id, customer_id as "customerId", score, grade, calculated_at as "calculatedAt"
    `,
    [customerId, score, g],
  )

  return { ...res.rows[0], metrics }
}

export async function storeAnalysis(customerId: string) {
  const pool = getPool()
  const customerRes = await pool.query(
    `
      select id, code, name, category, status, created_at
      from customers
      where id = $1
      limit 1
    `,
    [customerId],
  )
  const customer = customerRes.rows[0]
  const credit = await getCustomerCreditProfile(customerId)
  const ar = await getCustomerOutstanding(customerId)

  const scoreRes = await pool.query(
    `
      select score, grade, calculated_at as "calculatedAt"
      from customer_scores
      where customer_id = $1
      order by calculated_at desc
      limit 10
    `,
    [customerId],
  )

  const monthlyPurchase = await pool.query(
    `
      select
        to_char(date_trunc('month', invoice_date), 'YYYY-MM') as month,
        sum(total_amount)::text as total
      from invoices
      where customer_id = $1
      group by 1
      order by 1 desc
      limit 12
    `,
    [customerId],
  )

  return {
    customer,
    credit: {
      creditLimit: credit.creditLimit,
      paymentTermDays: credit.paymentTermDays,
      outstanding: ar.outstanding,
      remainingLimit: Math.max(0, credit.creditLimit - ar.outstanding),
    },
    scores: scoreRes.rows,
    purchaseTrend: monthlyPurchase.rows.reverse(),
  }
}

