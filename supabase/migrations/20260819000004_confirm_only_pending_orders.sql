-- ============================================================================
-- A refunded order must never confirm into a ticket
-- Run by founder: supabase db push --linked
-- Reproduced by: scripts/verify/webhook-ordering-drill.mjs (TEST 1)
-- Proven by:     the same drill, plus refund-e2e, the expiry drill and the
--                oversell drill as no-regression checks
-- ============================================================================
--
-- THE DEFECT, DRIVEN OVER HTTP BEFORE THIS WAS WRITTEN.
--
-- Stripe gives no ordering guarantee between event types. scripts/verify/
-- webhook-ordering-drill.mjs delivered a REAL charge.refunded for a REAL test-mode
-- charge BEFORE payment_intent.succeeded for the same intent, both signed and both
-- through the real route:
--
--   [1] charge.refunded          -> order=refunded,  tickets=0, ledger -2500c
--   [2] payment_intent.succeeded -> order=confirmed, tickets=1, sold_count 0 -> 1
--   Stripe: amount_refunded 2749 of 2749
--
--   RESULT: a valid admitting ticket, a consumed seat, and the buyer holding every
--           cent back. "A ticket exists and no money was taken."
--
-- WHY. confirm_order's only early exit was `IF v_order.status = 'confirmed'`. An
-- order sitting at `refunded` is not `confirmed`, so it fell straight through,
-- confirmed the order, and trg_issue_tickets_on_confirm fired on the transition.
--
-- A SECOND RISK WAS SUSPECTED AND IS WITHDRAWN, recorded because the withdrawal is
-- the useful part. tg_issue_tickets_on_confirm fires on ANY transition into
-- `confirmed`, so an order at `partially_refunded` re-confirmed by a redelivery
-- looked like it would be issued a COMPLETE SECOND SET of tickets. It would not:
-- issue_tickets_for_order inserts with
--
--     ON CONFLICT (order_item_id, idx_in_item) DO NOTHING
--
-- so every ticket is keyed to its order item and index and a re-issue is a row-level
-- no-op. The claim was made from the first 26 lines of that function and was wrong;
-- reading the rest settled it. No guard is added there, because the constraint is
-- already the guard and adding a second one would have meant re-declaring a body
-- that also calls assign_order_seats.
--
-- TWO CHANGES, both in the database, because the ticket is minted by a database
-- trigger and an application-level check cannot stand in front of it.
--
--   1. confirm_order WHITELISTS the statuses it will confirm from. A whitelist and
--      not a blacklist, deliberately: the old code was effectively a blacklist of
--      one value, and every status added since (`partially_refunded`, `refunded`,
--      `cancelled`, `expired`) silently became confirmable. With a whitelist, a
--      status added tomorrow is refused until somebody decides otherwise.
--   2. reconcile_refund no longer reverses a sale that was never recorded. In the
--      out-of-order case it debited the organiser 2500c for a sale the ledger had
--      never credited, because the confirmation had not arrived yet. It still
--      voids tickets, returns inventory and sets the order status; only the ledger
--      reversal is skipped, and only when there is demonstrably nothing to reverse.
--
-- WHY confirm_order ACKNOWLEDGES rather than raises. Returning TRUE for an
-- already-terminal order makes the webhook return 200, so Stripe stops retrying a
-- delivery that can never succeed. Raising would leave Stripe redelivering until it
-- gives up, for an order whose money has already gone back. The distinction matters:
-- a lapsed hold on a SOLD OUT tier still raises (20260819000003), because that one
-- needs a human to refund. A refunded order needs nobody.
--
-- WHAT IS NOT CHANGED. `pending` is the only confirmable status, which is what
-- checkout writes. The free-event path also inserts `pending` and then calls
-- confirm_order (src/app/actions/checkout.ts), so it is unaffected. An additional
-- Stripe API call in handlePaymentSucceeded to re-read the charge was considered and
-- rejected: it would put a network round trip on every payment to detect a case the
-- order status already carries, and it would still be a snapshot.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. confirm_order: only a pending order may be confirmed.
--
-- Body is otherwise identical to 20260819000003, including the lapsed-hold
-- re-acquire and its sold-out refusal. Only the status gate changes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_order(
  p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_reservation RECORD;
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
  v_hold_active BOOLEAN := FALSE;
  v_taken INT;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Idempotency latch: a redelivery of an already-confirmed order is a true no-op.
  IF v_order.status = 'confirmed' THEN
    RETURN TRUE;
  END IF;

  /*
   * THE WHITELIST. Only a pending order may be confirmed.
   *
   * `refunded`, `partially_refunded`, `cancelled` and `expired` are all terminal
   * with respect to confirmation, and confirming any of them mints a ticket for an
   * order that is not owed one. Proven for `refunded` by the ordering drill: a
   * refund that overtook its own payment produced a valid ticket for a fully
   * refunded charge.
   *
   * TRUE is returned rather than raised so the webhook answers 200 and Stripe stops
   * redelivering something that can never succeed.
   */
  IF v_order.status <> 'pending' THEN
    RAISE NOTICE 'confirm_order: order % is % and will not be confirmed', p_order_id, v_order.status;
    RETURN TRUE;
  END IF;

  -- Resolve the hold FIRST: the ticket trigger fires on the confirmation, so the
  -- seat must be secured before the order moves.
  IF v_order.reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation
    FROM public.reservations
    WHERE id = v_order.reservation_id
    FOR UPDATE;

    v_hold_active := FOUND AND v_reservation.status = 'active';

    IF FOUND AND jsonb_typeof(v_reservation.items) = 'array' THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_reservation.items)
      LOOP
        IF v_item ? 'ticket_tier_id' THEN
          v_tier_id := (v_item->>'ticket_tier_id')::UUID;
          v_quantity := (v_item->>'quantity')::INT;

          IF v_hold_active THEN
            UPDATE public.ticket_tiers
            SET
              sold_count = sold_count + v_quantity,
              reserved_count = GREATEST(reserved_count - v_quantity, 0)
            WHERE id = v_tier_id;
          ELSE
            -- The hold lapsed: re-acquire from what is genuinely left, with the
            -- availability test inside the UPDATE so it runs under the write lock.
            UPDATE public.ticket_tiers
            SET sold_count = sold_count + v_quantity
            WHERE id = v_tier_id
              AND total_capacity - sold_count - reserved_count >= v_quantity;

            GET DIAGNOSTICS v_taken = ROW_COUNT;

            IF v_taken = 0 THEN
              RAISE EXCEPTION
                'order % cannot be confirmed: the reservation expired and tier % is sold out',
                p_order_id, v_tier_id
                USING ERRCODE = 'check_violation';
            END IF;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.orders
  SET
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_order.reservation_id IS NOT NULL AND v_hold_active THEN
    UPDATE public.reservations
    SET
      status = 'converted',
      converted_at = NOW()
    WHERE id = v_order.reservation_id;
  END IF;

  IF v_order.discount_code_id IS NOT NULL THEN
    UPDATE public.discount_codes
    SET current_uses = current_uses + 1
    WHERE id = v_order.discount_code_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. reconcile_refund: do not reverse a sale that was never recorded.
--
-- In the out-of-order case the refund arrived before the confirmation, so the
-- ledger had never credited the sale, and the reversal debited the organiser 2500c
-- for money they had never been credited. Tickets, inventory, the reserve hold and
-- the statuses are all still handled; only the ledger reversal is conditional, and
-- only on there being demonstrably nothing to reverse.
--
-- Body is otherwise identical to 20260621000005, including the ::public.order_status
-- cast (dropped once before, which made the whole function raise) and the event_id
-- attribution on every ledger insert.
-- ----------------------------------------------------------------------------
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
  v_sale_recorded BOOLEAN;
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

  -- WAS THERE A SALE TO REVERSE? The sale is recorded by recordOrderConfirmedLedger
  -- as an `order_confirmed` row. Without it the money was never credited, so
  -- reversing it would debit an organiser for income they never received.
  SELECT EXISTS (
    SELECT 1 FROM public.organiser_balance_ledger
    WHERE reference_id = v_order.id AND reason = 'order_confirmed'
  ) INTO v_sale_recorded;

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

  IF v_sale_recorded THEN
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
  ELSE
    RAISE NOTICE 'reconcile_refund: order % has no recorded sale; skipping the ledger reversal',
      v_order.id;
  END IF;

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

COMMIT;
