-- ============================================================
-- Webhook event-level dedupe (P2-6)
-- DRAFT - NOT YET APPLIED.
-- Founder applies via: supabase db push --linked  (then: npm run db:types)
-- Never apply via Dashboard SQL editor. Never via Supabase MCP.
-- Design: docs/TRIAD-REFACTOR-DESIGN.md section 4 (founder/PM review required)
-- ============================================================
-- Purpose:
--   Single chokepoint that records every Stripe webhook event id so a
--   redelivery (Stripe retry, or rare concurrent double-delivery) of an
--   already-processed event is a guaranteed no-op. Claim-first lifecycle:
--   'received' on claim, 'processed' on success, 'failed' on a retryable
--   failure (re-claimed and re-processed by the next delivery).
--   event_id is the Stripe event.id, globally unique and immutable across
--   redeliveries, so it is the natural primary key.
-- AU English. No em-dashes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  event_id      TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received', 'processed', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 1,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

-- Supports the operational query "show me failed / stuck-in-received events
-- in the last N hours" without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_pwe_status_created
  ON public.processed_webhook_events (status, created_at);

-- RLS on with no policy: the webhook is the only writer and runs as
-- service_role, which bypasses RLS. No anon/authenticated access is ever
-- legitimate for this table.
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.processed_webhook_events TO service_role;

COMMENT ON TABLE public.processed_webhook_events IS
  'Stripe webhook dedupe ledger (P2-6). One row per Stripe event.id. '
  'Claim-first: received -> processed | failed. service_role only.';

COMMIT;
