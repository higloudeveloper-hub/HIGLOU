-- Higlou Magic Studio FULL BOOTSTRAP
-- Generated for higloudeveloper-hub migration 2026-08-11T13:20:37.0517397-04:00
-- Apply in Supabase SQL Editor (new project) OR via psql

-- ===== BEGIN supabase\schema.sql =====
-- Higlou eBay Listing Generator schema
-- Apply in Supabase SQL editor or via CLI migrations.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create type public.product_status as enum (
  'Uploaded',
  'Analyzing',
  'Needs Review',
  'Ready',
  'CSV Generated',
  'Published'
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null default '',
  subtitle text not null default '',
  brand text not null default '',
  collection text not null default '',
  model text not null default '',
  sku text not null default '',
  upc text not null default '',
  mpn text not null default '',
  category_id text not null default '',
  category_name text not null default '',
  condition text not null default '',
  condition_id text not null default '',
  condition_description text not null default '',
  price numeric(12,2),
  quantity integer not null default 1,
  listing_format text not null default 'FixedPrice',
  description_html text not null default '',
  description_summary text not null default '',
  item_specifics jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  set_includes jsonb not null default '[]'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  size text not null default '',
  product_type text not null default '',
  shipping_policy_id text not null default '',
  return_policy_id text not null default '',
  payment_policy_id text not null default '',
  handling_time integer not null default 1,
  item_location text not null default '',
  postal_code text not null default '',
  country text not null default 'US',
  status public.product_status not null default 'Uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  public_url text not null,
  storage_path text not null,
  file_name text not null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  mime_type text not null default 'image/jpeg',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_item_specifics (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  csv_column text not null,
  label text not null,
  value text not null default '',
  required boolean not null default false,
  confidence numeric(4,3),
  is_custom boolean not null default false
);

create type public.ebay_template_type as enum (
  'draft_listing',
  'new_listing',
  'unknown'
);

create table if not exists public.ebay_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  file_name text not null,
  storage_path text,
  raw_content text not null,
  sha256 text not null,
  info_line text not null,
  template_type public.ebay_template_type not null default 'unknown',
  headers jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ebay_policy_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  payment_policy_id text not null default '',
  return_policy_id text not null default '',
  shipping_policy_id text not null default '',
  default_item_location text not null default '',
  default_postal_code text not null default '',
  default_handling_time integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.store_branding (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  store_name text not null default 'Higlou Store',
  store_name_display text not null default 'HIGLOU STORE',
  slogan text not null default 'Quality Products â€¢ Reliable Service â€¢ Shop With Confidence',
  thank_you_message text not null default 'Thank You for Shopping With Higlou Store',
  thank_you_subtext text not null default '',
  shipping_information text not null default '',
  return_policy_text text not null default '',
  warranty_information text not null default '',
  footer_text text not null default '',
  logo_url text not null default '',
  colors jsonb not null default '{"headerBackground":"#111111","headerText":"#ffffff","bodyText":"#1d1d1f","accent":"#f4c928","panelBackground":"#f7f7f7","border":"#e5e5e5"}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_csv_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  file_name text not null,
  content text not null,
  template_sha256 text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  request_meta jsonb not null default '{}'::jsonb,
  response_json jsonb,
  status text not null default 'completed',
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_item_specifics enable row level security;
alter table public.ebay_templates enable row level security;
alter table public.ebay_policy_settings enable row level security;
alter table public.store_branding enable row level security;
alter table public.generated_csv_files enable row level security;
alter table public.analysis_history enable row level security;

create policy users_self on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy products_owner on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy product_images_owner on public.product_images
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy product_item_specifics_owner on public.product_item_specifics
  for all using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.user_id = auth.uid()
    )
  );

create policy ebay_templates_owner on public.ebay_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy ebay_policy_settings_owner on public.ebay_policy_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy store_branding_owner on public.store_branding
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy generated_csv_files_owner on public.generated_csv_files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy analysis_history_owner on public.analysis_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  provider text not null,
  operation text not null,
  image_count integer not null default 0,
  request_count integer not null default 1,
  estimated_cost numeric(12, 6) not null default 0,
  status text not null default 'ok',
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.image_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  image_hash text not null,
  provider text not null,
  analysis_version text not null default 'hybrid-v1',
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, image_hash, provider, analysis_version)
);

alter table public.ai_usage_events enable row level security;
alter table public.image_analysis_cache enable row level security;

create policy ai_usage_events_owner on public.ai_usage_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy image_analysis_cache_owner on public.image_analysis_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cost control: editable provider rates + budget settings
create table if not exists public.provider_pricing_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  service text not null default 'default',
  model text,
  input_price_per_million numeric(12, 6),
  cached_input_price_per_million numeric(12, 6),
  output_price_per_million numeric(12, 6),
  price_per_1000_units numeric(12, 6),
  free_units_monthly integer,
  currency text not null default 'USD',
  effective_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.provider_pricing_settings enable row level security;

create policy provider_pricing_settings_read on public.provider_pricing_settings
  for select using (auth.role() = 'authenticated');

alter table public.ai_usage_events add column if not exists model text;
alter table public.ai_usage_events add column if not exists request_id text;
alter table public.ai_usage_events add column if not exists input_tokens integer not null default 0;
alter table public.ai_usage_events add column if not exists cached_input_tokens integer not null default 0;
alter table public.ai_usage_events add column if not exists output_tokens integer not null default 0;
alter table public.ai_usage_events add column if not exists reasoning_tokens integer not null default 0;
alter table public.ai_usage_events add column if not exists ocr_unit_count integer not null default 0;
alter table public.ai_usage_events add column if not exists retry_count integer not null default 0;
alter table public.ai_usage_events add column if not exists cache_hit boolean not null default false;

create table if not exists public.budget_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  monthly_product_target integer not null default 500,
  monthly_budget_warning_usd numeric(12, 2) not null default 75,
  monthly_budget_limit_usd numeric(12, 2) not null default 100,
  enforcement_mode text not null default 'warn_only',
  default_analysis_tier text not null default 'economy',
  updated_at timestamptz not null default now()
);

alter table public.budget_settings enable row level security;

create policy budget_settings_owner on public.budget_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage: create a public-read bucket named `product-images` in the Supabase dashboard
-- (or Storage API). Uploads use the service role; public HTTPS URLs are used for eBay
-- Item photo URL values. Suggested path layout: {userId}/{productId|temp}/{uuid}-{safeName}

-- Marketplace catalog: see migrations/20260715_db_products.sql
-- (db_products + db_product_images + don-baraton-images bucket)
-- Creative Engine tables were removed in 20260716_drop_creative_engine.sql

-- ===== END supabase\schema.sql =====

-- ===== BEGIN supabase\migrations\20260714_product_analysis_cache.sql =====
-- Phase A: product-level smart cache (fingerprint keyed)

create table if not exists public.product_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_fingerprint text not null,
  normalized_product_json jsonb not null default '{}'::jsonb,
  confidence_json jsonb not null default '{}'::jsonb,
  cost_json jsonb not null default '{}'::jsonb,
  analysis_payload jsonb not null default '{}'::jsonb,
  pipeline_version text not null default 'higlou-pipeline-v2a',
  prompt_version text not null default 'higlou-prompt-v2a',
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  hit_count integer not null default 1,
  unique (user_id, product_fingerprint, pipeline_version, prompt_version)
);

create index if not exists product_analysis_cache_user_fp_idx
  on public.product_analysis_cache (user_id, product_fingerprint);

alter table public.product_analysis_cache enable row level security;

drop policy if exists product_analysis_cache_owner on public.product_analysis_cache;
create policy product_analysis_cache_owner on public.product_analysis_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== END supabase\migrations\20260714_product_analysis_cache.sql =====

-- ===== BEGIN supabase\migrations\20260715_db_products.sql =====
-- Don Baraton catalog: products + images (independent of Higlou products FK)
-- Same Supabase project as Higlou; Don Baraton app reads/writes via service role.

create table if not exists public.db_products (
  id uuid primary key default gen_random_uuid(),
  higlou_product_id uuid references public.products (id) on delete set null,
  slug text not null unique,
  title text not null,
  subtitle text not null default '',
  brand text not null default '',
  sku text not null default '',
  ebay_category_id text not null default '',
  leaf_category_name text not null default '',
  category_slug text not null default 'more',
  category_name text not null default 'More',
  condition text not null default 'New',
  price numeric(12, 2) not null check (price > 0),
  currency text not null default 'USD',
  quantity integer not null default 1 check (quantity >= 0),
  description_html text not null default '',
  description_summary text not null default '',
  item_specifics jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  size text not null default '',
  product_type text not null default '',
  free_shipping boolean not null default false,
  shipping_cost numeric(12, 2),
  item_location text not null default '',
  postal_code text not null default '',
  status text not null default 'active'
    check (status in ('draft', 'active', 'sold', 'hidden')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists db_products_sku_unique
  on public.db_products (lower(sku))
  where sku <> '';

create index if not exists db_products_category_idx
  on public.db_products (category_slug, status);

create index if not exists db_products_published_idx
  on public.db_products (published_at desc)
  where status = 'active';

create index if not exists db_products_search_idx
  on public.db_products using gin (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(description_summary, '')
    )
  );

create table if not exists public.db_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.db_products (id) on delete cascade,
  url text not null,
  storage_path text not null default '',
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists db_product_images_product_idx
  on public.db_product_images (product_id, sort_order);

-- Keep only one primary per product (soft via unique partial index)
create unique index if not exists db_product_images_one_primary
  on public.db_product_images (product_id)
  where is_primary = true;

alter table public.db_products enable row level security;
alter table public.db_product_images enable row level security;

-- Public storefront: read active products
drop policy if exists db_products_public_read on public.db_products;
create policy db_products_public_read on public.db_products
  for select
  using (status = 'active');

drop policy if exists db_product_images_public_read on public.db_product_images;
create policy db_product_images_public_read on public.db_product_images
  for select
  using (
    exists (
      select 1 from public.db_products p
      where p.id = product_id and p.status = 'active'
    )
  );

-- Authenticated sellers can manage (Higlou users); service role bypasses RLS
drop policy if exists db_products_authenticated_all on public.db_products;
create policy db_products_authenticated_all on public.db_products
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists db_product_images_authenticated_all on public.db_product_images;
create policy db_product_images_authenticated_all on public.db_product_images
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Storage bucket for Don Baraton images (public read)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'don-baraton-images',
  'don-baraton-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set public = excluded.public;

drop policy if exists don_baraton_images_public_read on storage.objects;
create policy don_baraton_images_public_read on storage.objects
  for select
  using (bucket_id = 'don-baraton-images');

drop policy if exists don_baraton_images_auth_write on storage.objects;
create policy don_baraton_images_auth_write on storage.objects
  for insert
  with check (
    bucket_id = 'don-baraton-images'
    and auth.role() in ('authenticated', 'service_role')
  );

drop policy if exists don_baraton_images_auth_update on storage.objects;
create policy don_baraton_images_auth_update on storage.objects
  for update
  using (
    bucket_id = 'don-baraton-images'
    and auth.role() in ('authenticated', 'service_role')
  );

drop policy if exists don_baraton_images_auth_delete on storage.objects;
create policy don_baraton_images_auth_delete on storage.objects
  for delete
  using (
    bucket_id = 'don-baraton-images'
    and auth.role() in ('authenticated', 'service_role')
  );

-- ===== END supabase\migrations\20260715_db_products.sql =====

-- ===== BEGIN supabase\migrations\20260715_don_baraton_orders.sql =====
-- Don Baraton marketplace ops (orders + shipments)
-- Run AFTER 20260715_db_products.sql
-- Does NOT require don_baraton_listings

create table if not exists public.don_baraton_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  status text not null default 'new'
    check (status in (
      'new',
      'confirmed',
      'packed',
      'shipped',
      'delivered',
      'cancelled',
      'refunded'
    )),
  buyer_name text not null default '',
  buyer_email text not null default '',
  buyer_phone text not null default '',
  ship_address_line1 text not null default '',
  ship_address_line2 text not null default '',
  ship_city text not null default '',
  ship_state text not null default '',
  ship_postal text not null default '',
  ship_country text not null default 'US',
  subtotal numeric(12, 2) not null default 0,
  shipping_cost numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  notes text not null default '',
  source text not null default 'storefront',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.don_baraton_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.don_baraton_orders (id) on delete cascade,
  product_id uuid references public.db_products (id) on delete set null,
  title text not null,
  sku text not null default '',
  unit_price numeric(12, 2) not null,
  quantity integer not null check (quantity > 0),
  image_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists don_baraton_order_items_order_idx
  on public.don_baraton_order_items (order_id);

create table if not exists public.don_baraton_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.don_baraton_orders (id) on delete cascade,
  carrier text not null default '',
  tracking_number text not null default '',
  tracking_url text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'label_created', 'in_transit', 'delivered', 'exception')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists don_baraton_orders_status_idx
  on public.don_baraton_orders (status, created_at desc);

alter table public.don_baraton_orders enable row level security;
alter table public.don_baraton_order_items enable row level security;
alter table public.don_baraton_shipments enable row level security;

drop policy if exists don_baraton_orders_service on public.don_baraton_orders;
create policy don_baraton_orders_service on public.don_baraton_orders
  for all using (true) with check (true);

drop policy if exists don_baraton_order_items_service on public.don_baraton_order_items;
create policy don_baraton_order_items_service on public.don_baraton_order_items
  for all using (true) with check (true);

drop policy if exists don_baraton_shipments_service on public.don_baraton_shipments;
create policy don_baraton_shipments_service on public.don_baraton_shipments
  for all using (true) with check (true);

-- ===== END supabase\migrations\20260715_don_baraton_orders.sql =====

-- ===== BEGIN supabase\migrations\20260716_db_offers.sql =====
-- Buyer offers (eBay-style Best Offer) for Don Baraton Outlet
create table if not exists public.db_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.db_products (id) on delete set null,
  listing_slug text not null,
  listing_title text not null default '',
  listing_image_url text not null default '',
  list_price numeric(12, 2) not null,
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text not null default '',
  message text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  expires_at timestamptz not null,
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists db_offers_status_idx
  on public.db_offers (status, created_at desc);

create index if not exists db_offers_product_idx
  on public.db_offers (product_id);

alter table public.db_offers enable row level security;

drop policy if exists db_offers_public_insert on public.db_offers;
create policy db_offers_public_insert on public.db_offers
  for insert
  with check (true);

drop policy if exists db_offers_authenticated_all on public.db_offers;
create policy db_offers_authenticated_all on public.db_offers
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ===== END supabase\migrations\20260716_db_offers.sql =====

-- ===== BEGIN supabase\migrations\20260716_db_buyer_profiles.sql =====
-- Buyer profiles for Don Baraton storefront (linked to Supabase Auth shoppers)

create table if not exists public.db_buyer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  buyer_name text not null default '',
  buyer_email text not null default '',
  buyer_phone text not null default '',
  ship_address_line1 text not null default '',
  ship_address_line2 text not null default '',
  ship_city text not null default '',
  ship_state text not null default '',
  ship_postal text not null default '',
  ship_country text not null default 'US',
  preferred_payment text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.db_buyer_profiles enable row level security;

drop policy if exists "buyer_profiles_select_own" on public.db_buyer_profiles;
create policy "buyer_profiles_select_own"
  on public.db_buyer_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "buyer_profiles_insert_own" on public.db_buyer_profiles;
create policy "buyer_profiles_insert_own"
  on public.db_buyer_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "buyer_profiles_update_own" on public.db_buyer_profiles;
create policy "buyer_profiles_update_own"
  on public.db_buyer_profiles for update
  using (auth.uid() = user_id);

-- ===== END supabase\migrations\20260716_db_buyer_profiles.sql =====

-- ===== BEGIN supabase\migrations\20260806_store_branding_template.sql =====
-- Per-store HTML description template (classic | modern | editorial | luxury | fresh)
alter table public.store_branding
  add column if not exists template_id text not null default 'classic';

-- ===== END supabase\migrations\20260806_store_branding_template.sql =====

-- ===== BEGIN supabase\migrations\20260806_ebay_connections.sql =====
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

-- ===== END supabase\migrations\20260806_ebay_connections.sql =====

-- ===== db_offer_notifications (present in live, missing from migrations) =====
create table if not exists public.db_offer_notifications (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.db_offers (id) on delete set null,
  buyer_email text not null default '',
  buyer_name text not null default '',
  listing_slug text not null default '',
  listing_title text not null default '',
  listing_image_url text not null default '',
  list_price numeric(12,2),
  suggested_amount numeric(12,2),
  message text not null default '',
  status text not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.db_offer_notifications enable row level security;
drop policy if exists db_offer_notifications_authenticated_all on public.db_offer_notifications;
create policy db_offer_notifications_authenticated_all on public.db_offer_notifications
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- product-images bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set public = excluded.public;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists product_images_auth_write on storage.objects;
create policy product_images_auth_write on storage.objects
  for insert with check (bucket_id = 'product-images' and auth.role() in ('authenticated','service_role'));

drop policy if exists product_images_auth_update on storage.objects;
create policy product_images_auth_update on storage.objects
  for update using (bucket_id = 'product-images' and auth.role() in ('authenticated','service_role'));

drop policy if exists product_images_auth_delete on storage.objects;
create policy product_images_auth_delete on storage.objects
  for delete using (bucket_id = 'product-images' and auth.role() in ('authenticated','service_role'));

