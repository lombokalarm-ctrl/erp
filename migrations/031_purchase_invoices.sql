create table if not exists purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  invoice_date date not null default current_date,
  warehouse_id uuid not null references warehouses(id),
  supplier_id uuid not null references suppliers(id),
  term_days int not null default 0,
  due_date date not null default current_date,
  status text not null check (status in ('DRAFT', 'POSTED', 'CANCELLED')) default 'DRAFT',
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_invoices_supplier_id_idx on purchase_invoices(supplier_id);
create index if not exists purchase_invoices_warehouse_id_idx on purchase_invoices(warehouse_id);
create index if not exists purchase_invoices_invoice_date_idx on purchase_invoices(invoice_date);
create index if not exists purchase_invoices_status_idx on purchase_invoices(status);

create table if not exists purchase_invoice_items (
  id uuid primary key default gen_random_uuid(),
  purchase_invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  uom_code text not null,
  qty numeric(18,6) not null check (qty > 0),
  qty_base numeric(18,6) not null check (qty_base > 0),
  base_price numeric(18,6) not null default 0 check (base_price >= 0),
  disc1_type text not null check (disc1_type in ('PERCENT', 'AMOUNT')) default 'PERCENT',
  disc1_value numeric(18,6) not null default 0 check (disc1_value >= 0),
  disc2_type text not null check (disc2_type in ('PERCENT', 'AMOUNT')) default 'PERCENT',
  disc2_value numeric(18,6) not null default 0 check (disc2_value >= 0),
  net_unit_price numeric(18,6) not null default 0 check (net_unit_price >= 0),
  line_gross numeric(18,6) not null default 0 check (line_gross >= 0),
  line_discount numeric(18,6) not null default 0 check (line_discount >= 0),
  line_net numeric(18,6) not null default 0 check (line_net >= 0),
  created_at timestamptz not null default now()
);

create index if not exists purchase_invoice_items_purchase_invoice_id_idx
  on purchase_invoice_items(purchase_invoice_id);
create index if not exists purchase_invoice_items_product_id_idx
  on purchase_invoice_items(product_id);
