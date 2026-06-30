with latest_supplier as (
  select distinct on (src.product_id)
    src.product_id,
    src.supplier_id
  from (
    select
      poi.product_id,
      po.supplier_id,
      po.order_date::timestamp as event_at,
      po.created_at
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    where po.supplier_id is not null

    union all

    select
      pii.product_id,
      pi.supplier_id,
      pi.invoice_date::timestamp as event_at,
      pi.created_at
    from purchase_invoice_items pii
    join purchase_invoices pi on pi.id = pii.purchase_invoice_id
    where pi.supplier_id is not null
  ) src
  order by src.product_id, src.event_at desc, src.created_at desc
)
update products p
set
  supplier_id = ls.supplier_id,
  updated_at = now()
from latest_supplier ls
where p.id = ls.product_id
  and p.supplier_id is null;
