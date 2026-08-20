-- ============================================================================
-- A REFUNDED SQUAD MEMBER IS NOT A PAID SQUAD MEMBER.
--
-- FOUND 20 August 2026 while adjudicating the unwind requirement "squad or group
-- membership updated". `squad_members` is written in exactly one place,
-- handleSquadMemberPaymentSucceeded in the Stripe webhook. Nothing on the refund
-- path touches it. So a member who paid and was then refunded keeps
-- `status = 'paid'` forever.
--
-- THE CONSEQUENCE, read out of the code rather than guessed
-- (src/app/api/webhooks/stripe/route.ts, the squad completion block):
--
--     const { count: paidCount } = await adminClient
--       .from('squad_members')
--       .select('id', { count: 'exact', head: true })
--       .eq('squad_id', squadId)
--       .eq('status', 'paid')
--     if ((paidCount ?? 0) < squad.total_spots) return
--     -- All members paid - complete the squad
--
-- A squad completes when the number of members at 'paid' reaches total_spots. A
-- refunded member still counts, so a squad can complete on a slot nobody has paid
-- for, and the group goes to the event one ticket short of what the count claims.
-- The same row also survives the squad-expire cron, which refunds paid members and
-- leaves them reading as paid.
--
-- ----------------------------------------------------------------------------
-- WHY A NEW ENUM VALUE RATHER THAN REUSING ONE.
--
-- The existing states are invited, paid, declined and timed_out. 'declined' means
-- the person said no and 'timed_out' means they never answered; a refunded member
-- did neither, they paid and then got their money back. Overloading either one
-- would put a wrong word in the organiser's group view and would make the two
-- cases indistinguishable in any later report.
--
-- ADDING A VALUE IS THE SAFE DIRECTION HERE, and that is worth stating because
-- the blast radius looked large: 'paid' is referenced 37 times across about twenty
-- call sites. Every one of them tests FOR 'paid', so a row that leaves 'paid'
-- simply stops matching, which is the intended behaviour in each case:
--   * squad completion stops counting them, which is the defect being fixed;
--   * the my-squads "active members" filter (invited or paid) drops them, correct,
--     they are no longer in the group;
--   * nothing switches exhaustively on the enum, so no branch is left unhandled.
--
-- ----------------------------------------------------------------------------
-- ONLY A FULL REFUND MOVES THE MEMBER.
--
-- A partial refund leaves the member holding tickets, so they are still a paid
-- member of that squad. The condition below is `v_remaining = 0`, the same value
-- the function already computes to decide between 'refunded' and
-- 'partially_refunded' on the order, so the two answers can never disagree.
--
-- IT LIVES IN reconcile_refund, NOT IN THE WEBHOOK. reconcile_refund is the one
-- place a completed refund is applied, so putting it here means EVERY trigger
-- gets it: the organiser button, the admin console, automatic approval, and an
-- orphan refund adopted from Stripe. A webhook-side fix would have covered one.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The state a refunded member is in.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'squad_member_status' AND e.enumlabel = 'refunded'
  ) THEN
    ALTER TYPE public.squad_member_status ADD VALUE 'refunded';
  END IF;
END
$$;

COMMIT;

-- A new enum value cannot be used in the same transaction that adds it, so the
-- function that uses it is created in a second one.
BEGIN;

-- ----------------------------------------------------------------------------
-- 2. reconcile_refund also releases the squad slot.
--
-- Body is otherwise identical to 20260820000001, including the seat release, the
-- seat unhooking, the ::public.order_status cast and the v_sale_recorded guard.
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
  v_squad_freed  INT := 0;
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

  -- SEAT RELEASE (20260820000001). 'blocked' is an organiser decision about the
  -- room and must survive a refund untouched.
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

  UPDATE public.tickets t
    SET released_seat_id = t.seat_id,
        seat_id          = NULL,
        updated_at       = NOW()
  FROM public.refund_tickets rt
  WHERE rt.refund_id = v_refund.id
    AND rt.ticket_id = t.id
    AND t.seat_id IS NOT NULL;

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

  -- ==========================================================================
  -- SQUAD MEMBERSHIP. Only on a FULL refund: a member who still holds a ticket
  -- is still in the group. v_remaining is the same count that decides the order
  -- status below, so the two answers cannot disagree.
  -- ==========================================================================
  IF v_remaining = 0 THEN
    UPDATE public.squad_members
      SET status = 'refunded'
      WHERE order_id = v_order.id
        AND status = 'paid';
    GET DIAGNOSTICS v_squad_freed = ROW_COUNT;
    IF v_squad_freed > 0 THEN
      RAISE NOTICE 'reconcile_refund: released % squad slot(s) for order %', v_squad_freed, v_order.id;
    END IF;
  END IF;

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
