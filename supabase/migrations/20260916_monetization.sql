-- Higlou Money Engine / Monetization (additive only)
-- Apply after existing migrations. Does not alter legacy tables destructively.

create table if not exists public.affiliate_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null default '',
  provider_id text not null default 'amazon_associates',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  tracking_id text not null,
  provider_id text not null default 'amazon_associates',
  product_id uuid references public.products (id) on delete set null,
  asin text,
  destination_url text not null,
  associate_tag text not null default '',
  campaign_id uuid references public.affiliate_campaigns (id) on delete set null,
  source text,
  click_count integer not null default 0,
  unique_click_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, tracking_id)
);

create index if not exists affiliate_links_tracking_idx
  on public.affiliate_links (tracking_id);

create table if not exists public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.affiliate_links (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  source text,
  campaign_id uuid,
  product_id uuid,
  marketplace text,
  destination_url text,
  is_unique boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_clicks_link_created_idx
  on public.affiliate_clicks (link_id, created_at desc);

create table if not exists public.affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references public.affiliate_links (id) on delete set null,
  user_id uuid not null references public.users (id) on delete cascade,
  provider_id text not null default 'amazon_associates',
  revenue numeric(12, 2),
  attributed boolean not null default false,
  note text not null default 'Requires provider report - not invented',
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.smart_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  slug text not null,
  affiliate_link_id uuid references public.affiliate_links (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  label text not null default '',
  platform text not null default 'other',
  destination_url text not null,
  click_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists smart_links_slug_idx on public.smart_links (slug);

create table if not exists public.money_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  asin text,
  score integer,
  availability text not null default 'insufficient',
  recommendation text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists money_scores_product_idx
  on public.money_scores (user_id, product_id);

create table if not exists public.monetization_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  asin text,
  recommendation text not null,
  money_score integer,
  confidence numeric(4, 3),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  asin text,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.affiliate_campaigns enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_conversions enable row level security;
alter table public.smart_links enable row level security;
alter table public.money_scores enable row level security;
alter table public.monetization_opportunities enable row level security;
alter table public.product_watchlist enable row level security;

drop policy if exists "affiliate_campaigns_own" on public.affiliate_campaigns;
create policy "affiliate_campaigns_own"
  on public.affiliate_campaigns for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "affiliate_links_own" on public.affiliate_links;
create policy "affiliate_links_own"
  on public.affiliate_links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "affiliate_clicks_own" on public.affiliate_clicks;
create policy "affiliate_clicks_own"
  on public.affiliate_clicks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "affiliate_conversions_own" on public.affiliate_conversions;
create policy "affiliate_conversions_own"
  on public.affiliate_conversions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "smart_links_own" on public.smart_links;
create policy "smart_links_own"
  on public.smart_links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "money_scores_own" on public.money_scores;
create policy "money_scores_own"
  on public.money_scores for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "monetization_opportunities_own" on public.monetization_opportunities;
create policy "monetization_opportunities_own"
  on public.monetization_opportunities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "product_watchlist_own" on public.product_watchlist;
create policy "product_watchlist_own"
  on public.product_watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
