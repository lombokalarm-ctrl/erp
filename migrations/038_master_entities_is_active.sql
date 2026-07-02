alter table products
  add column if not exists is_active boolean not null default true;

alter table suppliers
  add column if not exists is_active boolean not null default true;

alter table customers
  add column if not exists is_active boolean not null default true;

create index if not exists idx_products_is_active on products(is_active);
create index if not exists idx_suppliers_is_active on suppliers(is_active);
create index if not exists idx_customers_is_active on customers(is_active);
