-- A VENUE's DISTRIBUTION PREFERENCES, THE PROOF (supabase/migrations/20261031033001_venue_distribution_preferences.sql).
-- Run joined after Supabase's new default and the migration, one transaction; it ends by RAISING its verdict, so TEST
-- is left as found. RED: without the migration every check fails in its own block.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_venue uuid;
  v_owner uuid;
  v_other uuid;
  v_ok boolean;
  v_posts boolean;
  v_roundup boolean;
  v_n int;
BEGIN
  SELECT v.id, o.owner_id INTO v_venue, v_owner
    FROM public.venues v JOIN public.organisations o ON o.id = v.organisation_id
   WHERE v.listing_source = 'organiser' AND o.owner_id IS NOT NULL
   ORDER BY v.created_at LIMIT 1;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: TEST lacks a claimed venue with an owner to prove with'; END IF;
  SELECT id INTO v_other FROM public.venues WHERE id <> v_venue ORDER BY created_at LIMIT 1;

  -- D1 only the service role reaches the table and the three functions.
  BEGIN
    IF NOT has_table_privilege('anon', 'public.venue_distribution_preferences', 'select')
       AND NOT has_table_privilege('authenticated', 'public.venue_distribution_preferences', 'select')
       AND NOT has_table_privilege('authenticated', 'public.venue_distribution_preferences', 'insert')
       AND has_table_privilege('service_role', 'public.venue_distribution_preferences', 'select')
       AND NOT has_function_privilege('anon', 'public.venue_distribution_set(uuid, uuid, boolean, boolean)', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.venue_distribution_set(uuid, uuid, boolean, boolean)', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.venue_distribution_for(uuid[])', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.venue_distribution_off(text)', 'execute')
       AND has_function_privilege('service_role', 'public.venue_distribution_set(uuid, uuid, boolean, boolean)', 'execute')
       AND has_function_privilege('service_role', 'public.venue_distribution_for(uuid[])', 'execute')
       AND has_function_privilege('service_role', 'public.venue_distribution_off(text)', 'execute') THEN
      v_out := v_out || ' | D1 only the service role reads the answers and calls the functions: PASS';
    ELSE v_out := v_out || ' | D1 grants: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | D1 grants: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- D2 someone who is not one of the venue's people is refused in the function's words, and nothing is kept.
  BEGIN
    v_ok := false;
    BEGIN
      PERFORM public.venue_distribution_set(gen_random_uuid(), v_venue, false, false);
    EXCEPTION WHEN check_violation THEN v_ok := sqlerrm LIKE 'refused: only the people of a claimed venue%'; END;
    SELECT count(*) INTO v_n FROM public.venue_distribution_preferences WHERE venue_id = v_venue;
    IF v_ok AND v_n = 0 THEN v_out := v_out || ' | D2 a stranger is refused and nothing kept: PASS';
    ELSE v_out := v_out || ' | D2 stranger: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | D2 stranger: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- D3 a venue that has said nothing has no row: the answers read nothing for it, and it is off no channel.
  BEGIN
    SELECT count(*) INTO v_n FROM public.venue_distribution_for(ARRAY[v_venue, v_other]);
    IF v_n = 0 AND NOT EXISTS (SELECT 1 FROM public.venue_distribution_off('our_posts') x WHERE x = v_venue) THEN
      v_out := v_out || ' | D3 silence is no row and on every channel: PASS';
    ELSE v_out := v_out || ' | D3 silence: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | D3 silence: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- D4 the owner says no to our posts and yes to the round-up: kept as given, and the venue is off our posts only.
  BEGIN
    PERFORM public.venue_distribution_set(v_owner, v_venue, false, true);
    SELECT our_posts, weekly_roundup INTO v_posts, v_roundup FROM public.venue_distribution_for(ARRAY[v_venue]);
    IF v_posts = false AND v_roundup = true
       AND EXISTS (SELECT 1 FROM public.venue_distribution_off('our_posts') x WHERE x = v_venue)
       AND NOT EXISTS (SELECT 1 FROM public.venue_distribution_off('weekly_roundup') x WHERE x = v_venue) THEN
      v_out := v_out || ' | D4 an answer is kept as given, off our posts only: PASS';
    ELSE v_out := v_out || ' | D4 answer: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | D4 answer: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- D5 a second answer replaces the first, one row per venue.
  BEGIN
    PERFORM public.venue_distribution_set(v_owner, v_venue, true, false);
    SELECT count(*) INTO v_n FROM public.venue_distribution_preferences WHERE venue_id = v_venue;
    SELECT our_posts, weekly_roundup INTO v_posts, v_roundup FROM public.venue_distribution_for(ARRAY[v_venue]);
    IF v_n = 1 AND v_posts = true AND v_roundup = false
       AND EXISTS (SELECT 1 FROM public.venue_distribution_off('weekly_roundup') x WHERE x = v_venue)
       AND NOT EXISTS (SELECT 1 FROM public.venue_distribution_off('our_posts') x WHERE x = v_venue) THEN
      v_out := v_out || ' | D5 the latest answer stands, one row: PASS';
    ELSE v_out := v_out || ' | D5 latest: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | D5 latest: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- D6 a missing answer and an unknown channel are refused, never read as yes or as nobody.
  BEGIN
    v_ok := false;
    BEGIN
      PERFORM public.venue_distribution_set(v_owner, v_venue, null, true);
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF v_ok THEN
      v_ok := false;
      BEGIN
        PERFORM count(*) FROM public.venue_distribution_off('instagram');
      EXCEPTION WHEN invalid_parameter_value THEN v_ok := true; END;
    END IF;
    IF v_ok THEN v_out := v_out || ' | D6 a missing answer and an unknown channel are refused: PASS';
    ELSE v_out := v_out || ' | D6 refusals: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | D6 refusals: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
