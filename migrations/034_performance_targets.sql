create table if not exists performance_target_periods (
  id uuid primary key default gen_random_uuid(),
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year between 2000 and 2100),
  period_key text not null unique,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'FINAL')),
  notes text,
  created_by uuid references users(id),
  finalized_by uuid references users(id),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists performance_target_assignments (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references performance_target_periods(id) on delete cascade,
  user_id uuid not null references users(id),
  assignment_type text not null check (assignment_type in ('SALES', 'DRIVER')),
  region_id uuid references regions(id),
  target_visit_count int not null default 0 check (target_visit_count >= 0),
  target_customer_coverage int not null default 0 check (target_customer_coverage >= 0),
  target_sales_amount numeric(14,2) not null default 0 check (target_sales_amount >= 0),
  target_sales_order_count int not null default 0 check (target_sales_order_count >= 0),
  target_delivery_count int not null default 0 check (target_delivery_count >= 0),
  target_delivery_points int not null default 0 check (target_delivery_points >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists performance_target_assignments_unique_idx
  on performance_target_assignments (
    period_id,
    user_id,
    assignment_type,
    coalesce(region_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists performance_target_assignments_period_idx
  on performance_target_assignments(period_id);

create index if not exists performance_target_assignments_user_idx
  on performance_target_assignments(user_id);

create index if not exists performance_target_assignments_region_idx
  on performance_target_assignments(region_id);

create table if not exists performance_target_schedules (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references performance_target_assignments(id) on delete cascade,
  schedule_type text not null check (schedule_type in ('VISIT', 'DELIVERY')),
  day_of_week text not null check (
    day_of_week in (
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY'
    )
  ),
  week_of_month int check (week_of_month between 1 and 5),
  start_time text,
  end_time text,
  route_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists performance_target_schedules_assignment_idx
  on performance_target_schedules(assignment_id);
