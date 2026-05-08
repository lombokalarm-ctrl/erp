alter table sales_order_items
  drop constraint if exists sales_order_items_qty_base_non_negative_chk;
alter table sales_order_items
  add constraint sales_order_items_qty_base_non_negative_chk
  check (qty_base is null or qty_base >= 0);

alter table invoice_items
  drop constraint if exists invoice_items_qty_base_non_negative_chk;
alter table invoice_items
  add constraint invoice_items_qty_base_non_negative_chk
  check (qty_base is null or qty_base >= 0);

alter table delivery_order_items
  drop constraint if exists delivery_order_items_qty_base_non_negative_chk;
alter table delivery_order_items
  add constraint delivery_order_items_qty_base_non_negative_chk
  check (qty_base is null or qty_base >= 0);

alter table return_items
  drop constraint if exists return_items_qty_base_non_negative_chk;
alter table return_items
  add constraint return_items_qty_base_non_negative_chk
  check (qty_base is null or qty_base >= 0);

alter table goods_receipt_items
  drop constraint if exists goods_receipt_items_qty_base_non_negative_chk;
alter table goods_receipt_items
  add constraint goods_receipt_items_qty_base_non_negative_chk
  check (qty_base is null or qty_base >= 0);

alter table purchase_order_items
  drop constraint if exists purchase_order_items_qty_base_non_negative_chk;
alter table purchase_order_items
  add constraint purchase_order_items_qty_base_non_negative_chk
  check (qty_base is null or qty_base >= 0);

create or replace function enforce_product_uoms_base_presence()
returns trigger
language plpgsql
as $$
declare
  v_product_id uuid;
  v_base_count int;
begin
  v_product_id := coalesce(new.product_id, old.product_id);
  if v_product_id is null then
    return null;
  end if;

  select count(*)::int
  into v_base_count
  from product_uoms pu
  where pu.product_id = v_product_id
    and pu.to_base_factor = 1;

  if v_base_count <> 1 then
    raise exception 'Produk % wajib memiliki tepat 1 unit base (to_base_factor=1)', v_product_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_product_uoms_base_presence on product_uoms;
create constraint trigger trg_product_uoms_base_presence
after insert or update or delete on product_uoms
deferrable initially deferred
for each row
execute function enforce_product_uoms_base_presence();

drop view if exists uom_product_mapping_audit;
create view uom_product_mapping_audit as
select
  p.id as product_id,
  p.sku,
  p.name,
  p.base_uom_id,
  count(pu.id) as mapping_count,
  count(*) filter (where pu.to_base_factor = 1) as base_mapping_count,
  bool_or(pu.uom_id = p.base_uom_id and pu.to_base_factor = 1) as base_uom_matches_mapping
from products p
left join product_uoms pu on pu.product_id = p.id
group by p.id, p.sku, p.name, p.base_uom_id;
