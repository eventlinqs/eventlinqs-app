-- =============================================================================
-- 20260421000001_m5_phase1_personalisation.sql
--
-- M5 Phase 1 personalisation schema.
--
-- 1. saved_events               — heart-save primitive (earlier migration was
--                                 never applied; this re-runs the DDL
--                                 idempotently so the table exists in prod).
-- 2. saved_organisers           — used by /events "Recommended for you" rail
-- 3. saved_categories           — ditto
--
-- All tables enforce RLS (users read/write own rows only). Foreign keys
-- cascade on delete so removing a user / organisation / event / category
-- cleans up the save rows automatically.
-- =============================================================================

-- ─── saved_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);
ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own saves" ON saved_events;
CREATE POLICY "users read own saves" ON saved_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own saves" ON saved_events;
CREATE POLICY "users insert own saves" ON saved_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users delete own saves" ON saved_events;
CREATE POLICY "users delete own saves" ON saved_events
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_saved_events_user  ON saved_events(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_events_event ON saved_events(event_id);

-- ─── saved_organisers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_organisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organisation_id)
);
ALTER TABLE saved_organisers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own saved organisers" ON saved_organisers;
CREATE POLICY "users read own saved organisers" ON saved_organisers
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own saved organisers" ON saved_organisers;
CREATE POLICY "users insert own saved organisers" ON saved_organisers
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users delete own saved organisers" ON saved_organisers;
CREATE POLICY "users delete own saved organisers" ON saved_organisers
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_saved_organisers_user ON saved_organisers(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_organisers_org  ON saved_organisers(organisation_id);

-- ─── saved_categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES event_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);
ALTER TABLE saved_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own saved categories" ON saved_categories;
CREATE POLICY "users read own saved categories" ON saved_categories
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own saved categories" ON saved_categories;
CREATE POLICY "users insert own saved categories" ON saved_categories
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users delete own saved categories" ON saved_categories;
CREATE POLICY "users delete own saved categories" ON saved_categories
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_saved_categories_user ON saved_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_categories_cat  ON saved_categories(category_id);
