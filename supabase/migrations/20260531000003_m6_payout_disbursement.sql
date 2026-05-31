-- Migration: 20260531000003_m6_payout_disbursement.sql
-- (renumbered from 20260531000001 to resolve a version collision with the
--  refund work now on main: 20260531000001_refund_reconcile.sql and
--  20260531000002_fix_reconcile_refund_status_cast.sql. Refund holds 0001/0002;
--  payout takes 0003. Renumber only; body unchanged.)
--
-- M6 launch-gate item 4: organiser payout disbursement + reserve-hold release.
--
-- ARCHITECTURE (locked decision, 2026-05-31): the sale path is a Stripe
-- destination charge, so the organiser's full share (including the reserve)
-- already lands in their CONNECTED account at sale time. The platform never
-- holds those funds. Disbursement is therefore a Stripe PAYOUT created ON the
-- connected account (balance -> organiser bank), NOT a transfer to it. The
-- reserve is held by leaving it in the connected account's Stripe balance
-- (connected accounts must be on a MANUAL payout schedule) until release_at,
-- after which a follow-up payout disburses it.
--
-- The organiser_balance_ledger is the platform's authoritative accounting:
--   available_balance(org, currency) = SUM(delta_cents)
-- order_confirmed (+share), reserve_hold (-reserve), reserve_release (+),
-- payout (-), refund_* (-), chargeback (-), adjustment (+/-). The running
-- sum is exactly "credits - active holds - already-paid - refunds".
--
-- HARD INVARIANT: disburse_payout never records a payout larger than the
-- available ledger balance, computed under a row lock so two concurrent
-- admins produce exactly one payout. The app layer additionally caps the
-- amount at the connected account's real Stripe available balance before
-- calling this RPC, so a refund that reverses a transfer (and is not yet
-- mirrored in the ledger) can never cause an overpay.
--
-- This migration is DATA-MODEL + RPC only. It does not move money; the app
-- layer (src/lib/payments/payout.ts) calls Stripe. Apply with (npx is broken
-- on this machine; use the supabase binary directly, from this worktree):
--   supabase db push --linked
-- Then verify the functions exist by probing pg_proc, not the "up to date" line.

-- ============================================================
-- 1. payouts table: support platform-initiated payouts
-- ============================================================
-- The Phase-1 stub keyed every row on a Stripe payout id (webhook-upsert).
-- Platform-initiated payouts are created in the DB FIRST (the atomic claim),
-- before the Stripe payout exists, so stripe_payout_id must be nullable. It
-- stays UNIQUE (Postgres treats multiple NULLs as distinct, so this is safe).

ALTER TABLE public.payouts
  ALTER COLUMN stripe_payout_id DROP NOT NULL;

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payouts.initiated_by IS
  'admin_users.id of the operator who triggered this payout. NULL for webhook-observed / system payouts.';
COMMENT ON COLUMN public.payouts.reversed_at IS
  'Set when a failed/canceled payout has had its ledger debit compensated (see void_payout). Guards against double compensation.';

-- ============================================================
-- 2. organiser_available_balance(): the single available figure
-- ============================================================
-- Pure computation over the append-only ledger. SECURITY DEFINER so it can
-- read the ledger regardless of the caller's RLS; granted to service_role
-- only (admin paths). Organiser-facing reads sum their own RLS-scoped ledger
-- rows directly, so this function is never exposed to organisers.

CREATE OR REPLACE FUNCTION public.organiser_available_balance(
  p_organisation_id UUID,
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
    AND currency = p_currency;
$$;

COMMENT ON FUNCTION public.organiser_available_balance(UUID, TEXT) IS
  'Authoritative available balance = SUM(organiser_balance_ledger.delta_cents) for an org+currency. Subtracts reserve holds, payouts and refunds; adds reserve releases.';

-- ============================================================
-- 3. disburse_payout(): atomic claim of an available payout
-- ============================================================
-- Locks the organisation row, computes available exactly, refuses to overpay,
-- and atomically writes BOTH the payout row (status 'pending', no Stripe id
-- yet) and the negative ledger entry that reserves the funds. The app then
-- creates the Stripe payout with idempotency_key = payout id and back-fills
-- stripe_payout_id. Two concurrent admins serialise on the org lock: the
-- second sees the reduced available and is refused -> exactly one payout.

CREATE OR REPLACE FUNCTION public.disburse_payout(
  p_organisation_id UUID,
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
  v_payout_id UUID;
BEGIN
  -- Lock the organisation row for the duration of the transaction.
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

  v_available := public.organiser_available_balance(p_organisation_id, p_currency);
  v_amount := COALESCE(p_amount_cents, v_available);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'nothing_to_disburse',
      'available_cents', v_available);
  END IF;

  -- HARD INVARIANT: never record more than available.
  IF v_amount > v_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'exceeds_available',
      'available_cents', v_available, 'requested_cents', v_amount);
  END IF;

  INSERT INTO public.payouts (
    organisation_id, stripe_payout_id, amount_cents, currency, status, initiated_by, metadata
  ) VALUES (
    p_organisation_id, NULL, v_amount, p_currency, 'pending', p_actor,
    jsonb_build_object('source', 'operator_disbursement', 'available_before_cents', v_available)
  )
  RETURNING id INTO v_payout_id;

  -- Negative ledger entry: reserves the funds atomically with the claim.
  INSERT INTO public.organiser_balance_ledger (
    organisation_id, delta_cents, currency, reason, reference_type, reference_id, metadata
  ) VALUES (
    p_organisation_id, -v_amount, p_currency, 'payout', 'payout', v_payout_id,
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

COMMENT ON FUNCTION public.disburse_payout(UUID, TEXT, BIGINT, UUID) IS
  'Atomically claims a payout: locks the org, computes available from the ledger, refuses overpay, inserts the payout row (status pending, no Stripe id) plus the negative ledger entry. The app creates the Stripe payout next with idempotency_key = payout id.';

-- ============================================================
-- 4. void_payout(): compensate a failed/canceled payout
-- ============================================================
-- Idempotent reversal: marks the payout failed/canceled and writes the
-- compensating positive ledger entry so available is restored (net zero
-- balance change on failure). reversed_at guards against double compensation.
-- A 'paid' payout cannot be voided (the money has moved).

CREATE OR REPLACE FUNCTION public.void_payout(
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
  IF p_status NOT IN ('failed', 'canceled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_void_status');
  END IF;

  SELECT * INTO v_payout
  FROM public.payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'payout_not_found');
  END IF;

  -- Already compensated: idempotent no-op.
  IF v_payout.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_reversed', true,
      'payout_id', p_payout_id);
  END IF;

  IF v_payout.status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_void_paid');
  END IF;

  UPDATE public.payouts
  SET status = p_status,
      failure_reason = COALESCE(p_reason, failure_reason),
      reversed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_payout_id;

  INSERT INTO public.organiser_balance_ledger (
    organisation_id, delta_cents, currency, reason, reference_type, reference_id, metadata
  ) VALUES (
    v_payout.organisation_id, v_payout.amount_cents, v_payout.currency, 'adjustment', 'payout', p_payout_id,
    jsonb_build_object('reversal_of_payout', p_payout_id, 'void_status', p_status, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'reversed', true,
    'payout_id', p_payout_id, 'amount_cents', v_payout.amount_cents);
END;
$$;

COMMENT ON FUNCTION public.void_payout(UUID, TEXT, TEXT) IS
  'Idempotently compensates a failed/canceled payout: marks it and writes the offsetting positive ledger entry so available is restored. reversed_at prevents double compensation. Cannot void a paid payout.';

-- ============================================================
-- 5. release_holds(): move matured reserves into available
-- ============================================================
-- For every reserve hold whose release_at has passed and that is not yet
-- released, on an organisation that is payout-active and has no open
-- chargeback hold on the same event, mark it released and write the
-- reserve_release credit (moving the reserve into available) and decrement
-- the org's hold counter. FOR UPDATE SKIP LOCKED + released_at guard make it
-- concurrency-safe and safe to run repeatedly (the cron).

CREATE OR REPLACE FUNCTION public.release_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
  v_hold RECORD;
  v_payout_status TEXT;
  v_has_open_chargeback BOOLEAN;
BEGIN
  FOR v_hold IN
    SELECT id, organisation_id, event_id, amount_cents, currency
    FROM public.payout_holds
    WHERE hold_type = 'reserve'
      AND released_at IS NULL
      AND release_at <= NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Skip while the organisation is not payout-active (on_hold / restricted).
    SELECT payout_status INTO v_payout_status
    FROM public.organisations
    WHERE id = v_hold.organisation_id;
    IF v_payout_status IS DISTINCT FROM 'active' THEN
      CONTINUE;
    END IF;

    -- Skip while an open chargeback hold exists on the same event
    -- (the "no open dispute" release condition).
    SELECT EXISTS (
      SELECT 1 FROM public.payout_holds c
      WHERE c.organisation_id = v_hold.organisation_id
        AND c.event_id IS NOT DISTINCT FROM v_hold.event_id
        AND c.hold_type = 'chargeback'
        AND c.released_at IS NULL
    ) INTO v_has_open_chargeback;
    IF v_has_open_chargeback THEN
      CONTINUE;
    END IF;

    UPDATE public.payout_holds
    SET released_at = NOW()
    WHERE id = v_hold.id;

    INSERT INTO public.organiser_balance_ledger (
      organisation_id, delta_cents, currency, reason, reference_type, reference_id, metadata
    ) VALUES (
      v_hold.organisation_id, v_hold.amount_cents, v_hold.currency, 'reserve_release', 'hold', v_hold.id,
      jsonb_build_object('released_by', 'cron')
    );

    UPDATE public.organisations
    SET hold_amount_cents = GREATEST(hold_amount_cents - v_hold.amount_cents, 0),
        updated_at = NOW()
    WHERE id = v_hold.organisation_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.release_holds() IS
  'Releases matured reserve holds: for each reserve hold past release_at on a payout-active org with no open chargeback hold on the same event, sets released_at, writes the reserve_release credit, and decrements the org hold counter. Idempotent and concurrency-safe; driven by /api/cron/payout-holds-release.';

-- ============================================================
-- 6. Grants: mutating RPCs are service_role only
-- ============================================================
-- Organisers can never call these. The admin server actions (service-role
-- client) call them after requireAdminSession + capability checks. Organiser
-- read access to payouts/holds/ledger is via the existing RLS SELECT policies
-- only.

REVOKE ALL ON FUNCTION public.organiser_available_balance(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disburse_payout(UUID, TEXT, BIGINT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_payout(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_holds() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.organiser_available_balance(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.disburse_payout(UUID, TEXT, BIGINT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_payout(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_holds() TO service_role;
