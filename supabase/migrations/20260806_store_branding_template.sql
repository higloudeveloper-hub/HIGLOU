-- Per-store HTML description template (classic | modern | editorial | luxury | fresh)
alter table public.store_branding
  add column if not exists template_id text not null default 'classic';
