-- ---------------------------------------------------------------------------
-- A FOUNDING INVITE IS SPENT ONCE, FOR EXACTLY ONE SPOT, AND NEVER ON NOTHING.
--
-- LB-INVITEWHOLE, 20 September 2026, lane B.
--
-- ---------------------------------------------------------------------------
-- DEFECT ONE: THE INVITE THAT IS SPENT ON NOTHING.
--
-- src/lib/founding/invites.ts, acceptFoundingInvite, ran the conversion as four
-- separate round trips from the application:
--
--     1. read the invite by code, where status = 'pending'
--     2. UPDATE it to 'accepted'                     <- the code is now spent
--     3. UPDATE the new organisation's referred_by
--     4. SELECT claim_founding_spot(...)             <- the spot is granted
--
-- Step 2 is deliberately first, so that two submits of one link cannot both
-- pass the pending check. That ordering is right and it is kept. What was
-- missing is that steps 2 and 4 were in DIFFERENT TRANSACTIONS, and step 4's
-- error was discarded by the caller:
--
--     const { data: spot } = await admin.rpc('claim_founding_spot', { ... })
--     const spotNumber = typeof spot === 'number' ? spot : null
--
-- A dropped socket, a pool refusal or a statement timeout on step 4 lands in
-- `error`, leaves `data` null, and is indistinguishable at that line from the
-- programme being full. So the invited organiser was told
--
--     "All 50 founding spots are taken right now"
--
-- while their single-use code had already been marked accepted a few
-- milliseconds earlier. The link cannot be used again, the organiser has no
-- spot, no fee-free window, and nothing anywhere recorded that it happened.
-- The person who invited them keeps the referral relationship and loses the
-- referral. That is the front door of the acquisition loop failing closed on
-- the one visitor it exists to convert.
--
-- THE RULE THIS INSTALLS: the invite is consumed and the spot is claimed in ONE
-- transaction, inside the database, so a fault rolls both back and the code is
-- still pending when the organiser tries again. There is no longer a state in
-- which an invite is spent and no spot was ever asked for.
--
-- ---------------------------------------------------------------------------
-- DEFECT TWO: THE ALLOWANCE THAT FAILS OPEN.
--
-- A founding organiser may issue five personal invites
-- (INVITES_PER_FOUNDING_ORGANISER in src/lib/founding/invites.ts). The whole
-- enforcement lived in one application read:
--
--     const { count } = await admin.from('founding_invites')
--       .select('id', { count: 'exact', head: true }).eq('inviter_org_id', org.id)
--     if ((count ?? 0) >= INVITES_PER_FOUNDING_ORGANISER) { ... refuse ... }
--
-- `error` is not bound, so a failed count is `null`, and `null ?? 0` is zero.
-- A count that could not be taken therefore read as "this organiser has issued
-- no invites yet" and minted a sixth. Every founding invite is a founding spot
-- and six fee-free months, so the one read standing between the offer and its
-- own scarcity failed in the direction that gives the offer away.
--
-- The TypeScript is fixed in the same commit and now raises. This trigger is
-- the backstop, in the place a backstop belongs: it holds against a direct SQL
-- insert and against a code path nobody has written yet, exactly as
-- enforce_founding_waiver_cap holds the fifty.
--
-- ---------------------------------------------------------------------------
-- OBSERVED BEFORE WRITING, read only, on both databases, 20 September 2026.
--
--                                   TEST vkapki...   production gndnld...
--   founding_invites rows                        0                      0
--   issued by an organiser                       0                      0
--   most held by one inviter                     0                      0
--   organisations with is_founding               5                      0
--   organisations holding a window              12                      0
--
-- No row on either database breaks the allowance this adds, so the trigger is
-- installable without a repair statement and the CREATE cannot fail on data.
-- Measured rather than assumed, because a constraint cannot be added to a
-- database that already breaks it, and the one database nobody measured is the
-- one it fails on.
--
-- IS THIS DESTRUCTIVE? No. It adds one function, one trigger function and one
-- trigger. It drops nothing, retypes nothing, and writes no row.
-- claim_founding_spot is untouched and is still the only place the fifty cap is
-- counted: the new function CALLS it rather than restating it, so the two
-- cannot drift.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. ONE TRANSACTION FOR THE CONVERSION
-- ---------------------------------------------------------------------------
--
-- Through PostgREST one RPC is one transaction, so every write below either
-- lands together or does not land at all.
--
-- WHY IT RETURNS FIVE FACTS RATHER THAN A SPOT NUMBER. The caller has to tell
-- four different stories and the old return shape could only tell two of them.
-- `alreadyFull` was returned whenever no spot came back, which is false when
-- the organisation ALREADY held one (claim_founding_spot answers NULL for both)
-- and false again when the offer was closed. An organiser reading "all fifty
-- spots are taken" while in fact holding spot 7 is being told the offer failed
-- when it succeeded.
CREATE OR REPLACE FUNCTION public.accept_founding_invite(
  p_code       TEXT,
  p_user_id    UUID,
  p_org_id     UUID,
  p_offer_open BOOLEAN
)
RETURNS TABLE (
  consumed          BOOLEAN,
  spot_number       INTEGER,
  referral_recorded BOOLEAN,
  offer_closed      BOOLEAN,
  already_founding  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $accept$
DECLARE
  v_invite       public.founding_invites%ROWTYPE;
  v_consumed     BOOLEAN := FALSE;
  v_spot         INTEGER := NULL;
  v_referral     BOOLEAN := FALSE;
  v_was_founding BOOLEAN := FALSE;
BEGIN
  IF p_code IS NULL OR p_user_id IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'accept_founding_invite needs a code, a user and an organisation'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The row lock is what makes the code single use under a double submit: the
  -- second caller waits here and then finds no pending row.
  SELECT * INTO v_invite
  FROM public.founding_invites
  WHERE code = p_code
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, FALSE, FALSE, FALSE;
    RETURN;
  END IF;

  UPDATE public.founding_invites
  SET status              = 'accepted',
      accepted_by_user_id = p_user_id,
      accepted_org_id     = p_org_id,
      accepted_at         = NOW()
  WHERE id = v_invite.id;
  v_consumed := TRUE;

  -- WHO REFERRED WHOM, recorded before the spot is asked for and independently
  -- of whether one was available. The relationship is a fact about how this
  -- organiser arrived; the spot is a separate question, and an organiser who
  -- came through a friend's link still came through it when the fiftieth spot
  -- went an hour earlier. The three-month credit is granted later, by
  -- trg_founding_referral_credit, on this organisation's first confirmed paid
  -- order (migration 20260913000010).
  --
  -- organisations_referred_by_not_self already refuses a self-referral; the
  -- inequality here is so the ordinary case never reaches a raised constraint.
  IF v_invite.inviter_org_id IS NOT NULL AND v_invite.inviter_org_id <> p_org_id THEN
    UPDATE public.organisations
    SET referred_by_organisation_id = v_invite.inviter_org_id
    WHERE id = p_org_id
      AND referred_by_organisation_id IS NULL;
    v_referral := FOUND;
  END IF;

  -- THE OFFER CAN BE CLOSED WITHOUT A DEPLOY (FO1 reversal condition). The
  -- invite is still consumed above, deliberately, so the link cannot be
  -- replayed once the offer reopens. The flag itself is resolved by the
  -- application (src/lib/flags/broadcast.ts is the platform's one flag
  -- resolver, with a cache and a documented fallback) and handed in, rather
  -- than read a second way here where the two could disagree.
  IF NOT p_offer_open THEN
    RETURN QUERY SELECT v_consumed, NULL::INTEGER, v_referral, TRUE, FALSE;
    RETURN;
  END IF;

  -- Asked BEFORE the claim, because claim_founding_spot answers NULL for "the
  -- programme is full" and NULL for "this organisation already holds a spot",
  -- and the caller has to say something different in each case.
  SELECT is_founding INTO v_was_founding
  FROM public.organisations
  WHERE id = p_org_id;

  v_spot := public.claim_founding_spot(p_org_id, v_invite.city_slug);

  RETURN QUERY SELECT v_consumed, v_spot, v_referral, FALSE, COALESCE(v_was_founding, FALSE);
END $accept$;

COMMENT ON FUNCTION public.accept_founding_invite(TEXT, UUID, UUID, BOOLEAN) IS
  'Consumes a pending founding invite and claims a founding spot in ONE transaction, so a fault can never leave a single-use code spent with no spot granted. Returns what actually happened: whether the code was consumed, the spot number if one was granted, whether the referral was recorded, whether the offer was closed, and whether the organisation already held a spot.';

REVOKE ALL ON FUNCTION public.accept_founding_invite(TEXT, UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_founding_invite(TEXT, UUID, UUID, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.accept_founding_invite(TEXT, UUID, UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_founding_invite(TEXT, UUID, UUID, BOOLEAN) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. THE PER ORGANISER ALLOWANCE, IN THE DATABASE
-- ---------------------------------------------------------------------------
--
-- Five is INVITES_PER_FOUNDING_ORGANISER in src/lib/founding/invites.ts. The
-- two literals are held together by
-- scripts/guards/the-founding-invite-is-spent-once.mjs, which fails the build if
-- they ever say different numbers, for the same reason
-- founding-offer-matches-configuration holds the fifty: an offer rule with two
-- implementations that quietly differ is worse than either one alone.
--
-- COUNTED ON inviter_org_id ALONE, with no filter on inviter_kind, because that
-- is exactly what the application read counts. Founder-issued invites carry a
-- NULL inviter_org_id by construction, so the two expressions select the same
-- rows today; matching the application read means they still will if that ever
-- stops being true.
--
-- EVERY STATUS COUNTS, including revoked. The allowance is on what an organiser
-- may ISSUE, not on what is outstanding, and counting only pending rows would
-- let one organiser mint an unbounded number of codes by revoking each one.
CREATE OR REPLACE FUNCTION public.enforce_founding_invite_allowance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $allowance$
DECLARE
  v_issued    INTEGER;
  v_allowance CONSTANT INTEGER := 5;
BEGIN
  IF NEW.inviter_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise against a concurrent insert by the same organisation. Without
  -- this, two requests can both count four and both insert, and the allowance
  -- is six. The lock is on the inviting organisation's own row, so it costs
  -- nothing to anybody else's invite.
  PERFORM 1 FROM public.organisations WHERE id = NEW.inviter_org_id FOR UPDATE;

  SELECT COUNT(*) INTO v_issued
  FROM public.founding_invites
  WHERE inviter_org_id = NEW.inviter_org_id;

  IF v_issued >= v_allowance THEN
    RAISE EXCEPTION
      'founding invite allowance reached: organisation % has already issued % of % invites',
      NEW.inviter_org_id, v_issued, v_allowance
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $allowance$;

COMMENT ON FUNCTION public.enforce_founding_invite_allowance() IS
  'Refuses a founding invite beyond the five a single founding organiser may issue. The backstop for the application count, which read a FAILED count as zero and minted a sixth.';

DROP TRIGGER IF EXISTS trg_founding_invite_allowance ON public.founding_invites;
CREATE TRIGGER trg_founding_invite_allowance
  BEFORE INSERT ON public.founding_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_founding_invite_allowance();

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS. Prove the shape before committing.
--
-- Shape only, deliberately. The BEHAVIOUR is proven against this database by
-- scripts/verify/lb-invitewhole-drive.mjs, which spends a real invite, forces a
-- failed claim and shows the code still pending, and asks for a sixth invite
-- and reads back the 23514. A DO block that inserted rows to test itself would
-- have to clean up after itself inside the migration's own transaction, and a
-- migration that writes rows to prove it works is a migration that leaves them
-- behind the first time an assertion fires early.
-- ---------------------------------------------------------------------------
DO $post$
DECLARE
  missing TEXT := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'accept_founding_invite'
      AND pg_get_function_identity_arguments(p.oid) = 'p_code text, p_user_id uuid, p_org_id uuid, p_offer_open boolean'
  ) THEN
    missing := missing || ' accept_founding_invite(text,uuid,uuid,boolean)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_founding_invite_allowance'
  ) THEN
    missing := missing || ' enforce_founding_invite_allowance()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_founding_invite_allowance' AND NOT tgisinternal
  ) THEN
    missing := missing || ' trg_founding_invite_allowance';
  END IF;

  -- The new function must CALL the cap rather than restate it, so the fifty
  -- lives in one place. A rewrite that inlined the count would pass every other
  -- check here and would drift the day the cap moves.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'accept_founding_invite'
      AND p.prosrc LIKE '%claim_founding_spot%'
  ) THEN
    missing := missing || ' accept_founding_invite no longer calls claim_founding_spot';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'LB-INVITEWHOLE migration incomplete, missing:%', missing;
  END IF;

  RAISE NOTICE 'LB-INVITEWHOLE: accept_founding_invite and the five-invite allowance are installed';
END $post$;
