alter table products
  add column if not exists base_uom_id uuid references uoms(id);

create table if not exists product_uoms (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  uom_id uuid not null references uoms(id),
  to_base_factor numeric(18,6) not null check (to_base_factor > 0),
  is_sale boolean not null default true,
  is_purchase boolean not null default true,
  is_default_sale boolean not null default false,
  is_default_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_uoms_default_sale_requires_sale check ((not is_default_sale) or is_sale),
  constraint product_uoms_default_purchase_requires_purchase check ((not is_default_purchase) or is_purchase),
  unique (product_id, uom_id)
);

create index if not exists idx_product_uoms_product on product_uoms(product_id);
create index if not exists idx_product_uoms_uom on product_uoms(uom_id);

create unique index if not exists uq_product_uoms_default_sale
  on product_uoms(product_id)
  where is_default_sale;

create unique index if not exists uq_product_uoms_default_purchase
  on product_uoms(product_id)
  where is_default_purchase;
