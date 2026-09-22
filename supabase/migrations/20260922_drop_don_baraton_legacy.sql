-- Drop legacy Don Baratón marketplace tables no longer used by Higlou Affiliate.
-- Safe: Amazon Affiliates + Facebook Ads do not read these tables.
-- Keep product-images / higlou-secrets buckets.

drop table if exists public.don_baraton_order_items cascade;
drop table if exists public.don_baraton_shipments cascade;
drop table if exists public.don_baraton_orders cascade;
drop table if exists public.don_baraton_listings cascade;

-- Legacy storefront catalog (Don Baratón shop) — not used by Affiliate flow
drop table if exists public.db_product_images cascade;
drop table if exists public.db_products cascade;

-- Storage bucket leftovers (ignore if already gone)
delete from storage.objects where bucket_id = 'don-baraton-images';
delete from storage.buckets where id = 'don-baraton-images';
