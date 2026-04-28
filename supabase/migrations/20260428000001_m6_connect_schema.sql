-- =====================================================================
-- 20260428000001_m6_connect_schema.sql
-- =====================================================================
-- M6 Stripe Connect: schema and webhook scaffold for tiered payout system.
--
-- Adds the columns and tables needed by the rev 1 implementation plan:
--   docs/m6/m6-implementation-plan.md (sections 1.4 tiered payouts, 1.5
--   reserve and float, 1.6 tier eligibility automation, 1.7 refund cost
--   allocation, 1.8 refund and chargeback policy, 1.13 KYC enforcement).
--
-- Phase 1 deliverable. No business logic, no user-visible behaviour change.
-- Phases 2-5 wire the columns and tables to live state.
-- =====================================================================

-- ============= 1. Extend organisations =============

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS stripe_account_country TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stripe_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payout_tier TEXT NOT NULL DEFAULT 'tier_1'
    CHECK (payout_tier IN ('tier_1', 'tier_2', 'tier_3')),
  ADD COLUMN IF NOT EXISTS payout_schedule TEXT NOT NULL DEFAULT 'post_event_only'
    CHECK (payout_schedule IN ('post_event_only', 'scheduled_plus_on_demand')),
  ADD COLUMN IF NOT EXISTS payout_destination TEXT,
  ADD COLUMN IF NOT EXISTS refund_window_days INTEGER NOT NULL DEFAULT 7
    CHECK (refund_window_days >= 0 AND refund_window_days <= 7),
  ADD COLUMN IF NOT EXISTS risk_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (risk_tier IN ('standard', 'elevated', 'high')),
  ADD COLUMN IF NOT EXISTS hold_amount_cents BIGINT NOT NULL DEFAULT 0
    CHECK (hold_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS total_event_count INTEGER NOT NULL DEFAULT 0
    CHECK (total_event_count >= 0),
  ADD COLUMN IF NOT EXISTS total_volume_cents BIGINT NOT NULL DEFAULT 0
    CHECK (total_volume_cents >= 0),
  ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'active'
    CHECK (payout_status IN ('active', 'on_hold', 'restricted'));

CREATE INDEX IF NOT EXISTS idx_organisations_payout_tier
  ON public.organisations(payout_tier);

CREATE INDEX IF NOT EXISTS idx_organisations_risk_tier
  ON public.organisations(risk_tier)
  WHERE risk_tier <> 'standard';

CREATE INDEX IF NOT EXISTS idx_organisations_payout_status
  ON public.organisations(payout_status)
  WHERE payout_status <> 'active';

COMMENT ON COLUMN public.organisations.payout_tier IS
  'M6 tiered payout model. tier_1 default for new organisers, tier_2 after 1 clean event, tier_3 admin-approved. See docs/m6/m6-implementation-plan.md §1.4.';

COMMENT ON COLUMN public.organisations.hold_amount_cents IS
  'Running total of unreleased reserve across all the organisation events. See §1.5.';

COMMENT ON COLUMN public.organisations.refund_window_days IS
  'Buyer-initiated refund window in days before event start. Platform max 7 days. See §1.8.';

-- ============= 2. payouts table =============

CREATE TABLE IF NOT EXISTS public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  stripe_payout_id TEXT UNIQUE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL,
  arrival_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_organisation_id
  ON public.payouts(organisation_id);

CREATE INDEX IF NOT EXISTS idx_payouts_status
  ON public.payouts(status);

CREATE INDEX IF NOT EXISTS idx_payouts_arrival_date
  ON public.payouts(arrival_date DESC NULLS LAST);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisation owners can view their payouts"
  ON public.payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = payouts.organisation_id
        AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "Organisation members can view their payouts"
  ON public.payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = payouts.organisation_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.payouts IS
  'Stripe payouts to connected organisation accounts. One row per Stripe payout.id. Written by webhook handlers in Phase 1+. See §1.4.';

-- ============= 3. payout_holds table =============

CREATE TABLE IF NOT EXISTS public.payout_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  hold_type TEXT NOT NULL
    CHECK (hold_type IN ('reserve', 'chargeback', 'admin_manual', 'negative_balance', 'new_organiser')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL,
  release_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  reason_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_holds_organisation_id
  ON public.payout_holds(organisation_id);

CREATE INDEX IF NOT EXISTS idx_payout_holds_event_id
  ON public.payout_holds(event_id);

CREATE INDEX IF NOT EXISTS idx_payout_holds_unreleased
  ON public.payout_holds(release_at)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payout_holds_hold_type
  ON public.payout_holds(hold_type);

ALTER TABLE public.payout_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisation owners can view their holds"
  ON public.payout_holds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = payout_holds.organisation_id
        AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "Organisation members can view their holds"
  ON public.payout_holds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = payout_holds.organisation_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.payout_holds IS
  'Per-event reserves and chargeback holds. Written by Phase 3 PaymentIntent succeeded handler and Phase 5 dispute handler. release_at is computed as event_end + 3 business days for reserves. See §1.5 and §1.8.';

-- ============= 4. organiser_balance_ledger table =============

CREATE TABLE IF NOT EXISTS public.organiser_balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  delta_cents BIGINT NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT NOT NULL
    CHECK (reason IN (
      'order_confirmed',
      'refund_from_balance',
      'refund_from_reserve',
      'refund_from_gateway',
      'refund_platform_float',
      'chargeback',
      'chargeback_fee',
      'payout',
      'reserve_hold',
      'reserve_release',
      'instant_payout_fee',
      'adjustment'
    )),
  reference_type TEXT NOT NULL
    CHECK (reference_type IN ('order', 'payout', 'hold', 'dispute', 'adjustment')),
  reference_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_ledger_organisation_id
  ON public.organiser_balance_ledger(organisation_id);

CREATE INDEX IF NOT EXISTS idx_balance_ledger_reason
  ON public.organiser_balance_ledger(reason);

CREATE INDEX IF NOT EXISTS idx_balance_ledger_reference
  ON public.organiser_balance_ledger(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_balance_ledger_created_at
  ON public.organiser_balance_ledger(created_at DESC);

ALTER TABLE public.organiser_balance_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisation owners can view their ledger"
  ON public.organiser_balance_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = organiser_balance_ledger.organisation_id
        AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "Organisation members can view their ledger"
  ON public.organiser_balance_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = organiser_balance_ledger.organisation_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.organiser_balance_ledger IS
  'Append-only ledger of organisation balance deltas. Positive deltas: order_confirmed, reserve_release. Negative deltas: refund_*, chargeback, payout, reserve_hold, fees. Running sum < 0 triggers payout_status = on_hold. See §1.7.';

-- ============= 5. tier_progression_log table =============

CREATE TABLE IF NOT EXISTS public.tier_progression_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  from_tier TEXT NOT NULL CHECK (from_tier IN ('tier_1', 'tier_2', 'tier_3')),
  to_tier TEXT NOT NULL CHECK (to_tier IN ('tier_1', 'tier_2', 'tier_3')),
  reason TEXT NOT NULL
    CHECK (reason IN (
      'auto_promotion',
      'admin_promotion',
      'chargeback_demotion',
      'negative_balance_demotion',
      'admin_demotion'
    )),
  triggered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tier_progression_organisation_id
  ON public.tier_progression_log(organisation_id);

CREATE INDEX IF NOT EXISTS idx_tier_progression_created_at
  ON public.tier_progression_log(created_at DESC);

ALTER TABLE public.tier_progression_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisation owners can view their tier history"
  ON public.tier_progression_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = tier_progression_log.organisation_id
        AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "Organisation members can view their tier history"
  ON public.tier_progression_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = tier_progression_log.organisation_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all tier progression"
  ON public.tier_progression_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

COMMENT ON TABLE public.tier_progression_log IS
  'Append-only audit log of tier promotions and demotions. Written by nightly job (Phase 6+) and dispute webhook (Phase 5). See §1.6.';

-- =====================================================================
-- End of 20260428000001_m6_connect_schema.sql
-- =====================================================================
