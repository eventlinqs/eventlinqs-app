-- =============================================================================
-- 20260628000001_events_is_seed_data.sql
--
-- Mark sample/demo catalogue events at the DATA LAYER so real organiser events
-- can be filtered instantly and a seeded event is never mistaken for a real,
-- purchasable one.
--
--   is_seed_data = true  -> sample/demo catalogue row (never a real sale)
--   is_seed_data = false -> a real organiser-created event (the default)
--
-- Filter real events with `WHERE is_seed_data = false`. At Production promotion,
-- `DELETE FROM events WHERE is_seed_data` wipes every seeded row (tiers cascade).
--
-- SAFE EVERYWHERE: default false, so applying this to Production never marks a
-- real event as seed. The TEST backfill (marking the existing demo catalogue as
-- seed) is done by the seeder under a TEST-only guard, NOT in this migration, so
-- this file is harmless if it is ever applied to Production.
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_seed_data boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.is_seed_data IS
  'TRUE = sample/demo catalogue event (never a real organiser sale). Filter real events with is_seed_data = false; DELETE ... WHERE is_seed_data removes all seed data at production promotion.';

-- Partial index: the only hot query is "the seed rows" (for cleanup/filtering).
CREATE INDEX IF NOT EXISTS idx_events_is_seed_data
  ON public.events (is_seed_data) WHERE is_seed_data = true;
