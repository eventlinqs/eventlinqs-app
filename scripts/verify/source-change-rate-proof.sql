-- THE PROOF FOR 20261101161501_source_change_rate.sql, as the database itself. Run through
-- scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by RAISING its verdict,
-- so TEST is left exactly as it was found. Red against an empty migration: the columns are absent.
DO $proof$
DECLARE
  v_source uuid;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT id INTO v_source FROM public.listing_sources LIMIT 1;
  IF v_source IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no listing source on this database'; END IF;

  -- S1 every source starts at once a day, and the interval stays between 6 and 24 hours.
  IF (SELECT refresh_interval_hours FROM public.listing_sources WHERE id = v_source) = 24 THEN
    BEGIN
      UPDATE public.listing_sources SET refresh_interval_hours = 48 WHERE id = v_source;
      v_out := v_out || ' | S1 a 48 hour interval was kept: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | S1 daily by default, never past 24 hours: PASS'; END;
  ELSE v_out := v_out || ' | S1 the default is not daily: FAIL'; v_fail := v_fail + 1; END IF;

  -- S2 the change rate is the share of checks that found a change, null before any check.
  IF public.listing_source_change_rate(v_source) IS NULL THEN
    UPDATE public.listing_sources SET checks_counted = 8, changes_counted = 2, refresh_interval_hours = 6,
           refresh_interval_reason = 'proof: changes on a quarter of checks' WHERE id = v_source;
    IF public.listing_source_change_rate(v_source) = 0.25 THEN v_out := v_out || ' | S2 the change rate is measured: PASS';
    ELSE v_out := v_out || ' | S2 rate ' || public.listing_source_change_rate(v_source) || ': FAIL'; v_fail := v_fail + 1; END IF;
  ELSE v_out := v_out || ' | S2 a rate before any check: FAIL'; v_fail := v_fail + 1; END IF;

  -- S3 more changes than checks is refused; a stop says why.
  BEGIN
    UPDATE public.listing_sources SET changes_counted = 9 WHERE id = v_source;
    v_out := v_out || ' | S3 more changes than checks was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    BEGIN
      UPDATE public.listing_sources SET stopped_at = now() WHERE id = v_source;
      v_out := v_out || ' | S3 a stop with no reason was kept: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | S3 changes within checks, a stop says why: PASS'; END;
  END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
