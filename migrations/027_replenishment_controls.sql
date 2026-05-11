alter table products
  add column if not exists min_stock_base numeric(18,6) not null default 0,
  add column if not exists reorder_qty_base numeric(18,6) not null default 0;

create index if not exists products_min_stock_base_idx on products(min_stock_base);
