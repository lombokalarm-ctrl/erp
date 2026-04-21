-- create extension if not exists "pgcrypto";

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id),
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  phone text,
  address text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customer_credit_profiles (
  customer_id uuid primary key references customers(id) on delete cascade,
  credit_limit numeric(14,2) not null default 0,
  payment_term_days int not null default 0,
  max_overdue_days_before_block int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customer_scores (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  score int not null,
  grade text not null,
  calculated_at timestamptz not null default now()
);

create index customer_scores_customer_id_idx on customer_scores(customer_id);

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references product_categories(id),
  unit text not null default 'pcs',
  purchase_price numeric(14,2) not null default 0,
  sale_price numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid not null references customers(id),
  created_by uuid not null references users(id),
  order_date date not null,
  status text not null default 'DRAFT',
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(14,2) not null,
  unit_price numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);

create index sales_order_items_sales_order_id_idx on sales_order_items(sales_order_id);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  customer_id uuid not null references customers(id),
  sales_order_id uuid references sales_orders(id),
  invoice_date date not null,
  due_date date not null,
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'UNPAID',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_customer_id_idx on invoices(customer_id);
create index invoices_due_date_idx on invoices(due_date);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(14,2) not null,
  unit_price numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);

create index invoice_items_invoice_id_idx on invoice_items(invoice_id);

create table files (
  id uuid primary key default gen_random_uuid(),
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  method text not null,
  amount numeric(14,2) not null,
  paid_at timestamptz not null,
  note text,
  proof_file_id uuid references files(id),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create index payments_invoice_id_idx on payments(invoice_id);

create table scoring_configs (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table scoring_rules (
  id uuid primary key default gen_random_uuid(),
  scoring_config_id uuid not null references scoring_configs(id) on delete cascade,
  code text not null,
  weight numeric(8,4) not null,
  created_at timestamptz not null default now(),
  unique(scoring_config_id, code)
);

