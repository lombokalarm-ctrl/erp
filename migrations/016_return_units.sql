alter table return_items
add column uom text not null default 'pcs',
add column uom_to_pcs int not null default 1,
add column qty_pcs numeric(14,2) not null default 0;

update return_items set qty_pcs = qty;
