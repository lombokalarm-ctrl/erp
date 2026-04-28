alter table sales_order_items add column uom text not null default 'pcs';
alter table sales_order_items add column uom_to_pcs int not null default 1;
alter table sales_order_items add column qty_pcs int not null default 0;

update sales_order_items
set qty_pcs = floor(qty)::int
where qty_pcs = 0;

alter table delivery_order_items add column uom text not null default 'pcs';
alter table delivery_order_items add column uom_to_pcs int not null default 1;
alter table delivery_order_items add column qty_pcs int not null default 0;

update delivery_order_items
set qty_pcs = qty
where qty_pcs = 0;

alter table invoice_items add column uom text not null default 'pcs';
alter table invoice_items add column uom_to_pcs int not null default 1;
alter table invoice_items add column qty_pcs int not null default 0;

update invoice_items
set qty_pcs = floor(qty)::int
where qty_pcs = 0;
