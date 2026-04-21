-- Drop old constraint
alter table sales_orders drop constraint if exists sales_orders_status_check;

-- Add new constraint with PENDING_APPROVAL
alter table sales_orders add constraint sales_orders_status_check 
  check (status in ('PENDING_APPROVAL', 'DRAFT', 'CONFIRMED', 'DELIVERED', 'CANCELLED'));

-- Create approval table
create table if not exists sales_order_approvals (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  requested_by uuid not null references users(id),
  status text not null check (status in ('PENDING', 'APPROVED', 'REJECTED')) default 'PENDING',
  approver_id uuid references users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_order_approvals_so_id_idx on sales_order_approvals(sales_order_id);

-- Insert new permission for overriding/approving SO
insert into permissions (code, description) values ('sales_orders:approve', 'Persetujuan Sales Order (Override Credit)') on conflict do nothing;

-- Also add this permission to 'Admin' and 'Manager' roles
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.name in ('Admin', 'Manager') and p.code = 'sales_orders:approve'
on conflict do nothing;
