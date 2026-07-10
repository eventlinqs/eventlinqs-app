-- ============================================================
-- Community giving, Layer 1 GROUNDWORK ONLY (2026-07-05, additive).
--
-- The founder-approved buyer round-up requires the settlement split to
-- learn about a donation line: organiser credit is computed as
-- total_cents minus (platform + processing) INSIDE the funds-holding
-- engine (src/lib/payments/connect-ledger.ts), so a buyer contribution
-- added to the charged total would flow to the ORGANISER unless that one
-- line subtracts it. Per the directive's stop clause, the engine was NOT
-- touched and the charging path is NOT built. This migration ships only
-- the safe groundwork:
--   - community_contributions: the append-only record a future impact
--     counter and outbound cause payout will read
--   - the community_giving flag, seeded OFF (not the directed
--     default-on: enabling it without the engine line would either
--     mischarge buyers or misroute funds; it flips on with the approved
--     one-line engine change)
-- DOWN: drop the table and delete the flag row.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'AUD',
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.community_contributions IS
  'Optional, buyer-funded checkout round-up contributions (Layer 1 community giving). Purely additive to the buyer total; never taken from the platform fee or the organiser payout. Capture-and-hold: the outbound donation payout is a future build.';

CREATE INDEX IF NOT EXISTS idx_community_contributions_event
  ON public.community_contributions(event_id);
CREATE INDEX IF NOT EXISTS idx_community_contributions_city
  ON public.community_contributions(city);

ALTER TABLE public.community_contributions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages community contributions"
    ON public.community_contributions FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.feature_flags (flag, enabled, description)
VALUES (
  'community_giving',
  FALSE,
  'Layer 1 buyer round-up at checkout. OFF until the founder approves the one-line settlement change in connect-ledger (organiser credit must subtract donation_cents); enabling earlier would misroute buyer contributions to organiser payouts.'
)
ON CONFLICT (flag) DO NOTHING;
