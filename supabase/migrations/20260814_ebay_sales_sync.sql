-- Reflect eBay sales onto Higlou products
alter table public.products
  add column if not exists ebay_sold_qty integer,
  add column if not exists ebay_last_sold_at timestamptz;
