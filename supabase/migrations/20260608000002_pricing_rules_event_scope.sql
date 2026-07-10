-- =============================================================================
-- 20260608000002_pricing_rules_event_scope.sql
--
-- Fee system: add the per-EVENT override scope to pricing_rules so the founder
-- can set a fee at three scopes with clear precedence:
--   event (highest) > organiser > region/global (default).
--
-- pricing_rules stays the ONE source of truth for every fee value. An event
-- override is a pricing_rules row with event_id set; the resolver
-- (src/lib/payments/pricing-rules.ts) matches it on (rule_type, event_id) alone
-- and ranks it above the org/region/global levels, all of which are guarded
-- with event_id IS NULL so an event row can never leak into a broader lookup.
--
-- Idempotent. Safe to re-run. Existing rows untouched (event_id defaults NULL).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. event_id (per-event override) column
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS event_id UUID NULL
    REFERENCES public.events(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.pricing_rules.event_id IS
  'NULL = applies at organisation/region/global scope. UUID = per-event override (highest precedence), set from the admin pricing panel. Matched on (rule_type, event_id) alone - an event override is absolute for that event.';

-- -----------------------------------------------------------------------------
-- 2. Rework the partial unique indexes so the three scopes are disjoint.
--
-- Previously:
--   region default : WHERE organisation_id IS NULL
--   org override   : WHERE organisation_id IS NOT NULL
-- An event row (organisation_id IS NULL, event_id NOT NULL) would have fallen
-- into the region_default index, which omits event_id, so two events could
-- collide. Re-scope both partials to event_id IS NULL and add a dedicated
-- event-override uniqueness on (rule_type, event_id, version).
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.pricing_rules_region_default_uniq;
DROP INDEX IF EXISTS public.pricing_rules_org_override_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_region_default_uniq
  ON public.pricing_rules (
    rule_type, country_code, currency, event_type, organiser_tier, version
  )
  WHERE organisation_id IS NULL AND event_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_org_override_uniq
  ON public.pricing_rules (
    rule_type, country_code, currency, event_type, organiser_tier, organisation_id, version
  )
  WHERE organisation_id IS NOT NULL AND event_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_event_override_uniq
  ON public.pricing_rules (rule_type, event_id, version)
  WHERE event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Lookup index for the per-event resolver query
--      WHERE rule_type = $1 AND event_id = $2
--        AND effective_from <= NOW() AND (effective_until IS NULL OR ...)
--      ORDER BY version DESC LIMIT 1
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pricing_rules_event_lookup
  ON public.pricing_rules (rule_type, event_id, effective_from)
  WHERE event_id IS NOT NULL;
