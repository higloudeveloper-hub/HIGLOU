-- Long-lived / never-expiring Facebook Page token metadata
alter table public.facebook_connections
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_never_expires boolean not null default false;

comment on column public.facebook_connections.token_never_expires is
  'True when Page token was obtained from a long-lived User token (Meta: does not expire)';
