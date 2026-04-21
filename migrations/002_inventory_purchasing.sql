create table suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table inventory_balances (
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  qty numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id),
  product_id uuid not null references products(id),
  type text not null,
  qty_delta numeric(14,2) not null,
  ref_type text,
  ref_id uuid,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index inventory_transactions_product_id_idx on inventory_transactions(product_id);
create index inventory_transactions_created_at_idx on inventory_transactions(created_at);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique,
  supplier_id uuid not null references suppliers(id),
  created_by uuid not null references users(id),
  order_date date not null,
  status text not null default 'DRAFT',
  subtotal numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(14,2) not null,
  unit_price numeric(14,2) not null,
  line_total numeric(14,2) not null
);

create index purchase_order_items_po_id_idx on purchase_order_items(purchase_order_id);

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  grn_no text not null unique,
  purchase_order_id uuid references purchase_orders(id),
  warehouse_id uuid not null references warehouses(id),
  received_date date not null,
  created_by uuid not null references users(id),
  notes text,
  created_at timestamptz not null default now()
);

create table goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references goods_receipts(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(14,2) not null
);

create index goods_receipt_items_grn_id_idx on goods_receipt_items(goods_receipt_id);

