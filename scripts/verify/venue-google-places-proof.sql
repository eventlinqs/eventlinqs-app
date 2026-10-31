-- GOOGLE VENUE PHOTOS, THE DATA HALF, PROVED ON TEST (supabase/migrations/20261031180001_venue_google_places.sql).
-- One transaction that ends by RAISING its verdict, so TEST is left as found.
--   RED:   this file alone (the migration not there).
--   GREEN: the migration then this file, joined, in one transaction:
--          scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <migration + this, joined>
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_n int;
  v_venue uuid;
  v_user uuid;
  v_ok boolean;
  v_reason text;
BEGIN
  -- G1: the three price rows, free calls at 0, Place Details Pro at US$17 per 1,000.
  BEGIN
    SELECT count(*) INTO v_n FROM public.google_spend_prices
      WHERE (api = 'places_text_search_ids' AND unit_price_micros = 0) OR (api = 'places_details_ids' AND unit_price_micros = 0) OR (api = 'places_details_pro' AND unit_price_micros = 17000);
    IF v_n = 3 THEN v_out := v_out || ' | G1 three price rows: PASS'; ELSE v_out := v_out || ' | G1 price rows: FAIL (' || v_n || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G1: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- G2: a free call passes the guard at zero cost when Google is on, and is still counted.
  BEGIN
    UPDATE public.google_spend_settings SET enabled = true, daily_call_quota = 10 WHERE id;
    SELECT allowed, reason INTO v_ok, v_reason FROM public.google_spend_reserve('places_details_ids', 1, 'proof: a free call');
    SELECT count(*) INTO v_n FROM public.google_spend_ledger WHERE purpose = 'proof: a free call' AND allowed AND cost_micros = 0;
    IF v_ok AND v_n = 1 THEN v_out := v_out || ' | G2 a free call allowed, logged at 0: PASS'; ELSE v_out := v_out || ' | G2: FAIL (' || coalesce(v_reason, 'allowed') || ', ledger ' || v_n || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G2: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- G3: the table keeps a place id and evidence; an approval is whole (who and when) or not at all.
  BEGIN
    SELECT id INTO v_venue FROM public.venues WHERE removed_at IS NULL LIMIT 1;
    SELECT id INTO v_user FROM auth.users LIMIT 1;
    INSERT INTO public.venue_google_places (venue_id, place_id, match_evidence) VALUES (v_venue, 'ChIJproofproofproof', '{"metres": 5}'::jsonb);
    BEGIN
      UPDATE public.venue_google_places SET approved_at = now() WHERE venue_id = v_venue;
      v_out := v_out || ' | G3 half an approval: FAIL (kept)'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | G3 half an approval refused: PASS'; END;
    UPDATE public.venue_google_places SET approved_at = now(), approved_by = v_user WHERE venue_id = v_venue;
    v_out := v_out || ' | G3 a whole approval kept: PASS';
  EXCEPTION WHEN others THEN v_out := v_out || ' | G3: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- G4: no visitor reads it; the server does.
  BEGIN
    IF NOT has_table_privilege('anon', 'public.venue_google_places', 'select') AND NOT has_table_privilege('authenticated', 'public.venue_google_places', 'select') AND has_table_privilege('service_role', 'public.venue_google_places', 'select') THEN
      v_out := v_out || ' | G4 anon and authenticated cannot read, service_role can: PASS';
    ELSE v_out := v_out || ' | G4 grants: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G4: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%', CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
