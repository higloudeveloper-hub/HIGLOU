-- Per-user eBay OAuth connection (Sell Inventory / Account APIs)
create table if not exists public.ebay_connections (
  user_id uuid primary key references public.users (id) on delete cascade,
  ebay_user_id text,
  ebay_username text,
  marketplace_id text not null default 'EBAY_US',
  refresh_token_enc text not null default '',
  access_token_enc text,
  access_token_expires_at timestamptz,
  scopes text,
  connected_at timestamptz,
  revoked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ebay_connections enable row level security;

drop policy if exists "ebay_connections_select_own" on public.ebay_connections;
create policy "ebay_connections_select_own"
  on public.ebay_connections for select
  using (auth.uid() = user_id);

drop policy if exists "ebay_connections_insert_own" on public.ebay_connections;
create policy "ebay_connections_insert_own"
  on public.ebay_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "ebay_connections_update_own" on public.ebay_connections;
create policy "ebay_connections_update_own"
  on public.ebay_connections for update
  using (auth.uid() = user_id);

drop policy if exists "ebay_connections_delete_own" on public.ebay_connections;
create policy "ebay_connections_delete_own"
  on public.ebay_connections for delete
  using (auth.uid() = user_id);

-- Track Inventory API publish status on products
alter table public.products
  add column if not exists ebay_offer_id text,
  add column if not exists ebay_listing_id text,
  add column if not exists ebay_status text;
