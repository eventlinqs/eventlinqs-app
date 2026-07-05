-- ============================================================
-- Remove the Venue Revenue Sharing Program (founder decision 2026-07-05).
--
-- Standard ticketing economics from here: the organiser receives face
-- value, EventLinqs keeps its full fee, no partner share is deducted from
-- the platform margin. The organiser payout path was never touched by the
-- programme (the share was carved from EventLinqs's retained margin), so
-- ending it changes no organiser number.
--
-- One-source law: the rate lives ONLY in pricing_rules. The schema forbids
-- a zero-percentage row (pricing_rules_value_split_check requires
-- value_percentage > 0), so the lawful disable is the rule's own end-date:
-- effective_until = NOW() on the open venue rows. History is preserved
-- (no row deleted or re-valued); reversible by clearing effective_until or
-- appending a new version. Defensive: any active enrolment is ended (none
-- exist on TEST; the guard tolerates the column layout). Ledger tables are
-- retained untouched as history (zero rows on TEST).
-- ============================================================

UPDATE public.pricing_rules
SET effective_until = NOW()
WHERE rule_type = 'venue_revenue_share_percentage'
  AND effective_until IS NULL;

DO $$
BEGIN
  UPDATE public.venue_enrolments SET ended_at = NOW() WHERE ended_at IS NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;
