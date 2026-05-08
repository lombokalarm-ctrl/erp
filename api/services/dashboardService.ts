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

export async function getUomV2HealthMetrics() {
  const pool = getPool()

  const summaryRes = await pool.query(
    `
      with product_counts as (
        select
          count(*)::int as total_products,
          count(*) filter (where base_uom_id is not null)::int as mapped_products
        from products
      ),
      invalid_mapping as (
        select count(*)::int as invalid_products
        from uom_product_mapping_audit
        where base_mapping_count <> 1
           or base_uom_matches_mapping is not true
      ),
      tx_missing as (
        select
          (
            select count(*)::int from sales_order_items where qty_base is null or base_uom_id is null
          ) + (
            select count(*)::int from invoice_items where qty_base is null or base_uom_id is null
          ) + (
            select count(*)::int from delivery_order_items where qty_base is null or base_uom_id is null
          ) + (
            select count(*)::int from return_items where qty_base is null or base_uom_id is null
          ) + (
            select count(*)::int from goods_receipt_items where qty_base is null or base_uom_id is null
          ) + (
            select count(*)::int from purchase_order_items where qty_base is null or base_uom_id is null
          ) as missing_base_fields
      ),
      active_uoms as (
        select count(*)::int as active_uoms
        from uoms
        where is_active = true
      )
      select
        au.active_uoms as "activeUoms",
        pc.total_products as "totalProducts",
        pc.mapped_products as "mappedProducts",
        im.invalid_products as "invalidMappingProducts",
        tx.missing_base_fields as "transactionsMissingBaseFields"
      from active_uoms au
      cross join product_counts pc
      cross join invalid_mapping im
      cross join tx_missing tx
    `,
  )

  const invalidProductsRes = await pool.query(
    `
      select
        a.product_id as "productId",
        p.sku,
        p.name,
        a.base_mapping_count as "baseMappingCount",
        a.base_uom_matches_mapping as "baseUomMatchesMapping"
      from uom_product_mapping_audit a
      join products p on p.id = a.product_id
      where a.base_mapping_count <> 1
         or a.base_uom_matches_mapping is not true
      order by p.sku asc
      limit 20
    `,
  )

  const conversionSourceRes = await pool.query(
    `
      select conversion_source as source, count(*)::int as total
      from (
        select conversion_source from sales_order_items
        union all
        select conversion_source from invoice_items
        union all
        select conversion_source from return_items
        union all
        select conversion_source from goods_receipt_items
        union all
        select conversion_source from purchase_order_items
      ) t
      where conversion_source is not null
      group by conversion_source
      order by total desc
    `,
  )

  return {
    summary: summaryRes.rows[0] ?? {
      activeUoms: 0,
      totalProducts: 0,
      mappedProducts: 0,
      invalidMappingProducts: 0,
      transactionsMissingBaseFields: 0,
    },
    invalidProducts: invalidProductsRes.rows,
    conversionSources: conversionSourceRes.rows,
  }
}
