alter table sales_order_items
  add column if not exists qty_base numeric(18,6),
  add column if not exists base_uom_id uuid references uoms(id),
  add column if not exists conversion_source text;

alter table invoice_items
  add column if not exists qty_base numeric(18,6),
  add column if not exists base_uom_id uuid references uoms(id),
  add column if not exists conversion_source text;

alter table delivery_order_items
  add column if not exists qty_base numeric(18,6),
  add column if not exists base_uom_id uuid references uoms(id),
  add column if not exists conversion_source text;

alter table return_items
  add column if not exists qty_base numeric(18,6),
  add column if not exists base_uom_id uuid references uoms(id),
  add column if not exists conversion_source text;

alter table goods_receipt_items
  add column if not exists qty_base numeric(18,6),
  add column if not exists base_uom_id uuid references uoms(id),
  add column if not exists conversion_source text;

alter table purchase_order_items
  add column if not exists qty_base numeric(18,6),
  add column if not exists base_uom_id uuid references uoms(id),
  add column if not exists conversion_source text;

update sales_order_items soi
set
  qty_base = coalesce(soi.qty_pcs::numeric(18,6), soi.qty::numeric(18,6) * coalesce(soi.uom_to_pcs, 1)::numeric(18,6)),
  base_uom_id = coalesce(soi.base_uom_id, p.base_uom_id),
  conversion_source = coalesce(soi.conversion_source, 'legacy')
from products p
where p.id = soi.product_id;

update invoice_items ii
set
  qty_base = coalesce(ii.qty_pcs::numeric(18,6), ii.qty::numeric(18,6) * coalesce(ii.uom_to_pcs, 1)::numeric(18,6)),
  base_uom_id = coalesce(ii.base_uom_id, p.base_uom_id),
  conversion_source = coalesce(ii.conversion_source, 'legacy')
from products p
where p.id = ii.product_id;

update delivery_order_items doi
set
  qty_base = coalesce(doi.qty_pcs::numeric(18,6), doi.qty::numeric(18,6) * coalesce(doi.uom_to_pcs, 1)::numeric(18,6)),
  base_uom_id = coalesce(doi.base_uom_id, p.base_uom_id),
  conversion_source = coalesce(doi.conversion_source, 'legacy')
from products p
where p.id = doi.product_id;

update return_items ri
set
  qty_base = coalesce(ri.qty_pcs::numeric(18,6), ri.qty::numeric(18,6) * coalesce(ri.uom_to_pcs, 1)::numeric(18,6)),
  base_uom_id = coalesce(ri.base_uom_id, p.base_uom_id),
  conversion_source = coalesce(ri.conversion_source, 'legacy')
from products p
where p.id = ri.product_id;

update goods_receipt_items gri
set
  qty_base = coalesce(gri.qty_pcs::numeric(18,6), gri.qty::numeric(18,6) * coalesce(gri.uom_to_pcs, 1)::numeric(18,6)),
  base_uom_id = coalesce(gri.base_uom_id, p.base_uom_id),
  conversion_source = coalesce(gri.conversion_source, 'legacy')
from products p
where p.id = gri.product_id;

update purchase_order_items poi
set
  qty_base = coalesce(poi.qty_pcs::numeric(18,6), poi.qty::numeric(18,6) * coalesce(poi.uom_to_pcs, 1)::numeric(18,6)),
  base_uom_id = coalesce(poi.base_uom_id, p.base_uom_id),
  conversion_source = coalesce(poi.conversion_source, 'legacy')
from products p
where p.id = poi.product_id;

alter table sales_order_items
  add constraint sales_order_items_conversion_source_chk
  check (conversion_source in ('legacy', 'product_uom_v2'));

alter table invoice_items
  add constraint invoice_items_conversion_source_chk
  check (conversion_source in ('legacy', 'product_uom_v2'));

alter table delivery_order_items
  add constraint delivery_order_items_conversion_source_chk
  check (conversion_source in ('legacy', 'product_uom_v2'));

alter table return_items
  add constraint return_items_conversion_source_chk
  check (conversion_source in ('legacy', 'product_uom_v2'));

alter table goods_receipt_items
  add constraint goods_receipt_items_conversion_source_chk
  check (conversion_source in ('legacy', 'product_uom_v2'));

alter table purchase_order_items
  add constraint purchase_order_items_conversion_source_chk
  check (conversion_source in ('legacy', 'product_uom_v2'));
