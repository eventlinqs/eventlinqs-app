-- S2 Architecture Hardening — compound indexes for hot public-browse paths.
--
-- Rationale: fetchers.ts filters every public listing on
--   status='published' AND visibility='public' AND start_date >= now()
-- then narrows by venue_city (ILIKE), venue_country (eq), and
-- category_id. The btree below covers the always-on predicate plus the
-- dominant sort; city/country compounds cover the geo-scoped listings
-- (browse/[city]).
--
-- Notes:
--  * venue_city filter uses ILIKE `%city%`, so a plain btree can only
--    help when combined with the equality columns. A pg_trgm GIN for
--    true substring acceleration is deferred to a follow-up migration.
--  * tickets compound index deferred — column shape (`status` vs
--    `state`) needs verification against live schema first.
--  * saved_events(user_id) already covered by idx_saved_events_user in
--    20260421000001_m5_phase1_personalisation.sql — no-op here.

CREATE INDEX IF NOT EXISTS idx_events_status_visibility_start
  ON events (status, visibility, start_date)
  WHERE status = 'published' AND visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_events_country_start
  ON events (venue_country, status, start_date)
  WHERE status = 'published' AND visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_events_category_start
  ON events (category_id, start_date)
  WHERE status = 'published' AND visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_events_is_free_start
  ON events (is_free, start_date)
  WHERE status = 'published' AND visibility = 'public' AND is_free = true;

ANALYZE events;
