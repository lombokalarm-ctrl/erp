create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  severity text not null default 'warning',
  entity_type text not null,
  entity_id uuid,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table notifications
  drop constraint if exists notifications_status_check;

alter table notifications
  add constraint notifications_status_check
  check (status in ('OPEN', 'RESOLVED'));

create index if not exists notifications_status_created_idx
  on notifications(status, created_at desc);

create index if not exists notifications_entity_idx
  on notifications(entity_type, entity_id);

create table if not exists notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notification_reads_user_read_idx
  on notification_reads(user_id, read_at desc);
