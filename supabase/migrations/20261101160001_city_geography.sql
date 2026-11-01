-- CITY FIRST, DIRECTIVE 3: A CITY IS A PLACE, READ FROM THE POINT (the CONTROLLER's 1 November 2026 15:32; the model at
-- C:\dev\EVIDENCE\CITY-FIRST-1NOV\data-model.md). Until now a listing's city was whatever text it carried: production
-- held 8 upcoming 'Geelong' events at Aireys Pub, Aireys Inlet, 41 km away in Surf Coast Shire.
--
-- (1) city_geography: each guide city as ABS codes (ASGS Edition 3, 2021; CC BY 4.0, 'Based on ABS data'), each read
--     from the ABS's public map service by placing the city's own centre (saved at C:\dev\EVIDENCE\CITY-FIRST-1NOV\w1\
--     src\city-centres-abs.txt), never typed from memory: its Urban Centre (the city), its council or, for Melbourne,
--     Greater Melbourne (the surroundings), its Tourism Region (the region, the boundaries Victoria's Tourism Regions
--     2022 is built on). Public reference data: anyone may read it.
-- (2) venues gain their placement: Urban Centre, council, gazetted suburb, Greater Capital City area and Tourism Region,
--     with the time and the point they were placed from. Written only by scripts/ops/place-venues-abs.mjs.
-- (3) venue_city_relation(city, venue): city, surrounding, region, outside, or unplaced. One function, so the guide,
--     the coverage report and every count read the same rule. A placement taken from an older point is not a placement.

create table if not exists public.city_geography (
  city_slug text primary key references public.cities (slug) on update cascade on delete restrict,
  ucl_code text not null,
  surround_lga_codes text[] not null default '{}',
  surround_gccsa_code text,
  region_tr_code text not null,
  region_name text not null,
  radius_steps_km integer[] not null default '{10, 25, 50}',
  source_note text not null,
  checked_on date not null,
  check (cardinality(surround_lga_codes) > 0 or surround_gccsa_code is not null)
);

alter table public.city_geography enable row level security;
drop policy if exists city_geography_read on public.city_geography;
create policy city_geography_read on public.city_geography for select using (true);
revoke all on table public.city_geography from anon, authenticated, service_role;
grant select on table public.city_geography to anon, authenticated;
grant select, insert, update, delete on table public.city_geography to service_role;

comment on table public.city_geography is
  'City first (1 November 2026): each guide city as ABS ASGS 2021 codes: Urban Centre (the city), council or Greater Capital City area (the surroundings), Tourism Region (the region). Based on ABS data, CC BY 4.0.';

insert into public.city_geography (city_slug, ucl_code, surround_lga_codes, surround_gccsa_code, region_tr_code, region_name, source_note, checked_on)
values
  ('geelong', '203003', array['22750'], null, '2R140', 'Geelong and the Bellarine',
   'ABS ASGS 2021 UCL, LGA and TR layers, read by placing the city centre, 1 November 2026', '2026-11-01'),
  ('ballarat', '203001', array['20570'], null, '2R170', 'Ballarat',
   'ABS ASGS 2021 UCL, LGA and TR layers, read by placing the city centre, 1 November 2026', '2026-11-01'),
  ('bendigo', '203002', array['22620'], null, '2R060', 'Bendigo Loddon',
   'ABS ASGS 2021 UCL, LGA and TR layers, read by placing the city centre, 1 November 2026', '2026-11-01'),
  ('melbourne', '201001', array[]::text[], '2GMEL', '2R010', 'Melbourne',
   'ABS ASGS 2021 UCL, GCCSA and TR layers, read by placing the city centre, 1 November 2026', '2026-11-01')
on conflict (city_slug) do nothing;

alter table public.venues add column if not exists abs_ucl_code text;
alter table public.venues add column if not exists abs_ucl_name text;
alter table public.venues add column if not exists abs_lga_code text;
alter table public.venues add column if not exists abs_lga_name text;
alter table public.venues add column if not exists abs_sal_code text;
alter table public.venues add column if not exists abs_sal_name text;
alter table public.venues add column if not exists abs_gccsa_code text;
alter table public.venues add column if not exists abs_tr_code text;
alter table public.venues add column if not exists abs_tr_name text;
alter table public.venues add column if not exists abs_placed_at timestamptz;
alter table public.venues add column if not exists abs_placed_latitude double precision;
alter table public.venues add column if not exists abs_placed_longitude double precision;

comment on column public.venues.abs_placed_at is
  'When scripts/ops/place-venues-abs.mjs placed this venue in the ABS ASGS 2021 areas, from abs_placed_latitude and abs_placed_longitude. A placement from a point that is no longer the venue''s is not used.';

create or replace function public.venue_city_relation(p_city text, p_venue uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when v.id is null or g.city_slug is null then 'unplaced'
    -- A placement taken from an older point is not a placement: the venue moved, so it is placed again first.
    when v.abs_placed_at is null or v.latitude is distinct from v.abs_placed_latitude
         or v.longitude is distinct from v.abs_placed_longitude then 'unplaced'
    when v.abs_ucl_code = g.ucl_code then 'city'
    when v.abs_lga_code = any (g.surround_lga_codes)
         or (g.surround_gccsa_code is not null and v.abs_gccsa_code = g.surround_gccsa_code) then 'surrounding'
    when v.abs_tr_code = g.region_tr_code then 'region'
    else 'outside'
  end
  from (select 1) one
  left join public.venues v on v.id = p_venue
  left join public.city_geography g on g.city_slug = p_city
$$;

revoke all on function public.venue_city_relation(text, uuid) from public;
grant execute on function public.venue_city_relation(text, uuid) to anon, authenticated, service_role;

comment on function public.venue_city_relation(text, uuid) is
  'City first: how a venue stands to a guide city (city, surrounding, region, outside, unplaced), from its ABS placement and city_geography. The one rule the guide and the coverage report read.';
