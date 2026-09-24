-- Persist Facebook-ready CDN image for /go Open Graph scrapes
alter table public.smart_links
  add column if not exists og_image_url text;
