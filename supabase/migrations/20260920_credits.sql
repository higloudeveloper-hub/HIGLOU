-- Credit wallets + ledger (Stripe-ready; packs charged later via Stripe Checkout)
create table if not exists public.credit_wallets (
  user_id uuid primary key references public.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_granted integer not null default 0,
  lifetime_spent integer not null default 0,
  onboarded_at timestamptz,
  welcome_bonus_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  action text not null,
  reason text,
  meta jsonb not null default '{}'::jsonb,
  -- Stripe fields reserved for later
  stripe_session_id text,
  stripe_payment_intent text,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "credit_wallets_select_own" on public.credit_wallets;
create policy "credit_wallets_select_own"
  on public.credit_wallets for select
  using (auth.uid() = user_id);

drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own"
  on public.credit_ledger for select
  using (auth.uid() = user_id);
