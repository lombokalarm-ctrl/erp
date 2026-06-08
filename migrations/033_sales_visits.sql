create table sales_visits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  visited_by uuid not null references users(id),
  customer_code_snapshot text,
  customer_name_snapshot text,
  sales_name_snapshot text,
  visit_status text not null,
  note text,
  visited_at timestamptz not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_meters numeric(10,2),
  location_captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_visits_visited_by_idx on sales_visits(visited_by);
create index sales_visits_customer_id_idx on sales_visits(customer_id);
create index sales_visits_visited_at_idx on sales_visits(visited_at desc);
create index sales_visits_status_idx on sales_visits(visit_status);

create table sales_visit_photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references sales_visits(id) on delete cascade,
  file_id uuid not null references files(id),
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create index sales_visit_photos_visit_id_idx on sales_visit_photos(visit_id);
