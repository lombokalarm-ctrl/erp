alter table customers
  add column if not exists ktp_no text,
  add column if not exists npwp_no text;

alter table customer_credit_profiles
  add column if not exists sales_order_limit numeric(14,2) not null default 0;
