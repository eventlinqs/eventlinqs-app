-- Migration: 20260514121006_remove_non_au_cities.sql
-- Purpose: enforce the AU-first launch lock at the database layer.
--
-- Context (Batch 11.0 Round 3 Item D):
--   Vercel runtime logs surfaced real user traffic to non-AU city
--   routes such as /events/browse/manchester, /london, /new-york,
--   /lagos, /dublin, /accra. Those routes returned HTTP 200 because
--   the LAUNCH_TARGET_CITIES allow-list in
--   src/lib/locations/launch-cities.ts included 19 non-AU cities
--   for a future regional expansion that has been deferred.
--
--   The code-side fix trimmed LAUNCH_TARGET_CITIES to the 13 AU
--   cities and added a venue_country='Australia' filter on the
--   picker's DB lookup. This migration belt-and-braces the launch
--   lock at the DB layer:
--
--     1. Adds `country` column to public.cities with default 'AU'.
--     2. Backfills country='AU' on every existing row (all current
--        rows are AU cities).
--     3. Adds CHECK constraint `country = 'AU'` so any future
--        attempt to seed a non-AU city is rejected by Postgres.
--     4. Optional: deletes any existing non-AU row (none exist
--        today; statement is idempotent and safe to no-op).
--
-- To re-enable international markets, drop the CHECK constraint via
-- a new migration AND re-add the relevant entries to
-- LAUNCH_TARGET_CITIES in src/lib/locations/launch-cities.ts.
--
-- Idempotency: every statement guards with IF NOT EXISTS / IF EXISTS.
-- Safe to re-run.
--
-- Author: Batch 11.0 Round 3 Item D
-- Date: 2026-05-14

BEGIN;

-- ----------------------------------------------------------------------
-- 1. Add `country` column to public.cities (default 'AU', NOT NULL)
-- ----------------------------------------------------------------------
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'AU';

COMMENT ON COLUMN public.cities.country IS
  'ISO-3166-1 alpha-2 country code. AU-first launch lock: CHECK constraint enforces AU only until international expansion is re-enabled.';

-- ----------------------------------------------------------------------
-- 2. Backfill country='AU' on every existing row.
--    All current rows are AU cities; this is a safety pass in case
--    the column default did not apply to legacy rows.
-- ----------------------------------------------------------------------
UPDATE public.cities
SET country = 'AU'
WHERE country IS NULL OR country <> 'AU';

-- ----------------------------------------------------------------------
-- 3. Delete any non-AU rows that exist (none expected; idempotent).
--    Note: cities.slug is referenced by events.city_primary and
--    suburbs.city_slug, both with ON DELETE SET NULL / CASCADE.
--    No live data points at non-AU rows, so the DELETE is a no-op.
-- ----------------------------------------------------------------------
DELETE FROM public.cities WHERE country <> 'AU';

-- ----------------------------------------------------------------------
-- 4. CHECK constraint: cities must be country = 'AU' (launch lock).
-- ----------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cities_country_au_only'
      AND conrelid = 'public.cities'::regclass
  ) THEN
    ALTER TABLE public.cities
      ADD CONSTRAINT cities_country_au_only
      CHECK (country = 'AU');
  END IF;
END $$;

COMMENT ON CONSTRAINT cities_country_au_only ON public.cities IS
  'AU-first launch lock (Batch 11.0 Round 3). To enable international markets, drop this constraint via a new migration AND re-add the relevant entries to LAUNCH_TARGET_CITIES in src/lib/locations/launch-cities.ts.';

COMMIT;

-- ----------------------------------------------------------------------
-- Post-migration verification (run manually after `supabase db push --linked`):
--
--   SELECT country, count(*) FROM public.cities GROUP BY country;
--   -- expect: AU = 20 rows, no other countries.
--
--   INSERT INTO public.cities (slug, name, state, country, tier, latitude, longitude)
--     VALUES ('test-non-au', 'Test', 'NA', 'GB', 2, 0, 0);
--   -- expect: ERROR: new row violates check constraint "cities_country_au_only"
-- ----------------------------------------------------------------------
