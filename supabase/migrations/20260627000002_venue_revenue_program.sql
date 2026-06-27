-- =====================================================================
-- 20260627000002_venue_revenue_program.sql
-- =====================================================================
-- The Venue Revenue Sharing Program (CLAUDE.md "Venue Revenue Sharing
-- Program"; docs/EventLinqs-Venue-Revenue-Program-SPEC.md).
--
-- An ENROLLED venue earns 20% of the EventLinqs PLATFORM FEE on every paid
-- ticket for an event held at that venue. The share is carved from the
-- platform fee EventLinqs already keeps, so it NEVER reduces the organiser
-- payout or the buyer total, and NEVER makes EventLinqs unprofitable. It is an
-- opt-in, attractive-offer model: there is no hard exclusivity (ACCC/DOJ risk),
-- venues choose EventLinqs because it pays them.
--
-- This migration is DATA-MODEL + RPC ONLY. It moves no money. It is ADDITIVE:
-- the organiser ledger (organiser_balance_ledger), the disburse_transfer claim,
-- and the charge/transfer mechanics are NOT touched. The venue share lives in a
-- SEPARATE ledger funded from EventLinqs's retained margin, paid through the
-- same proven funds-holding transfer path after the event.
--
-- Single source of truth: the 20% rate lives in pricing_rules as
-- rule_type='venue_revenue_share_percentage' and is resolved by the ONE
-- getPricingRule resolver and admin-editable, so it never forks fee logic.
--
-- Idempotent (IF NOT EXISTS / DROP ... IF EXISTS / OR REPLACE) so it is safe to
-- re-run. Apply to a TEST/STAGING project first (never production) per the
-- constitution: Lawal applies with `supabase db push --linked` and verifies
-- with a direct DB query.
-- =====================================================================

-- ============================================================
-- 1. venues: Stripe connected-account fields + enrolment state
-- ============================================================
-- A venue is "in the program" iff revenue_share_status = 'enrolled'. The
-- enrolled/unenrolled timestamps are the human-readable audit; the status is the
-- machine gate the accrual path reads. stripe_* mirror the organisation fields so
-- a venue is paid by the same platform->connected Transfer as an organiser.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_account_country TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revenue_share_status TEXT NOT NULL DEFAULT 'not_enrolled'
    CHECK (revenue_share_status IN ('not_enrolled', 'enrolled', 'suspended')),
  ADD COLUMN IF NOT EXISTS revenue_share_enrolled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revenue_share_unenrolled_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_venues_stripe_account
  ON public.venues(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_revenue_share_enrolled
  ON public.venues(revenue_share_status) WHERE revenue_share_status = 'enrolled';

COMMENT ON COLUMN public.venues.revenue_share_status IS
  'Venue Revenue Sharing Program membership. enrolled = paid tickets at this venue accrue a venue share. Only ''enrolled'' generates shares; ''suspended''/''not_enrolled'' do not. Past accruals are immutable on un-enrol.';

-- Index the event->venue link so the venue-disbursement scan (find ended events
-- at enrolled venues) and the dashboard event list stay fast.
CREATE INDEX IF NOT EXISTS idx_events_venue_id
  ON public.events(venue_id) WHERE venue_id IS NOT NULL;

-- ============================================================
-- 2. venue_enrolments: append-only enrolment history (who/when/rate)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venue_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('enrolled', 'unenrolled', 'suspended', 'resumed')),
  share_percentage NUMERIC(7, 4),
  actor_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venue_enrolments_venue
  ON public.venue_enrolments(venue_id, created_at DESC);

COMMENT ON TABLE public.venue_enrolments IS
  'Append-only audit of every venue enrolment state change (who, when, rate snapshot). The current state lives denormalised on venues.revenue_share_status for fast reads.';

-- ============================================================
-- 3. venue_share_ledger: append-only ledger of what each venue is owed
-- ============================================================
-- The venue's payable balance for an event = SUM(delta_cents) over its rows:
--   accrual          (+) one per paid order at an enrolled venue
--   refund_reversal  (-) proportional claw-back when a ticket is refunded
--   payout           (-) the disbursement claim (disburse_venue_share)
--   adjustment       (+/-) compensations (e.g. a voided/failed payout)
-- Funded from EventLinqs's retained platform fee, never from organiser money, so
-- it is intentionally SEPARATE from organiser_balance_ledger.
CREATE TABLE IF NOT EXISTS public.venue_share_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  delta_cents BIGINT NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('accrual', 'refund_reversal', 'payout', 'adjustment')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('order', 'refund', 'payout', 'adjustment')),
  reference_id UUID,
  platform_fee_cents BIGINT,
  share_percentage NUMERIC(7, 4),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one accrual per order: makes the confirmation hook idempotent on
-- Stripe webhook redelivery (the unique violation is caught and treated as
-- already-recorded).
CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_share_ledger_accrual_order
  ON public.venue_share_ledger(order_id) WHERE reason = 'accrual';

CREATE INDEX IF NOT EXISTS idx_venue_share_ledger_venue_event
  ON public.venue_share_ledger(venue_id, event_id, currency);

CREATE INDEX IF NOT EXISTS idx_venue_share_ledger_order
  ON public.venue_share_ledger(order_id);

CREATE INDEX IF NOT EXISTS idx_venue_share_ledger_reference
  ON public.venue_share_ledger(reference_type, reference_id);

COMMENT ON TABLE public.venue_share_ledger IS
  'Append-only ledger of venue revenue-share amounts owed, funded from the EventLinqs platform-fee margin (NOT organiser funds). Payable balance = SUM(delta_cents) per venue+event+currency. Separate from organiser_balance_ledger so the organiser reconciliation is untouched.';

-- ============================================================
-- 4. venue_payouts: the platform->venue transfer record
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venue_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  stripe_transfer_id TEXT,
  destination_account_id TEXT,
  arrival_date TIMESTAMPTZ,
  initiated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_payouts_stripe_transfer
  ON public.venue_payouts(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venue_payouts_venue_event
  ON public.venue_payouts(venue_id, event_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.venue_payouts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.venue_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.venue_payouts IS
  'platform balance -> venue connected account transfers of accrued venue share, after the event. Mirrors payouts(kind=transfer). stripe_transfer_id is the idempotency anchor.';

-- ============================================================
-- 5. venue_event_share_balance(): payable venue share for one event
-- ============================================================
CREATE OR REPLACE FUNCTION public.venue_event_share_balance(
  p_venue_id UUID,
  p_event_id UUID,
  p_currency TEXT
)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(SUM(delta_cents), 0)::BIGINT
  FROM public.venue_share_ledger
  WHERE venue_id = p_venue_id
    AND event_id IS NOT DISTINCT FROM p_event_id
    AND currency = p_currency;
$$;

COMMENT ON FUNCTION public.venue_event_share_balance(UUID, UUID, TEXT) IS
  'Net venue share owed for one venue+event+currency = SUM(venue_share_ledger.delta_cents). The disbursable figure once the event has ended.';

-- ============================================================
-- 6. disburse_venue_share(): atomic claim of a venue's accrued share
-- ============================================================
-- Venue analogue of disburse_transfer. Locks the venue row, computes the net
-- payable, refuses overpay, and atomically writes BOTH the venue_payouts row
-- (status='pending', stripe_transfer_id NULL) and the negative 'payout' ledger
-- entry that reserves the funds. The app then creates the Stripe Transfer with
-- idempotency_key = payout id and back-fills stripe_transfer_id; void_venue_payout
-- compensates a failed transfer. Payout is NOT gated on current enrolment: a
-- venue that un-enrolled is still paid what it accrued WHILE enrolled.
CREATE OR REPLACE FUNCTION public.disburse_venue_share(
  p_venue_id UUID,
  p_event_id UUID,
  p_currency TEXT,
  p_amount_cents BIGINT DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venue RECORD;
  v_available BIGINT;
  v_amount BIGINT;
  v_payout_id UUID;
BEGIN
  SELECT id, stripe_account_id INTO v_venue
  FROM public.venues
  WHERE id = p_venue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'venue_not_found');
  END IF;

  v_available := public.venue_event_share_balance(p_venue_id, p_event_id, p_currency);
  v_amount := COALESCE(p_amount_cents, v_available);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'nothing_to_disburse',
      'available_cents', v_available);
  END IF;

  IF v_amount > v_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'exceeds_available',
      'available_cents', v_available, 'requested_cents', v_amount);
  END IF;

  INSERT INTO public.venue_payouts (
    venue_id, event_id, amount_cents, currency, status,
    destination_account_id, initiated_by, metadata
  ) VALUES (
    p_venue_id, p_event_id, v_amount, p_currency, 'pending',
    v_venue.stripe_account_id, p_actor,
    jsonb_build_object('source', 'venue_event_disbursement', 'available_before_cents', v_available)
  )
  RETURNING id INTO v_payout_id;

  -- Negative ledger entry reserves the funds atomically with the claim.
  INSERT INTO public.venue_share_ledger (
    venue_id, event_id, order_id, delta_cents, currency, reason,
    reference_type, reference_id, metadata
  ) VALUES (
    p_venue_id, p_event_id, NULL, -v_amount, p_currency, 'payout',
    'payout', v_payout_id,
    jsonb_build_object('initiated_by', p_actor, 'available_before_cents', v_available)
  );

  RETURN jsonb_build_object(
    'success', true,
    'payout_id', v_payout_id,
    'amount_cents', v_amount,
    'available_before_cents', v_available,
    'available_after_cents', v_available - v_amount
  );
END;
$$;

COMMENT ON FUNCTION public.disburse_venue_share(UUID, UUID, TEXT, BIGINT, UUID) IS
  'Atomically claims a venue-share disbursement: locks the venue, computes the net payable from venue_share_ledger, refuses overpay, inserts the venue_payouts row (pending, no Stripe id) plus the negative payout ledger entry. The app then creates the Stripe Transfer with idempotency_key = payout id. void_venue_payout compensates a failed transfer.';

-- ============================================================
-- 7. void_venue_payout(): compensate a failed/voided venue transfer
-- ============================================================
CREATE OR REPLACE FUNCTION public.void_venue_payout(
  p_payout_id UUID,
  p_status TEXT DEFAULT 'failed',
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payout RECORD;
BEGIN
  IF p_status NOT IN ('failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  SELECT id, venue_id, event_id, amount_cents, currency, status
  INTO v_payout
  FROM public.venue_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'payout_not_found');
  END IF;

  -- Idempotent: already failed -> no double compensation.
  IF v_payout.status = 'failed' THEN
    RETURN jsonb_build_object('success', true, 'already_voided', true);
  END IF;

  UPDATE public.venue_payouts
  SET status = 'failed',
      metadata = metadata || jsonb_build_object('void_reason', p_reason),
      updated_at = NOW()
  WHERE id = p_payout_id;

  -- Restore the reserved funds with an offsetting +adjustment entry.
  INSERT INTO public.venue_share_ledger (
    venue_id, event_id, order_id, delta_cents, currency, reason,
    reference_type, reference_id, metadata
  ) VALUES (
    v_payout.venue_id, v_payout.event_id, NULL, v_payout.amount_cents, v_payout.currency,
    'adjustment', 'payout', v_payout.id,
    jsonb_build_object('void_of_payout', true, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'restored_cents', v_payout.amount_cents);
END;
$$;

COMMENT ON FUNCTION public.void_venue_payout(UUID, TEXT, TEXT) IS
  'Compensates a failed venue transfer: marks the venue_payouts row failed and writes the offsetting +adjustment ledger entry so the venue''s payable balance is restored. Idempotent.';

-- ============================================================
-- 8. Grants: define-r / mutating RPCs are service_role only
-- ============================================================
REVOKE ALL ON FUNCTION public.venue_event_share_balance(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disburse_venue_share(UUID, UUID, TEXT, BIGINT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_venue_payout(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.venue_event_share_balance(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.disburse_venue_share(UUID, UUID, TEXT, BIGINT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_venue_payout(UUID, TEXT, TEXT) TO service_role;

-- ============================================================
-- 9. RLS: service role writes; venue org members read their own
-- ============================================================
ALTER TABLE public.venue_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_share_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_payouts ENABLE ROW LEVEL SECURITY;

-- A user can read a venue's program rows iff they own or manage the venue's
-- organisation (owner_id, or organisation_members owner/admin/manager). All
-- writes go through the service-role admin client (RLS-bypassing), never the
-- session client, mirroring the organiser ledger discipline.
DROP POLICY IF EXISTS "Service role manages venue enrolments" ON public.venue_enrolments;
CREATE POLICY "Service role manages venue enrolments"
  ON public.venue_enrolments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Venue org members can view enrolments" ON public.venue_enrolments;
CREATE POLICY "Venue org members can view enrolments"
  ON public.venue_enrolments FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM public.venues v
      WHERE v.organisation_id IN (SELECT id FROM public.organisations WHERE owner_id = auth.uid())
         OR v.organisation_id IN (
           SELECT organisation_id FROM public.organisation_members
           WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
         )
    )
  );

DROP POLICY IF EXISTS "Service role manages venue share ledger" ON public.venue_share_ledger;
CREATE POLICY "Service role manages venue share ledger"
  ON public.venue_share_ledger FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Venue org members can view share ledger" ON public.venue_share_ledger;
CREATE POLICY "Venue org members can view share ledger"
  ON public.venue_share_ledger FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM public.venues v
      WHERE v.organisation_id IN (SELECT id FROM public.organisations WHERE owner_id = auth.uid())
         OR v.organisation_id IN (
           SELECT organisation_id FROM public.organisation_members
           WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
         )
    )
  );

DROP POLICY IF EXISTS "Service role manages venue payouts" ON public.venue_payouts;
CREATE POLICY "Service role manages venue payouts"
  ON public.venue_payouts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Venue org members can view payouts" ON public.venue_payouts;
CREATE POLICY "Venue org members can view payouts"
  ON public.venue_payouts FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM public.venues v
      WHERE v.organisation_id IN (SELECT id FROM public.organisations WHERE owner_id = auth.uid())
         OR v.organisation_id IN (
           SELECT organisation_id FROM public.organisation_members
           WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
         )
    )
  );

-- ============================================================
-- 10. pricing_rules seed: venue_revenue_share_percentage = 20
-- ============================================================
-- Single source of truth for the venue share rate, resolved by getPricingRule
-- and admin-editable in /admin/venues. Seed the AU/AUD region default and a
-- GLOBAL/AUD fallback at 20%. Append-only versioned, idempotent: only writes
-- when the current effective value differs from 20.
DO $$
DECLARE
  v_cur_pct NUMERIC;
  v_next    INT;
BEGIN
  -- AU/AUD region default -> 20
  SELECT value_percentage INTO v_cur_pct
  FROM public.pricing_rules
  WHERE rule_type = 'venue_revenue_share_percentage'
    AND country_code = 'AU' AND currency = 'AUD'
    AND organisation_id IS NULL AND event_id IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY version DESC
  LIMIT 1;

  IF v_cur_pct IS DISTINCT FROM 20 THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.pricing_rules
    WHERE rule_type = 'venue_revenue_share_percentage'
      AND country_code = 'AU' AND currency = 'AUD'
      AND organisation_id IS NULL AND event_id IS NULL;

    INSERT INTO public.pricing_rules
      (rule_type, country_code, currency, event_type, organiser_tier,
       organisation_id, event_id, value_type,
       value_percentage, value_cents, value_integer,
       version, effective_from, effective_until)
    VALUES
      ('venue_revenue_share_percentage', 'AU', 'AUD', 'ALL', 'ALL',
       NULL, NULL, 'percentage',
       20, NULL, NULL,
       v_next, now(), NULL);
  END IF;

  -- GLOBAL/AUD fallback -> 20
  SELECT value_percentage INTO v_cur_pct
  FROM public.pricing_rules
  WHERE rule_type = 'venue_revenue_share_percentage'
    AND country_code = 'GLOBAL' AND currency = 'AUD'
    AND organisation_id IS NULL AND event_id IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY version DESC
  LIMIT 1;

  IF v_cur_pct IS DISTINCT FROM 20 THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.pricing_rules
    WHERE rule_type = 'venue_revenue_share_percentage'
      AND country_code = 'GLOBAL' AND currency = 'AUD'
      AND organisation_id IS NULL AND event_id IS NULL;

    INSERT INTO public.pricing_rules
      (rule_type, country_code, currency, event_type, organiser_tier,
       organisation_id, event_id, value_type,
       value_percentage, value_cents, value_integer,
       version, effective_from, effective_until)
    VALUES
      ('venue_revenue_share_percentage', 'GLOBAL', 'AUD', 'ALL', 'ALL',
       NULL, NULL, 'percentage',
       20, NULL, NULL,
       v_next, now(), NULL);
  END IF;
END $$;

-- =====================================================================
-- End of 20260627000002_venue_revenue_program.sql
-- =====================================================================
