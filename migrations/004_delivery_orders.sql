create table delivery_orders (
  id uuid primary key default gen_random_uuid(),
  do_no text not null unique,
  sales_order_id uuid not null references sales_orders(id),
  delivery_date date not null,
  status text not null default 'DELIVERED',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table delivery_order_items (
  id uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references delivery_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  qty int not null
);

alter table sales_orders add column delivery_status text not null default 'PENDING';
