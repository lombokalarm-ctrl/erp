alter table products add column unit_prices jsonb not null default '{"pcs":0,"pack":0,"dus":0}'::jsonb;
alter table products add column pack_size int not null default 1;
alter table products add column dus_size int not null default 1;
