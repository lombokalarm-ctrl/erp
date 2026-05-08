insert into uoms(code, name)
values
  ('pcs', 'Pcs'),
  ('pack', 'Pack'),
  ('dus', 'Dus'),
  ('lusin', 'Lusin'),
  ('bal', 'Bal'),
  ('karung', 'Karung')
on conflict (code) do update
set
  name = excluded.name,
  is_active = true,
  updated_at = now();

update products p
set base_uom_id = u.id
from uoms u
where u.code = 'pcs'
  and p.base_uom_id is null;

insert into product_uoms (
  product_id,
  uom_id,
  to_base_factor,
  is_sale,
  is_purchase,
  is_default_sale,
  is_default_purchase
)
select
  p.id,
  u.id,
  1,
  true,
  true,
  true,
  true
from products p
join uoms u on u.code = 'pcs'
on conflict (product_id, uom_id) do update
set
  to_base_factor = excluded.to_base_factor,
  is_sale = excluded.is_sale,
  is_purchase = excluded.is_purchase,
  is_default_sale = excluded.is_default_sale,
  is_default_purchase = excluded.is_default_purchase,
  updated_at = now();

insert into product_uoms (
  product_id,
  uom_id,
  to_base_factor,
  is_sale,
  is_purchase
)
select
  p.id,
  u.id,
  p.pack_size::numeric(18,6),
  true,
  true
from products p
join uoms u on u.code = 'pack'
where p.pack_size > 0
on conflict (product_id, uom_id) do update
set
  to_base_factor = excluded.to_base_factor,
  is_sale = excluded.is_sale,
  is_purchase = excluded.is_purchase,
  updated_at = now();

insert into product_uoms (
  product_id,
  uom_id,
  to_base_factor,
  is_sale,
  is_purchase
)
select
  p.id,
  u.id,
  coalesce(
    nullif(p.dus_size, 0)::numeric(18,6),
    (nullif(p.pack_size, 0) * nullif(p.pack_per_dus, 0))::numeric(18,6)
  ) as to_base_factor,
  true,
  true
from products p
join uoms u on u.code = 'dus'
where coalesce(
  nullif(p.dus_size, 0),
  (nullif(p.pack_size, 0) * nullif(p.pack_per_dus, 0))
) > 0
on conflict (product_id, uom_id) do update
set
  to_base_factor = excluded.to_base_factor,
  is_sale = excluded.is_sale,
  is_purchase = excluded.is_purchase,
  updated_at = now();
