-- =============================================================================
-- 20260502000002_pricing_rules_extension.sql
--
-- M6 Phase 3 (rework). Extends the long-format pricing_rules table without
-- changing its shape, so the existing 18 production rows remain valid.
--
-- Adds:
--   1. organisation_id NULL column (per-org enterprise overrides)
--   2. Six new rule_type values via CHECK constraint replacement
--   3. value_type 'integer' for non-money / non-percentage values
--   4. Replacement uniqueness constraints (partial indexes for NULL vs UUID)
--   5. Lookup index aligned with pricing-rules service query plan
--   6. Region-default seed rows for AU, GB, US, NG, GH, KE, ZA, GLOBAL
--
-- Idempotent. Safe to re-run. Existing rows untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. organisation_id (per-org override) column
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS organisation_id UUID NULL
    REFERENCES public.organisations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.pricing_rules.organisation_id IS
  'NULL = region default rule that applies to every organisation in the country. UUID = per-organisation override (enterprise deals, M7 admin panel).';

-- -----------------------------------------------------------------------------
-- 2. Replace rule_type CHECK constraint with extended set
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_rule_type_check;

ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_rule_type_check CHECK (rule_type IN (
    -- Existing (production)
    'platform_fee_percentage',
    'platform_fee_fixed',
    'instant_payout_fee',
    'resale_fee',
    'featured_listing',
    'subscription_price',
    -- New in M6 Phase 3
    'processing_fee_percentage',
    'processing_fee_fixed_cents',
    'processing_fee_pass_through',
    'reserve_percentage',
    'payout_schedule_days',
    'application_fee_composition_mode'
  ));

COMMENT ON COLUMN public.pricing_rules.rule_type IS
  'Rule category. Money values use value_type=fixed (cents) or value_type=percentage (e.g. 2.5 = 2.5%). Integer codes (pass_through, composition_mode) use value_type=integer with documented enum values per type.';

-- -----------------------------------------------------------------------------
-- 3. Extend value_type CHECK to include 'integer'
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_value_type_check;

ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_value_type_check CHECK (value_type IN (
    'percentage', 'fixed', 'integer'
  ));

COMMENT ON COLUMN public.pricing_rules.value_type IS
  'percentage: stored as the percent (e.g. 2.5 means 2.5%). fixed: cents (e.g. 30 means 30 cents). integer: enum code or count (e.g. 3 = 3 days, 1 = pass_through mode 1).';

-- -----------------------------------------------------------------------------
-- 4. Replace the legacy "no active duplicates" constraint
--
-- Old: UNIQUE(rule_type, country_code, event_type, organiser_tier, version)
-- Problem: missing currency and organisation_id from the scope set, and the
--   PG default (NULLS DISTINCT) means multiple region-default rows could exist
--   for the same scope.
--
-- New: two partial unique indexes, one for region defaults (organisation_id
--   IS NULL) and one for per-org overrides (organisation_id IS NOT NULL).
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_no_active_duplicates;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_region_default_uniq
  ON public.pricing_rules (
    rule_type, country_code, currency, event_type, organiser_tier, version
  )
  WHERE organisation_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_org_override_uniq
  ON public.pricing_rules (
    rule_type, country_code, currency, event_type, organiser_tier, organisation_id, version
  )
  WHERE organisation_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. Lookup index aligned with pricing-rules service
--
-- Service query shape:
--   SELECT * FROM pricing_rules
--   WHERE rule_type = $1
--     AND country_code = $2
--     AND currency = $3
--     AND (organisation_id = $4 OR organisation_id IS NULL)
--     AND effective_from <= NOW()
--     AND (effective_until IS NULL OR effective_until > NOW())
--   ORDER BY organisation_id NULLS LAST, version DESC
--   LIMIT 1
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pricing_rules_lookup
  ON public.pricing_rules (
    rule_type, country_code, currency, organisation_id, effective_from
  );

-- -----------------------------------------------------------------------------
-- 6. Seed region defaults for the six new rule types.
--
-- ON CONFLICT DO NOTHING uses the partial unique index above. Re-running this
-- migration is a no-op for existing rows.
--
-- Seed scope: AU/GB/US (v1 launch markets) plus existing baseline countries
-- (NG/GH/KE/ZA) so country coverage is complete. Default values per founder
-- spec.
-- -----------------------------------------------------------------------------

-- 6a. processing_fee_percentage (Stripe processing percent the buyer pays)
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type)
VALUES
  ('processing_fee_percentage', 'GLOBAL', 'AUD', 2.9000, 'percentage'),
  ('processing_fee_percentage', 'AU',     'AUD', 2.9000, 'percentage'),
  ('processing_fee_percentage', 'GB',     'GBP', 1.5000, 'percentage'),
  ('processing_fee_percentage', 'US',     'USD', 2.9000, 'percentage'),
  ('processing_fee_percentage', 'NG',     'NGN', 2.9000, 'percentage'),
  ('processing_fee_percentage', 'GH',     'GHS', 2.9000, 'percentage'),
  ('processing_fee_percentage', 'KE',     'KES', 2.9000, 'percentage'),
  ('processing_fee_percentage', 'ZA',     'ZAR', 2.9000, 'percentage')
ON CONFLICT DO NOTHING;

-- 6b. processing_fee_fixed_cents (Stripe per-transaction fixed component)
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type)
VALUES
  ('processing_fee_fixed_cents', 'GLOBAL', 'AUD', 30,    'fixed'),
  ('processing_fee_fixed_cents', 'AU',     'AUD', 30,    'fixed'),
  ('processing_fee_fixed_cents', 'GB',     'GBP', 20,    'fixed'),
  ('processing_fee_fixed_cents', 'US',     'USD', 30,    'fixed'),
  ('processing_fee_fixed_cents', 'NG',     'NGN', 10000, 'fixed'),
  ('processing_fee_fixed_cents', 'GH',     'GHS', 100,   'fixed'),
  ('processing_fee_fixed_cents', 'KE',     'KES', 5000,  'fixed'),
  ('processing_fee_fixed_cents', 'ZA',     'ZAR', 200,   'fixed')
ON CONFLICT DO NOTHING;

-- 6c. processing_fee_pass_through
--   integer code: 0 = absorb (organiser pays), 1 = pass to buyer, 2 = split
--   v1 default: 1 (matches Eventbrite / Humanitix industry standard)
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type)
VALUES
  ('processing_fee_pass_through', 'GLOBAL', 'AUD', 1, 'integer'),
  ('processing_fee_pass_through', 'AU',     'AUD', 1, 'integer'),
  ('processing_fee_pass_through', 'GB',     'GBP', 1, 'integer'),
  ('processing_fee_pass_through', 'US',     'USD', 1, 'integer'),
  ('processing_fee_pass_through', 'NG',     'NGN', 1, 'integer'),
  ('processing_fee_pass_through', 'GH',     'GHS', 1, 'integer'),
  ('processing_fee_pass_through', 'KE',     'KES', 1, 'integer'),
  ('processing_fee_pass_through', 'ZA',     'ZAR', 1, 'integer')
ON CONFLICT DO NOTHING;

-- 6d. reserve_percentage (rolling reserve as percent of organiser net share)
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type)
VALUES
  ('reserve_percentage', 'GLOBAL', 'AUD', 20.0000, 'percentage'),
  ('reserve_percentage', 'AU',     'AUD', 20.0000, 'percentage'),
  ('reserve_percentage', 'GB',     'GBP', 20.0000, 'percentage'),
  ('reserve_percentage', 'US',     'USD', 20.0000, 'percentage'),
  ('reserve_percentage', 'NG',     'NGN', 20.0000, 'percentage'),
  ('reserve_percentage', 'GH',     'GHS', 20.0000, 'percentage'),
  ('reserve_percentage', 'KE',     'KES', 20.0000, 'percentage'),
  ('reserve_percentage', 'ZA',     'ZAR', 20.0000, 'percentage')
ON CONFLICT DO NOTHING;

-- 6e. payout_schedule_days (days post-event before reserve hold releases)
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type)
VALUES
  ('payout_schedule_days', 'GLOBAL', 'AUD', 3, 'integer'),
  ('payout_schedule_days', 'AU',     'AUD', 3, 'integer'),
  ('payout_schedule_days', 'GB',     'GBP', 3, 'integer'),
  ('payout_schedule_days', 'US',     'USD', 3, 'integer'),
  ('payout_schedule_days', 'NG',     'NGN', 3, 'integer'),
  ('payout_schedule_days', 'GH',     'GHS', 3, 'integer'),
  ('payout_schedule_days', 'KE',     'KES', 3, 'integer'),
  ('payout_schedule_days', 'ZA',     'ZAR', 3, 'integer')
ON CONFLICT DO NOTHING;

-- 6f. application_fee_composition_mode
--   integer code:
--     1 = stripe_fee_inclusive (app_fee = platform commission + processing
--         fee charged to buyer; platform pays Stripe out of app_fee)
--     2 = stripe_fee_exclusive (app_fee = platform commission only; processing
--         fee stays with the organiser; Stripe fee comes out of platform float)
--   v1 default: 1 (current implementation, platform-stable)
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type)
VALUES
  ('application_fee_composition_mode', 'GLOBAL', 'AUD', 1, 'integer')
ON CONFLICT DO NOTHING;
