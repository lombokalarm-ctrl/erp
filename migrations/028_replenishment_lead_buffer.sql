alter table products
  add column if not exists lead_time_days int not null default 0,
  add column if not exists buffer_days int not null default 0;

alter table products
  add constraint products_lead_time_days_non_negative_chk
  check (lead_time_days >= 0);

alter table products
  add constraint products_buffer_days_non_negative_chk
  check (buffer_days >= 0);
