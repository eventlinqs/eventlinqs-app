-- =====================================================================
-- 20260621000005_reconcile_refund_cast_and_event_scope.sql
-- =====================================================================
-- 20260621000002 re-defined reconcile_refund to add event_id (event-scoped
-- ledger) but was authored from the 20260531000001 body, which accidentally
-- dropped the order_status enum cast that 20260531000002 had added. That made
-- the UPDATE orders SET status = CASE ... raise "column status is of type
-- order_status but expression is of type text", so reconcile_refund threw and
-- refunds never reconciled. Caught by the end-to-end TEST proof.
--
-- This migration restores the explicit ::public.order_status cast AND keeps the
-- event_id attribution on every ledger insert. Body otherwise unchanged.
-- Apply to TEST/STAGING only (never production). Idempotent (OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reconcile_refund(
  p_stripe_refund_id    TEXT,
  p_charge_id           TEXT,
  p_refund_amount_cents BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund       public.refunds%ROWTYPE;
  v_order        public.orders%ROWTYPE;
  v_share        BIGINT;
  v_app_fee      BIGINT;
  v_proc         BIGINT;
  v_reserve_part BIGINT;
  v_balance_part BIGINT;
  v_hold         public.payout_holds%ROWTYPE;
  v_remaining    INT;
BEGIN
  SELECT * INTO v_refund FROM public.refunds
    WHERE stripe_refund_id = p_stripe_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_refund_row';
  END IF;
  IF v_refund.status = 'completed' THEN
    RETURN 'already_done';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_refund.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found for refund %', v_refund.order_id, v_refund.id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.tickets t
    SET status = 'refunded', refunded_at = NOW(), updated_at = NOW()
    FROM public.refund_tickets rt
    WHERE rt.refund_id = v_refund.id AND rt.ticket_id = t.id
      AND t.status NOT IN ('void','refunded');

  UPDATE public.ticket_tiers tt
    SET sold_count = GREATEST(0, tt.sold_count - sub.cnt),
        updated_at = NOW()
  FROM (
    SELECT t.ticket_tier_id AS tier, count(*)::int AS cnt
    FROM public.refund_tickets rt
    JOIN public.tickets t ON t.id = rt.ticket_id
    WHERE rt.refund_id = v_refund.id AND t.ticket_tier_id IS NOT NULL
    GROUP BY t.ticket_tier_id
  ) sub
  WHERE tt.id = sub.tier;

  v_app_fee := round(
    (v_order.platform_fee_cents + v_order.processing_fee_cents)::numeric
    * p_refund_amount_cents / NULLIF(v_order.total_cents, 0)
  )::BIGINT;
  v_share := p_refund_amount_cents - v_app_fee;

  SELECT * INTO v_hold FROM public.payout_holds
    WHERE organisation_id = v_order.organisation_id
      AND hold_type = 'reserve'
      AND released_at IS NULL
      AND (metadata->>'order_id') = v_order.id::text
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE;

  IF FOUND AND v_hold.amount_cents > 0 AND v_share > 0 THEN
    v_reserve_part := LEAST(v_hold.amount_cents, v_share);
  ELSE
    v_reserve_part := 0;
  END IF;
  v_balance_part := v_share - v_reserve_part;

  IF v_reserve_part > 0 THEN
    INSERT INTO public.organiser_balance_ledger
      (organisation_id, event_id, delta_cents, currency, reason, reference_type, reference_id, metadata)
    VALUES
      (v_order.organisation_id, v_order.event_id, v_reserve_part, v_order.currency, 'reserve_release',
       'order', v_order.id,
       jsonb_build_object('refund_id', v_refund.id, 'stripe_refund_id', p_stripe_refund_id)),
      (v_order.organisation_id, v_order.event_id, -v_reserve_part, v_order.currency, 'refund_from_reserve',
       'order', v_order.id,
       jsonb_build_object('refund_id', v_refund.id, 'stripe_refund_id', p_stripe_refund_id));

    UPDATE public.payout_holds
      SET amount_cents = amount_cents - v_reserve_part,
          released_at  = CASE WHEN amount_cents - v_reserve_part <= 0 THEN NOW() ELSE released_at END
      WHERE id = v_hold.id;

    UPDATE public.organisations
      SET hold_amount_cents = GREATEST(0, hold_amount_cents - v_reserve_part),
          updated_at = NOW()
      WHERE id = v_order.organisation_id;
  END IF;

  IF v_balance_part <> 0 THEN
    INSERT INTO public.organiser_balance_ledger
      (organisation_id, event_id, delta_cents, currency, reason, reference_type, reference_id, metadata)
    VALUES
      (v_order.organisation_id, v_order.event_id, -v_balance_part, v_order.currency, 'refund_from_balance',
       'order', v_order.id,
       jsonb_build_object('refund_id', v_refund.id, 'stripe_refund_id', p_stripe_refund_id));
  END IF;

  v_proc := round(
    v_order.processing_fee_cents::numeric * p_refund_amount_cents / NULLIF(v_order.total_cents, 0)
  )::BIGINT;
  UPDATE public.organisations
    SET total_volume_cents = GREATEST(0, total_volume_cents - (p_refund_amount_cents - v_proc)),
        updated_at = NOW()
    WHERE id = v_order.organisation_id;

  SELECT count(*) INTO v_remaining FROM public.tickets
    WHERE order_id = v_order.id AND status IN ('valid','scanned');
  UPDATE public.orders
    SET status = (CASE WHEN v_remaining = 0 THEN 'refunded' ELSE 'partially_refunded' END)::public.order_status,
        updated_at = NOW()
    WHERE id = v_order.id;

  UPDATE public.refunds
    SET status = 'completed', processed_at = NOW()
    WHERE id = v_refund.id;

  RETURN 'reconciled';
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_refund(TEXT, TEXT, BIGINT) FROM PUBLIC;
