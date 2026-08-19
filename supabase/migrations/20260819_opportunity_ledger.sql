-- Saved real opportunities and which niches actually paid.
create table if not exists public.opportunity_ledger (
  user_id uuid not null references public.users (id) on delete cascade,
  mode text not null,
  asin text not null,
  query text not null default '',
  title text not null default '',
  brand text not null default '',
  image_url text not null default '',
  amazon_price numeric,
  ebay_price numeric,
  net_profit numeric,
  roi numeric,
  score integer,
  ebay_count integer,
  payload jsonb not null default '{}'::jsonb,
  seen_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, mode, asin)
);

create table if not exists public.opportunity_niche_stats (
  user_id uuid not null references public.users (id) on delete cascade,
  mode text not null,
  query text not null,
  category_id text not null default '',
  scans integer not null default 0,
  confirmed integer not null default 0,
  best_keep numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode, query)
);

alter table public.opportunity_ledger enable row level security;
alter table public.opportunity_niche_stats enable row level security;

drop policy if exists "opportunity_ledger_select_own" on public.opportunity_ledger;
create policy "opportunity_ledger_select_own"
  on public.opportunity_ledger for select
  using (auth.uid() = user_id);

drop policy if exists "opportunity_ledger_write_own" on public.opportunity_ledger;
create policy "opportunity_ledger_write_own"
  on public.opportunity_ledger for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "opportunity_niche_stats_select_own" on public.opportunity_niche_stats;
create policy "opportunity_niche_stats_select_own"
  on public.opportunity_niche_stats for select
  using (auth.uid() = user_id);

drop policy if exists "opportunity_niche_stats_write_own" on public.opportunity_niche_stats;
create policy "opportunity_niche_stats_write_own"
  on public.opportunity_niche_stats for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
