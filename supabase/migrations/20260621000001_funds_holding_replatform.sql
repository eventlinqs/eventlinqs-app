-- =====================================================================
-- 20260621000001_funds_holding_replatform.sql
-- =====================================================================
-- Payments re-platform: platform-held funds (merchant of record).
-- Design + founder sign-off: docs/PAYMENTS-FUNDS-HOLDING.md.
--   Founder ruling (2026-06-21):
--     - MoR/GST: Option 1 - platform is the PAYMENTS merchant of record and
--       holds funds, but a LIMITED PAYMENT COLLECTION AGENT for tax (organiser
--       stays GST seller of the ticket; EventLinqs remits GST only on its fee).
--     - Advance sales: Option A - transfer after the event from the platform's
--       available balance (source_transaction is a code-level config flag, not
--       relied on here), with a 90-day funds-holding monitor.
--
-- ARCHITECTURE (new, supersedes the destination-charge model):
--   Sales are SEPARATE CHARGES AND TRANSFERS. The buyer is charged on the
--   PLATFORM account (no transfer_data, no on_behalf_of, no application_fee).
--   All ticket funds sit in the PLATFORM balance and are HELD. The organiser
--   share is a platform-held LIABILITY, released to the connected account by an
--   explicit platform->connected Transfer only AFTER event_end + buffer, net of
--   the platform fee, with a reserve retained across the refund window.
--
--   This CORRECTS the false "connected accounts are on a manual payout schedule"
--   assumption baked into 20260531000003 and src/lib/payments/payout.ts: under
--   the old model funds settled to the connected account at sale and Stripe swept
--   them daily. Under this model funds never leave the platform balance until we
--   transfer them. The connected payout schedule is set by src/lib/stripe/connect.ts.
--
-- LEDGER INVARIANT (re-anchored): for every (organisation, event, currency),
--   organiser_event_available_balance() = SUM(organiser_balance_ledger.delta_cents)
--   is the amount EventLinqs holds in the PLATFORM balance earmarked for that
--   org+event and not yet transferred. Disbursement is gated on event end and is
--   computed PER EVENT (never the org-wide sum) so funds for events that have not
--   yet ended are never paid out. The amount is claimed under a row lock before
--   the Stripe transfer, and the app layer additionally caps it at the platform's
--   real Stripe available balance, mirroring the disburse_payout discipline.
--
-- SCOPE OF THIS MIGRATION (Step 2 foundation): payouts table now distinguishes
--   the platform->connected TRANSFER leg from the connected->bank PAYOUT leg;
--   the ledger gains per-event attribution; the event-scoped available function
--   and the disburse_transfer claim RPC land here. The refund-reconcile and
--   dispute RPC adaptations (stages 6-7) ship in a SEPARATE follow-up migration
--   co-developed and tested with that code, so each money RPC is proven before
--   it touches funds.
--
-- DATA-MODEL + RPC ONLY. Moves no money. Apply to a TEST/STAGING project ONLY
-- (never production) per docs/PAYMENTS-FUNDS-HOLDING.md and the constitution.
-- Idempotent (IF NOT EXISTS / OR REPLACE) so it is safe to re-run on a reset.
-- =====================================================================

-- ============================================================
-- 1. payouts: distinguish TRANSFER (platform->connected) from PAYOUT
--    (connected->bank), and attribute a disbursement to its event.
-- ============================================================
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'transfer'
    CHECK (kind IN ('transfer', 'payout')),
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_transaction_id TEXT;

-- Existing rows predate this model and were connected-account payouts
-- (connected->bank), so label them 'payout'. New disbursements default to
-- 'transfer' and disburse_transfer sets it explicitly.
UPDATE public.payouts SET kind = 'payout'
  WHERE stripe_payout_id IS NOT NULL AND kind = 'transfer';

-- stripe_transfer_id is unique when present (Postgres treats NULLs as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payouts_stripe_transfer
  ON public.payouts(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payouts_event_id
  ON public.payouts(event_id);

CREATE INDEX IF NOT EXISTS idx_payouts_kind
  ON public.payouts(kind);

COMMENT ON COLUMN public.payouts.kind IS
  'transfer = platform balance -> connected account (the disbursement we control). payout = connected account -> organiser bank (Stripe-driven leg). See docs/PAYMENTS-FUNDS-HOLDING.md.';
COMMENT ON COLUMN public.payouts.stripe_transfer_id IS
  'Stripe Transfer id for kind=transfer rows. NULL until the platform->connected transfer is created (claim-first ordering).';
COMMENT ON COLUMN public.payouts.event_id IS
  'The event whose end triggered this disbursement. Disbursement is event-scoped so funds for not-yet-ended events are never paid out.';
COMMENT ON COLUMN public.payouts.source_transaction_id IS
  'Optional Stripe charge id passed as transfer source_transaction (Option B). NULL under the Option A launch default.';

-- ============================================================
-- 2. organiser_balance_ledger: per-event attribution
-- ============================================================
-- Held funds are released per event, so every ledger delta must be attributable
-- to an event. Backfilled from the referenced order / hold where derivable;
-- older org-level payout rows with no event stay NULL (excluded from event sums).
ALTER TABLE public.organiser_balance_ledger
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

UPDATE public.organiser_balance_ledger l
  SET event_id = o.event_id
  FROM public.orders o
  WHERE l.reference_type = 'order' AND l.reference_id = o.id AND l.event_id IS NULL;

UPDATE public.organiser_balance_ledger l
  SET event_id = h.event_id
  FROM public.payout_holds h
  WHERE l.reference_type = 'hold' AND l.reference_id = h.id AND l.event_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_balance_ledger_event
  ON public.organiser_balance_ledger(organisation_id, event_id, currency);

COMMENT ON COLUMN public.organiser_balance_ledger.event_id IS
  'Event this delta is attributable to. Drives event-scoped available balance so disbursement releases held funds per ended event. NULL only for legacy org-level entries.';

-- ============================================================
-- 3. organiser_event_available_balance(): held funds for ONE ended event
-- ============================================================
-- Pure computation over the append-only ledger, scoped to org+event+currency.
-- This is the disbursable figure for an event once it has ended: order_confirmed
-- credits, minus reserve_hold, plus reserve_release, minus refunds, minus any
-- prior payout/transfer for the event. SECURITY DEFINER, service_role only.
CREATE OR REPLACE FUNCTION public.organiser_event_available_balance(
  p_organisation_id UUID,
  p_event_id UUID,
  p_currency TEXT
)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(SUM(delta_cents), 0)::BIGINT
  FROM public.organiser_balance_ledger
  WHERE organisation_id = p_organisation_id
    AND event_id = p_event_id
    AND currency = p_currency;
$$;

COMMENT ON FUNCTION public.organiser_event_available_balance(UUID, UUID, TEXT) IS
  'Platform-held funds earmarked for one org+event+currency and not yet transferred = SUM(ledger.delta_cents) scoped to that event. The disbursable figure once the event has ended.';

-- ============================================================
-- 4. disburse_transfer(): atomic claim of an event's disbursable funds
-- ============================================================
-- Event-scoped analogue of disburse_payout. Locks the org, refuses to disburse
-- while payouts are inactive or an open chargeback hold exists on the event,
-- computes the event-scoped available, refuses overpay, and atomically writes
-- BOTH the payouts row (kind='transfer', stripe_transfer_id NULL) and the
-- negative 'payout' ledger entry that reserves the funds. The app then creates
-- the Stripe Transfer with idempotency_key = payout id and back-fills
-- stripe_transfer_id. Concurrency-safe via the org lock.
CREATE OR REPLACE FUNCTION public.disburse_transfer(
  p_organisation_id UUID,
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
  v_org RECORD;
  v_available BIGINT;
  v_amount BIGINT;
  v_open_cb BIGINT;
  v_payout_id UUID;
BEGIN
  SELECT id, payout_status INTO v_org
  FROM public.organisations
  WHERE id = p_organisation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'organisation_not_found');
  END IF;

  IF v_org.payout_status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'payouts_not_active',
      'payout_status', v_org.payout_status);
  END IF;

  -- Never disburse an event with an open chargeback hold: those funds are frozen.
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_open_cb
  FROM public.payout_holds
  WHERE organisation_id = p_organisation_id
    AND event_id = p_event_id
    AND hold_type = 'chargeback'
    AND released_at IS NULL;
  IF v_open_cb > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'open_chargeback_hold',
      'frozen_cents', v_open_cb);
  END IF;

  v_available := public.organiser_event_available_balance(p_organisation_id, p_event_id, p_currency);
  v_amount := COALESCE(p_amount_cents, v_available);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'nothing_to_disburse',
      'available_cents', v_available);
  END IF;

  -- HARD INVARIANT: never record more than the event's available.
  IF v_amount > v_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'exceeds_available',
      'available_cents', v_available, 'requested_cents', v_amount);
  END IF;

  INSERT INTO public.payouts (
    organisation_id, stripe_payout_id, kind, event_id, amount_cents, currency,
    status, initiated_by, metadata
  ) VALUES (
    p_organisation_id, NULL, 'transfer', p_event_id, v_amount, p_currency,
    'pending', p_actor,
    jsonb_build_object('source', 'event_disbursement', 'available_before_cents', v_available)
  )
  RETURNING id INTO v_payout_id;

  -- Negative ledger entry reserves the funds atomically with the claim.
  INSERT INTO public.organiser_balance_ledger (
    organisation_id, event_id, delta_cents, currency, reason, reference_type, reference_id, metadata
  ) VALUES (
    p_organisation_id, p_event_id, -v_amount, p_currency, 'payout', 'payout', v_payout_id,
    jsonb_build_object('initiated_by', p_actor, 'kind', 'transfer', 'available_before_cents', v_available)
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

COMMENT ON FUNCTION public.disburse_transfer(UUID, UUID, TEXT, BIGINT, UUID) IS
  'Atomically claims an event-scoped disbursement: locks the org, blocks on inactive payouts or an open chargeback hold, computes the event-scoped available, refuses overpay, inserts the payouts row (kind=transfer, no Stripe id) plus the negative payout ledger entry. The app then creates the Stripe Transfer with idempotency_key = payout id. void_payout (20260531000003) compensates a failed transfer.';

-- ============================================================
-- 5. Grants: mutating/define-r RPCs are service_role only
-- ============================================================
REVOKE ALL ON FUNCTION public.organiser_event_available_balance(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disburse_transfer(UUID, UUID, TEXT, BIGINT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.organiser_event_available_balance(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.disburse_transfer(UUID, UUID, TEXT, BIGINT, UUID) TO service_role;

-- =====================================================================
-- End of 20260621000001_funds_holding_replatform.sql
-- =====================================================================
