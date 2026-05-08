create table if not exists uoms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists uom_edges (
  id uuid primary key default gen_random_uuid(),
  from_uom_id uuid not null references uoms(id),
  to_uom_id uuid not null references uoms(id),
  factor numeric(18,6) not null check (factor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uom_edges_not_self check (from_uom_id <> to_uom_id),
  unique (from_uom_id, to_uom_id)
);

create index if not exists idx_uom_edges_from on uom_edges(from_uom_id);
create index if not exists idx_uom_edges_to on uom_edges(to_uom_id);
