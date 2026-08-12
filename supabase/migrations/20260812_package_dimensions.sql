-- Persist measured / suggested package weight & dimensions for Calculated shipping
alter table public.products
  add column if not exists package_weight_lbs integer not null default 0,
  add column if not exists package_weight_oz integer not null default 0,
  add column if not exists package_length_in numeric(8,2) not null default 0,
  add column if not exists package_width_in numeric(8,2) not null default 0,
  add column if not exists package_depth_in numeric(8,2) not null default 0,
  add column if not exists package_source text not null default 'auto';

comment on column public.products.package_source is 'auto = heuristic suggestion; manual = seller measured box';
