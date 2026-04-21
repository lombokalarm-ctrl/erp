import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type CustomerCreditProfile = {
  customerId: string
  creditLimit: string
  paymentTermDays: number
  maxOverdueDaysBeforeBlock: number | null
}

export async function getCreditProfile(customerId: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        customer_id as "customerId",
        credit_limit::text as "creditLimit",
        payment_term_days as "paymentTermDays",
        max_overdue_days_before_block as "maxOverdueDaysBeforeBlock"
      from customer_credit_profiles
      where customer_id = $1
      limit 1
    `,
    [customerId],
  )
  return res.rows[0] as CustomerCreditProfile | undefined
}

export async function upsertCreditProfile(input: {
  customerId: string
  creditLimit: number
  paymentTermDays: number
  maxOverdueDaysBeforeBlock?: number | null
}) {
  const pool = getPool()
  const exists = await pool.query('select 1 from customers where id = $1', [
    input.customerId,
  ])
  if (!exists.rowCount) {
    throw new ApiError({ code: 'NOT_FOUND', status: 404, message: 'Customer tidak ditemukan' })
  }

  const res = await pool.query(
    `
      insert into customer_credit_profiles(
        customer_id,
        credit_limit,
        payment_term_days,
        max_overdue_days_before_block
      )
      values ($1, $2, $3, $4)
      on conflict(customer_id) do update
        set credit_limit = excluded.credit_limit,
            payment_term_days = excluded.payment_term_days,
            max_overdue_days_before_block = excluded.max_overdue_days_before_block,
            updated_at = now()
      returning
        customer_id as "customerId",
        credit_limit::text as "creditLimit",
        payment_term_days as "paymentTermDays",
        max_overdue_days_before_block as "maxOverdueDaysBeforeBlock"
    `,
    [
      input.customerId,
      input.creditLimit,
      input.paymentTermDays,
      input.maxOverdueDaysBeforeBlock ?? null,
    ],
  )
  return res.rows[0] as CustomerCreditProfile
}

