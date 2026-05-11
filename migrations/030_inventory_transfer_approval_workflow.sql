create table if not exists inventory_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  client_ref text unique,
  source_warehouse_id uuid not null references warehouses(id),
  target_warehouse_id uuid not null references warehouses(id),
  transfer_date date not null default current_date,
  status text not null check (status in ('PENDING_L1', 'PENDING_L2', 'APPROVED', 'REJECTED')) default 'PENDING_L1',
  note text,
  created_by uuid references users(id),
  posted_transfer_id uuid references inventory_transfers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_transfer_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references inventory_transfer_requests(id) on delete cascade,
  product_id uuid not null references products(id),
  qty_base numeric(18,6) not null check (qty_base > 0)
);

create table if not exists inventory_transfer_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references inventory_transfer_requests(id) on delete cascade,
  level int not null check (level in (1, 2)),
  status text not null check (status in ('PENDING', 'APPROVED', 'REJECTED')) default 'PENDING',
  approver_id uuid references users(id),
  notes text,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id, level)
);

create index if not exists inventory_transfer_requests_status_idx on inventory_transfer_requests(status, created_at desc);
create index if not exists inventory_transfer_requests_created_at_idx on inventory_transfer_requests(created_at desc);
create index if not exists inventory_transfer_request_items_request_id_idx on inventory_transfer_request_items(request_id);
create index if not exists inventory_transfer_approvals_request_id_idx on inventory_transfer_approvals(request_id);

insert into permissions(code, description)
values
  ('inventory:approve_level1', 'Persetujuan transfer gudang level 1'),
  ('inventory:approve_level2', 'Persetujuan transfer gudang level 2')
on conflict(code) do nothing;

insert into role_permissions(role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code = 'inventory:approve_level1'
where r.name = 'Manager'
on conflict do nothing;

insert into role_permissions(role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code = 'inventory:approve_level2'
where r.name = 'Admin'
on conflict do nothing;
