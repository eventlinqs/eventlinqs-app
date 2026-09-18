-- ============================================================================
-- FO1. THE FOUNDING ORGANISER OFFER BECOMES WHAT THE PAGE PROMISES.
-- Close-out FO1, lane B, 13 September 2026.
--
-- WHY. www.eventlinqs.com.au/organisers promises, in public and in every
-- outreach message sent from 12 September: six months completely fee free, and
-- "3 more fee-free months for every organiser you refer WHO RUNS AN EVENT".
-- The product paid that three months out the instant the invited organiser
-- CREATED AN ACCOUNT (src/lib/founding/invites.ts, acceptFoundingInvite). So
-- the copy promised an event and the machine paid on a signup, and nothing
-- anywhere recorded what the whole offer was costing.
--
-- WHAT THIS MIGRATION ADDS, in five parts.
--   1. Who referred whom, on the account, and a once-only credit marker, so
--      PL1's referral link and the existing invite codes both write to one
--      place and neither can pay twice.
--   2. The waived platform fee on the order, so the cost of the offer is a
--      number the owner can read rather than an absence in a column.
--   3. One authority for founding-window month arithmetic, matching the
--      TypeScript helper exactly, including its month-end roll-forward.
--   4. The machine that grants the three months when the referred organiser's
--      FIRST PAID TICKET SELLS, as a trigger on orders, mirroring
--      platform_notify_order_paid, and never able to block an order.
--   5. The owner's hand: grant, revoke and extend a window, with a deliberate,
--      audit-logged override of the fifty cap.
--
-- IS THIS DESTRUCTIVE? No.
--   * Three nullable columns and one NOT NULL column with a DEFAULT of 0. No
--     column is dropped or retyped.
--   * The backfill only ever RECORDS history that already happened: every
--     founding invite already accepted is marked as ALREADY CREDITED, because
--     it was, under the old rule. Without that, the new trigger would pay the
--     same referral a second time when that organiser's first ticket sells.
--   * enforce_founding_waiver_cap is replaced with a version that behaves
--     identically except for one deliberate, transaction-scoped escape hatch
--     that only admin_set_founding_waiver can open.
--   * No order, payment, payout or transfer row is read or written by the
--     backfill.
--
-- OBSERVED BEFORE WRITING (read only, TEST vkapkibzokmfaxqogypq, 13 September
-- 2026): 250 organisations, 0 with is_founding, 0 holding a fee-free window,
-- 0 founding_invites of any status, 528 orders. The backfill therefore affects
-- nobody today. It is written anyway, because a migration that assumes an empty
-- table is a migration that corrupts a full one.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. WHO REFERRED WHOM, AND THE ONCE-ONLY MARKER
-- ---------------------------------------------------------------------------
--
-- The marker lives on the REFERRED organisation rather than on the invite row,
-- because there are two ways in and there must be one answer. An organiser
-- arriving through a founding invite code has a founding_invites row; an
-- organiser arriving through PL1's /organisers?ref=<code> link does not. One
-- column on the account covers both and cannot disagree with itself.
--
-- The referrer's count of confirmed referrals is DERIVED from these two columns
-- (count where referred_by_organisation_id = X and referral_credited_at is not
-- null), never stored. A stored counter needs a declared maintainer and rots
-- the first time a path forgets to increment it.

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS referred_by_organisation_id UUID
    REFERENCES public.organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_credited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.organisations.referred_by_organisation_id IS
  'The organisation that referred this one, set at signup from a founding invite code or from the PL1 referral link. Never set to self.';

COMMENT ON COLUMN public.organisations.referral_credited_at IS
  'When the referrer was credited the three fee-free months for bringing this organisation in. Set once, by trigger trg_founding_referral_credit, on this organisation''s FIRST confirmed paid order. NULL means the referral has not earned anything yet.';

CREATE INDEX IF NOT EXISTS idx_organisations_referred_by
  ON public.organisations (referred_by_organisation_id)
  WHERE referred_by_organisation_id IS NOT NULL;

-- An organisation cannot refer itself.
ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_referred_by_not_self;
ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_referred_by_not_self
  CHECK (referred_by_organisation_id IS NULL OR referred_by_organisation_id <> id);

-- BACKFILL. Every founding invite already accepted established a referral AND
-- already paid the inviter three months at acceptance time, under the rule this
-- migration replaces. Record both facts: the relationship, so it is not lost,
-- and the credit, so the new trigger never pays it twice.
UPDATE public.organisations o
SET referred_by_organisation_id = COALESCE(o.referred_by_organisation_id, i.inviter_org_id),
    referral_credited_at        = COALESCE(o.referral_credited_at, i.accepted_at, NOW())
FROM public.founding_invites i
WHERE i.accepted_org_id = o.id
  AND i.status = 'accepted'
  AND i.inviter_org_id IS NOT NULL
  AND i.inviter_org_id <> o.id
  AND (o.referred_by_organisation_id IS NULL OR o.referral_credited_at IS NULL);

-- ---------------------------------------------------------------------------
-- 2. THE WAIVED PLATFORM FEE, ON THE ORDER
-- ---------------------------------------------------------------------------
--
-- A waived order stores platform_fee_cents = 0, which is correct and is also
-- indistinguishable from a free event, a discount to zero, or a fee that was
-- never resolved. This column holds what the platform fee WOULD have been, so
-- the offer's cost is a sum over a column rather than an archaeology exercise
-- across historical pricing_rules versions.
--
-- Zero rather than NULL as the default, because every order that is not under a
-- waiver genuinely waived nothing, and SUM() over a nullable column invites a
-- reader to wonder which NULLs meant "unknown".

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS founding_fee_waived_cents BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.founding_fee_waived_cents IS
  'The platform fee this order did NOT charge because the organiser held a Founding Organiser window when it was created. Zero on every other order. Written by the checkout from PaymentCalculator, which is the only thing that knows the rate that was resolved before the waiver zeroed it.';

CREATE INDEX IF NOT EXISTS idx_orders_founding_waived
  ON public.orders (organisation_id, created_at)
  WHERE founding_fee_waived_cents > 0;

-- ---------------------------------------------------------------------------
-- 3. ONE AUTHORITY FOR FOUNDING-WINDOW MONTH ARITHMETIC
-- ---------------------------------------------------------------------------
--
-- src/lib/payments/founding-waiver.ts already computes these dates in
-- TypeScript, on the UTC fields only, and keeps JavaScript's month-end
-- ROLL-FORWARD: 31 August plus three months lands on 1 December rather than
-- clamping to 30 November, which favours the organiser by a day and is
-- predictable.
--
-- Postgres `+ INTERVAL '3 months'` CLAMPS instead, so a naive trigger would
-- have disagreed with the TypeScript by one day for any window whose date is a
-- 29th, 30th or 31st. One day of a fee waiver is small; a money rule with two
-- implementations that quietly differ is not. This function reproduces the
-- roll-forward exactly: go to the first of the target month, then add
-- (day - 1) days, which overflows into the following month the same way
-- Date.setUTCMonth does, then put the time of day back.
--
-- IMMUTABLE and pure, forced through UTC at both ends, so it cannot depend on
-- the session TimeZone.

CREATE OR REPLACE FUNCTION public.founding_add_months(p_ts TIMESTAMPTZ, p_months INT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    date_trunc('month', (p_ts AT TIME ZONE 'UTC'))
    + make_interval(months => p_months)
    + make_interval(days => (EXTRACT(DAY FROM (p_ts AT TIME ZONE 'UTC'))::INT - 1))
    + ((p_ts AT TIME ZONE 'UTC') - date_trunc('day', (p_ts AT TIME ZONE 'UTC')))
  ) AT TIME ZONE 'UTC'
$$;

COMMENT ON FUNCTION public.founding_add_months(TIMESTAMPTZ, INT) IS
  'Adds whole months to a timestamp in UTC with JavaScript month-end roll-forward, so it agrees to the millisecond with addMonthsUtc in src/lib/payments/founding-waiver.ts. The two are the same rule and must stay the same rule.';

-- ---------------------------------------------------------------------------
-- 4. THE MACHINE: THREE MONTHS WHEN THE REFERRED ORGANISER'S FIRST TICKET SELLS
-- ---------------------------------------------------------------------------
--
-- Extends FROM THE CURRENT VALUE when the window is still open, so two
-- referrals in the same week stack to six months instead of one overwriting the
-- other, and FROM NOW when it has lapsed, because granting three months that
-- already expired would be a silent no-op and the organiser would have earned
-- nothing. Identical to extendWaiver() in TypeScript.

CREATE OR REPLACE FUNCTION public.credit_founding_referral(p_org_id UUID, p_order_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $credit$
DECLARE
  v_referrer UUID;
  v_previous TIMESTAMPTZ;
  v_next     TIMESTAMPTZ;
  v_months   CONSTANT INT := 3;
BEGIN
  -- Lock the referred organisation's row so two confirmations of two orders in
  -- the same instant cannot both see an uncredited referral.
  SELECT referred_by_organisation_id
    INTO v_referrer
  FROM public.organisations
  WHERE id = p_org_id
    AND referred_by_organisation_id IS NOT NULL
    AND referral_credited_at IS NULL
  FOR UPDATE;

  IF v_referrer IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mark the credit FIRST, so the once-only guarantee does not depend on the
  -- update below succeeding twice.
  UPDATE public.organisations
  SET referral_credited_at = NOW()
  WHERE id = p_org_id
    AND referral_credited_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT founding_fee_free_until INTO v_previous
  FROM public.organisations WHERE id = v_referrer FOR UPDATE;

  v_next := public.founding_add_months(
    GREATEST(COALESCE(v_previous, NOW()), NOW()),
    v_months
  );

  UPDATE public.organisations
  SET founding_fee_free_until = v_next,
      founding_bonus_months   = COALESCE(founding_bonus_months, 0) + v_months
  WHERE id = v_referrer;

  INSERT INTO public.audit_log (action, target_type, target_id, metadata)
  VALUES (
    'founding.waiver.extended',
    'organisation',
    v_referrer::TEXT,
    jsonb_build_object(
      'organisation_id',         v_referrer,
      'reason',                  'referred_organiser_first_paid_sale',
      'referred_organisation_id', p_org_id,
      'order_id',                p_order_id,
      'months_added',            v_months,
      'previous_fee_free_until', v_previous,
      'new_fee_free_until',      v_next
    )
  );

  RETURN v_next;
END $credit$;

COMMENT ON FUNCTION public.credit_founding_referral(UUID, UUID) IS
  'Grants the referrer three fee-free months the first time a referred organisation confirms a paid order. Once only per referred organisation, enforced by organisations.referral_credited_at under a row lock.';

-- The trigger function. It may never break the thing it is watching: a founding
-- referral is a marketing grant and an order is money, so a fault here warns and
-- lets the order complete. The handler sits in THIS frame rather than inside
-- credit_founding_referral, because arguments are evaluated in the caller and a
-- safety net one frame too low is not a safety net (the lesson of
-- 20260909000004).
CREATE OR REPLACE FUNCTION public.tg_founding_referral_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $tg$
BEGIN
  BEGIN
    PERFORM public.credit_founding_referral(NEW.organisation_id, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'founding referral credit failed for order % (organisation %): %',
      NEW.id, NEW.organisation_id, SQLERRM;
  END;
  RETURN NULL;
END $tg$;

DROP TRIGGER IF EXISTS trg_founding_referral_credit ON public.orders;
CREATE TRIGGER trg_founding_referral_credit
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status = 'confirmed'::order_status
    AND NEW.total_cents > 0
  )
  EXECUTE FUNCTION public.tg_founding_referral_credit();

-- The INSERT twin, for the same reason platform_notify_order_paid has one: an
-- order that is inserted already confirmed never fires the UPDATE trigger.
DROP TRIGGER IF EXISTS trg_founding_referral_credit_insert ON public.orders;
CREATE TRIGGER trg_founding_referral_credit_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  WHEN (
    NEW.status = 'confirmed'::order_status
    AND NEW.total_cents > 0
  )
  EXECUTE FUNCTION public.tg_founding_referral_credit();

-- ---------------------------------------------------------------------------
-- 5. THE OWNER'S HAND: GRANT, REVOKE, EXTEND, AND ONE DELIBERATE OVERRIDE
-- ---------------------------------------------------------------------------
--
-- The fifty cap has been enforced in the database since 20260727000002 and that
-- is the right place for it: it holds against a direct SQL grant and against a
-- code path nobody has written yet. But FO1 requires "the 51st grant refused by
-- the cap UNLESS THE OWNER OVERRIDES BY HAND", and an absolute trigger leaves
-- the owner no hand at all.
--
-- So the trigger gains exactly one escape: a transaction-scoped setting that
-- only admin_set_founding_waiver can set, and which cannot survive the
-- statement that set it. Every other path, including a hand-written UPDATE in a
-- SQL console, still meets the cap.

CREATE OR REPLACE FUNCTION public.enforce_founding_waiver_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $cap$
DECLARE
  holder_count INT;
BEGIN
  -- Only guard the transition INTO holding a waiver. Extending an existing
  -- window (a referral) must always be allowed, and clearing one always is.
  IF NEW.founding_fee_free_until IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.founding_fee_free_until IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- The owner's deliberate override, set for this transaction only by
  -- admin_set_founding_waiver(..., p_override => true) and audit-logged by its
  -- caller. current_setting with missing_ok = true returns NULL when it was
  -- never set, so the default posture is unchanged: the cap holds.
  IF COALESCE(current_setting('eventlinqs.founding_cap_override', TRUE), '') = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO holder_count
  FROM public.organisations
  WHERE founding_fee_free_until IS NOT NULL
    AND id <> NEW.id;

  IF holder_count >= 50 THEN
    RAISE EXCEPTION
      'founding waiver cap reached: % organisations already hold the Founding Organiser waiver (cap is 50)', holder_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $cap$;

-- The single entry point for an owner-made change to a founding organiser's
-- terms. NULL clears the window (revoke); a timestamp sets it (grant or
-- extend). Returns what the row holds afterwards, so the caller reports what the
-- database did rather than what it asked for.
--
-- MEMBERSHIP MOVES WITH THE TERMS, which is why p_membership exists rather than
-- the caller updating is_founding separately. Granting founding terms by hand IS
-- admitting an organiser to the programme, and revoking them is removing them
-- from it; splitting those into two writes is how an organisation ends up
-- carrying the badge with no window, or a window with no badge. 'none' is the
-- extend case, which changes the date and nothing about membership.
CREATE OR REPLACE FUNCTION public.admin_set_founding_waiver(
  p_org_id     UUID,
  p_until      TIMESTAMPTZ,
  p_override   BOOLEAN DEFAULT FALSE,
  p_membership TEXT DEFAULT 'none'
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin$
DECLARE
  v_after TIMESTAMPTZ;
  v_found BOOLEAN;
BEGIN
  IF p_membership NOT IN ('none', 'grant', 'revoke') THEN
    RAISE EXCEPTION 'p_membership must be none, grant or revoke, not %', p_membership
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_override THEN
    -- is_local = true: dies with this transaction, so the escape can never leak
    -- onto the next caller of a pooled connection.
    PERFORM set_config('eventlinqs.founding_cap_override', 'on', TRUE);
  END IF;

  UPDATE public.organisations
  SET founding_fee_free_until = p_until,
      is_founding = CASE p_membership
                      WHEN 'grant'  THEN TRUE
                      WHEN 'revoke' THEN FALSE
                      ELSE is_founding
                    END,
      founding_since = CASE
                         WHEN p_membership = 'grant' THEN COALESCE(founding_since, NOW())
                         WHEN p_membership = 'revoke' THEN NULL
                         ELSE founding_since
                       END
  WHERE id = p_org_id
  RETURNING TRUE, founding_fee_free_until INTO v_found, v_after;

  -- CLOSE THE ESCAPE BEFORE RETURNING, so it dies with this CALL rather than
  -- with the transaction. is_local already bounds it to the transaction, and
  -- through PostgREST one RPC is one transaction, so the two are the same thing
  -- today. They stop being the same thing the moment anything calls this twice
  -- in one transaction, and then the second grant would ride an override the
  -- owner authorised for the first. Found on 13 September by the database proof
  -- asserting the tighter guarantee and watching the looser one fail it.
  IF p_override THEN
    PERFORM set_config('eventlinqs.founding_cap_override', '', TRUE);
  END IF;

  IF NOT COALESCE(v_found, FALSE) THEN
    RAISE EXCEPTION 'organisation % not found', p_org_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_after;
END $admin$;

COMMENT ON FUNCTION public.admin_set_founding_waiver(UUID, TIMESTAMPTZ, BOOLEAN, TEXT) IS
  'Owner-made grant, extend or revoke of a Founding Organiser''s terms. NULL revokes the window. p_membership moves is_founding and founding_since with it, so the badge and the window can never disagree. p_override opens the fifty cap for this transaction only and the caller must audit-log it. Service role only.';

-- The service role is the only caller. The admin surface runs as service role
-- after its own role check plus 2FA; anon and authenticated have no business
-- moving a fee waiver.
REVOKE ALL ON FUNCTION public.admin_set_founding_waiver(UUID, TIMESTAMPTZ, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_founding_waiver(UUID, TIMESTAMPTZ, BOOLEAN, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_founding_waiver(UUID, TIMESTAMPTZ, BOOLEAN, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_founding_waiver(UUID, TIMESTAMPTZ, BOOLEAN, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.credit_founding_referral(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_founding_referral(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.credit_founding_referral(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.credit_founding_referral(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. THE REVERSAL CONDITION, AS A SWITCH THE OWNER CAN THROW WITHOUT A DEPLOY
-- ---------------------------------------------------------------------------
--
-- FO1: "founding_cap reached or founding_open false closes the offer to new
-- organisers at once; existing founding organisers keep their window." The cap
-- is already counted. This is the other half, and it rides the same governed
-- switch system as every other stage flag, so it appears on /admin/flags and
-- turns off with a row change.

INSERT INTO public.feature_flags (flag, enabled, description)
VALUES (
  'founding_open',
  TRUE,
  'The Founding Organiser offer is open to NEW organisers. False closes it at once: no new spot is granted and no new window is opened. Organisations that already hold a window keep it, and their referrals keep earning. FO1 reversal condition.'
)
ON CONFLICT (flag) DO NOTHING;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS. Prove the shape before committing.
-- ---------------------------------------------------------------------------

DO $post$
DECLARE
  missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='organisations'
                   AND column_name='referred_by_organisation_id') THEN
    missing := missing || ' organisations.referred_by_organisation_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='organisations'
                   AND column_name='referral_credited_at') THEN
    missing := missing || ' organisations.referral_credited_at';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='orders'
                   AND column_name='founding_fee_waived_cents') THEN
    missing := missing || ' orders.founding_fee_waived_cents';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname='trg_founding_referral_credit' AND NOT tgisinternal) THEN
    missing := missing || ' trg_founding_referral_credit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname='trg_founding_referral_credit_insert' AND NOT tgisinternal) THEN
    missing := missing || ' trg_founding_referral_credit_insert';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag='founding_open') THEN
    missing := missing || ' feature_flags.founding_open';
  END IF;
  IF missing <> '' THEN
    RAISE EXCEPTION 'FO1 migration incomplete, missing:%', missing;
  END IF;

  -- The month arithmetic must roll forward, not clamp. 31 August plus three
  -- months is 1 December, the same answer the TypeScript gives.
  IF public.founding_add_months(TIMESTAMPTZ '2026-08-31T04:05:06Z', 3)
     <> TIMESTAMPTZ '2026-12-01T04:05:06Z' THEN
    RAISE EXCEPTION 'founding_add_months does not roll forward at month end: got %',
      public.founding_add_months(TIMESTAMPTZ '2026-08-31T04:05:06Z', 3);
  END IF;
  IF public.founding_add_months(TIMESTAMPTZ '2026-07-27T10:00:00Z', 6)
     <> TIMESTAMPTZ '2027-01-27T10:00:00Z' THEN
    RAISE EXCEPTION 'founding_add_months lost time across the six-month window: got %',
      public.founding_add_months(TIMESTAMPTZ '2026-07-27T10:00:00Z', 6);
  END IF;

  RAISE NOTICE 'FO1: referral columns, waived-fee column, credit trigger, admin waiver RPC and founding_open all present';
END $post$;

COMMIT;
