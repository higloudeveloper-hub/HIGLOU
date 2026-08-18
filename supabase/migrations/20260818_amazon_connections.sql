-- Per-user Amazon Selling Partner OAuth connection
create table if not exists public.amazon_connections (
  user_id uuid primary key references public.users (id) on delete cascade,
  selling_partner_id text,
  marketplace_id text not null default 'ATVPDKIKX0DER',
  refresh_token_enc text not null default '',
  access_token_enc text,
  access_token_expires_at timestamptz,
  connected_at timestamptz,
  revoked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.amazon_connections enable row level security;

drop policy if exists "amazon_connections_select_own" on public.amazon_connections;
create policy "amazon_connections_select_own"
  on public.amazon_connections for select
  using (auth.uid() = user_id);

drop policy if exists "amazon_connections_insert_own" on public.amazon_connections;
create policy "amazon_connections_insert_own"
  on public.amazon_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "amazon_connections_update_own" on public.amazon_connections;
create policy "amazon_connections_update_own"
  on public.amazon_connections for update
  using (auth.uid() = user_id);

drop policy if exists "amazon_connections_delete_own" on public.amazon_connections;
create policy "amazon_connections_delete_own"
  on public.amazon_connections for delete
  using (auth.uid() = user_id);

alter table public.products
  add column if not exists amazon_sku text,
  add column if not exists amazon_asin text,
  add column if not exists amazon_status text;
