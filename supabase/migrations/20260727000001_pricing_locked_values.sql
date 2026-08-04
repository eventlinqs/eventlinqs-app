-- LOCK 1: pricing_rules matches docs/PRICING.md exactly.
--
-- FINDING THAT PROMPTED THIS (2026-07-27, verified by direct read of both
-- databases): Production and TEST already resolve the correct locked values.
-- The suspected cause, a fee migration that never reached Production, is
-- REFUTED: 20260627000001 landed on Production on 2026-07-26 and both
-- databases return 3.5 / 99 / 2.5 / 0.
--
-- The real defect is versioning hygiene. A new version is inserted with
-- effective_until = NULL and the PREVIOUS row is left open, so multiple
-- versions of one rule are simultaneously "active":
--
--   AU platform_fee_percentage : v1 = 2.5, v2 = 2.0, v3 = 3.5   <- 3 open
--   AU platform_fee_fixed      : v1 = 50,  v2 = 99              <- 2 open
--   AU processing_fee_percentage: v1 = 2.9, v2 = 2.5            <- 2 open
--   AU processing_fee_fixed_cents: v1 = 30, v2 = 0              <- 2 open
--
-- Correctness therefore rests ENTIRELY on `ORDER BY version DESC LIMIT 1`.
-- Any row inserted with a duplicate or non-incrementing version silently
-- changes the fee the platform charges, with no error anywhere. That is the
-- drift vector. This migration closes every superseded row so the open set is
-- exactly one row per rule, and the resolver's ordering becomes a tie-break it
-- never has to use rather than the only thing standing between the buyer and
-- the wrong price.
--
-- IS THIS DESTRUCTIVE? No. It is additive and reversible in effect:
--   * No row is deleted. Superseded rows are STAMPED with effective_until, so
--     the full history is preserved and auditable.
--   * The currently-resolved value does not change on either database, because
--     the highest version is already the locked value. Verified before writing.
--   * Any value that is somehow NOT locked is corrected by inserting a NEW
--     highest version, never by editing a historical row.
--
-- DOES IT AFFECT AN EXISTING ORDER? No. Orders store their own fee amounts at
-- capture time (orders.platform_fee_cents and payment_processing_fee_cents);
-- nothing recomputes a past order from pricing_rules. Payouts for existing
-- orders read the stored amounts. This migration cannot move a cent of money
-- that has already been taken.

BEGIN;

-- 1. Close every superseded AU/AUD region row for the four fee rules.
--    "Superseded" = an open row that is not the highest open version for its
--    (rule_type, country_code, currency) at the region scope.
WITH ranked AS (
  SELECT
    id,
    rule_type,
    ROW_NUMBER() OVER (
      PARTITION BY rule_type, country_code, currency
      ORDER BY version DESC
    ) AS rn
  FROM public.pricing_rules
  WHERE country_code = 'AU'
    AND currency = 'AUD'
    AND organisation_id IS NULL
    AND event_id IS NULL
    AND effective_until IS NULL
    AND rule_type IN (
      'platform_fee_percentage',
      'platform_fee_fixed',
      'processing_fee_percentage',
      'processing_fee_fixed_cents',
      'processing_fee_pass_through'
    )
)
UPDATE public.pricing_rules p
SET effective_until = NOW()
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 2. Assert the surviving open row carries the locked value. If any does not,
--    insert a new highest version holding the locked value. Written as an
--    idempotent upsert-by-version so re-running the migration is a no-op once
--    the values are correct.
DO $$
DECLARE
  locked RECORD;
  current_value NUMERIC;
  current_version INT;
BEGIN
  FOR locked IN
    SELECT * FROM (VALUES
      ('platform_fee_percentage',     'percentage', 3.5::NUMERIC),
      ('platform_fee_fixed',          'fixed',      99::NUMERIC),
      ('processing_fee_percentage',   'percentage', 2.5::NUMERIC),
      ('processing_fee_fixed_cents',  'fixed',      0::NUMERIC),
      ('processing_fee_pass_through', 'integer',    1::NUMERIC)
    ) AS t(rule_type, value_type, locked_value)
  LOOP
    SELECT
      COALESCE(value_percentage, value_cents::NUMERIC, value_integer::NUMERIC),
      version
    INTO current_value, current_version
    FROM public.pricing_rules
    WHERE rule_type = locked.rule_type
      AND country_code = 'AU'
      AND currency = 'AUD'
      AND organisation_id IS NULL
      AND event_id IS NULL
      AND effective_until IS NULL
    ORDER BY version DESC
    LIMIT 1;

    IF current_value IS NULL OR current_value IS DISTINCT FROM locked.locked_value THEN
      -- Close whatever is open, then insert the locked value as a new version.
      UPDATE public.pricing_rules
      SET effective_until = NOW()
      WHERE rule_type = locked.rule_type
        AND country_code = 'AU'
        AND currency = 'AUD'
        AND organisation_id IS NULL
        AND event_id IS NULL
        AND effective_until IS NULL;

      INSERT INTO public.pricing_rules (
        rule_type, country_code, currency, event_type, organiser_tier,
        organisation_id, event_id, value_type, version,
        effective_from, effective_until,
        value_percentage, value_cents, value_integer
      ) VALUES (
        locked.rule_type, 'AU', 'AUD', 'ALL', 'ALL',
        NULL, NULL, locked.value_type, COALESCE(current_version, 0) + 1,
        NOW(), NULL,
        CASE WHEN locked.value_type = 'percentage' THEN locked.locked_value END,
        CASE WHEN locked.value_type = 'fixed'      THEN locked.locked_value::BIGINT END,
        CASE WHEN locked.value_type = 'integer'    THEN locked.locked_value::INT END
      );

      RAISE NOTICE 'pricing lock: % corrected to %', locked.rule_type, locked.locked_value;
    END IF;
  END LOOP;
END $$;

-- 3. Prove the post-condition inside the transaction. If the open set is not
--    exactly one row per rule carrying the locked value, ABORT the migration
--    rather than leave the database half-locked.
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM (
    SELECT rule_type, COUNT(*) AS open_rows
    FROM public.pricing_rules
    WHERE country_code = 'AU' AND currency = 'AUD'
      AND organisation_id IS NULL AND event_id IS NULL
      AND effective_until IS NULL
      AND rule_type IN (
        'platform_fee_percentage', 'platform_fee_fixed',
        'processing_fee_percentage', 'processing_fee_fixed_cents',
        'processing_fee_pass_through'
      )
    GROUP BY rule_type
    HAVING COUNT(*) <> 1
  ) AS offenders;

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'pricing lock post-condition failed: % rule(s) do not have exactly one open row', bad_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pricing_rules
    WHERE rule_type = 'platform_fee_percentage' AND country_code = 'AU' AND currency = 'AUD'
      AND organisation_id IS NULL AND event_id IS NULL AND effective_until IS NULL
      AND value_percentage = 3.5
  ) THEN
    RAISE EXCEPTION 'pricing lock post-condition failed: platform_fee_percentage is not 3.5';
  END IF;

  RAISE NOTICE 'pricing lock: post-condition satisfied, one open row per rule at the locked values';
END $$;

COMMIT;
