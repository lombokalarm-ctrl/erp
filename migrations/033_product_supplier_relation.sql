alter table products
add column if not exists supplier_id uuid references suppliers(id);

create index if not exists products_supplier_id_idx on products(supplier_id);
