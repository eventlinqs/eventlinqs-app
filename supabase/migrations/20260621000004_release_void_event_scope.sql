-- =====================================================================
-- 20260621000004_release_void_event_scope.sql
-- =====================================================================
-- Funds-holding model: event-scoped ledger completeness.
--
-- 20260621000001 added organiser_balance_ledger.event_id and made disbursement
-- event-scoped, but release_holds() and void_payout() (from 20260531000003)
-- still wrote their ledger entries with event_id NULL. That breaks the
-- event-scoped available: a released reserve (reserve_release) or a voided
-- transfer (adjustment) would not be attributed to the event, so the released
-- funds would never appear as disbursable for that event.
--
-- This CREATE OR REPLACE adds event_id to both inserts (from the hold's /
-- payout's event_id). Logic is otherwise unchanged from 20260531000003.
-- Apply to TEST/STAGING only (never production). Idempotent (OR REPLACE).
-- =====================================================================

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
    SELECT payout_status INTO v_payout_status
    FROM public.organisations
    WHERE id = v_hold.organisation_id;
    IF v_payout_status IS DISTINCT FROM 'active' THEN
      CONTINUE;
    END IF;

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

    -- event_id attached so the event-scoped available reflects the released reserve.
    INSERT INTO public.organiser_balance_ledger (
      organisation_id, event_id, delta_cents, currency, reason, reference_type, reference_id, metadata
    ) VALUES (
      v_hold.organisation_id, v_hold.event_id, v_hold.amount_cents, v_hold.currency, 'reserve_release', 'hold', v_hold.id,
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

  IF v_payout.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_reversed', true, 'payout_id', p_payout_id);
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

  -- event_id attached so the compensating credit restores the event-scoped available.
  INSERT INTO public.organiser_balance_ledger (
    organisation_id, event_id, delta_cents, currency, reason, reference_type, reference_id, metadata
  ) VALUES (
    v_payout.organisation_id, v_payout.event_id, v_payout.amount_cents, v_payout.currency, 'adjustment', 'payout', p_payout_id,
    jsonb_build_object('reversal_of_payout', p_payout_id, 'void_status', p_status, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'reversed', true, 'payout_id', p_payout_id, 'amount_cents', v_payout.amount_cents);
END;
$$;

REVOKE ALL ON FUNCTION public.release_holds() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_payout(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_holds() TO service_role;
GRANT EXECUTE ON FUNCTION public.void_payout(UUID, TEXT, TEXT) TO service_role;
