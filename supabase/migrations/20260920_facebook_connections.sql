-- Per-user Facebook Page connection for affiliate sharing / ads
create table if not exists public.facebook_connections (
  user_id uuid primary key references public.users (id) on delete cascade,
  page_id text not null default '',
  page_name text,
  access_token_enc text not null default '',
  connected_at timestamptz,
  revoked_at timestamptz,
  last_error text,
  last_share_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.facebook_connections enable row level security;

drop policy if exists "facebook_connections_select_own" on public.facebook_connections;
create policy "facebook_connections_select_own"
  on public.facebook_connections for select
  using (auth.uid() = user_id);

drop policy if exists "facebook_connections_insert_own" on public.facebook_connections;
create policy "facebook_connections_insert_own"
  on public.facebook_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "facebook_connections_update_own" on public.facebook_connections;
create policy "facebook_connections_update_own"
  on public.facebook_connections for update
  using (auth.uid() = user_id);

drop policy if exists "facebook_connections_delete_own" on public.facebook_connections;
create policy "facebook_connections_delete_own"
  on public.facebook_connections for delete
  using (auth.uid() = user_id);
