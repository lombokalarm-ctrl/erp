import { getPool } from '../db/pool.js'

export async function getDashboardMetrics() {
  const pool = getPool()
  
  // 1. KPI Cards (This Month)
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  
  const kpiRes = await pool.query(
    `
      select 
        (select coalesce(sum(total_amount), 0) from invoices where invoice_date >= $1) as "monthlyRevenue",
        (select coalesce(sum(amount), 0) from payments where paid_at >= $1::timestamp) as "monthlyCollection",
        (select count(id) from sales_orders where order_date >= $1) as "monthlyOrders",
        (select count(id) from customers where status = 'ACTIVE') as "activeCustomers"
    `,
    [startOfMonth]
  )
  const kpi = kpiRes.rows[0]

  // 2. Sales Trend (Last 7 Days)
  const trendRes = await pool.query(
    `
      with dates as (
        select generate_series(
          current_date - interval '6 days',
          current_date,
          '1 day'::interval
        )::date as d
      )
      select 
        d.d::text as "date",
        coalesce(sum(i.total_amount), 0)::float as "revenue"
      from dates d
      left join invoices i on i.invoice_date = d.d
      group by d.d
      order by d.d asc
    `
  )

  // 3. Overdue Invoices
  const overdueRes = await pool.query(
    `
      select 
        i.id,
        i.invoice_no as "invoiceNo",
        c.name as "customerName",
        i.due_date::text as "dueDate",
        i.total_amount::text as "totalAmount",
        coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)::text as "paidAmount"
      from invoices i
      join customers c on c.id = i.customer_id
      where i.status = 'OVERDUE'
      order by i.due_date asc
      limit 5
    `
  )
  const overdues = overdueRes.rows.map(r => {
    const remaining = Number(r.totalAmount) - Number(r.paidAmount)
    return { ...r, remaining: String(remaining) }
  })

  // 4. Critical Stock (Low Inventory)
  const stockRes = await pool.query(
    `
      select 
        p.id,
        p.sku,
        p.name,
        coalesce(sum(ib.qty), 0)::float as "qty"
      from products p
      left join inventory_balances ib on ib.product_id = p.id
      group by p.id, p.sku, p.name
      having coalesce(sum(ib.qty), 0) <= 10
      order by coalesce(sum(ib.qty), 0) asc
      limit 5
    `
  )

  return {
    kpi: {
      monthlyRevenue: String(kpi.monthlyRevenue ?? 0),
      monthlyCollection: String(kpi.monthlyCollection ?? 0),
      monthlyOrders: Number(kpi.monthlyOrders ?? 0),
      activeCustomers: Number(kpi.activeCustomers ?? 0),
    },
    trend: trendRes.rows,
    overdues,
    criticalStocks: stockRes.rows
  }
}
