-- THE GROWTH SCORECARD, THE PROOF (supabase/migrations/20261101034501_growth_scorecard.sql; Law 8, the CONTROLLER's
-- 1 November 03:32 G1 and G2). Run joined after Supabase's new default and the migration through
-- scripts/verify/replay-under-new-default.mjs, one transaction; it ends by RAISING its verdict, so TEST is left as found.
-- RED without the migration: the function and the table do not exist, so S1 to S4 fail. Since plan v2 (20261101044501)
-- S1 also requires selling_through_eventlinqs, so it is red without that migration.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_card jsonb;
  v_row public.growth_scorecard_daily;
  v_n int;
  k text;
BEGIN
  -- S1 the read answers every number (IS DISTINCT FROM, so a MISSING key fails: jsonb_typeof of a missing key is null,
  -- and null <> number is null, which never raised; the first version of this proof had that hole)
  -- S1 the read answers every number the desk and the founder email show, each a number (the cities an object).
  BEGIN
    v_card := public.growth_scorecard_read();
    FOREACH k IN ARRAY array['visible_events','selling_through_eventlinqs','photo_rights_recorded','claims_verified','venues_claimed',
                             'frequent_paid_organisers_30d','paid_tickets_7d','remind_me_active',
                             'subscribers_confirmed','outreach_sent_yesterday','outreach_replies_yesterday'] LOOP
      IF jsonb_typeof(v_card -> k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'key % is %', k, coalesce(jsonb_typeof(v_card -> k), 'missing'); END IF;
    END LOOP;
    IF jsonb_typeof(v_card -> 'checked_next_14_days_by_city') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'cities is not an object'; END IF;
    v_out := v_out || ' | S1 the read answers every number (visible ' || (v_card ->> 'visible_events') || '): PASS';
  EXCEPTION WHEN others THEN v_out := v_out || ' | S1 the read: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- S2 the snapshot keeps one row for Melbourne's day, and a second read the same day replaces it, never a second row.
  BEGIN
    v_row := public.growth_scorecard_snapshot(1);
    v_row := public.growth_scorecard_snapshot(1);
    SELECT count(*) INTO v_n FROM public.growth_scorecard_daily WHERE day = (now() at time zone 'Australia/Melbourne')::date;
    IF v_n = 1 AND v_row.plan_version = 1 AND v_row.numbers ? 'visible_events' THEN
      v_out := v_out || ' | S2 one row a day, replaced on a second read: PASS';
    ELSE v_out := v_out || ' | S2 snapshot: FAIL (' || v_n || ' row(s))'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | S2 snapshot: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- S3 a plan version below 1 is refused.
  BEGIN
    BEGIN
      PERFORM public.growth_scorecard_snapshot(0);
      v_out := v_out || ' | S3 plan version 0: FAIL (accepted)'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | S3 a plan version below 1 is refused: PASS';
    END;
  EXCEPTION WHEN others THEN v_out := v_out || ' | S3: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- S4 nobody but the service role reaches the read, the snapshot or the table.
  BEGIN
    IF NOT has_function_privilege('anon', 'public.growth_scorecard_read()', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.growth_scorecard_read()', 'execute')
       AND NOT has_function_privilege('anon', 'public.growth_scorecard_snapshot(integer)', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.growth_scorecard_snapshot(integer)', 'execute')
       AND NOT has_table_privilege('anon', 'public.growth_scorecard_daily', 'select')
       AND NOT has_table_privilege('authenticated', 'public.growth_scorecard_daily', 'select')
       AND has_function_privilege('service_role', 'public.growth_scorecard_read()', 'execute')
       AND has_table_privilege('service_role', 'public.growth_scorecard_daily', 'select') THEN
      v_out := v_out || ' | S4 only the service role reaches the read, the snapshot and the table: PASS';
    ELSE v_out := v_out || ' | S4 grants: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | S4 grants: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
