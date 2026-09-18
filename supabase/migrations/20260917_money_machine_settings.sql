-- Per-user Money Machine preferences (associate tag + module toggles).
-- Additive only.

create table if not exists public.money_machine_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  money_engine boolean not null default true,
  affiliate_engine boolean not null default true,
  smart_links boolean not null default true,
  money_score boolean not null default true,
  autopilot boolean not null default true,
  openai_pref boolean not null default true,
  vision_pref boolean not null default true,
  keepa_pref boolean not null default true,
  associate_tag text not null default '',
  associate_marketplace text not null default 'US',
  updated_at timestamptz not null default now()
);

alter table public.money_machine_settings enable row level security;

drop policy if exists "money_machine_settings_own" on public.money_machine_settings;
create policy "money_machine_settings_own"
  on public.money_machine_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
