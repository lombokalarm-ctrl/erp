create table if not exists auth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_ip text,
  user_agent text
);

create index if not exists auth_refresh_tokens_user_id_idx
  on auth_refresh_tokens(user_id, created_at desc);

create index if not exists auth_refresh_tokens_expires_idx
  on auth_refresh_tokens(expires_at);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx
  on password_reset_tokens(user_id, created_at desc);

create index if not exists password_reset_tokens_expires_idx
  on password_reset_tokens(expires_at);
