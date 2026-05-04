-- Batch 5 - Culture taxonomy.
--
-- Adds two reference tables (cultures, event_types) and three columns on
-- events (culture_primary, sub_culture, event_type) to support the new
-- /culture/[slug] landing page family. The 14 culture slugs are seeded
-- from the IA Blueprint v2.0:
--   Tier 1 (10): african, south-asian, caribbean, latin, east-asian,
--                filipino, mediterranean, middle-eastern, european, pacific
--   Tier 2 (4):  gospel, comedy, wellness, pride
--
-- All policies are anon-readable; writes are restricted to authenticated
-- users with admin role on public.users.
--
-- Idempotent: every CREATE / ALTER guarded by IF NOT EXISTS.

begin;

-- ----------------------------------------------------------------------
-- 1. cultures table
-- ----------------------------------------------------------------------
create table if not exists public.cultures (
  slug text primary key,
  display_name text not null,
  tier int2 not null check (tier in (1, 2)),
  tagline text,
  hero_query text,
  display_order int2 not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cultures is
  'Culture taxonomy for /culture/[slug] landing pages. Seeded from IA Blueprint v2.0.';

-- ----------------------------------------------------------------------
-- 2. event_types table
-- ----------------------------------------------------------------------
create table if not exists public.event_types (
  slug text primary key,
  display_name text not null,
  display_order int2 not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.event_types is
  'Event type / format taxonomy (e.g. concert, festival, workshop, club-night).';

-- ----------------------------------------------------------------------
-- 3. events column extensions
-- ----------------------------------------------------------------------
alter table public.events
  add column if not exists culture_primary text references public.cultures(slug) on delete set null,
  add column if not exists sub_culture text,
  add column if not exists event_type text references public.event_types(slug) on delete set null;

create index if not exists events_culture_primary_idx
  on public.events(culture_primary)
  where culture_primary is not null;

create index if not exists events_event_type_idx
  on public.events(event_type)
  where event_type is not null;

-- ----------------------------------------------------------------------
-- 4. Seed cultures (Tier 1)
-- ----------------------------------------------------------------------
insert into public.cultures (slug, display_name, tier, tagline, hero_query, display_order)
values
  ('african',          'African',          1, 'Every rhythm. Every region. One platform.',         'african celebration dance music vibrant crowd',      10),
  ('south-asian',      'South Asian',      1, 'Bollywood, bhangra, garba and beyond.',              'indian wedding sangeet bollywood dance celebration', 20),
  ('caribbean',        'Caribbean',        1, 'Carnival energy, all year round.',                    'caribbean carnival soca steel drum tropical',        30),
  ('latin',            'Latin',            1, 'Salsa, bachata, reggaeton: the heat lives here.',     'latin dance salsa club music vibrant',               40),
  ('east-asian',       'East Asian',       1, 'K-pop, Lunar, anime, J-rock: the full spectrum.',     'lunar new year red lanterns dragon celebration',     50),
  ('filipino',         'Filipino',         1, 'Fiesta. Family. Forever.',                            'filipino fiesta celebration parol traditional',      60),
  ('mediterranean',    'Mediterranean',    1, 'Italian, Greek, Spanish, Portuguese: la dolce vita.', 'italian festival pasta wine celebration warm',       70),
  ('middle-eastern',   'Middle Eastern',   1, 'Arabic, Persian, Turkish, Israeli: one stage.',       'middle eastern dabke dance celebration colorful',    80),
  ('european',         'European',         1, 'From Polish to French to Ukrainian, all here.',       'european festival folk dance celebration',           90),
  ('pacific',          'Pacific',          1, 'Maori, Samoan, Tongan, Fijian: islands in the room.', 'pacific islander polynesian dance celebration',     100)
on conflict (slug) do update set
  display_name = excluded.display_name,
  tier         = excluded.tier,
  tagline      = excluded.tagline,
  hero_query   = excluded.hero_query,
  display_order = excluded.display_order,
  updated_at   = now();

-- Tier 2 cross-cultural verticals
insert into public.cultures (slug, display_name, tier, tagline, hero_query, display_order)
values
  ('gospel',   'Gospel',   2, 'Worship. Praise. Together.',          'gospel choir worship raised hands joy',           200),
  ('comedy',   'Comedy',   2, 'Stand-up, sketch, improv, all of it.', 'comedy club stage microphone audience laughing',  210),
  ('wellness', 'Wellness', 2, 'Yoga, sound bath, breathwork, retreats.', 'yoga wellness meditation outdoor calm',         220),
  ('pride',    'Pride',    2, 'Queer culture, every culture, all welcome.', 'pride parade rainbow celebration joy',         230)
on conflict (slug) do update set
  display_name = excluded.display_name,
  tier         = excluded.tier,
  tagline      = excluded.tagline,
  hero_query   = excluded.hero_query,
  display_order = excluded.display_order,
  updated_at   = now();

-- ----------------------------------------------------------------------
-- 5. Seed event_types
-- ----------------------------------------------------------------------
insert into public.event_types (slug, display_name, display_order)
values
  ('concert',     'Concert',      10),
  ('festival',    'Festival',     20),
  ('club-night',  'Club night',   30),
  ('comedy-show', 'Comedy show',  40),
  ('workshop',    'Workshop',     50),
  ('conference',  'Conference',   60),
  ('community',   'Community',    70),
  ('religious',   'Religious',    80),
  ('sport',       'Sport',        90),
  ('exhibition',  'Exhibition',  100),
  ('food-drink',  'Food & drink', 110),
  ('family',      'Family',      120),
  ('other',       'Other',       999)
on conflict (slug) do update set
  display_name  = excluded.display_name,
  display_order = excluded.display_order,
  updated_at    = now();

-- ----------------------------------------------------------------------
-- 6. RLS policies (anon read; admin write)
-- ----------------------------------------------------------------------
alter table public.cultures    enable row level security;
alter table public.event_types enable row level security;

drop policy if exists "cultures_anon_select" on public.cultures;
create policy "cultures_anon_select" on public.cultures
  for select using (is_active = true);

drop policy if exists "cultures_admin_all" on public.cultures;
create policy "cultures_admin_all" on public.cultures
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

drop policy if exists "event_types_anon_select" on public.event_types;
create policy "event_types_anon_select" on public.event_types
  for select using (is_active = true);

drop policy if exists "event_types_admin_all" on public.event_types;
create policy "event_types_admin_all" on public.event_types
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

commit;
