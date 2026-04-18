CREATE TABLE IF NOT EXISTS saved_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);
ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own saves" ON saved_events FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users insert own saves" ON saved_events FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own saves" ON saved_events FOR DELETE USING (user_id = auth.uid());
