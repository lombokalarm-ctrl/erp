-- Backfill inconsistent sales orders:
-- if approval is already APPROVED but sales order status is still DRAFT,
-- promote it to CONFIRMED so downstream flow (invoice/DO) can proceed.
update sales_orders so
set status = 'CONFIRMED'
where so.status = 'DRAFT'
  and exists (
    select 1
    from sales_order_approvals a
    where a.sales_order_id = so.id
      and a.status = 'APPROVED'
  );
