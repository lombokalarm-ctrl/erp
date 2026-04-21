create table if not exists schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

alter table customers add column sales_id uuid references users(id);
