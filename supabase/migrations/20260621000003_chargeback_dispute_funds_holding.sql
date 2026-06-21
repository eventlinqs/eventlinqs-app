-- =====================================================================
-- 20260621000003_chargeback_dispute_funds_holding.sql
-- =====================================================================
-- Funds-holding model (docs/PAYMENTS-FUNDS-HOLDING.md Stage 7).
--
-- Under separate charges and transfers the PLATFORM is merchant of record and
-- is liable for disputes: Stripe automatically debits the platform balance for
-- the disputed amount + fee. These RPCs make the organiser side correct:
--
--   freeze_chargeback(order, dispute_id, dispute_amount)
--     On charge.dispute.created. Idempotent on dispute_id. Computes the
--     organiser's share of the dispute, writes a `chargeback` payout_holds row
--     (which blocks disbursement + reserve-release for the whole event until the
--     dispute resolves - disburse_transfer and release_holds both refuse while an
--     open chargeback hold exists) and a `chargeback` ledger debit that removes
--     the disputed share from the event-scoped available so it is never paid out.
--     For the common case (dispute before disbursement) this fully protects the
--     platform: the organiser simply never receives the disputed share.
--
--   resolve_chargeback(dispute_id, outcome)
--     On charge.dispute.closed. Releases the chargeback hold. won -> restores the
--     organiser's share (+adjustment) since Stripe credits the platform back.
--     lost -> the chargeback debit stands; the organiser forfeits the share.
--
-- Post-disbursement disputes (organiser already paid before the dispute) leave
-- the event-available negative and the hold open; recovering already-paid funds
-- via a transfer reversal is operator-assisted (documented follow-up), so the
-- automated path stays correct for the dominant pre-disbursement case.
--
-- Apply to TEST/STAGING only (never production). Idempotent (OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.freeze_chargeback(
  p_order_id            UUID,
  p_dispute_id          TEXT,
  p_dispute_amount_cents BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    public.orders%ROWTYPE;
  v_app_fee  BIGINT;
  v_share    BIGINT;
  v_hold_id  UUID;
  v_existing UUID;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  -- Idempotent on the Stripe dispute id (webhook may redeliver).
  SELECT id INTO v_existing FROM public.payout_holds
    WHERE hold_type = 'chargeback' AND metadata->>'dispute_id' = p_dispute_id
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_frozen', true, 'hold_id', v_existing,
      'organisation_id', v_order.organisation_id, 'event_id', v_order.event_id);
  END IF;

  v_app_fee := round(
    (v_order.platform_fee_cents + v_order.processing_fee_cents)::numeric
    * p_dispute_amount_cents / NULLIF(v_order.total_cents, 0)
  )::BIGINT;
  v_share := GREATEST(p_dispute_amount_cents - v_app_fee, 0);

  INSERT INTO public.payout_holds (
    organisation_id, event_id, hold_type, amount_cents, currency, release_at, reason_text, metadata
  ) VALUES (
    v_order.organisation_id, v_order.event_id, 'chargeback', v_share, v_order.currency,
    NOW() + INTERVAL '180 days', 'Open dispute ' || p_dispute_id,
    jsonb_build_object('dispute_id', p_dispute_id, 'order_id', v_order.id::text, 'dispute_amount_cents', p_dispute_amount_cents)
  )
  RETURNING id INTO v_hold_id;

  IF v_share > 0 THEN
    INSERT INTO public.organiser_balance_ledger (
      organisation_id, event_id, delta_cents, currency, reason, reference_type, reference_id, metadata
    ) VALUES (
      v_order.organisation_id, v_order.event_id, -v_share, v_order.currency, 'chargeback', 'dispute', NULL,
      jsonb_build_object('dispute_id', p_dispute_id, 'order_id', v_order.id::text)
    );

    UPDATE public.organisations
      SET hold_amount_cents = hold_amount_cents + v_share, updated_at = NOW()
      WHERE id = v_order.organisation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'organisation_id', v_order.organisation_id,
    'event_id', v_order.event_id,
    'share_cents', v_share
  );
END;
$$;

COMMENT ON FUNCTION public.freeze_chargeback(UUID, TEXT, BIGINT) IS
  'On charge.dispute.created: freezes the organiser share of a disputed order (chargeback payout_holds row blocking the event + chargeback ledger debit removing it from available). Idempotent on dispute_id.';

CREATE OR REPLACE FUNCTION public.resolve_chargeback(
  p_dispute_id TEXT,
  p_outcome    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.payout_holds%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('won', 'lost') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_outcome');
  END IF;

  SELECT * INTO v_hold FROM public.payout_holds
    WHERE hold_type = 'chargeback' AND metadata->>'dispute_id' = p_dispute_id
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'no_hold', true);
  END IF;
  IF v_hold.released_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_resolved', true, 'hold_id', v_hold.id);
  END IF;

  UPDATE public.payout_holds SET released_at = NOW() WHERE id = v_hold.id;
  UPDATE public.organisations
    SET hold_amount_cents = GREATEST(0, hold_amount_cents - v_hold.amount_cents), updated_at = NOW()
    WHERE id = v_hold.organisation_id;

  IF p_outcome = 'won' AND v_hold.amount_cents > 0 THEN
    -- Stripe credits the platform back on a won dispute; restore the organiser's
    -- share so it becomes disbursable again.
    INSERT INTO public.organiser_balance_ledger (
      organisation_id, event_id, delta_cents, currency, reason, reference_type, reference_id, metadata
    ) VALUES (
      v_hold.organisation_id, v_hold.event_id, v_hold.amount_cents, v_hold.currency, 'adjustment', 'dispute', NULL,
      jsonb_build_object('dispute_id', p_dispute_id, 'outcome', 'won', 'restores_chargeback', true)
    );
  END IF;
  -- lost: the -chargeback debit stands (organiser forfeits the disputed share).

  RETURN jsonb_build_object('success', true, 'outcome', p_outcome, 'hold_id', v_hold.id, 'share_cents', v_hold.amount_cents);
END;
$$;

COMMENT ON FUNCTION public.resolve_chargeback(TEXT, TEXT) IS
  'On charge.dispute.closed: releases the chargeback hold. won restores the organiser share (+adjustment); lost leaves it forfeited. Idempotent.';

REVOKE ALL ON FUNCTION public.freeze_chargeback(UUID, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_chargeback(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.freeze_chargeback(UUID, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_chargeback(TEXT, TEXT) TO service_role;
