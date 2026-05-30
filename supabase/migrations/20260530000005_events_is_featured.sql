-- M7 admin: "feature an event" capability.
-- The admin panel can feature/unfeature any event. pause and cancel reuse the
-- existing events.status lifecycle; there was no featured flag, so add one.
-- Run by founder:  supabase db push --linked   (then: npm run db:types)
--
-- No RLS change: events RLS already restricts writes to owners/service-role,
-- and the admin panel writes through the service-role client. Public read of
-- published events is unchanged.

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.events.is_featured IS
  'Platform-admin featured flag (M7 admin panel). Independent of is_high_demand (virtual queue).';

-- Partial index for a future "Featured" public surface: only published, public,
-- featured events are ever queried by the flag.
CREATE INDEX IF NOT EXISTS idx_events_featured
  ON public.events (start_date)
  WHERE is_featured = TRUE AND status = 'published' AND visibility = 'public';

COMMIT;
