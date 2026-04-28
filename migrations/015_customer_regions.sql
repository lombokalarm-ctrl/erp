create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table customers
add column email text,
add column region_id uuid references regions(id);
