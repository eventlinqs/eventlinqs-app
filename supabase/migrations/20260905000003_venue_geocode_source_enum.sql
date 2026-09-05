-- ============================================================================
-- VENUE GEOCODE SOURCE BECOMES A POSTGRES ENUM, 5 September 2026 (C1)
--
-- THE DEFECT THIS SERVES. 20260904000001 added events.venue_geocode_source as
-- TEXT with a CHECK on the three values, and the committed types then carried
-- the narrowing 'places' | 'geocoding' | 'manual' | null on that column. The
-- generator does not emit that for a TEXT column: it emits string | null, and
-- somebody wrote the union into the generated section by hand. The types-drift
-- guard reported it as unexplained drift on origin/main at dc71374e (CI run
-- 33942112287), beside two other hand edits made in the same file.
--
-- A hand-written union is a promise TypeScript keeps and the database does not
-- know about. This migration moves the promise into the database, where the
-- generator reads it back as Database["public"]["Enums"]["venue_geocode_source"]
-- on every regeneration and nobody writes it by hand again.
--
-- WHAT IT DOES, in order, in one transaction:
--   1. Refuses if any row holds a value outside the three. The CHECK already
--      forbids that, and the cast below would also fail, but a refusal with a
--      count in the message is faster to read than a cast error.
--   2. Creates public.venue_geocode_source as an enum of the same three values,
--      in the same order the CHECK listed them. Guarded so a re-run is a no-op.
--   3. Drops the CHECK, which the enum makes redundant.
--   4. Converts the column, casting each existing text value to the enum.
--      Nulls stay null: a null still reads as "unknown, pre-dates 2026-09-04".
--
-- WHAT DOES NOT CHANGE. The three values, their meaning, the null semantics,
-- the comment on the column, the partial index (it does not name the column),
-- the writers (the organiser actions and the venue backfill send the same
-- three strings, which Postgres casts to the enum on write) and
-- events_within_distance, which RETURNS SETOF events and follows the table.
--
-- Read on TEST and on production before writing this (C1 evidence,
-- C:\dev\EVIDENCE\C1\test-column-state-before.txt and
-- prod-column-state-before.txt): TEST holds 201 null and 6 'places', production
-- holds 4 null, both under CHECK events_venue_geocode_source_check.
-- ============================================================================

-- 1. No row may hold a value the enum cannot carry.
DO $$
DECLARE
  bad_rows integer;
BEGIN
  SELECT count(*) INTO bad_rows
  FROM public.events
  WHERE venue_geocode_source IS NOT NULL
    AND venue_geocode_source NOT IN ('places', 'geocoding', 'manual');
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'events.venue_geocode_source holds % row(s) outside places, geocoding and manual; repair the data before converting the column', bad_rows;
  END IF;
END
$$;

-- 2. The enum. Same three values, same order as the CHECK it replaces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'venue_geocode_source'
  ) THEN
    CREATE TYPE public.venue_geocode_source AS ENUM ('places', 'geocoding', 'manual');
  END IF;
END
$$;

COMMENT ON TYPE public.venue_geocode_source IS
  'Who wrote events.venue_latitude/longitude: places (organiser pick), geocoding (server geocode of typed text), manual (a person or a seed script). Replaces the CHECK from 20260904000001 so the generated types carry the union from the schema.';

-- 3. The CHECK is redundant once the column is the enum.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_venue_geocode_source_check;

-- 4. The column. Existing text values cast one to one; nulls stay null.
ALTER TABLE public.events
  ALTER COLUMN venue_geocode_source TYPE public.venue_geocode_source
    USING venue_geocode_source::public.venue_geocode_source;
