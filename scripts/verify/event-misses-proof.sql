-- THE PROOF FOR 20261101163001_event_misses.sql (the learning loop), as the database itself. Run through
-- scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by RAISING its verdict,
-- so TEST is left exactly as it was found. Red against an empty migration: the table is absent.
DO $proof$
DECLARE
  v_week jsonb;
  v_n int;
  v_out text := '';
  v_fail int := 0;
BEGIN
  -- X1 a miss is kept with who found it, where and why.
  INSERT INTO public.event_misses (city_slug, title, starts_at, venue_name, found_by, found_by_detail, found_on_url, reason)
  VALUES ('geelong', 'Proof Miss One', now() + interval '3 days', 'Costa Hall', 'leaders', 'Visit Geelong calendar', 'https://example.com/one', 'source_not_registered'),
         ('geelong', 'Proof Miss Two', now() + interval '5 days', 'The Wool Exchange', 'window', 'WINDOW 6 audit', null, 'no_adapter');
  SELECT count(*) INTO v_n FROM public.event_misses WHERE title LIKE 'Proof Miss %';
  IF v_n = 2 THEN v_out := v_out || ' | X1 misses kept with who, where and why: PASS';
  ELSE v_out := v_out || ' | X1 rows ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- X2 a reason outside the list is refused.
  BEGIN
    INSERT INTO public.event_misses (city_slug, title, found_by, reason) VALUES ('geelong', 'Proof Bad Reason', 'window', 'bad luck');
    v_out := v_out || ' | X2 an unknown reason was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | X2 only the named reasons: PASS'; END;

  -- X3 a miss is fixed only with the fix written down.
  BEGIN
    UPDATE public.event_misses SET fixed_at = now() WHERE title = 'Proof Miss One';
    v_out := v_out || ' | X3 fixed without a fix: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | X3 fixed only with its fix: PASS'; END;
  UPDATE public.event_misses SET fixed_at = now(), fix = 'Costa Hall registered as a source', fix_ref = 'proof' WHERE title = 'Proof Miss One';

  -- X4 the weekly report counts this week's misses, the fixed ones and each reason.
  SELECT w INTO v_week FROM jsonb_array_elements(public.growth_misses_weekly('geelong')) w
   WHERE w ->> 'week' = to_char(date_trunc('week', now() at time zone 'Australia/Sydney'), 'YYYY-MM-DD');
  IF (v_week ->> 'misses')::int >= 2 AND (v_week ->> 'fixed')::int >= 1 AND v_week -> 'by_reason' ? 'no_adapter' THEN
    v_out := v_out || ' | X4 the weekly report counts misses, fixes and reasons: PASS';
  ELSE v_out := v_out || ' | X4 weekly report ' || coalesce(v_week::text, 'empty') || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- X5 service role only.
  IF has_table_privilege('anon', 'public.event_misses', 'SELECT') OR has_table_privilege('authenticated', 'public.event_misses', 'SELECT')
     OR has_function_privilege('anon', 'public.growth_misses_weekly(text)', 'EXECUTE') THEN
    v_out := v_out || ' | X5 readable outside the service role: FAIL'; v_fail := v_fail + 1;
  ELSE v_out := v_out || ' | X5 service role only: PASS'; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
