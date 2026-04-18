-- =============================================================================
-- 20260418000001_add_geo_and_pricing_columns.sql
--
-- Stream A / Session 2B.
--
-- Adds efficient filter scaffolding for the /events page:
--   1. events.is_free           — boolean cache of "all tiers are $0"
--   2. events.venue_latitude/longitude + idx — venue coords for distance filter
--   3. events_within_distance() — Haversine RPC used by the distance filter
--   4. profiles.preferred_city  — user-chosen city, shape mirrors el_city cookie
--   5. Backfill venue coords for seed events by venue_city match
--
-- Idempotent: every ALTER uses IF NOT EXISTS, every CREATE uses OR REPLACE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. is_free column + trigger
-- -----------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;

-- One-time backfill: flag events whose highest tier price is 0.
UPDATE events SET is_free = true
WHERE id IN (
  SELECT event_id FROM ticket_tiers
  GROUP BY event_id
  HAVING MAX(price) = 0
);

CREATE OR REPLACE FUNCTION update_event_is_free()
RETURNS TRIGGER AS $$
DECLARE
  target_event uuid;
BEGIN
  target_event := COALESCE(NEW.event_id, OLD.event_id);
  UPDATE events SET is_free = (
    SELECT COALESCE(MAX(price), 0) = 0
    FROM ticket_tiers
    WHERE event_id = target_event
  ) WHERE id = target_event;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_event_is_free ON ticket_tiers;
CREATE TRIGGER trg_update_event_is_free
AFTER INSERT OR UPDATE OR DELETE ON ticket_tiers
FOR EACH ROW EXECUTE FUNCTION update_event_is_free();

-- -----------------------------------------------------------------------------
-- 2. Venue coords + index
-- -----------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_latitude  NUMERIC(10,7);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_longitude NUMERIC(10,7);

CREATE INDEX IF NOT EXISTS idx_events_venue_coords
  ON events(venue_latitude, venue_longitude)
  WHERE venue_latitude IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Haversine distance RPC
--    Returns full event rows within p_radius_km of (p_lat, p_lng).
--    Uses the standard 6371 km earth radius.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events_within_distance(
  p_lat NUMERIC,
  p_lng NUMERIC,
  p_radius_km NUMERIC
) RETURNS SETOF events AS $$
  SELECT *
  FROM events
  WHERE venue_latitude IS NOT NULL
    AND venue_longitude IS NOT NULL
    AND 6371 * acos(
      cos(radians(p_lat)) * cos(radians(venue_latitude)) *
      cos(radians(venue_longitude) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(venue_latitude))
    ) <= p_radius_km;
$$ LANGUAGE sql STABLE;

-- -----------------------------------------------------------------------------
-- 4. profiles.preferred_city
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_city JSONB;
COMMENT ON COLUMN profiles.preferred_city IS
  'User-selected city. Shape: {city, country, countryCode, latitude, longitude}';

-- -----------------------------------------------------------------------------
-- 5. Seed-event coord backfill
--    Approximate city-centre coords so /events?distance=N has data to match on.
--    Only updates rows where coords are currently null to avoid stomping on
--    organiser-entered precise coords.
-- -----------------------------------------------------------------------------
UPDATE events SET venue_latitude = -37.8136, venue_longitude = 144.9631
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Melbourne';
UPDATE events SET venue_latitude = -33.8688, venue_longitude = 151.2093
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Sydney';
UPDATE events SET venue_latitude = -27.4698, venue_longitude = 153.0251
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Brisbane';
UPDATE events SET venue_latitude = -31.9523, venue_longitude = 115.8613
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Perth';
UPDATE events SET venue_latitude = -34.9285, venue_longitude = 138.6007
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Adelaide';
UPDATE events SET venue_latitude = -36.8485, venue_longitude = 174.7633
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Auckland';
UPDATE events SET venue_latitude = 51.5074,  venue_longitude = -0.1278
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'London';
UPDATE events SET venue_latitude = 53.4808,  venue_longitude = -2.2426
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Manchester';
UPDATE events SET venue_latitude = 43.6532,  venue_longitude = -79.3832
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Toronto';
UPDATE events SET venue_latitude = 40.7128,  venue_longitude = -74.0060
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'New York';
UPDATE events SET venue_latitude = 29.7604,  venue_longitude = -95.3698
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Houston';
UPDATE events SET venue_latitude = 33.7490,  venue_longitude = -84.3880
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Atlanta';
UPDATE events SET venue_latitude = 6.5244,   venue_longitude = 3.3792
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Lagos';
UPDATE events SET venue_latitude = 5.6037,   venue_longitude = -0.1870
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Accra';
UPDATE events SET venue_latitude = -26.2041, venue_longitude = 28.0473
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Johannesburg';
UPDATE events SET venue_latitude = -1.2921,  venue_longitude = 36.8219
  WHERE venue_latitude IS NULL AND venue_city ILIKE 'Nairobi';
