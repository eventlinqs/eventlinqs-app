-- ============================================================================
-- LAW 24: SIX MONTHS FREE FOR EVERY ORGANISER, FROM THEIR OWN REGISTRATION.
-- PLATFORM-FIX-1 Task 3, 26 September 2026.
--
-- THE RULING (founder, 20 September 2026), verbatim: "Every new organiser gets
-- six months free, counted from the date they register or set up on
-- EventLinqs. Not a cap of 50. Every organiser. After six months the standard
-- fee applies."
--
-- WHAT THE ENGINE DID INSTEAD, read from the tree before writing this:
--   * No path opened a window at registration. organisations.founding_fee_free_until,
--     the one column the charge, the display and the payout read
--     (src/lib/payments/founding-waiver.ts, getFoundingWaiver), was set only by
--     a founding invite conversion or by the owner's hand in /admin/network.
--     An organiser who simply signed up paid the full fee from day one.
--   * Two SQL caps of fifty: claim_founding_spot (v_cap, 20260710000002) and
--     the trigger trg_founding_waiver_cap / enforce_founding_waiver_cap
--     (20260727000002, redefined 20260913000010), which refused the 51st window.
--
-- WHAT THIS CHANGES, in four parts.
--   1. The fifty-window cap trigger and its function are dropped.
--   2. claim_founding_spot is redefined without its cap. The founding invite
--      programme (the badge, the personal invites, the onboarding) continues;
--      it no longer runs out.
--   3. A BEFORE INSERT trigger stamps every new organisation's window at
--      founding_add_months(created_at, 6): six months from its own
--      registration, by the same month arithmetic the TypeScript uses
--      (addMonthsUtc), so the two cannot disagree by a day. A value the insert
--      supplies explicitly is kept.
--   4. BACKFILL: every existing organisation gets the same window from its own
--      created_at. A window already later than that is kept (GREATEST), so no
--      organiser loses a day they already hold, and a referral extension
--      already earned stands. Each row changed is audit-logged.
--
-- UNCHANGED, deliberately: FOUNDING_REFERRAL_MONTHS and credit_founding_referral
-- (three more months per referred organiser whose first paid ticket sells).
-- LAW 24 does not mention the referral months; that question is the founder's.
-- admin_set_founding_waiver keeps its signature; p_override is now a no-op
-- because there is no cap left to override.
--
-- OBSERVED BEFORE WRITING (read only, 26 September 2026):
--   production gndnldyfudbytbboxesk: 3 organisations, 0 holding a window,
--     all 3 registered 2026-08-07 to 2026-08-27, so the backfill opens 3
--     windows, each ending six months after its registration (Feb 2027).
--   TEST vkapkibzokmfaxqogypq: 293 organisations, 12 holding a window;
--     281 would open, 7 would move later, none would move earlier.
--
-- IS THIS DESTRUCTIVE? No column is dropped or retyped. One trigger and its
-- function are dropped (the cap). The backfill only ever moves a window LATER
-- or opens one that did not exist. Orders already placed carry their own fee
-- and are not touched.
--
-- TRANSACTION SHAPE: no CREATE INDEX or other pipeline-incompatible statement,
-- so the Supabase CLI runs this file as one implicit transaction.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. THE FIFTY-WINDOW CAP GOES
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_founding_waiver_cap ON public.organisations;
DROP FUNCTION IF EXISTS public.enforce_founding_waiver_cap();

-- ---------------------------------------------------------------------------
-- 2. claim_founding_spot WITHOUT A CAP
-- ---------------------------------------------------------------------------
-- Same signature, same serialisation, same answers, except that it no longer
-- answers NULL because a number was reached. NULL now means only "already
-- founding, or no such organisation".
CREATE OR REPLACE FUNCTION public.claim_founding_spot(
  p_org_id uuid,
  p_city_slug text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_taken integer;
BEGIN
  -- Serialise against concurrent claims, so two signups cannot be given the
  -- same spot number.
  PERFORM 1 FROM public.organisations WHERE is_founding = true FOR UPDATE;

  SELECT count(*) INTO v_taken FROM public.organisations WHERE is_founding = true;

  UPDATE public.organisations
  SET is_founding = true,
      founding_city = p_city_slug,
      founding_since = now()
  WHERE id = p_org_id AND is_founding = false;

  IF NOT FOUND THEN
    -- Already founding, or the org does not exist: not a new claim.
    RETURN NULL;
  END IF;

  RETURN v_taken + 1;
END;
$$;

COMMENT ON FUNCTION public.claim_founding_spot(uuid, text) IS
  'Grants an organisation Founding Organiser membership and returns its 1-based spot number, or NULL when it already holds one or does not exist. Uncapped since LAW 24 (20260926000001).';

-- ---------------------------------------------------------------------------
-- 3. EVERY NEW ORGANISATION: SIX MONTHS FROM ITS OWN REGISTRATION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_registration_fee_free_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $stamp$
BEGIN
  IF NEW.founding_fee_free_until IS NULL THEN
    NEW.founding_fee_free_until := public.founding_add_months(COALESCE(NEW.created_at, now()), 6);
  END IF;
  RETURN NEW;
END $stamp$;

COMMENT ON FUNCTION public.stamp_registration_fee_free_window() IS
  'LAW 24 (founder, 20 September 2026): every organisation is fee-free for six months from its own registration. Stamps founding_fee_free_until = founding_add_months(created_at, 6) on insert unless the insert supplies a value.';

DROP TRIGGER IF EXISTS trg_registration_fee_free_window ON public.organisations;
CREATE TRIGGER trg_registration_fee_free_window
  BEFORE INSERT ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_registration_fee_free_window();

-- ---------------------------------------------------------------------------
-- 4. BACKFILL: EVERY EXISTING ORGANISATION, FROM ITS OWN created_at
-- ---------------------------------------------------------------------------
WITH changed AS (
  UPDATE public.organisations o
  SET founding_fee_free_until = public.founding_add_months(o.created_at, 6)
  WHERE o.founding_fee_free_until IS NULL
     OR o.founding_fee_free_until < public.founding_add_months(o.created_at, 6)
  RETURNING o.id, o.created_at, o.founding_fee_free_until AS new_until
)
INSERT INTO public.audit_log (action, target_type, target_id, metadata)
SELECT
  'founding.waiver.law24_backfill',
  'organisation',
  c.id::TEXT,
  jsonb_build_object(
    'organisation_id',    c.id,
    'reason',             'LAW 24: six months fee-free from registration, every organiser',
    'registered_at',      c.created_at,
    'new_fee_free_until', c.new_until,
    'migration',          '20260926000001_law24_six_months_for_every_organiser'
  )
FROM changed c;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $post$
DECLARE
  v_short INT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_founding_waiver_cap' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'LAW 24: the fifty-window cap trigger is still installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_registration_fee_free_window' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'LAW 24: the registration window trigger is missing';
  END IF;
  SELECT count(*) INTO v_short FROM public.organisations
  WHERE founding_fee_free_until IS NULL
     OR founding_fee_free_until < public.founding_add_months(created_at, 6);
  IF v_short > 0 THEN
    RAISE EXCEPTION 'LAW 24: % organisation(s) still hold less than six months from registration', v_short;
  END IF;
  RAISE NOTICE 'LAW 24: cap removed, registration window stamped on insert, every organisation holds six months from its own registration';
END $post$;

COMMIT;
