-- ============================================================
-- M6 Phase 5 - Refunds Extension
-- ============================================================
-- Adds the persistent refunds table that backs the organiser
-- Refunds Manager and the buyer-initiated refund request flow.
--
-- Phase 3 shipped a stateless refund core (src/lib/payments/refund.ts)
-- that issues Stripe refunds with reverse_transfer + proportional
-- application-fee refund. Phase 5 wraps that core in a request -> review
-- -> process -> notify lifecycle, persisted here for audit and dispute
-- evidence.
--
-- Idempotent: every CREATE / ALTER uses IF NOT EXISTS so the migration
-- is safe to re-run during local resets.
-- ============================================================

-- 1. ENUMS ---------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_reason') THEN
    CREATE TYPE public.refund_reason AS ENUM (
      'requested_by_buyer',
      'duplicate',
      'fraudulent',
      'event_cancelled',
      'cannot_attend',
      'other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status') THEN
    CREATE TYPE public.refund_status AS ENUM (
      'pending',
      'processing',
      'completed',
      'failed',
      'cancelled'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_initiator') THEN
    CREATE TYPE public.refund_initiator AS ENUM (
      'buyer',
      'organiser',
      'admin',
      'system'
    );
  END IF;
END $$;

-- 2. TABLE ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,

  -- Financial
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,

  -- Lifecycle
  reason public.refund_reason NOT NULL,
  status public.refund_status NOT NULL DEFAULT 'pending',
  initiator public.refund_initiator NOT NULL,

  -- Stripe linkage (set during processing)
  stripe_refund_id TEXT,
  stripe_application_fee_refund_id TEXT,
  refund_reverse_transfer BOOLEAN NOT NULL DEFAULT TRUE,

  -- Communication and audit
  buyer_message TEXT,
  organiser_internal_notes TEXT,
  failure_reason TEXT,

  -- Actors
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INDEXES -------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_refunds_order ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_organisation ON public.refunds(organisation_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_requested_by ON public.refunds(requested_by);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund ON public.refunds(stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_org_status_created
  ON public.refunds(organisation_id, status, created_at DESC);

-- 4. UPDATED_AT TRIGGER --------------------------------------

CREATE OR REPLACE FUNCTION public.refunds_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refunds_set_updated_at ON public.refunds;
CREATE TRIGGER trg_refunds_set_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.refunds_set_updated_at();

-- 5. ROW LEVEL SECURITY --------------------------------------

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- Org owners: full read of refunds for their organisations
DROP POLICY IF EXISTS "Org owners read their refunds" ON public.refunds;
CREATE POLICY "Org owners read their refunds"
  ON public.refunds FOR SELECT
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
  );

-- Buyers: read refunds they personally requested
DROP POLICY IF EXISTS "Buyers read self refunds" ON public.refunds;
CREATE POLICY "Buyers read self refunds"
  ON public.refunds FOR SELECT
  USING (requested_by = auth.uid());

-- Buyers: read refunds tied to their own orders (covers org-initiated cases)
DROP POLICY IF EXISTS "Buyers read refunds on own orders" ON public.refunds;
CREATE POLICY "Buyers read refunds on own orders"
  ON public.refunds FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

-- Inserts and updates flow through the service-role admin client only.
-- No policies defined for INSERT/UPDATE/DELETE: RLS denies by default,
-- which forces every write through the server-side mutations layer that
-- enforces ownership checks via resolveRefundScope().

-- 6. COMMENTS ------------------------------------------------

COMMENT ON TABLE public.refunds IS
  'Persistent refund lifecycle: request -> review -> process -> notify. Backs M6 Phase 5 Refunds Manager.';
COMMENT ON COLUMN public.refunds.refund_reverse_transfer IS
  'TRUE when Stripe refund used reverse_transfer to pull organiser funds back. Mirrors Phase 3 destination-charge mechanics.';
COMMENT ON COLUMN public.refunds.stripe_application_fee_refund_id IS
  'Stripe ApplicationFeeRefund id when refund_application_fee was issued proportionally.';
