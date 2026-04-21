create table if not exists returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  type text not null check (type in ('SALES_RETURN', 'PURCHASE_RETURN')),
  customer_id uuid references customers(id),
  supplier_id uuid references suppliers(id),
  reference_no text, -- misal nomor invoice atau PO terkait
  warehouse_id uuid not null references warehouses(id),
  return_date date not null,
  status text not null default 'COMPLETED',
  notes text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(14,2) not null,
  reason text
);

create index returns_customer_id_idx on returns(customer_id);
create index returns_supplier_id_idx on returns(supplier_id);
create index return_items_return_id_idx on return_items(return_id);
