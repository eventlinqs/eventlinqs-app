-- THE VENUE'S OWN /go CODE, THE PROOF (supabase/migrations/20261030203001_venue_go_presses.sql). Run joined after
-- Supabase's new default and the migration, one transaction; it ends by RAISING its verdict, so TEST is left as found.
-- RED: without the migration every check fails in its own block.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_venue uuid;
  v_ok boolean;
  v_n int;
BEGIN
  SELECT id INTO v_venue FROM public.venues ORDER BY created_at LIMIT 1;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: TEST lacks a venue to prove with'; END IF;

  -- G1 only the service role reaches the table.
  BEGIN
    IF NOT has_table_privilege('anon', 'public.venue_go_presses', 'select')
       AND NOT has_table_privilege('anon', 'public.venue_go_presses', 'insert')
       AND NOT has_table_privilege('authenticated', 'public.venue_go_presses', 'select')
       AND NOT has_table_privilege('authenticated', 'public.venue_go_presses', 'insert')
       AND has_table_privilege('service_role', 'public.venue_go_presses', 'select')
       AND has_table_privilege('service_role', 'public.venue_go_presses', 'insert')
       AND NOT has_table_privilege('service_role', 'public.venue_go_presses', 'update') THEN
      v_out := v_out || ' | G1 only the service role reads and adds a press, and nobody edits one: PASS';
    ELSE v_out := v_out || ' | G1 grants: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G1 grants: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- G2 one press per visitor per venue per day; another day or another visitor counts.
  BEGIN
    INSERT INTO public.venue_go_presses (venue_id, via, visitor, day) VALUES (v_venue, 'qr', 'visitor-one', '2026-10-30');
    INSERT INTO public.venue_go_presses (venue_id, via, visitor, day) VALUES (v_venue, 'qr', 'visitor-one', '2026-10-30')
      ON CONFLICT (venue_id, visitor, day) DO NOTHING;
    INSERT INTO public.venue_go_presses (venue_id, via, visitor, day) VALUES (v_venue, 'link', 'visitor-one', '2026-10-31');
    INSERT INTO public.venue_go_presses (venue_id, via, visitor, day) VALUES (v_venue, 'qr', 'visitor-two', '2026-10-30');
    SELECT count(*) INTO v_n FROM public.venue_go_presses WHERE venue_id = v_venue AND visitor LIKE 'visitor-%';
    IF v_n = 3 THEN v_out := v_out || ' | G2 one per visitor per venue per day: PASS';
    ELSE v_out := v_out || ' | G2 count ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G2 one a day: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- G3 an unnamed way in is refused.
  BEGIN
    v_ok := false;
    BEGIN
      INSERT INTO public.venue_go_presses (venue_id, via, visitor, day) VALUES (v_venue, 'poster', 'visitor-three', '2026-10-30');
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF v_ok THEN v_out := v_out || ' | G3 an unnamed way in is refused: PASS';
    ELSE v_out := v_out || ' | G3 via: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G3 via: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
