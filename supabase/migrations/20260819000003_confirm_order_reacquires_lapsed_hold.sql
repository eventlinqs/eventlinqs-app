-- ============================================================================
-- confirm_order must never mint a ticket for a seat it did not take
-- Run by founder: supabase db push --linked
-- Reproduced by: scripts/verify/reservation-expiry-drill.mjs
-- Proven by:     scripts/verify/reservation-expiry-drill.mjs (all three cases)
-- ============================================================================
--
-- THE DEFECT, REPRODUCED WITH NUMBERS BEFORE THIS WAS WRITTEN.
--
-- scripts/verify/reservation-expiry-drill.mjs, against the real TEST database, on a
-- tier with capacity 1:
--
--   buyer A reserves the last seat, starts paying
--   the 10 minute hold lapses, expire_stale_reservations returns the seat
--   buyer B legitimately buys it            -> sold_count 1 of 1, correct
--   buyer A's payment finally lands         -> confirm_order runs
--
--   RESULT:  2 admitting tickets for a tier with capacity 1.
--            Both buyers charged. Both holding a ticket. One turned away at the door.
--
-- WHY. The old body confirmed the order UNCONDITIONALLY and moved inventory only
-- when the reservation was still `active`:
--
--     UPDATE public.orders SET status = 'confirmed' ...          -- always
--     IF FOUND AND v_reservation.status = 'active' THEN           -- sometimes
--       ... sold_count = sold_count + v_quantity ...
--
-- The ticket-issuing trigger fires on that confirmation
-- (tg_issue_tickets_on_confirm -> issue_tickets_for_order, which loops
-- order_items), so the ticket was minted from the CONFIRMATION while the seat was
-- taken from the RESERVATION. Decouple those two and an expired hold produces a
-- paid, ticketed order that the platform does not believe sold anything: sold_count
-- stayed 0 while a ticket existed.
--
-- The row lock in create_reservation cannot help here, and that is worth stating
-- plainly because it is why the oversell drill missed this. Buyer B did nothing
-- wrong and raced nobody: the seat genuinely was free when they bought it. The
-- oversell is created minutes later, by a payment arriving for a hold that no longer
-- exists.
--
-- THE FIX. Inventory and confirmation become one decision. When the hold has
-- lapsed, the seat is RE-ACQUIRED atomically from what is actually left:
--
--     UPDATE public.ticket_tiers
--        SET sold_count = sold_count + v_quantity
--      WHERE id = v_tier_id
--        AND total_capacity - sold_count - reserved_count >= v_quantity;
--
-- The predicate is evaluated inside the UPDATE, under the row lock Postgres takes to
-- write it, so it cannot be raced. Two outcomes, and both are safe:
--
--   SEAT AVAILABLE      the buyer is late but the room still has room. Take it,
--                       confirm, issue the ticket. The buyer never knows.
--   SEAT GONE           RAISE. The order stays `pending`, no ticket is minted, and
--                       the money sits captured at Stripe awaiting a refund.
--
-- WHY RAISING IS THE RIGHT FAILURE, and it is deliberately the lesser of two bad
-- outcomes rather than a good one. Refusing leaves a paid order with no ticket,
-- which the founder named as unacceptable. Confirming would leave TWO PEOPLE ON ONE
-- SEAT, which cannot be undone at the door and is worse: a paid order with no ticket
-- is a refund, and a refund is a solved problem on this platform. So this fails
-- closed toward the recoverable state.
--
-- The webhook already behaves correctly around that raise: handlePaymentSucceeded
-- returns 500 on a confirm_order failure, so Stripe retries on its backoff, and the
-- handler is idempotent. A genuinely sold-out event will exhaust those retries and
-- leave the order `pending` with the payment captured, which is visible rather than
-- silent.
--
-- WHAT IS DELIBERATELY NOT IN THIS MIGRATION. The operator surface for that state
-- (an alert, and a one-click refund for "paid but the seat was gone") is a product
-- decision about what the buyer is told, and it is recorded for a founder ruling
-- rather than invented here. This migration's job is to make the oversell impossible;
-- turning the remaining bad state into a good experience is the next decision.
--
-- Everything else is unchanged: the already-confirmed early return, the seat-
-- reservation object shape (seat rows carry their own inventory, so tier counters are
-- untouched for those), the reservation conversion, and the discount usage bump.
-- ============================================================================

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
  -- Lock and get the order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Skip if already confirmed. Idempotency latch: Stripe retries deliveries, so a
  -- replay must be a true no-op and must NOT take inventory a second time.
  IF v_order.status = 'confirmed' THEN
    RETURN TRUE;
  END IF;

  -- Resolve the hold FIRST. Inventory is decided before the order is confirmed,
  -- because the ticket-issuing trigger fires on that confirmation and must never
  -- run for a seat this function did not manage to take.
  IF v_order.reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation
    FROM public.reservations
    WHERE id = v_order.reservation_id
    FOR UPDATE;

    v_hold_active := FOUND AND v_reservation.status = 'active';

    -- GA reservations: items is an ARRAY of tier line items. Seat reservations:
    -- items is an OBJECT ({"seat_ids": [...]}) and the seat rows carry the
    -- inventory, so tier counters are not involved either way.
    IF FOUND AND jsonb_typeof(v_reservation.items) = 'array' THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_reservation.items)
      LOOP
        IF v_item ? 'ticket_tier_id' THEN
          v_tier_id := (v_item->>'ticket_tier_id')::UUID;
          v_quantity := (v_item->>'quantity')::INT;

          IF v_hold_active THEN
            -- The hold is live: the seats are already counted in reserved_count,
            -- so move them across. This is the ordinary path.
            UPDATE public.ticket_tiers
            SET
              sold_count = sold_count + v_quantity,
              reserved_count = GREATEST(reserved_count - v_quantity, 0)
            WHERE id = v_tier_id;
          ELSE
            -- THE HOLD HAS LAPSED. The sweeper already returned these seats, so
            -- reserved_count no longer contains them and they may belong to
            -- somebody else. Re-acquire from what is genuinely left. The
            -- availability test lives INSIDE the UPDATE, so it is evaluated under
            -- the same row lock that performs the write and cannot be raced.
            UPDATE public.ticket_tiers
            SET sold_count = sold_count + v_quantity
            WHERE id = v_tier_id
              AND total_capacity - sold_count - reserved_count >= v_quantity;

            GET DIAGNOSTICS v_taken = ROW_COUNT;

            IF v_taken = 0 THEN
              -- Sold out while this buyer was paying. Refuse rather than confirm:
              -- confirming would mint a ticket for a seat another buyer already
              -- holds, and an oversell cannot be undone at the door. The order
              -- stays pending with the payment captured, which is a refund, and a
              -- refund is recoverable.
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

  -- Only now is the order confirmed, which is what fires the ticket issue.
  UPDATE public.orders
  SET
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Mark the reservation converted when there was a live one to convert.
  IF v_order.reservation_id IS NOT NULL AND v_hold_active THEN
    UPDATE public.reservations
    SET
      status = 'converted',
      converted_at = NOW()
    WHERE id = v_order.reservation_id;
  END IF;

  -- Update discount code usage count
  IF v_order.discount_code_id IS NOT NULL THEN
    UPDATE public.discount_codes
    SET current_uses = current_uses + 1
    WHERE id = v_order.discount_code_id;
  END IF;

  RETURN TRUE;
END;
$$;
