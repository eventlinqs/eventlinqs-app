-- ============================================================================
-- VENUE GEOCODE PROVENANCE (Scope v5, 3.1.1), 4 September 2026
--
-- THE DEFECT THIS SERVES. events.venue_latitude, venue_longitude and
-- venue_place_id have existed since the baseline schema and the organiser form
-- never wrote them: every event a real organiser created had null coordinates
-- and never appeared on its city map (scope audit, 3 September 2026). The form
-- now fills them from a Places pick, and a server-side geocode fills them for a
-- typed address. Two writers need provenance, or the backfill cannot tell a
-- Places pick (the organiser chose that building) from a geocode of typed text
-- (a best guess it may overwrite) from a value somebody set by hand.
--
--   venue_geocode_source   'places'    the organiser picked it from Places
--                          'geocoding' the Geocoding API resolved typed text
--                          'manual'    written by a person or a seed script
--   venue_geocoded_at      when the coordinates were last written
--
-- The backfill (scripts/ops/backfill-venue-coordinates.mjs) selects rows whose
-- coordinates are null and never touches a row whose source is 'places'.
--
-- Additive only, no backfill of existing rows, no trigger: existing coordinates
-- (seeded events) keep a null source, which reads as "unknown" and is exactly
-- what it is.
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS venue_geocode_source TEXT
    CHECK (venue_geocode_source IN ('places', 'geocoding', 'manual')),
  ADD COLUMN IF NOT EXISTS venue_geocoded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.events.venue_geocode_source IS
  'Who wrote venue_latitude/longitude: places (organiser pick), geocoding (server geocode of typed text), manual. Null = unknown (pre-dates 2026-09-04).';
COMMENT ON COLUMN public.events.venue_geocoded_at IS
  'When venue_latitude/longitude were last written.';

-- The backfill's working set: events with an address and no coordinates.
CREATE INDEX IF NOT EXISTS idx_events_venue_ungeocoded
  ON public.events (id)
  WHERE venue_latitude IS NULL AND venue_address IS NOT NULL;
