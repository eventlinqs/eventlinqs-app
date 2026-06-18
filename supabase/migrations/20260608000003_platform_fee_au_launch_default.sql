-- =============================================================================
-- 20260608000003_platform_fee_au_launch_default.sql
--
-- Set the launch platform fee for Australia to the founder's documented value:
--   platform_fee_percentage AU/AUD = 2.0
--   platform_fee_fixed      AU/AUD = 50 (cents) = AUD 0.50
--
-- so the documented launch fee and the live value match (displayed == charged,
-- single source). Append-only versioned write, exactly as the admin pricing
-- editor does: insert a new highest-version region-default row (organisation_id
-- IS NULL, event_id IS NULL). Past orders keep their historical fee.
--
-- Idempotent: only writes when the current effective AU value differs from the
-- target, so re-running is a no-op. Runs AFTER 20260608000002 (event_id column).
-- =============================================================================

DO $$
DECLARE
  v_cur_pct   NUMERIC;
  v_cur_fixed BIGINT;
  v_next      INT;
BEGIN
  -- ---- platform_fee_percentage AU/AUD -> 2.0 --------------------------------
  SELECT value_percentage INTO v_cur_pct
  FROM public.pricing_rules
  WHERE rule_type = 'platform_fee_percentage'
    AND country_code = 'AU' AND currency = 'AUD'
    AND organisation_id IS NULL AND event_id IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY version DESC
  LIMIT 1;

  IF v_cur_pct IS DISTINCT FROM 2.0 THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.pricing_rules
    WHERE rule_type = 'platform_fee_percentage'
      AND country_code = 'AU' AND currency = 'AUD'
      AND organisation_id IS NULL AND event_id IS NULL;

    INSERT INTO public.pricing_rules
      (rule_type, country_code, currency, event_type, organiser_tier,
       organisation_id, event_id, value_type,
       value_percentage, value_cents, value_integer,
       version, effective_from, effective_until)
    VALUES
      ('platform_fee_percentage', 'AU', 'AUD', 'ALL', 'ALL',
       NULL, NULL, 'percentage',
       2.0, NULL, NULL,
       v_next, now(), NULL);
  END IF;

  -- ---- platform_fee_fixed AU/AUD -> 50 cents --------------------------------
  SELECT value_cents INTO v_cur_fixed
  FROM public.pricing_rules
  WHERE rule_type = 'platform_fee_fixed'
    AND country_code = 'AU' AND currency = 'AUD'
    AND organisation_id IS NULL AND event_id IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY version DESC
  LIMIT 1;

  IF v_cur_fixed IS DISTINCT FROM 50 THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.pricing_rules
    WHERE rule_type = 'platform_fee_fixed'
      AND country_code = 'AU' AND currency = 'AUD'
      AND organisation_id IS NULL AND event_id IS NULL;

    INSERT INTO public.pricing_rules
      (rule_type, country_code, currency, event_type, organiser_tier,
       organisation_id, event_id, value_type,
       value_percentage, value_cents, value_integer,
       version, effective_from, effective_until)
    VALUES
      ('platform_fee_fixed', 'AU', 'AUD', 'ALL', 'ALL',
       NULL, NULL, 'fixed',
       NULL, 50, NULL,
       v_next, now(), NULL);
  END IF;
END $$;
