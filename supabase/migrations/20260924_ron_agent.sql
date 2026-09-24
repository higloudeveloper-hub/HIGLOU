-- RON: Higlou's red robot agent — Facebook auto-publisher + learning memory.
-- Additive only.

create table if not exists public.ron_agent_state (
  user_id uuid primary key references public.users (id) on delete cascade,
  enabled boolean not null default false,
  /** auto = publish alone · watch = suggest only · off mirrored by enabled=false */
  mode text not null default 'auto',
  status_message text not null default 'Apagado',
  last_run_at timestamptz,
  last_post_at timestamptz,
  last_error text,
  posts_today integer not null default 0,
  posts_today_date date,
  /** Learning weights: niches, formats, asins that earn clicks */
  learning jsonb not null default '{}'::jsonb,
  /** Recent activity feed for the floating robot UI */
  activity_log jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists ron_agent_state_enabled_idx
  on public.ron_agent_state (enabled)
  where enabled = true;

alter table public.ron_agent_state enable row level security;

drop policy if exists "ron_agent_state_own" on public.ron_agent_state;
create policy "ron_agent_state_own"
  on public.ron_agent_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
