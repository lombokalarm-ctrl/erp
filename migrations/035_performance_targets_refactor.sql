create table if not exists sales_monthly_targets (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references performance_target_periods(id) on delete cascade,
  sales_user_id uuid not null references users(id),
  target_sales_amount numeric(14,2) not null default 0 check (target_sales_amount >= 0),
  target_sales_order_count int not null default 0 check (target_sales_order_count >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, sales_user_id)
);

create index if not exists sales_monthly_targets_period_idx
  on sales_monthly_targets(period_id);

create index if not exists sales_monthly_targets_sales_idx
  on sales_monthly_targets(sales_user_id);

create table if not exists sales_visit_target_schedules (
  id uuid primary key default gen_random_uuid(),
  sales_target_id uuid not null references sales_monthly_targets(id) on delete cascade,
  region_id uuid not null references regions(id),
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
  target_visit_count int not null default 0 check (target_visit_count >= 0),
  route_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_target_id, region_id, day_of_week)
);

create index if not exists sales_visit_target_schedules_target_idx
  on sales_visit_target_schedules(sales_target_id);

create index if not exists sales_visit_target_schedules_region_idx
  on sales_visit_target_schedules(region_id);

create table if not exists delivery_target_periods (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references performance_target_periods(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id)
);

create index if not exists delivery_target_periods_period_idx
  on delivery_target_periods(period_id);

create table if not exists delivery_target_schedules (
  id uuid primary key default gen_random_uuid(),
  delivery_target_period_id uuid not null references delivery_target_periods(id) on delete cascade,
  region_id uuid not null references regions(id),
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
  target_delivery_count int not null default 0 check (target_delivery_count >= 0),
  target_delivery_points int not null default 0 check (target_delivery_points >= 0),
  route_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_target_period_id, region_id, day_of_week)
);

create index if not exists delivery_target_schedules_period_idx
  on delivery_target_schedules(delivery_target_period_id);

create index if not exists delivery_target_schedules_region_idx
  on delivery_target_schedules(region_id);
