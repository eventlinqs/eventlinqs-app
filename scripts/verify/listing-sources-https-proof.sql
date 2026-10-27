-- THE LISTING SOURCES HTTPS PROOF (supabase/migrations/20261027220001_listing_sources_https_only.sql), on TEST,
-- as the service role writes them. One transaction that ends by RAISING its verdict, so TEST is left as found.
DO $proof$
DECLARE
  v_series uuid;
  v_out text := '';
  v_fail int := 0;
  v_bad text;
BEGIN
  SELECT id INTO v_series FROM public.event_series LIMIT 1;
  IF v_series IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no series on this database'; END IF;

  INSERT INTO public.listing_checks (series_id, source_url, source_date, import_file, outcome)
  VALUES (v_series, 'https://whatson.example.com/bp-proof', current_date, 'bp-proof.csv', 'confirmed');
  v_out := v_out || ' | H1 an https source is kept: PASS';

  FOREACH v_bad IN ARRAY ARRAY['http://whatson.example.com/bp-proof', 'javascript:alert(1)', 'data:text/html,hi', 'https://two words.example.com'] LOOP
    BEGIN
      INSERT INTO public.listing_checks (series_id, source_url, source_date, import_file, outcome)
      VALUES (v_series, v_bad, current_date, 'bp-proof.csv', 'confirmed');
      v_out := v_out || ' | H2 ' || v_bad || ' kept: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN
      v_out := v_out || ' | H2 ' || v_bad || ' refused: PASS';
    END;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listing_checks_source_url_https_only' AND convalidated) THEN
    v_out := v_out || ' | H3 validated on every existing row: PASS';
  ELSE
    v_out := v_out || ' | H3 NOT VALID: an existing row is not https, so new rows alone are held';
  END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%', CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
