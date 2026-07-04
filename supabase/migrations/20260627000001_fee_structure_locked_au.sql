-- =============================================================================
-- 20260627000001_fee_structure_locked_au.sql
--
-- Set the LOCKED EventLinqs fee structure for Australia
-- (docs/EventLinqs-Fee-Structure-LOCKED.md). Two fees on every paid ticket:
--   platform_fee_percentage   AU/AUD = 3.5   (service fee, the profit margin)
--   platform_fee_fixed        AU/AUD = 99    (cents) = AUD 0.99 per ticket
--   processing_fee_percentage AU/AUD = 2.5   (payment processing, thin margin)
--   processing_fee_fixed_cents AU/AUD = 0    (no flat processing component)
--
-- This is the single source of truth the charge (PaymentCalculator), the payout
-- (application-fee), and the display (getLivePublicFee) all read, so displayed
-- == charged. Append-only versioned write exactly as the admin pricing editor
-- does: a change inserts a new highest-version region-default row
-- (organisation_id IS NULL, event_id IS NULL). Past orders keep their historical
-- fee. Free events stay $0 (the calculator short-circuits a zero-subtotal cart).
--
-- The funds-holding charge/transfer mechanics are NOT touched: only the fee
-- VALUES change and they compose through the existing single-source flow.
--
-- Idempotent: only writes when the current effective AU value differs from the
-- target, so re-running is a no-op. Supersedes the
-- 20260608000003 launch default (2% + AUD 0.50). Lawal applies with
-- `supabase db push --linked` to TEST, then to production at launch, and
-- verifies with a direct DB query.
-- =============================================================================

DO $$
DECLARE
  v_cur_pct   NUMERIC;
  v_cur_fixed BIGINT;
  v_next      INT;
BEGIN
  -- ---- platform_fee_percentage AU/AUD -> 3.5 --------------------------------
  SELECT value_percentage INTO v_cur_pct
  FROM public.pricing_rules
  WHERE rule_type = 'platform_fee_percentage'
    AND country_code = 'AU' AND currency = 'AUD'
    AND organisation_id IS NULL AND event_id IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY version DESC
  LIMIT 1;

  IF v_cur_pct IS DISTINCT FROM 3.5 THEN
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
       3.5, NULL, NULL,
       v_next, now(), NULL);
  END IF;

  -- ---- platform_fee_fixed AU/AUD -> 99 cents (AUD 0.99) ---------------------
  SELECT value_cents INTO v_cur_fixed
  FROM public.pricing_rules
  WHERE rule_type = 'platform_fee_fixed'
    AND country_code = 'AU' AND currency = 'AUD'
    AND organisation_id IS NULL AND event_id IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY version DESC
  LIMIT 1;

  IF v_cur_fixed IS DISTINCT FROM 99 THEN
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
       NULL, 99, NULL,
       v_next, now(), NULL);
  END IF;

  -- ---- processing_fee_percentage AU/AUD -> 2.5 ------------------------------
  SELECT value_percentage INTO v_cur_pct
  FROM public.pricing_rules
  WHERE rule_type = 'processing_fee_percentage'
    AND country_code = 'AU' AND currency = 'AUD'
    AND organisation_id IS NULL AND event_id IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY version DESC
  LIMIT 1;

  IF v_cur_pct IS DISTINCT FROM 2.5 THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.pricing_rules
    WHERE rule_type = 'processing_fee_percentage'
      AND country_code = 'AU' AND currency = 'AUD'
      AND organisation_id IS NULL AND event_id IS NULL;

    INSERT INTO public.pricing_rules
      (rule_type, country_code, currency, event_type, organiser_tier,
       organisation_id, event_id, value_type,
       value_percentage, value_cents, value_integer,
       version, effective_from, effective_until)
    VALUES
      ('processing_fee_percentage', 'AU', 'AUD', 'ALL', 'ALL',
       NULL, NULL, 'percentage',
       2.5, NULL, NULL,
       v_next, now(), NULL);
  END IF;

  -- ---- processing_fee_fixed_cents AU/AUD -> 0 (no flat processing) ----------
  SELECT value_cents INTO v_cur_fixed
  FROM public.pricing_rules
  WHERE rule_type = 'processing_fee_fixed_cents'
    AND country_code = 'AU' AND currency = 'AUD'
    AND organisation_id IS NULL AND event_id IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY version DESC
  LIMIT 1;

  IF v_cur_fixed IS DISTINCT FROM 0 THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.pricing_rules
    WHERE rule_type = 'processing_fee_fixed_cents'
      AND country_code = 'AU' AND currency = 'AUD'
      AND organisation_id IS NULL AND event_id IS NULL;

    INSERT INTO public.pricing_rules
      (rule_type, country_code, currency, event_type, organiser_tier,
       organisation_id, event_id, value_type,
       value_percentage, value_cents, value_integer,
       version, effective_from, effective_until)
    VALUES
      ('processing_fee_fixed_cents', 'AU', 'AUD', 'ALL', 'ALL',
       NULL, NULL, 'fixed',
       NULL, 0, NULL,
       v_next, now(), NULL);
  END IF;
END $$;
