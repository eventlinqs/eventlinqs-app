-- Batch 6 - City + suburb taxonomy.
--
-- Adds two reference tables (cities, suburbs) and three columns on events
-- (city_primary, suburb_primary, event_type) to back the new /city/[slug]
-- and /city/[slug]/[suburb] landing page family. Also extends the
-- existing event_types seed with the 8-type taxonomy used on city pages.
--
-- 20 cities (8 Tier 1 + 12 Tier 2), AU-only for v1. 24 suburbs across
-- the 7 Tier 1 cities that carry sub-pages (Sydney 6, Melbourne 6,
-- Brisbane 4, Perth 4, Gold Coast 2, Canberra 1, Hobart 1).
--
-- All policies are anon-readable; writes restricted to admin role on
-- public.users. Idempotent: every CREATE / ALTER guarded.
--
-- event_type column already added in 20260504000002_culture_taxonomy
-- (do not duplicate). city_primary / suburb_primary are new.

begin;

-- ----------------------------------------------------------------------
-- 1. cities table
-- ----------------------------------------------------------------------
create table if not exists public.cities (
  slug text primary key,
  name text not null,
  state text not null,
  region text,
  tier int2 not null check (tier in (1, 2)),
  population int4,
  latitude real not null,
  longitude real not null,
  description text,
  hero_query text,
  display_order int2 not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cities is
  'AU city taxonomy for /city/[slug] landing pages (Batch 6).';

-- ----------------------------------------------------------------------
-- 2. suburbs table
-- ----------------------------------------------------------------------
create table if not exists public.suburbs (
  slug text primary key,
  city_slug text not null references public.cities(slug) on delete cascade,
  name text not null,
  latitude real not null,
  longitude real not null,
  description text,
  hero_query text,
  display_order int2 not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.suburbs is
  'Tier 1 city suburbs for /city/[slug]/[suburb] landing pages (Batch 6).';

create index if not exists suburbs_city_slug_idx on public.suburbs(city_slug);

-- ----------------------------------------------------------------------
-- 3. events column extensions (city_primary + suburb_primary).
--    event_type column already added in 20260504000002_culture_taxonomy.
-- ----------------------------------------------------------------------
alter table public.events
  add column if not exists city_primary text references public.cities(slug) on delete set null,
  add column if not exists suburb_primary text references public.suburbs(slug) on delete set null;

create index if not exists events_city_primary_idx
  on public.events(city_primary)
  where city_primary is not null;

create index if not exists events_suburb_primary_idx
  on public.events(suburb_primary)
  where suburb_primary is not null;

-- ----------------------------------------------------------------------
-- 4. Seed cities (Tier 1: 8 capital + Gold Coast)
-- ----------------------------------------------------------------------
insert into public.cities (slug, name, state, region, tier, population, latitude, longitude, hero_query, display_order, description) values
  ('sydney',       'Sydney',       'NSW', 'Greater Sydney',         1, 5312000, -33.8688,  151.2093, 'sydney harbour bridge opera house skyline',     10, 'Australia''s largest city and cultural melting pot.'),
  ('melbourne',    'Melbourne',    'VIC', 'Greater Melbourne',      1, 5078000, -37.8136,  144.9631, 'melbourne city laneway tram skyline',           20, 'Australia''s arts and live music capital.'),
  ('brisbane',     'Brisbane',     'QLD', 'South East Queensland',  1, 2560000, -27.4698,  153.0251, 'brisbane river skyline story bridge',           30, 'Sunbelt capital with a year-round festival calendar.'),
  ('perth',        'Perth',        'WA',  'Perth Metropolitan',     1, 2192000, -31.9523,  115.8613, 'perth swan river skyline sunset',               40, 'Western capital with deep multicultural roots.'),
  ('adelaide',     'Adelaide',     'SA',  'Greater Adelaide',       1, 1402000, -34.9285,  138.6007, 'adelaide city park architecture',               50, 'The festival city.'),
  ('gold-coast',   'Gold Coast',   'QLD', 'South East Queensland',  1, 727000,  -28.0167,  153.4000, 'gold coast beach surfers paradise skyline',     60, 'Beach city, festival weekends, theme parks.'),
  ('canberra',     'Canberra',     'ACT', 'Australian Capital Territory', 1, 463000, -35.2809, 149.1300, 'canberra parliament lake architecture',  70, 'National capital, embassies, civic events.'),
  ('hobart',       'Hobart',       'TAS', 'Greater Hobart',         1, 251000,  -42.8821,  147.3272, 'hobart harbour mount wellington',               80, 'Mountain-and-sea capital, MONA, dark mofo.'),
  -- Tier 2 cities
  ('newcastle',    'Newcastle',    'NSW', 'Hunter Region',          2, 322000,  -32.9283,  151.7817, 'newcastle beach harbour city',                  110, 'Coal river city turned coastal arts hub.'),
  ('wollongong',   'Wollongong',   'NSW', 'Illawarra',              2, 308000,  -34.4278,  150.8931, 'wollongong beach lighthouse coastline',         120, 'Steel city by the sea, university town.'),
  ('geelong',      'Geelong',      'VIC', 'Greater Geelong',        2, 290000,  -38.1499,  144.3617, 'geelong waterfront cunningham pier',            130, 'Bayside Victorian city, growing arts scene.'),
  ('townsville',   'Townsville',   'QLD', 'North Queensland',       2, 195000,  -19.2589,  146.8169, 'townsville magnetic island tropical',           140, 'Tropical north Queensland anchor.'),
  ('cairns',       'Cairns',       'QLD', 'Far North Queensland',   2, 152000,  -16.9186,  145.7781, 'cairns tropical beach palm trees',              150, 'Reef gateway, tropical festival town.'),
  ('darwin',       'Darwin',       'NT',  'Top End',                2, 147000,  -12.4634,  130.8456, 'darwin tropical waterfront sunset',             160, 'Top End capital, Asian-Pacific crossroads.'),
  ('sunshine-coast','Sunshine Coast','QLD','South East Queensland', 2, 333000,  -26.6500,  153.0667, 'sunshine coast beach hinterland',               170, 'Beach hinterland lifestyle, growing music scene.'),
  ('bendigo',      'Bendigo',      'VIC', 'Loddon Mallee',          2, 100000,  -36.7570,  144.2794, 'bendigo heritage architecture city',            180, 'Goldfields heritage city.'),
  ('ballarat',     'Ballarat',     'VIC', 'Central Highlands',      2, 109000,  -37.5622,  143.8503, 'ballarat heritage gold rush architecture',      190, 'Goldfields city, heritage festivals.'),
  ('albury',       'Albury',       'NSW', 'Murray Region',          2, 56000,   -36.0737,  146.9135, 'albury murray river city',                      200, 'Border twin city on the Murray.'),
  ('launceston',   'Launceston',   'TAS', 'Northern Tasmania',      2, 107000,  -41.4332,  147.1441, 'launceston tasmania heritage city',             210, 'Northern Tasmanian gateway to the Tamar Valley.'),
  ('toowoomba',    'Toowoomba',    'QLD', 'Darling Downs',          2, 142000,  -27.5598,  151.9507, 'toowoomba garden city heritage',                220, 'Garden city of Queensland''s downs.')
on conflict (slug) do update set
  name          = excluded.name,
  state         = excluded.state,
  region        = excluded.region,
  tier          = excluded.tier,
  population    = excluded.population,
  latitude      = excluded.latitude,
  longitude     = excluded.longitude,
  hero_query    = excluded.hero_query,
  display_order = excluded.display_order,
  description   = excluded.description,
  updated_at    = now();

-- ----------------------------------------------------------------------
-- 5. Seed suburbs (24 across 7 Tier 1 cities that carry suburb pages)
-- ----------------------------------------------------------------------
insert into public.suburbs (slug, city_slug, name, latitude, longitude, hero_query, display_order, description) values
  -- Sydney 6
  ('sydney-inner-west',        'sydney',     'Inner West',          -33.8966, 151.1656, 'newtown sydney street art cafe culture people',        10, 'Newtown, Marrickville, Enmore: live music, art, food.'),
  ('sydney-north-shore',       'sydney',     'North Shore',         -33.8000, 151.2100, 'north sydney harbour bridge skyline elegant',          20, 'Mosman, Chatswood, North Sydney: harbour-side polish.'),
  ('sydney-eastern-suburbs',   'sydney',     'Eastern Suburbs',     -33.8915, 151.2767, 'bondi beach sydney sunset surfers',                    30, 'Bondi, Coogee, Paddington: beaches and brunches.'),
  ('sydney-western-sydney',    'sydney',     'Western Sydney',      -33.8150, 150.9953, 'parramatta sydney diverse multicultural community',    40, 'Parramatta, Blacktown, Liverpool: every culture in one postcode.'),
  ('sydney-northern-beaches',  'sydney',     'Northern Beaches',    -33.7969, 151.2842, 'manly beach sydney boardwalk lifestyle',               50, 'Manly to Palm Beach: 30km of coast.'),
  ('sydney-sutherland-shire',  'sydney',     'Sutherland Shire',    -34.0290, 151.1592, 'cronulla beach sydney wave surfers',                   60, 'Cronulla, Sutherland: surf culture.'),
  -- Melbourne 6
  ('melbourne-inner-melbourne','melbourne',  'Inner Melbourne',     -37.8136, 144.9631, 'melbourne laneway street art cafe culture',            10, 'CBD, Fitzroy, Carlton: laneway culture and live music.'),
  ('melbourne-eastern-suburbs','melbourne',  'Eastern Suburbs',     -37.8500, 145.1500, 'melbourne suburbs leafy residential lifestyle',        20, 'Box Hill, Camberwell: leafy residential, growing live scene.'),
  ('melbourne-western-suburbs','melbourne',  'Western Suburbs',     -37.7995, 144.8980, 'footscray melbourne diverse multicultural',            30, 'Footscray, Sunshine: most diverse postcodes in the country.'),
  ('melbourne-northern-suburbs','melbourne', 'Northern Suburbs',    -37.7700, 144.9614, 'brunswick melbourne street culture creative',          40, 'Brunswick, Coburg, Preston: creative streets and warehouse parties.'),
  ('melbourne-southern-suburbs','melbourne', 'Southern Suburbs',    -37.8400, 144.9890, 'south yarra melbourne cafe lifestyle',                 50, 'South Yarra, Prahran, Toorak: nightlife and dining.'),
  ('melbourne-bayside',        'melbourne',  'Bayside',             -37.8700, 144.9800, 'st kilda melbourne beach palm trees lifestyle',        60, 'St Kilda, Brighton: bay beaches and venues.'),
  -- Brisbane 4
  ('brisbane-inner-city',      'brisbane',   'Inner City',          -27.4698, 153.0251, 'south bank brisbane river lifestyle people',           10, 'CBD, South Brisbane, Kangaroo Point: river precincts and arts.'),
  ('brisbane-north-side',      'brisbane',   'North Side',          -27.4140, 153.0470, 'brisbane suburbs queensland sunny residential',        20, 'Chermside, Aspley, Stafford: large family suburbs.'),
  ('brisbane-south-side',      'brisbane',   'South Side',          -27.5400, 153.0600, 'brisbane south side queensland lifestyle',             30, 'Sunnybank, Mt Gravatt: Asian-Australian food and culture.'),
  ('brisbane-west-end',        'brisbane',   'West End / Fortitude Valley', -27.4795, 153.0252, 'fortitude valley brisbane street culture nightlife', 40, 'West End, Fortitude Valley: nightlife and live music spine.'),
  -- Perth 4
  ('perth-inner-perth',        'perth',      'Inner Perth',         -31.9523, 115.8613, 'perth city kings park people lifestyle',                10, 'Perth CBD, Northbridge, Subiaco: nightlife and cultural quarter.'),
  ('perth-northern-suburbs',   'perth',      'Northern Suburbs',    -31.8000, 115.7670, 'perth coastal beach scarborough sunset',                20, 'Joondalup, Scarborough: northern beaches and family suburbs.'),
  ('perth-southern-suburbs',   'perth',      'Southern Suburbs',    -32.0560, 115.7440, 'fremantle perth markets street culture people',         30, 'Fremantle, Cockburn: port culture and markets.'),
  ('perth-coastal',            'perth',      'Coastal',             -31.8970, 115.7570, 'perth scarborough beach sunset surfers',                40, 'Scarborough, Cottesloe: surf and sunset venues.'),
  -- Gold Coast 2
  ('gold-coast-surfers-paradise','gold-coast','Surfers Paradise',   -28.0023, 153.4145, 'surfers paradise beach gold coast people lifestyle',    10, 'Beachfront highrise nightlife strip.'),
  ('gold-coast-broadbeach',    'gold-coast', 'Broadbeach',          -28.0356, 153.4317, 'broadbeach gold coast beach lifestyle people',          20, 'Casino, dining, family-friendly beach precinct.'),
  -- Canberra 1
  ('canberra-civic',           'canberra',   'Civic',               -35.2809, 149.1300, 'canberra civic centre people lifestyle',                10, 'Civic and Braddon: central nightlife and arts.'),
  -- Hobart 1
  ('hobart-inner-city',        'hobart',     'Inner City',          -42.8821, 147.3272, 'hobart salamanca markets people lifestyle',             10, 'Salamanca, Battery Point: heritage waterfront precinct.')
on conflict (slug) do update set
  city_slug     = excluded.city_slug,
  name          = excluded.name,
  latitude      = excluded.latitude,
  longitude     = excluded.longitude,
  hero_query    = excluded.hero_query,
  display_order = excluded.display_order,
  description   = excluded.description,
  updated_at    = now();

-- ----------------------------------------------------------------------
-- 6. Extend event_types with the 8-type city-page taxonomy.
--    Adds 'dj-set' and 'cultural'; reuses concert/comedy/theatre/workshop/
--    food-drink/sport from 20260504000002_culture_taxonomy seed.
-- ----------------------------------------------------------------------
insert into public.event_types (slug, display_name, display_order) values
  ('dj-set',   'DJ Sets',  35),
  ('cultural', 'Cultural', 105)
on conflict (slug) do update set
  display_name  = excluded.display_name,
  display_order = excluded.display_order,
  updated_at    = now();

-- ----------------------------------------------------------------------
-- 7. RLS - cities + suburbs anon read; admin write.
-- ----------------------------------------------------------------------
alter table public.cities  enable row level security;
alter table public.suburbs enable row level security;

drop policy if exists "cities_anon_select" on public.cities;
create policy "cities_anon_select" on public.cities
  for select using (is_active = true);

drop policy if exists "cities_admin_all" on public.cities;
create policy "cities_admin_all" on public.cities
  for all using (
    exists (select 1 from public.admin_users a where a.id = auth.uid() and a.disabled_at is null and a.role in ('super_admin', 'admin'))
  );

drop policy if exists "suburbs_anon_select" on public.suburbs;
create policy "suburbs_anon_select" on public.suburbs
  for select using (is_active = true);

drop policy if exists "suburbs_admin_all" on public.suburbs;
create policy "suburbs_admin_all" on public.suburbs
  for all using (
    exists (select 1 from public.admin_users a where a.id = auth.uid() and a.disabled_at is null and a.role in ('super_admin', 'admin'))
  );

-- ----------------------------------------------------------------------
-- 8. Backfill city_primary on existing seed events using venue_city ilike.
--    Soft pass: only updates rows where city_primary is currently null and
--    a single city slug matches. Idempotent.
-- ----------------------------------------------------------------------
update public.events e
   set city_primary = c.slug
  from public.cities c
 where e.city_primary is null
   and e.venue_city is not null
   and lower(e.venue_city) like '%' || lower(c.name) || '%';

commit;
