-- Optional live-working flag for RON floating UI (safe additive).
alter table public.ron_agent_state
  add column if not exists is_working boolean not null default false;
