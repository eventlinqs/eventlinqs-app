-- ============================================================
-- M6 Refund Operator Path - reconcile layer
-- ============================================================
-- Builds on 20260503000001_refunds_extension.sql (refunds table).
-- Adds:
--   * refund_tickets join + DB-enforced single active claim
--   * unique stripe_refund_id (hard idempotency anchor)
--   * admin / org-member RLS read policies
--   * the two RPCs that back the webhook-driven reconcile
--     (create_refund_request, reconcile_refund)
--
-- The webhook is the sole money source of truth. The operator
-- action only creates a 'processing' intent and fires Stripe;
-- reconcile_refund does all money/ticket/inventory/hold changes
-- atomically and idempotently on stripe_refund_id.
--
-- Idempotent: every object uses IF NOT EXISTS / OR REPLACE so the
-- migration is safe to re-run during local resets.
-- Uses gen_random_uuid()-compatible patterns only (no uuid-ossp).
-- ============================================================

-- 1. refund_tickets join table -------------------------------
CREATE TABLE IF NOT EXISTS public.refund_tickets (
  refund_id  UUID NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
  ticket_id  UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (refund_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_refund_tickets_ticket ON public.refund_tickets(ticket_id);

-- DB-enforced single active claim: a ticket is in at most one active
-- refund. Active = pending/processing/completed; the trigger below
-- flips is_active to FALSE when the parent refund goes failed/cancelled.
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_tickets_active_ticket
  ON public.refund_tickets(ticket_id) WHERE is_active;

-- 2. Hard idempotency anchor: unique stripe_refund_id --------
-- Replaces the non-unique partial index from the refunds extension.
DROP INDEX IF EXISTS public.idx_refunds_stripe_refund;
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_stripe_refund
  ON public.refunds(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;

-- 3. Free tickets when a refund fails/cancels ----------------
CREATE OR REPLACE FUNCTION public.refund_tickets_deactivate_on_terminal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('failed','cancelled')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.refund_tickets
      SET is_active = FALSE
      WHERE refund_id = NEW.id AND is_active;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refund_tickets_deactivate ON public.refunds;
CREATE TRIGGER trg_refund_tickets_deactivate
  AFTER UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.refund_tickets_deactivate_on_terminal();

-- 4. RLS -----------------------------------------------------
ALTER TABLE public.refund_tickets ENABLE ROW LEVEL SECURITY;

-- Admins read all refunds (the refunds extension only granted org
-- owners + buyers; admins could not see refunds at all).
DROP POLICY IF EXISTS "Admins read all refunds" ON public.refunds;
CREATE POLICY "Admins read all refunds"
  ON public.refunds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.id = auth.uid() AND a.disabled_at IS NULL
        AND a.role IN ('super_admin','admin','support')
    )
  );

-- Org members (not just the owner) read their refunds.
DROP POLICY IF EXISTS "Org members read their refunds" ON public.refunds;
CREATE POLICY "Org members read their refunds"
  ON public.refunds FOR SELECT
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')
    )
  );

-- refund_tickets read mirrors refunds visibility: the parent subquery
-- is itself RLS-filtered, so a user sees join rows only for refunds
-- they are already allowed to read.
DROP POLICY IF EXISTS "Read refund_tickets via parent refund" ON public.refund_tickets;
CREATE POLICY "Read refund_tickets via parent refund"
  ON public.refund_tickets FOR SELECT
  USING (
    refund_id IN (SELECT id FROM public.refunds)
  );

-- Inserts/updates flow through the service-role admin client and the
-- SECURITY DEFINER RPCs only. No write policies: RLS denies by default.

COMMENT ON TABLE public.refund_tickets IS
  'Links a refund to the exact tickets it covers (by-ticket model). is_active enforces a single active claim per ticket via uq_refund_tickets_active_ticket.';

-- 5. create_refund_request RPC (Phase A, atomic intent) ------
-- Locks the order FOR UPDATE (serialises concurrent initiations),
-- re-checks authorisation, validates refundability and the selected
-- tickets, allocates the gross amount proportionally to the selected
-- tickets' face value, and writes the 'processing' refund + its
-- refund_tickets claims. NO money/ticket/inventory change here.
CREATE OR REPLACE FUNCTION public.create_refund_request(
  p_order_id      UUID,
  p_ticket_ids    UUID[],
  p_reason        public.refund_reason,
  p_initiator     public.refund_initiator,
  p_actor_id      UUID,
  p_buyer_message TEXT DEFAULT NULL
)
RETURNS TABLE (refund_id UUID, amount_cents BIGINT, currency TEXT, payment_intent_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order      public.orders%ROWTYPE;
  v_is_admin   BOOLEAN;
  v_owns_org   BOOLEAN;
  v_sel_face   BIGINT;
  v_all_face   BIGINT;
  v_amount     BIGINT;
  v_pi         TEXT;
  v_refund_id  UUID;
  v_sel_count  INT;
  v_req_count  INT;
BEGIN
  v_req_count := COALESCE(array_length(p_ticket_ids, 1), 0);
  IF v_req_count = 0 THEN
    RAISE EXCEPTION 'no tickets selected' USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the order: serialises all refunds for this order.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Authorisation (defence in depth; the service also checks).
  v_is_admin := EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.id = p_actor_id AND a.disabled_at IS NULL
      AND a.role IN ('super_admin','admin','support')
  );
  v_owns_org := EXISTS (
    SELECT 1 FROM public.organisations o
    WHERE o.id = v_order.organisation_id AND o.owner_id = p_actor_id
  ) OR EXISTS (
    SELECT 1 FROM public.organisation_members m
    WHERE m.organisation_id = v_order.organisation_id AND m.user_id = p_actor_id
      AND m.role IN ('owner','admin','manager')
  );
  IF NOT (v_is_admin OR v_owns_org) THEN
    RAISE EXCEPTION 'not authorised to refund this order'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Refundability.
  IF v_order.status NOT IN ('confirmed','partially_refunded') THEN
    RAISE EXCEPTION 'order not refundable in status %', v_order.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_order.total_cents <= 0 THEN
    RAISE EXCEPTION 'free orders are not refundable' USING ERRCODE = 'check_violation';
  END IF;

  -- Validate selected tickets: belong to the order, refundable status,
  -- and not already claimed by an active refund.
  SELECT count(*) INTO v_sel_count
  FROM public.tickets t
  WHERE t.id = ANY(p_ticket_ids)
    AND t.order_id = p_order_id
    AND t.status IN ('valid','scanned')
    AND NOT EXISTS (
      SELECT 1 FROM public.refund_tickets rt
      WHERE rt.ticket_id = t.id AND rt.is_active
    );
  IF v_sel_count <> v_req_count THEN
    RAISE EXCEPTION 'one or more tickets are not refundable or already claimed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Proportional amount by selected tickets' face value (order_item unit price).
  SELECT COALESCE(SUM(oi.unit_price_cents), 0) INTO v_all_face
  FROM public.tickets t
  JOIN public.order_items oi ON oi.id = t.order_item_id
  WHERE t.order_id = p_order_id;

  SELECT COALESCE(SUM(oi.unit_price_cents), 0) INTO v_sel_face
  FROM public.tickets t
  JOIN public.order_items oi ON oi.id = t.order_item_id
  WHERE t.id = ANY(p_ticket_ids);

  IF v_all_face <= 0 THEN
    RAISE EXCEPTION 'cannot allocate refund amount (zero face value)'
      USING ERRCODE = 'check_violation';
  END IF;

  v_amount := round(v_order.total_cents::numeric * v_sel_face / v_all_face)::BIGINT;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'computed refund amount must be positive'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Most recent Stripe payment intent for the order.
  SELECT p.gateway_payment_id INTO v_pi
  FROM public.payments p
  WHERE p.order_id = p_order_id AND p.gateway_payment_id IS NOT NULL
  ORDER BY p.created_at DESC LIMIT 1;
  IF v_pi IS NULL THEN
    RAISE EXCEPTION 'no payment intent for order' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.refunds (
    order_id, organisation_id, amount_cents, currency, reason, status,
    initiator, requested_by, buyer_message
  ) VALUES (
    p_order_id, v_order.organisation_id, v_amount, v_order.currency, p_reason, 'processing',
    p_initiator, p_actor_id, p_buyer_message
  ) RETURNING id INTO v_refund_id;

  -- Claim the tickets. The partial unique index is the hard backstop
  -- if two transactions somehow race past the order lock.
  INSERT INTO public.refund_tickets (refund_id, ticket_id, is_active)
  SELECT v_refund_id, unnest(p_ticket_ids), TRUE;

  RETURN QUERY SELECT v_refund_id, v_amount, v_order.currency, v_pi;
END;
$$;

REVOKE ALL ON FUNCTION public.create_refund_request(UUID, UUID[], public.refund_reason, public.refund_initiator, UUID, TEXT)
  FROM PUBLIC;
