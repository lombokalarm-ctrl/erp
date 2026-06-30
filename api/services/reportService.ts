import { getPool } from '../db/pool.js'

export async function getSalesReport(params: { startDate?: string; endDate?: string }) {
  const pool = getPool()
  const values: unknown[] = []
  
  let dateConditionI = "1=1"
  let dateConditionR = "1=1"

  if (params.startDate) {
    values.push(params.startDate)
    dateConditionI += ` AND i.invoice_date >= $${values.length}`
    dateConditionR += ` AND r.return_date >= $${values.length}`
  }
  
  if (params.endDate) {
    values.push(params.endDate)
    dateConditionI += ` AND i.invoice_date <= $${values.length}`
    dateConditionR += ` AND r.return_date <= $${values.length}`
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

  const qtySummaryRes = await pool.query(
    `
      select
        coalesce(
          (
            select sum(coalesce(ii.qty_base, ii.qty))
            from invoice_items ii
            join invoices i on i.id = ii.invoice_id
            where ${dateConditionI}
          ),
          0
        )::text as "grossQtyBaseSold",
        coalesce(
          (
            select sum(coalesce(ri.qty_base, ri.qty))
            from return_items ri
            join returns r on r.id = ri.return_id
            where r.type = 'SALES_RETURN' and ${dateConditionR}
          ),
          0
        )::text as "salesReturnQtyBase"
    `,
    values,
  )

  // 2. Top Products with UOM breakdown
  const topProductsRes = await pool.query(
    `
      with product_sales as (
        select
          p.id as product_id,
          p.sku,
          p.name as product_name,
          coalesce(sum(coalesce(ii.qty_base, ii.qty)), 0) as qty_base_sold,
          coalesce(sum(ii.line_total), 0) as revenue
        from invoice_items ii
        join invoices i on i.id = ii.invoice_id
        join products p on p.id = ii.product_id
        where ${dateConditionI}
        group by p.id, p.sku, p.name
        order by coalesce(sum(ii.line_total), 0) desc nulls last
        limit 20
      ),
      product_returns as (
        select
          ri.product_id,
          coalesce(sum(coalesce(ri.qty_base, ri.qty)), 0) as return_qty_base
        from return_items ri
        join returns r on r.id = ri.return_id
        where r.type = 'SALES_RETURN' and ${dateConditionR}
        group by ri.product_id
      )
      select
        ps.product_id as "productId",
        ps.sku,
        ps.product_name as "productName",
        ps.qty_base_sold::text as "qtyBaseSold",
        coalesce(pr.return_qty_base, 0)::text as "salesReturnQtyBase",
        (ps.qty_base_sold - coalesce(pr.return_qty_base, 0))::text as "netQtyBaseSold",
        ps.revenue::text as "revenue",
        coalesce(m.uom_mappings, '[]'::json) as "uomMappings"
      from product_sales ps
      left join product_returns pr on pr.product_id = ps.product_id
      left join lateral (
        select
          json_agg(
            json_build_object(
              'uomCode', u.code,
              'uomName', u.name,
              'toBaseFactor', pu.to_base_factor
            )
            order by pu.to_base_factor desc
          ) as uom_mappings
        from product_uoms pu
        join uoms u on u.id = pu.uom_id
        where pu.product_id = ps.product_id
      ) m on true
      order by ps.revenue desc nulls last
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

  const topProductsWithBreakdown = topProductsRes.rows.map((row) => {
    const qtyBaseNumber = Number(row.qtyBaseSold ?? 0)
    const mappingsRaw = Array.isArray(row.uomMappings) ? row.uomMappings : []

    const normalizedMappings = mappingsRaw
      .map((m: { uomCode?: string; uomName?: string; toBaseFactor?: string | number }) => ({
        uomCode: String(m.uomCode ?? '').toLowerCase(),
        uomName: String(m.uomName ?? ''),
        toBaseFactor: Number(m.toBaseFactor ?? 0),
      }))
      .filter((m: { uomCode: string; toBaseFactor: number }) => m.uomCode && m.toBaseFactor > 0)
      .sort((a: { toBaseFactor: number }, b: { toBaseFactor: number }) => b.toBaseFactor - a.toBaseFactor)

    const breakdown: Array<{ uomCode: string; qty: number }> = []
    let remaining = qtyBaseNumber

    for (let i = 0; i < normalizedMappings.length; i += 1) {
      const mapping = normalizedMappings[i]
      const isLast = i === normalizedMappings.length - 1
      const unitQty = isLast ? remaining / mapping.toBaseFactor : Math.floor(remaining / mapping.toBaseFactor)
      if (unitQty > 0 || (isLast && normalizedMappings.length === 1)) {
        breakdown.push({
          uomCode: mapping.uomCode,
          qty: Number(unitQty.toFixed(6)),
        })
      }
      remaining -= unitQty * mapping.toBaseFactor
      if (Math.abs(remaining) < 1e-9) {
        remaining = 0
      }
    }

    const breakdownLabel =
      breakdown.length > 0
        ? breakdown
            .filter((b) => b.qty > 0)
            .map((b) => `${Number(b.qty.toFixed(2))} ${b.uomCode}`)
            .join(' ')
        : `${Number(qtyBaseNumber.toFixed(2))} unit`

    const uomOrder = normalizedMappings.map((m) => m.uomCode).slice(0, 3)
    const qty1 = Number(breakdown.find((b) => b.uomCode === uomOrder[0])?.qty ?? 0)
    const qty2 = Number(breakdown.find((b) => b.uomCode === uomOrder[1])?.qty ?? 0)
    const qty3 = Number(breakdown.find((b) => b.uomCode === uomOrder[2])?.qty ?? 0)
    const satuanLabel = uomOrder.length ? uomOrder.join(', ') : '-'

    return {
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      qtyBaseSold: row.qtyBaseSold,
      salesReturnQtyBase: row.salesReturnQtyBase,
      netQtyBaseSold: row.netQtyBaseSold,
      revenue: row.revenue,
      breakdown,
      breakdownLabel,
      uomOrder,
      satuanLabel,
      qty1,
      qty2,
      qty3,
    }
  })

  const grossQtyBaseSold = Number(qtySummaryRes.rows[0]?.grossQtyBaseSold ?? 0)
  const salesReturnQtyBase = Number(qtySummaryRes.rows[0]?.salesReturnQtyBase ?? 0)
  const netQtyBaseSold = grossQtyBaseSold - salesReturnQtyBase

  return {
    summary: {
      totalTransactions: summaryRes.rows[0]?.totalTransactions ?? 0,
      totalRevenue: summaryRes.rows[0]?.totalRevenue ?? "0",
      grossQtyBaseSold: String(grossQtyBaseSold),
      salesReturnQtyBase: String(salesReturnQtyBase),
      netQtyBaseSold: String(netQtyBaseSold),
    },
    topProducts: topProductsWithBreakdown,
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
        upper(p.method) as method,
        count(p.id)::int as "count",
        coalesce(sum(p.amount), 0)::text as "total"
      from payments p
      where ${dateCondition}
      group by upper(p.method)
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
        coalesce(sum(case when upper(p.method) = 'CASH' then p.amount else 0 end), 0)::text as "cash",
        coalesce(sum(case when upper(p.method) = 'TRANSFER' then p.amount else 0 end), 0)::text as "transfer",
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
        upper(p.method) as method,
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
  
  let dateConditionI = "1=1"
  let dateConditionR = "1=1"
  let dateConditionPI = "1=1"

  if (params.startDate) {
    values.push(params.startDate)
    dateConditionI += ` AND i.invoice_date >= $${values.length}`
    dateConditionR += ` AND r.return_date >= $${values.length}`
    dateConditionPI += ` AND pi.invoice_date >= $${values.length}`
  }
  
  if (params.endDate) {
    values.push(params.endDate)
    dateConditionI += ` AND i.invoice_date <= $${values.length}`
    dateConditionR += ` AND r.return_date <= $${values.length}`
    dateConditionPI += ` AND pi.invoice_date <= $${values.length}`
  }

  // 1. Summary of Sales, Returns, Discounts, COGS, and Gross Profit.
  const summaryRes = await pool.query(
    `
      with sales_rows as (
        select
          coalesce(ii.qty_base, ii.qty)::numeric as qty_base,
          (coalesce(ii.line_total, 0)::numeric + coalesce(ii.discount_amount, 0)::numeric) as gross_amount,
          coalesce(ii.discount_amount, 0)::numeric as discount_amount,
          coalesce(ii.line_total, 0)::numeric as net_amount,
          coalesce(ii.qty_base, ii.qty)::numeric * coalesce(p.purchase_price, 0)::numeric as cogs_amount
        from invoice_items ii
        join invoices i on i.id = ii.invoice_id
        join products p on p.id = ii.product_id
        where ${dateConditionI}
      ),
      invoice_unit as (
        select
          ii.invoice_id,
          ii.product_id,
          case
            when coalesce(sum(coalesce(ii.qty_base, ii.qty)), 0) > 0
              then coalesce(sum(coalesce(ii.line_total, 0)), 0) / sum(coalesce(ii.qty_base, ii.qty))
            else 0
          end as net_unit_price
        from invoice_items ii
        group by ii.invoice_id, ii.product_id
      ),
      return_rows as (
        select
          coalesce(ri.qty_base, ri.qty)::numeric as qty_base,
          coalesce(ri.qty_base, ri.qty)::numeric * coalesce(iu.net_unit_price, 0)::numeric as return_net_amount,
          coalesce(ri.qty_base, ri.qty)::numeric * coalesce(p.purchase_price, 0)::numeric as return_cogs_amount
        from return_items ri
        join returns r on r.id = ri.return_id and r.type = 'SALES_RETURN'
        join products p on p.id = ri.product_id
        left join invoice_unit iu on iu.invoice_id = r.source_invoice_id and iu.product_id = ri.product_id
        where ${dateConditionR}
      )
      select
        coalesce((select sum(gross_amount) from sales_rows), 0)::text as "grossSales",
        coalesce((select sum(discount_amount) from sales_rows), 0)::text as "totalDiscounts",
        coalesce((select sum(return_net_amount) from return_rows), 0)::text as "salesReturnAmount",
        coalesce((select sum(cogs_amount) from sales_rows), 0)::text as "hppSales",
        coalesce((select sum(return_cogs_amount) from return_rows), 0)::text as "hppReturn",
        (
          coalesce((select sum(net_amount) from sales_rows), 0)
          - coalesce((select sum(return_net_amount) from return_rows), 0)
        )::text as "netSales",
        (
          coalesce((select sum(cogs_amount) from sales_rows), 0)
          - coalesce((select sum(return_cogs_amount) from return_rows), 0)
        )::text as "hppNet"
    `,
    values
  )

  const s = summaryRes.rows[0]
  const grossSales = Number(s?.grossSales ?? 0)
  const totalDiscounts = Number(s?.totalDiscounts ?? 0)
  const salesReturnAmount = Number(s?.salesReturnAmount ?? 0)
  const hppSales = Number(s?.hppSales ?? 0)
  const hppReturn = Number(s?.hppReturn ?? 0)
  const hppNet = Number(s?.hppNet ?? 0)
  const netSales = Number(s?.netSales ?? 0)
  const grossProfit = netSales - hppNet
  const marginPercentage = netSales > 0 ? (grossProfit / netSales) * 100 : 0

  // 2. Breakdown by Product Category with return-adjusted net/cogs.
  const byCategoryRes = await pool.query(
    `
      with sales_category as (
        select
          p.category_id,
          coalesce(sum(coalesce(ii.line_total, 0)), 0)::numeric as sales_net,
          coalesce(sum(coalesce(ii.qty_base, ii.qty)::numeric * coalesce(p.purchase_price, 0)::numeric), 0)::numeric as sales_cogs
        from invoice_items ii
        join invoices i on i.id = ii.invoice_id
        join products p on p.id = ii.product_id
        where ${dateConditionI}
        group by p.category_id
      ),
      invoice_unit as (
        select
          ii.invoice_id,
          ii.product_id,
          case
            when coalesce(sum(coalesce(ii.qty_base, ii.qty)), 0) > 0
              then coalesce(sum(coalesce(ii.line_total, 0)), 0) / sum(coalesce(ii.qty_base, ii.qty))
            else 0
          end as net_unit_price
        from invoice_items ii
        group by ii.invoice_id, ii.product_id
      ),
      return_category as (
        select
          p.category_id,
          coalesce(sum(coalesce(ri.qty_base, ri.qty)::numeric * coalesce(iu.net_unit_price, 0)::numeric), 0)::numeric as return_net,
          coalesce(sum(coalesce(ri.qty_base, ri.qty)::numeric * coalesce(p.purchase_price, 0)::numeric), 0)::numeric as return_cogs
        from return_items ri
        join returns r on r.id = ri.return_id and r.type = 'SALES_RETURN'
        join products p on p.id = ri.product_id
        left join invoice_unit iu on iu.invoice_id = r.source_invoice_id and iu.product_id = ri.product_id
        where ${dateConditionR}
        group by p.category_id
      )
      select
        coalesce(pc.name, 'Tanpa Kategori') as "categoryName",
        (coalesce(sc.sales_net, 0) - coalesce(rc.return_net, 0))::text as "netSales",
        (coalesce(sc.sales_cogs, 0) - coalesce(rc.return_cogs, 0))::text as "cogs",
        (
          (coalesce(sc.sales_net, 0) - coalesce(rc.return_net, 0))
          - (coalesce(sc.sales_cogs, 0) - coalesce(rc.return_cogs, 0))
        )::text as "grossProfit"
      from sales_category sc
      left join return_category rc on rc.category_id is not distinct from sc.category_id
      left join product_categories pc on pc.id = sc.category_id
      order by (coalesce(sc.sales_net, 0) - coalesce(rc.return_net, 0)) desc
    `,
    values
  )

  // 3. Daily trend with return-adjusted net/cogs.
  const trendRes = await pool.query(
    `
      with sales_daily as (
        select
          i.invoice_date::date as dt,
          coalesce(sum(coalesce(ii.line_total, 0)), 0)::numeric as sales_net,
          coalesce(sum(coalesce(ii.qty_base, ii.qty)::numeric * coalesce(p.purchase_price, 0)::numeric), 0)::numeric as sales_cogs
        from invoice_items ii
        join invoices i on i.id = ii.invoice_id
        join products p on p.id = ii.product_id
        where ${dateConditionI}
        group by i.invoice_date::date
      ),
      invoice_unit as (
        select
          ii.invoice_id,
          ii.product_id,
          case
            when coalesce(sum(coalesce(ii.qty_base, ii.qty)), 0) > 0
              then coalesce(sum(coalesce(ii.line_total, 0)), 0) / sum(coalesce(ii.qty_base, ii.qty))
            else 0
          end as net_unit_price
        from invoice_items ii
        group by ii.invoice_id, ii.product_id
      ),
      return_daily as (
        select
          r.return_date::date as dt,
          coalesce(sum(coalesce(ri.qty_base, ri.qty)::numeric * coalesce(iu.net_unit_price, 0)::numeric), 0)::numeric as return_net,
          coalesce(sum(coalesce(ri.qty_base, ri.qty)::numeric * coalesce(p.purchase_price, 0)::numeric), 0)::numeric as return_cogs
        from return_items ri
        join returns r on r.id = ri.return_id and r.type = 'SALES_RETURN'
        join products p on p.id = ri.product_id
        left join invoice_unit iu on iu.invoice_id = r.source_invoice_id and iu.product_id = ri.product_id
        where ${dateConditionR}
        group by r.return_date::date
      ),
      all_dates as (
        select dt from sales_daily
        union
        select dt from return_daily
      )
      select
        ad.dt::text as "date",
        (coalesce(sd.sales_net, 0) - coalesce(rd.return_net, 0))::text as "netSales",
        (coalesce(sd.sales_cogs, 0) - coalesce(rd.return_cogs, 0))::text as "cogs",
        (
          (coalesce(sd.sales_net, 0) - coalesce(rd.return_net, 0))
          - (coalesce(sd.sales_cogs, 0) - coalesce(rd.return_cogs, 0))
        )::text as "grossProfit"
      from all_dates ad
      left join sales_daily sd on sd.dt = ad.dt
      left join return_daily rd on rd.dt = ad.dt
      order by ad.dt desc
      limit 30
    `,
    values
  )

  // 4. Top SKU contributors (return-adjusted).
  const topProductsRes = await pool.query(
    `
      with sales_product as (
        select
          ii.product_id,
          coalesce(sum(coalesce(ii.qty_base, ii.qty)::numeric), 0)::numeric as gross_qty_base_sold,
          coalesce(sum(coalesce(ii.line_total, 0)::numeric), 0)::numeric as sales_net,
          coalesce(sum(coalesce(ii.qty_base, ii.qty)::numeric * coalesce(p.purchase_price, 0)::numeric), 0)::numeric as sales_cogs
        from invoice_items ii
        join invoices i on i.id = ii.invoice_id
        join products p on p.id = ii.product_id
        where ${dateConditionI}
        group by ii.product_id
      ),
      invoice_unit as (
        select
          ii.invoice_id,
          ii.product_id,
          case
            when coalesce(sum(coalesce(ii.qty_base, ii.qty)), 0) > 0
              then coalesce(sum(coalesce(ii.line_total, 0)), 0) / sum(coalesce(ii.qty_base, ii.qty))
            else 0
          end as net_unit_price
        from invoice_items ii
        group by ii.invoice_id, ii.product_id
      ),
      return_product as (
        select
          ri.product_id,
          coalesce(sum(coalesce(ri.qty_base, ri.qty)::numeric), 0)::numeric as return_qty_base,
          coalesce(sum(coalesce(ri.qty_base, ri.qty)::numeric * coalesce(iu.net_unit_price, 0)::numeric), 0)::numeric as return_net,
          coalesce(sum(coalesce(ri.qty_base, ri.qty)::numeric * coalesce(p.purchase_price, 0)::numeric), 0)::numeric as return_cogs
        from return_items ri
        join returns r on r.id = ri.return_id and r.type = 'SALES_RETURN'
        join products p on p.id = ri.product_id
        left join invoice_unit iu on iu.invoice_id = r.source_invoice_id and iu.product_id = ri.product_id
        where ${dateConditionR}
        group by ri.product_id
      )
      select
        p.id as "productId",
        p.sku,
        p.name as "productName",
        coalesce(sp.gross_qty_base_sold, 0)::text as "grossQtyBaseSold",
        coalesce(rp.return_qty_base, 0)::text as "returnQtyBase",
        (coalesce(sp.gross_qty_base_sold, 0) - coalesce(rp.return_qty_base, 0))::text as "netQtyBaseSold",
        (coalesce(sp.sales_net, 0) - coalesce(rp.return_net, 0))::text as "netSales",
        (coalesce(sp.sales_cogs, 0) - coalesce(rp.return_cogs, 0))::text as "cogs",
        (
          (coalesce(sp.sales_net, 0) - coalesce(rp.return_net, 0))
          - (coalesce(sp.sales_cogs, 0) - coalesce(rp.return_cogs, 0))
        )::text as "grossProfit"
      from sales_product sp
      join products p on p.id = sp.product_id
      left join return_product rp on rp.product_id = sp.product_id
      order by (
        (coalesce(sp.sales_net, 0) - coalesce(rp.return_net, 0))
        - (coalesce(sp.sales_cogs, 0) - coalesce(rp.return_cogs, 0))
      ) desc
      limit 20
    `,
    values,
  )

  const purchaseInvoiceRes = await pool.query(
    `
      with inv as (
        select
          pi.id,
          pi.supplier_id,
          s.name as supplier_name,
          sum(i.qty_base)::numeric as qty_base_total,
          sum(i.line_gross)::numeric as gross_amount,
          sum(i.line_discount)::numeric as discount_amount,
          sum(i.line_net)::numeric as net_amount,
          count(i.id)::int as item_count
        from purchase_invoices pi
        join suppliers s on s.id = pi.supplier_id
        join purchase_invoice_items i on i.purchase_invoice_id = pi.id
        where pi.status = 'POSTED'
          and ${dateConditionPI}
        group by pi.id, pi.supplier_id, s.name
      ),
      by_supplier as (
        select
          supplier_id as "supplierId",
          supplier_name as "supplierName",
          count(*)::int as "invoiceCount",
          coalesce(sum(qty_base_total), 0)::text as "qtyBaseTotal",
          coalesce(sum(gross_amount), 0)::text as "grossAmount",
          coalesce(sum(discount_amount), 0)::text as "discountAmount",
          coalesce(sum(net_amount), 0)::text as "netAmount"
        from inv
        group by supplier_id, supplier_name
        order by coalesce(sum(net_amount), 0) desc
        limit 50
      ),
      by_product as (
        select
          p.id as "productId",
          p.sku,
          p.name as "productName",
          coalesce(sum(i.qty_base), 0)::text as "qtyBaseTotal",
          coalesce(sum(i.line_gross), 0)::text as "grossAmount",
          coalesce(sum(i.line_discount), 0)::text as "discountAmount",
          coalesce(sum(i.line_net), 0)::text as "netAmount"
        from purchase_invoices pi
        join purchase_invoice_items i on i.purchase_invoice_id = pi.id
        join products p on p.id = i.product_id
        where pi.status = 'POSTED'
          and ${dateConditionPI}
        group by p.id, p.sku, p.name
        order by coalesce(sum(i.line_net), 0) desc
        limit 50
      )
      select
        (select count(*)::int from inv) as "invoiceCount",
        (select coalesce(sum(item_count), 0)::int from inv) as "itemCount",
        (select coalesce(sum(qty_base_total), 0)::text from inv) as "qtyBaseTotal",
        (select coalesce(sum(gross_amount), 0)::text from inv) as "grossAmount",
        (select coalesce(sum(discount_amount), 0)::text from inv) as "discountAmount",
        (select coalesce(sum(net_amount), 0)::text from inv) as "netAmount",
        (select coalesce(json_agg(by_supplier), '[]'::json) from by_supplier) as "bySupplier",
        (select coalesce(json_agg(by_product), '[]'::json) from by_product) as "byProduct"
    `,
    values,
  )

  const pi = purchaseInvoiceRes.rows[0] as
    | {
        invoiceCount: number
        itemCount: number
        qtyBaseTotal: string
        grossAmount: string
        discountAmount: string
        netAmount: string
        bySupplier: Array<{
          supplierId: string
          supplierName: string
          invoiceCount: number
          qtyBaseTotal: string
          grossAmount: string
          discountAmount: string
          netAmount: string
        }>
        byProduct: Array<{
          productId: string
          sku: string
          productName: string
          qtyBaseTotal: string
          grossAmount: string
          discountAmount: string
          netAmount: string
        }>
      }
    | undefined

  return {
    summary: {
      grossSales: String(grossSales),
      totalDiscounts: String(totalDiscounts),
      salesReturnAmount: String(salesReturnAmount),
      netSales: String(netSales),
      cogs: String(hppNet),
      hppSales: String(hppSales),
      hppReturn: String(hppReturn),
      hppNet: String(hppNet),
      grossProfit: String(grossProfit),
      marginPercentage: marginPercentage.toFixed(2),
    },
    byCategory: byCategoryRes.rows,
    trend: trendRes.rows,
    topProducts: topProductsRes.rows,
    purchaseInvoice: pi
      ? {
          summary: {
            invoiceCount: pi.invoiceCount ?? 0,
            itemCount: pi.itemCount ?? 0,
            qtyBaseTotal: pi.qtyBaseTotal ?? '0',
            grossAmount: pi.grossAmount ?? '0',
            discountAmount: pi.discountAmount ?? '0',
            netAmount: pi.netAmount ?? '0',
          },
          bySupplier: pi.bySupplier ?? [],
          byProduct: pi.byProduct ?? [],
        }
      : {
          summary: {
            invoiceCount: 0,
            itemCount: 0,
            qtyBaseTotal: '0',
            grossAmount: '0',
            discountAmount: '0',
            netAmount: '0',
          },
          bySupplier: [],
          byProduct: [],
        },
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

export async function getPurchaseReport(params: { startDate?: string; endDate?: string }) {
  const pool = getPool()
  const values: unknown[] = []

  let poDateCondition = '1=1'
  if (params.startDate) {
    values.push(params.startDate)
    poDateCondition += ` AND po.order_date >= $${values.length}`
  }
  if (params.endDate) {
    values.push(params.endDate)
    poDateCondition += ` AND po.order_date <= $${values.length}`
  }

  const summaryRes = await pool.query(
    `
      select
        count(distinct po.id)::int as "totalPO",
        coalesce(sum(po.total_amount), 0)::text as "totalPOAmount",
        count(distinct gr.id)::int as "totalGRN",
        coalesce(sum(gri.qty), 0)::text as "totalReceivedQty"
      from purchase_orders po
      left join goods_receipts gr on gr.purchase_order_id = po.id
      left join goods_receipt_items gri on gri.goods_receipt_id = gr.id
      where ${poDateCondition}
    `,
    values,
  )

  const bySupplierRes = await pool.query(
    `
      select
        s.code as "supplierCode",
        s.name as "supplierName",
        count(po.id)::int as "poCount",
        coalesce(sum(po.total_amount), 0)::text as "poAmount"
      from purchase_orders po
      join suppliers s on s.id = po.supplier_id
      where ${poDateCondition}
      group by s.id, s.code, s.name
      order by sum(po.total_amount) desc nulls last
      limit 30
    `,
    values,
  )

  const latestPORes = await pool.query(
    `
      select
        po.id,
        po.po_no as "poNo",
        po.order_date::text as "orderDate",
        po.status,
        po.total_amount::text as "totalAmount",
        s.name as "supplierName"
      from purchase_orders po
      join suppliers s on s.id = po.supplier_id
      where ${poDateCondition}
      order by po.order_date desc, po.po_no desc
      limit 50
    `,
    values,
  )

  return {
    summary: summaryRes.rows[0] ?? {
      totalPO: 0,
      totalPOAmount: '0',
      totalGRN: 0,
      totalReceivedQty: '0',
    },
    bySupplier: bySupplierRes.rows,
    latestPO: latestPORes.rows,
  }
}

export async function getStockReport(params: { q?: string; supplierId?: string }) {
  const pool = getPool()
  const values: unknown[] = []
  const where: string[] = []

  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`)
    where.push(`(lower(p.sku) like $${values.length} or lower(p.name) like $${values.length})`)
  }

  if (params.supplierId) {
    values.push(params.supplierId)
    where.push(`p.supplier_id = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const supplierOptionsRes = await pool.query(
    `
      select
        s.id,
        s.code,
        s.name
      from suppliers s
      order by s.name asc
    `,
  )

  const summaryRes = await pool.query(
    `
      select
        count(p.id)::int as "totalProducts",
        coalesce(sum(coalesce(b.qty, 0)), 0)::text as "totalQty"
      from products p
      left join (
        select product_id, sum(qty) as qty
        from inventory_balances
        group by product_id
      ) b on b.product_id = p.id
      ${whereSql}
    `,
    values,
  )

  const stockRes = await pool.query(
    `
      select
        p.id as "productId",
        p.sku,
        p.name as "productName",
        p.supplier_id as "supplierId",
        s.name as "supplierName",
        coalesce(sum(b.qty), 0)::text as qty,
        bu.code as "baseUomCode",
        coalesce(
          json_agg(
            json_build_object(
              'uomCode', u.code,
              'uomName', u.name,
              'toBaseFactor', pu.to_base_factor
            )
            order by pu.to_base_factor desc
          ) filter (where pu.id is not null),
          '[]'::json
        ) as "uomMappings"
      from products p
      left join suppliers s on s.id = p.supplier_id
      left join inventory_balances b on b.product_id = p.id
      left join uoms bu on bu.id = p.base_uom_id
      left join product_uoms pu on pu.product_id = p.id
      left join uoms u on u.id = pu.uom_id
      ${whereSql}
      group by p.id, p.sku, p.name, p.supplier_id, s.name, bu.code
      order by p.name asc
      limit 500
    `,
    values,
  )

  const movementRes = await pool.query(
    `
      select
        it.id,
        it.created_at as "createdAt",
        it.type,
        it.qty_delta::text as "qtyDelta",
        p.sku,
        p.name as "productName",
        it.ref_type as "refType"
      from inventory_transactions it
      join products p on p.id = it.product_id
      ${whereSql}
      order by it.created_at desc
      limit 100
    `,
    values,
  )

  const stockWithBreakdown = stockRes.rows.map((row) => {
    const qtyNumber = Number(row.qty ?? 0)
    const mappingsRaw = Array.isArray(row.uomMappings) ? row.uomMappings : []

    const normalizedMappings = mappingsRaw
      .map((m: { uomCode?: string; uomName?: string; toBaseFactor?: string | number }) => ({
        uomCode: String(m.uomCode ?? '').toLowerCase(),
        uomName: String(m.uomName ?? ''),
        toBaseFactor: Number(m.toBaseFactor ?? 0),
      }))
      .filter((m: { uomCode: string; toBaseFactor: number }) => m.uomCode && m.toBaseFactor > 0)
      .sort((a: { toBaseFactor: number }, b: { toBaseFactor: number }) => b.toBaseFactor - a.toBaseFactor)

    const breakdown: Array<{ uomCode: string; qty: number }> = []
    let remaining = qtyNumber

    for (let i = 0; i < normalizedMappings.length; i += 1) {
      const mapping = normalizedMappings[i]
      const isLast = i === normalizedMappings.length - 1
      const unitQty = isLast ? remaining / mapping.toBaseFactor : Math.floor(remaining / mapping.toBaseFactor)
      if (unitQty > 0 || (isLast && normalizedMappings.length === 1)) {
        breakdown.push({
          uomCode: mapping.uomCode,
          qty: Number(unitQty.toFixed(6)),
        })
      }
      remaining -= unitQty * mapping.toBaseFactor
      if (Math.abs(remaining) < 1e-9) {
        remaining = 0
      }
    }

    const breakdownLabel =
      breakdown.length > 0
        ? breakdown
            .filter((b) => b.qty > 0)
            .map((b) => `${Number(b.qty.toFixed(2))} ${b.uomCode}`)
            .join(' ')
        : `${Number(qtyNumber.toFixed(2))} ${row.baseUomCode ?? 'unit'}`

    const uomOrder = normalizedMappings.map((m) => m.uomCode).slice(0, 3)
    const baseMapping = normalizedMappings.find((m) => m.toBaseFactor === 1) ?? null
    const smallMapping = baseMapping
    const largeMapping = normalizedMappings.find((m) => m.toBaseFactor > 1) ?? null
    const smallQty = qtyNumber
    const largeQty = largeMapping
      ? largeMapping.toBaseFactor > 0
        ? qtyNumber / largeMapping.toBaseFactor
        : 0
      : 0

    return {
      ...row,
      breakdown,
      breakdownLabel,
      uomOrder,
      smallUnitCode: smallMapping?.uomCode ?? String(row.baseUomCode ?? 'unit').toLowerCase(),
      smallQty: Number(smallQty.toFixed(2)),
      largeUnitCode: largeMapping?.uomCode ?? null,
      largeQty: largeMapping ? Number(largeQty.toFixed(2)) : null,
    }
  })

  return {
    suppliers: supplierOptionsRes.rows,
    summary: summaryRes.rows[0] ?? { totalProducts: 0, totalQty: '0' },
    stock: stockWithBreakdown,
    latestMovements: movementRes.rows,
  }
}
