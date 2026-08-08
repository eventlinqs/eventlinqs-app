-- Category taxonomy repair.
--
-- RENUMBERED 20260808000001 -> 20260808000004 on 2026-08-08.
-- feat/launch-kit-moat carries its own 20260808000001 (city_primary_backfill),
-- plus ...000002 and ...000003, and is applying them to TEST now. Supabase
-- records applied migrations by the version prefix, so once that session
-- applied 20260808000001 this file would have been treated as already applied
-- and SKIPPED SILENTLY on merge: no error, no output, and the banned word plus
-- two dead homepage tiles would have stayed live with every gate green. That is
-- the exact defect class this sweep exists to find, so it is recorded here
-- rather than quietly renamed.
--
-- Three defects, one root: the code and the data disagree about the category
-- taxonomy, and nothing checks that they agree.
--
-- 1. THE BANNED WORD IS ON EVERY PUBLIC SURFACE. event_categories holds
--    slug 'arts-culture' with name 'Arts & Culture'. CLAUDE.md bans that word
--    "everywhere, in every form ... route names, file names, slugs,
--    identifiers, database tables/columns, and data". It renders as
--    "ARTS & CULTURE" on the events browse filter chips, on every city
--    landing's highlight cards, and on the event detail page of every event in
--    that category. Measured on the deployed preview: 19 of 62 walked surfaces.
--
-- 2. THE HOMEPAGE ARTS TILE MATCHES NOTHING. category-nav-rail.tsx offers
--    { slug: 'arts-community', name: 'Arts and theatre' } and links to
--    /events?category=arts-community. The fetcher looks that slug up in
--    event_categories, finds no row, and deliberately forces an empty result
--    (fetchers.ts, the '00000000-...' guard). So the tile resolves 200 to a
--    permanently empty page.
--
-- 3. THE HOMEPAGE COMEDY TILE MATCHES NOTHING. Same mechanism: a 'comedy'
--    tile and a homepage Comedy rail, and no 'comedy' row has ever existed.
--    Comedy is the fastest-growing ticketing category in Australia (LPA, and
--    CLAUDE.md Law 3 cites it), so this is not a marginal tile.
--
-- Renaming 'arts-culture' to 'arts-community' fixes 1 and 2 with one change,
-- because the slug the code already asks for is the slug that does not carry
-- the banned word. Events reference the category by UUID, so no event row has
-- to move and no published event changes category.
--
-- Idempotent: safe to re-run, and safe on a database where a previous attempt
-- created either row.

BEGIN;

-- 1 + 2. The banned word leaves the data, and the slug the homepage asks for
-- starts existing. Guarded so re-running cannot collide with an already
-- corrected row.
UPDATE public.event_categories
SET slug = 'arts-community',
    name = 'Arts and Theatre'
WHERE slug = 'arts-culture'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_categories WHERE slug = 'arts-community'
  );

-- If both somehow exist, the old row keeps its events but must not keep the
-- banned name on a public surface.
UPDATE public.event_categories
SET name = 'Arts and Theatre'
WHERE slug = 'arts-culture';

-- 3. Comedy becomes a real category rather than a tile pointing at nothing.
-- icon and is_active are set explicitly so the row behaves like every other
-- category on the filter chips rather than rendering without an icon.
INSERT INTO public.event_categories (slug, name, icon, is_active, sort_order)
SELECT
  'comedy',
  'Comedy',
  'mic',
  true,
  COALESCE((SELECT MAX(sort_order) FROM public.event_categories), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_categories WHERE slug = 'comedy'
);

-- Published events that are already tagged 'comedy' but carry no category (or
-- were filed under the arts row because comedy did not exist) are filed under
-- it, so the tile and the homepage rail have something to show on day one.
-- Only events whose tags SAY comedy are moved: nothing is guessed.
UPDATE public.events e
SET category_id = (SELECT id FROM public.event_categories WHERE slug = 'comedy')
-- @> rather than ? so no driver can read the operator as a bind placeholder.
WHERE e.tags @> '["comedy"]'::jsonb
  AND (
    e.category_id IS NULL
    OR e.category_id = (SELECT id FROM public.event_categories WHERE slug = 'arts-community')
  );

COMMIT;

-- Verification (run after applying):
--   select slug, name from public.event_categories
--    where slug in ('arts-culture','arts-community','comedy');
--   -- expect: arts-community | Arts and Theatre
--   --         comedy         | Comedy
--   --         and NO arts-culture row
--
--   select count(*) from public.event_categories where name ilike '%cultur%';
--   -- expect: 0
