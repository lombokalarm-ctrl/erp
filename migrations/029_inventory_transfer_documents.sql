create table if not exists inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  client_ref text unique,
  source_warehouse_id uuid not null references warehouses(id),
  target_warehouse_id uuid not null references warehouses(id),
  transfer_date date not null default current_date,
  status text not null default 'POSTED',
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references inventory_transfers(id) on delete cascade,
  product_id uuid not null references products(id),
  qty_base numeric(18,6) not null check (qty_base > 0)
);

create index if not exists inventory_transfers_created_at_idx on inventory_transfers(created_at desc);
create index if not exists inventory_transfer_items_transfer_id_idx on inventory_transfer_items(transfer_id);
