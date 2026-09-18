-- ============================================================================
-- AN1. WHERE AN ORGANISER CAME FROM, ON THE ACCOUNT, IN COLUMNS.
-- Close-out AN1, lane B, 13 September 2026.
--
-- WHY. Nobody can say how MKL Studios found EventLinqs. A platform that cannot
-- answer that cannot spend a dollar on advertising honestly, and the growth
-- plan's gate two says paid comes last and only after density. So the answer
-- has to be a number the owner can read on a Monday, not an archaeology
-- exercise, and it has to be collected before the first ad, not after.
--
-- WHY COLUMNS AND NOT JSONB. `profiles.metadata` already carries the
-- share-and-invite attribution (src/lib/growth/referrals.ts), and that module
-- says in as many words that promoting it to columns is an optional
-- optimisation rather than outstanding work. It is right about ITS fields,
-- which are read one profile at a time on a signup. These are different: they
-- are AGGREGATED weekly across every organiser, and a weekly aggregate over a
-- JSONB key is a sequential scan of every profile that no index can help. The
-- owner digest runs on a schedule and must stay cheap.
--
-- WHAT IT ADDS. Six nullable columns on public.profiles and one partial index.
-- Nothing is dropped, nothing is retyped, no existing row is written.
--
--   signup_heard_from        the answer to the one question asked at signup
--   signup_heard_from_other  the free text, when the answer was "other"
--   signup_src               the src parameter on the link that brought them
--   signup_landing_path      the first page they landed on, path only
--   signup_referrer_host     the site that sent them, HOST only, never the URL
--   signup_utm               the five utm parameters, as one object
--
-- PRIVACY, decided here rather than left to the caller. The REFERRER is stored
-- as a host and never as a full URL, because a full referrer can carry a search
-- query, a session token or somebody's own account page, and none of that
-- belongs in a table kept for years. The LANDING PATH is stored without its
-- query string for the same reason. Neither is identifying, which is why this
-- capture needs no consent banner: the banner in this item governs the
-- THIRD-PARTY analytics and advertising scripts, which are a different question
-- and are off by default.
--
-- OBSERVED BEFORE WRITING (read only, TEST vkapkibzokmfaxqogypq, 13 September
-- 2026): public.profiles carries id, email, full_name, display_name,
-- avatar_url, phone, role, is_verified, onboarding_completed, metadata,
-- created_at, updated_at and preferred_city. None of the six names below is
-- taken.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_heard_from TEXT,
  ADD COLUMN IF NOT EXISTS signup_heard_from_other TEXT,
  ADD COLUMN IF NOT EXISTS signup_src TEXT,
  ADD COLUMN IF NOT EXISTS signup_landing_path TEXT,
  ADD COLUMN IF NOT EXISTS signup_referrer_host TEXT,
  ADD COLUMN IF NOT EXISTS signup_utm JSONB;

COMMENT ON COLUMN public.profiles.signup_heard_from IS
  'The answer to the one question asked at signup, from a fixed list. Optional and never a condition of signing up: an account is created whether or not it is answered.';

COMMENT ON COLUMN public.profiles.signup_heard_from_other IS
  'The free text behind an answer of "other". Trimmed and bounded by the application; NULL for every other answer.';

COMMENT ON COLUMN public.profiles.signup_src IS
  'The src parameter on the link that brought this account in, captured first-touch. Set by the platform''s own links (organisers, footer, share, confirmation, forecast), so it says which SURFACE sent them rather than which site.';

COMMENT ON COLUMN public.profiles.signup_landing_path IS
  'The first path this person landed on, WITHOUT its query string. The query can carry a search term or a token and is not kept.';

COMMENT ON COLUMN public.profiles.signup_referrer_host IS
  'The HOST that sent them, never the full referring URL. A full referrer can carry a search query or a session token; the host is the whole answer to "which channel brought them".';

COMMENT ON COLUMN public.profiles.signup_utm IS
  'The utm parameters as one object: source, medium, campaign, term, content. Each key is absent rather than null when the link did not carry it.';

-- The weekly aggregate reads organisers created inside a window and groups by
-- source. A partial index keeps that cheap and costs nothing on every other
-- profile, because the overwhelming majority of accounts are attendees.
CREATE INDEX IF NOT EXISTS idx_profiles_organiser_signup_window
  ON public.profiles (created_at DESC)
  WHERE role = 'organiser';

-- ---------------------------------------------------------------------------
-- POST-CONDITION. Prove the shape before committing.
-- ---------------------------------------------------------------------------
DO $post$
DECLARE
  missing TEXT := '';
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'signup_heard_from', 'signup_heard_from_other', 'signup_src',
    'signup_landing_path', 'signup_referrer_host', 'signup_utm'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = col
    ) THEN
      missing := missing || ' profiles.' || col;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_profiles_organiser_signup_window'
  ) THEN
    missing := missing || ' idx_profiles_organiser_signup_window';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'AN1 migration incomplete, missing:%', missing;
  END IF;
  RAISE NOTICE 'AN1: six signup attribution columns and the organiser window index are present';
END $post$;

COMMIT;
