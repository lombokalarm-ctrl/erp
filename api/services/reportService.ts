import { getPool } from '../db/pool.js'

export async function getSalesReport(params: { startDate?: string; endDate?: string }) {
  const pool = getPool()
  const values: unknown[] = []
  
  let dateConditionI = "1=1"

  if (params.startDate) {
    values.push(params.startDate)
    dateConditionI += ` AND i.invoice_date >= $${values.length}`
  }
  
  if (params.endDate) {
    values.push(params.endDate)
    dateConditionI += ` AND i.invoice_date <= $${values.length}`
  }

  // 1. Summary
  const summaryRes = await pool.query(
    `
      select 
        count(i.id)::int as "totalTransactions", 
        coalesce(sum(i.total_amount), 0)::text as "totalRevenue"
      from invoices i
      where ${dateConditionI}
    `,
    values
  )

  // 2. Top Products
  const topProductsRes = await pool.query(
    `
      select 
        p.sku, 
        p.name as "productName", 
        sum(ii.qty)::int as "qtySold", 
        coalesce(sum(ii.line_total), 0)::text as "revenue"
      from invoice_items ii
      join invoices i on i.id = ii.invoice_id
      join products p on p.id = ii.product_id
      where ${dateConditionI}
      group by p.id, p.sku, p.name
      order by sum(ii.line_total) desc nulls last
      limit 20
    `,
    values
  )

  // 3. Daily Sales
  const dailyRes = await pool.query(
    `
      select 
        i.invoice_date::text as "date",
        count(i.id)::int as "transactions",
        coalesce(sum(i.total_amount), 0)::text as "revenue"
      from invoices i
      where ${dateConditionI}
      group by i.invoice_date
      order by i.invoice_date desc
      limit 30
    `,
    values
  )

  return {
    summary: {
      totalTransactions: summaryRes.rows[0]?.totalTransactions ?? 0,
      totalRevenue: summaryRes.rows[0]?.totalRevenue ?? "0",
    },
    topProducts: topProductsRes.rows,
    daily: dailyRes.rows
  }
}

export async function getCollectionReport(params: { startDate?: string; endDate?: string }) {
  const pool = getPool()
  const values: unknown[] = []
  
  let dateCondition = "1=1"

  if (params.startDate) {
    values.push(params.startDate)
    dateCondition += ` AND p.paid_at >= $${values.length}::timestamp`
  }
  
  if (params.endDate) {
    values.push(params.endDate)
    // Inclusive to the end of the day
    dateCondition += ` AND p.paid_at <= ($${values.length}::timestamp + interval '1 day' - interval '1 second')`
  }

  // 1. Summary by Method
  const methodRes = await pool.query(
    `
      select 
        p.method,
        count(p.id)::int as "count",
        coalesce(sum(p.amount), 0)::text as "total"
      from payments p
      where ${dateCondition}
      group by p.method
    `,
    values
  )

  const summary = methodRes.rows.reduce(
    (acc, row) => {
      acc.totalAmount += Number(row.total)
      acc.totalTransactions += row.count
      if (row.method === 'CASH') acc.cashAmount += Number(row.total)
      if (row.method === 'TRANSFER') acc.transferAmount += Number(row.total)
      if (row.method === 'TERM') acc.termAmount += Number(row.total) // although TERM might not represent direct cash in, but we list it
      return acc
    },
    { totalAmount: 0, totalTransactions: 0, cashAmount: 0, transferAmount: 0, termAmount: 0 }
  )

  // 2. Daily Collection
  const dailyRes = await pool.query(
    `
      select 
        date_trunc('day', p.paid_at)::date::text as "date",
        coalesce(sum(case when p.method = 'CASH' then p.amount else 0 end), 0)::text as "cash",
        coalesce(sum(case when p.method = 'TRANSFER' then p.amount else 0 end), 0)::text as "transfer",
        coalesce(sum(p.amount), 0)::text as "total"
      from payments p
      where ${dateCondition}
      group by 1
      order by 1 desc
      limit 30
    `,
    values
  )

  // 3. Latest Payments
  const latestRes = await pool.query(
    `
      select 
        p.id,
        p.paid_at as "paidAt",
        p.method,
        p.amount::text as "amount",
        i.invoice_no as "invoiceNo",
        c.name as "customerName"
      from payments p
      join invoices i on i.id = p.invoice_id
      join customers c on c.id = i.customer_id
      where ${dateCondition}
      order by p.paid_at desc
      limit 50
    `,
    values
  )

  return {
    summary: {
      totalAmount: String(summary.totalAmount),
      totalTransactions: summary.totalTransactions,
      cashAmount: String(summary.cashAmount),
      transferAmount: String(summary.transferAmount),
      termAmount: String(summary.termAmount),
    },
    daily: dailyRes.rows,
    latestPayments: latestRes.rows
  }
}

export async function getPromoReport(params: { startDate?: string; endDate?: string }) {
  const pool = getPool()
  const values: unknown[] = []
  
  let dateConditionI = "1=1"

  if (params.startDate) {
    values.push(params.startDate)
    dateConditionI += ` AND i.invoice_date >= $${values.length}`
  }
  
  if (params.endDate) {
    values.push(params.endDate)
    dateConditionI += ` AND i.invoice_date <= $${values.length}`
  }

  // 1. Summary
  const summaryRes = await pool.query(
    `
      select 
        coalesce(sum(ii.discount_amount), 0)::text as "totalDiscountGiven",
        count(distinct i.id)::int as "invoicesWithDiscount"
      from invoice_items ii
      join invoices i on i.id = ii.invoice_id
      where ${dateConditionI} and ii.discount_amount > 0
    `,
    values
  )

  // 2. Discounted Products Details
  const productsRes = await pool.query(
    `
      select 
        p.sku, 
        p.name as "productName", 
        sum(ii.qty)::int as "qtySold", 
        coalesce(sum(ii.discount_amount), 0)::text as "totalDiscount",
        coalesce(sum(ii.line_total), 0)::text as "revenueAfterDiscount"
      from invoice_items ii
      join invoices i on i.id = ii.invoice_id
      join products p on p.id = ii.product_id
      where ${dateConditionI} and ii.discount_amount > 0
      group by p.id, p.sku, p.name
      order by sum(ii.discount_amount) desc nulls last
      limit 50
    `,
    values
  )

  // 3. Active Promos Details
  const activePromosRes = await pool.query(
    `
      select
        p.name as "promoName",
        pr.name as "productName",
        pr.sku as "productSku",
        p.promo_type as "promoType",
        p.discount_value::float as "discountValue",
        p.min_qty as "minQty",
        p.start_date::text as "startDate",
        p.end_date::text as "endDate"
      from product_promos p
      join products pr on pr.id = p.product_id
      where p.is_active = true
        and (p.end_date is null or p.end_date >= now())
      order by p.created_at desc
    `
  )

  return {
    summary: {
      totalDiscountGiven: summaryRes.rows[0]?.totalDiscountGiven ?? "0",
      invoicesWithDiscount: summaryRes.rows[0]?.invoicesWithDiscount ?? 0,
    },
    discountedProducts: productsRes.rows,
    activePromos: activePromosRes.rows
  }
}

export async function getProfitLossReport(params: { startDate?: string; endDate?: string }) {
  const pool = getPool()
  const values: unknown[] = []
  
  let dateCondition = "1=1"

  if (params.startDate) {
    values.push(params.startDate)
    dateCondition += ` AND i.invoice_date >= $${values.length}`
  }
  
  if (params.endDate) {
    values.push(params.endDate)
    dateCondition += ` AND i.invoice_date <= $${values.length}`
  }

  // 1. Summary of Sales, Discounts, COGS, and Gross Profit
  const summaryRes = await pool.query(
    `
      select 
        coalesce(sum(ii.qty * ii.unit_price), 0)::text as "grossSales",
        coalesce(sum(ii.discount_amount), 0)::text as "totalDiscounts",
        coalesce(sum(ii.line_total), 0)::text as "netSales",
        coalesce(sum(ii.qty * p.purchase_price), 0)::text as "cogs"
      from invoice_items ii
      join invoices i on i.id = ii.invoice_id
      join products p on p.id = ii.product_id
      where ${dateCondition}
    `,
    values
  )

  const s = summaryRes.rows[0]
  const grossSales = Number(s?.grossSales ?? 0)
  const totalDiscounts = Number(s?.totalDiscounts ?? 0)
  const netSales = Number(s?.netSales ?? 0)
  const cogs = Number(s?.cogs ?? 0)
  const grossProfit = netSales - cogs
  const marginPercentage = netSales > 0 ? (grossProfit / netSales) * 100 : 0

  // 2. Breakdown by Product Category
  const byCategoryRes = await pool.query(
    `
      select 
        coalesce(pc.name, 'Tanpa Kategori') as "categoryName",
        coalesce(sum(ii.line_total), 0)::text as "netSales",
        coalesce(sum(ii.qty * p.purchase_price), 0)::text as "cogs",
        coalesce(sum(ii.line_total) - sum(ii.qty * p.purchase_price), 0)::text as "grossProfit"
      from invoice_items ii
      join invoices i on i.id = ii.invoice_id
      join products p on p.id = ii.product_id
      left join product_categories pc on pc.id = p.category_id
      where ${dateCondition}
      group by pc.id, pc.name
      order by sum(ii.line_total) desc
    `,
    values
  )

  // 3. Monthly / Daily Trend (last 30 items or grouped by month if long period)
  // We'll just do daily trend for simplicity
  const trendRes = await pool.query(
    `
      select 
        i.invoice_date::text as "date",
        coalesce(sum(ii.line_total), 0)::text as "netSales",
        coalesce(sum(ii.qty * p.purchase_price), 0)::text as "cogs",
        coalesce(sum(ii.line_total) - sum(ii.qty * p.purchase_price), 0)::text as "grossProfit"
      from invoice_items ii
      join invoices i on i.id = ii.invoice_id
      join products p on p.id = ii.product_id
      where ${dateCondition}
      group by i.invoice_date
      order by i.invoice_date desc
      limit 30
    `,
    values
  )

  return {
    summary: {
      grossSales: String(grossSales),
      totalDiscounts: String(totalDiscounts),
      netSales: String(netSales),
      cogs: String(cogs),
      grossProfit: String(grossProfit),
      marginPercentage: marginPercentage.toFixed(2),
    },
    byCategory: byCategoryRes.rows,
    trend: trendRes.rows
  }
}

export async function getReturnReport(params: { startDate?: string; endDate?: string; type?: string }) {
  const pool = getPool()
  const values: unknown[] = []
  
  let dateCondition = "1=1"

  if (params.startDate) {
    values.push(params.startDate)
    dateCondition += ` AND r.return_date >= $${values.length}`
  }
  
  if (params.endDate) {
    values.push(params.endDate)
    dateCondition += ` AND r.return_date <= $${values.length}`
  }
  
  let typeCondition = "1=1"
  if (params.type && (params.type === 'SALES_RETURN' || params.type === 'PURCHASE_RETURN')) {
    values.push(params.type)
    typeCondition += ` AND r.type = $${values.length}`
  }

  // 1. Summary
  const summaryRes = await pool.query(
    `
      select 
        count(distinct r.id)::int as "totalReturns",
        sum(case when r.type = 'SALES_RETURN' then 1 else 0 end)::int as "totalSalesReturns",
        sum(case when r.type = 'PURCHASE_RETURN' then 1 else 0 end)::int as "totalPurchaseReturns",
        coalesce(sum(ri.qty), 0)::float as "totalItemsReturned"
      from returns r
      left join return_items ri on ri.return_id = r.id
      where ${dateCondition} and ${typeCondition}
    `,
    values
  )

  // 2. Return Details (Product level)
  const detailsRes = await pool.query(
    `
      select 
        r.return_no as "returnNo",
        r.type,
        r.return_date::text as "returnDate",
        r.reference_no as "referenceNo",
        coalesce(c.name, s.name, '-') as "partnerName",
        p.sku,
        p.name as "productName",
        ri.qty::float as "qty",
        ri.reason,
        u.full_name as "createdBy"
      from return_items ri
      join returns r on r.id = ri.return_id
      join products p on p.id = ri.product_id
      left join customers c on c.id = r.customer_id
      left join suppliers s on s.id = r.supplier_id
      left join users u on u.id = r.created_by
      where ${dateCondition} and ${typeCondition}
      order by r.return_date desc, r.return_no desc
    `,
    values
  )

  return {
    summary: summaryRes.rows[0] || {
      totalReturns: 0,
      totalSalesReturns: 0,
      totalPurchaseReturns: 0,
      totalItemsReturned: 0
    },
    details: detailsRes.rows
  }
}

export async function getSalesPerformance(params: { startDate?: string; endDate?: string }) {
  const pool = getPool()
  const values: unknown[] = []
  
  let soJoinCondition = "so.customer_id = c.id AND so.status != 'CANCELLED'"
  
  if (params.startDate) {
    values.push(params.startDate)
    soJoinCondition += ` AND so.order_date >= $${values.length}`
  }
  
  if (params.endDate) {
    values.push(params.endDate)
    soJoinCondition += ` AND so.order_date <= $${values.length}`
  }

  const res = await pool.query(
    `
      select
        u.id as "salesId",
        u.full_name as "salesName",
        count(distinct c.id)::int as "totalCustomers",
        count(distinct so.id)::int as "totalOrders",
        coalesce(sum(so.total_amount), 0)::text as "totalRevenue"
      from users u
      join roles r on r.id = u.role_id
      left join customers c on c.sales_id = u.id
      left join sales_orders so on (${soJoinCondition})
      where r.name = 'Sales'
      group by u.id, u.full_name
      order by sum(so.total_amount) desc nulls last
    `,
    values,
  )

  return res.rows
}
