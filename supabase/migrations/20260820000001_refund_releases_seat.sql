-- ============================================================================
-- A REFUND MUST RELEASE THE SEAT.
--
-- REPRODUCED 20 August 2026 by scripts/verify/refund-seat-drill.mjs against TEST,
-- driving a real seated purchase and a real refund through the real functions:
--
--     artefact           observed         expected               verdict
--     ticket status      refunded         refunded               OK
--     tier sold_count    0                0 (one returned)       OK
--     order status       refunded         refunded               OK
--     refund status      completed        completed              OK
--     SEAT status        sold             available              FAIL
--
-- `reconcile_refund` is the single place a completed refund is applied. It voided
-- the ticket, returned the tier inventory, reversed the ledger, released the
-- reserve hold and set the order status, and it never touched `public.seats`. So
-- the seat stayed 'sold' while its ticket was void: nobody can sit in it, because
-- the ticket will not scan, and nobody can buy it, because the map says taken.
-- That seat is dead for the event, and the first person to find out is a steward
-- at the door with a queue behind them.
--
-- The asymmetry is the giveaway. The Stripe webhook marks seats sold when a
-- payment succeeds (src/app/api/webhooks/stripe/route.ts) and releases them back
-- to 'available' when a payment FAILS. Only the refund path, the third way a sale
-- can end, was missing its release.
--
-- ----------------------------------------------------------------------------
-- THREE CHANGES, AND THE SECOND AND THIRD ARE NOT OPTIONAL EXTRAS.
--
-- 1. reconcile_refund releases the seat: status back to 'available', and every
--    holder field cleared (reservation_id, order_item_id, held_by_user_id,
--    held_reason). Clearing status alone would leave a seat that reads available
--    on the map while still pointing at a dead reservation.
--
-- 2. reconcile_refund also clears `tickets.seat_id`, preserving the seat in the
--    ticket's metadata as `released_seat_id` so the organiser's history is not
--    lost. This is REQUIRED, not tidiness, because of assign_order_seats:
--
--        reservation_seats AS (
--          SELECT ... FROM public.seats s
--          WHERE s.reservation_id = v_reservation_id
--            AND NOT EXISTS (SELECT 1 FROM public.tickets tt WHERE tt.seat_id = s.id))
--
--    A refunded ticket that kept its seat_id satisfies that NOT EXISTS forever.
--    The seat would be resold (available, so checkout hands it out), the buyer
--    would be charged, and assign_order_seats would then decline to pair it,
--    leaving them a ticket with no seat. Releasing the seat without this would
--    have converted a dead seat into a sold seat with no occupant, which is
--    worse: the first failure is visible on a map, the second is only visible
--    when two people hold one seat.
--
-- 3. assign_order_seats stops counting a refunded or void ticket as an occupant.
--    Belt and braces for the same footgun: rows already in the database carry a
--    seat_id on refunded tickets, written before this migration, and change 2
--    only fixes refunds from here on. Without this, every seat refunded before
--    today stays unassignable even once an operator frees it by hand.
--
-- NOT CHANGED: the money. The ledger, the reserve hold, the fee arithmetic and
-- the conditional sale reversal from 20260819000004 are carried over verbatim.
-- This migration adds seat handling and changes nothing about cents.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Where the released seat is remembered.
--
-- `tickets` has no metadata column, so the seat a refund gave back needs a home
-- of its own. A dedicated column rather than a jsonb blob because this is a real
-- foreign key that an organiser report will want to join on: "which seat did this
-- refunded ticket hold" is a question with one answer, not a bag of properties.
--
-- ON DELETE SET NULL matches seat_id: deleting a seat map must not delete ticket
-- history.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS released_seat_id UUID REFERENCES public.seats(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tickets.released_seat_id IS
  'The seat this ticket held before a refund released it. Set by reconcile_refund '
  'when seat_id is cleared, so the seat can be resold without losing the history of '
  'who had it.';

-- ----------------------------------------------------------------------------
-- 1. reconcile_refund: release the seat, and unhook the dead ticket from it.
--
-- Body is otherwise identical to 20260819000004, including the ::public.order_status
-- cast (dropped once before, which made the whole function raise), the event_id
-- attribution on every ledger insert, and the v_sale_recorded guard.
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
  v_seats_freed  INT := 0;
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

  -- ==========================================================================
  -- SEAT RELEASE. The change this migration exists for.
  --
  -- Ordered AFTER the ticket void so the seat is only freed once the ticket that
  -- held it is definitively dead, and BEFORE the seat_id is cleared below,
  -- because that clear is what this join reads.
  --
  -- Only 'sold', 'reserved' and 'held' are released. 'blocked' is an organiser
  -- decision about the room (a broken seat, a camera position) and must survive a
  -- refund untouched; releasing it would silently put a seat the organiser took
  -- off sale back on sale.
  -- ==========================================================================
  UPDATE public.seats s
    SET status          = 'available',
        reservation_id  = NULL,
        order_item_id   = NULL,
        held_by_user_id = NULL,
        held_reason     = NULL,
        updated_at      = NOW()
  FROM public.refund_tickets rt
  JOIN public.tickets t ON t.id = rt.ticket_id
  WHERE rt.refund_id = v_refund.id
    AND t.seat_id IS NOT NULL
    AND s.id = t.seat_id
    AND s.status IN ('sold','reserved','held');

  GET DIAGNOSTICS v_seats_freed = ROW_COUNT;

  -- Unhook the dead ticket from the seat, keeping the seat in metadata so the
  -- organiser can still see which seat this refund gave back. See the header:
  -- without this, assign_order_seats treats the seat as occupied forever.
  UPDATE public.tickets t
    SET released_seat_id = t.seat_id,
        seat_id          = NULL,
        updated_at       = NOW()
  FROM public.refund_tickets rt
  WHERE rt.refund_id = v_refund.id
    AND rt.ticket_id = t.id
    AND t.seat_id IS NOT NULL;

  IF v_seats_freed > 0 THEN
    RAISE NOTICE 'reconcile_refund: released % seat(s) for refund %', v_seats_freed, v_refund.id;
  END IF;

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

-- ----------------------------------------------------------------------------
-- 2. assign_order_seats: a dead ticket is not an occupant.
--
-- Body is identical to 20260705000001 apart from the status filter in
-- reservation_seats. See the header, change 3: rows written before today carry a
-- seat_id on refunded tickets, and without this filter those seats can never be
-- paired to a new buyer even after an operator frees them by hand.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_order_seats(p_order_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation_id UUID;
  v_assigned INT := 0;
BEGIN
  SELECT o.reservation_id INTO v_reservation_id
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF v_reservation_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH order_tickets AS (
    SELECT t.id AS ticket_id,
           ROW_NUMBER() OVER (ORDER BY t.order_item_id, t.idx_in_item) AS rn
    FROM public.tickets t
    WHERE t.order_id = p_order_id
      AND t.seat_id IS NULL
      -- A refunded or void ticket in THIS order is not waiting for a seat either.
      AND t.status NOT IN ('refunded','void')
  ),
  reservation_seats AS (
    SELECT s.id AS seat_id, s.order_item_id,
           ROW_NUMBER() OVER (ORDER BY s.row_label, s.seat_number) AS rn
    FROM public.seats s
    WHERE s.reservation_id = v_reservation_id
      AND NOT EXISTS (
        SELECT 1 FROM public.tickets tt
        WHERE tt.seat_id = s.id
          AND tt.status NOT IN ('refunded','void')
      )
  ),
  paired AS (
    SELECT ot.ticket_id, rs.seat_id
    FROM order_tickets ot
    JOIN reservation_seats rs ON rs.rn = ot.rn
  )
  UPDATE public.tickets t
  SET seat_id = paired.seat_id, updated_at = NOW()
  FROM paired
  WHERE t.id = paired.ticket_id;

  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  -- Back-reference for organiser reporting: the seat knows its order item.
  UPDATE public.seats s
  SET order_item_id = t.order_item_id, updated_at = NOW()
  FROM public.tickets t
  WHERE t.seat_id = s.id
    AND t.order_id = p_order_id
    AND s.order_item_id IS DISTINCT FROM t.order_item_id;

  RETURN v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_order_seats(UUID) TO service_role;

COMMIT;
