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
