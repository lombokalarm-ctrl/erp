create table if not exists product_promos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  promo_type text not null check (promo_type in ('PERCENTAGE', 'FIXED_AMOUNT')),
  discount_value numeric(14,2) not null,
  min_qty int not null default 1,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_promos_product_id_idx on product_promos(product_id);
