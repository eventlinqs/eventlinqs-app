-- THE PROOF FOR 20261101160001_city_geography.sql (city first, directive 3), as the database itself.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. Red against an empty migration: the table is absent.
-- The placements below are the ones the ABS service answered on 1 November 2026 for real points (saved in
-- C:\dev\EVIDENCE\CITY-FIRST-1NOV\w1\src\city-centres-abs.txt and the model's table): Geelong centre, Ocean Grove,
-- Queenscliff and Aireys Inlet.
DO $proof$
DECLARE
  v_venue uuid;
  v_n int;
  v_r text;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT id INTO v_venue FROM public.venues WHERE latitude IS NOT NULL LIMIT 1;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no venue with coordinates on this database'; END IF;

  -- C1 the four guide cities, each a row of ABS codes.
  SELECT count(*) INTO v_n FROM public.city_geography WHERE city_slug IN ('geelong', 'ballarat', 'bendigo', 'melbourne');
  IF v_n = 4 THEN v_out := v_out || ' | C1 four guide cities seeded: PASS';
  ELSE v_out := v_out || ' | C1 rows ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- C2 Geelong's centre is the city of Geelong and outside Ballarat.
  UPDATE public.venues SET abs_ucl_code = '203003', abs_lga_code = '22750', abs_gccsa_code = '2RVIC', abs_tr_code = '2R140',
         abs_placed_at = now(), abs_placed_latitude = latitude, abs_placed_longitude = longitude WHERE id = v_venue;
  IF public.venue_city_relation('geelong', v_venue) = 'city' AND public.venue_city_relation('ballarat', v_venue) = 'outside' THEN
    v_out := v_out || ' | C2 Geelong centre: city of Geelong, outside Ballarat: PASS';
  ELSE v_out := v_out || ' | C2 got ' || public.venue_city_relation('geelong', v_venue) || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- C3 Ocean Grove: the same council, a separate town.
  UPDATE public.venues SET abs_ucl_code = '000000', abs_lga_code = '22750', abs_tr_code = '2R140' WHERE id = v_venue;
  v_r := public.venue_city_relation('geelong', v_venue);
  IF v_r = 'surrounding' THEN v_out := v_out || ' | C3 Ocean Grove is surrounding: PASS';
  ELSE v_out := v_out || ' | C3 got ' || v_r || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- C4 Queenscliff: the tourism region, outside the council.
  UPDATE public.venues SET abs_lga_code = '00000' WHERE id = v_venue;
  v_r := public.venue_city_relation('geelong', v_venue);
  IF v_r = 'region' THEN v_out := v_out || ' | C4 Queenscliff is the region: PASS';
  ELSE v_out := v_out || ' | C4 got ' || v_r || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- C5 Aireys Inlet: Surf Coast, Great Ocean Road: outside Geelong.
  UPDATE public.venues SET abs_lga_code = '26490', abs_tr_code = '2R040' WHERE id = v_venue;
  v_r := public.venue_city_relation('geelong', v_venue);
  IF v_r = 'outside' THEN v_out := v_out || ' | C5 Aireys Inlet is outside Geelong: PASS';
  ELSE v_out := v_out || ' | C5 got ' || v_r || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- C6 Melbourne's surroundings are Greater Melbourne beyond its Urban Centre.
  UPDATE public.venues SET abs_ucl_code = '000000', abs_lga_code = '00000', abs_gccsa_code = '2GMEL', abs_tr_code = '2R010' WHERE id = v_venue;
  v_r := public.venue_city_relation('melbourne', v_venue);
  IF v_r = 'surrounding' THEN v_out := v_out || ' | C6 Greater Melbourne is surrounding Melbourne: PASS';
  ELSE v_out := v_out || ' | C6 got ' || v_r || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- C7 a venue that moved is unplaced until placed again; so is a venue never placed, and an unknown city.
  UPDATE public.venues SET abs_placed_latitude = abs_placed_latitude + 0.5 WHERE id = v_venue;
  IF public.venue_city_relation('melbourne', v_venue) = 'unplaced' AND public.venue_city_relation('nowhere', v_venue) = 'unplaced' THEN
    v_out := v_out || ' | C7 a moved venue and an unknown city are unplaced: PASS';
  ELSE v_out := v_out || ' | C7 a stale placement was used: FAIL'; v_fail := v_fail + 1; END IF;

  -- C8 anyone may read the cities' codes; nobody signed out or in may change them.
  IF has_table_privilege('anon', 'public.city_geography', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.city_geography', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.city_geography', 'UPDATE')
     AND has_function_privilege('anon', 'public.venue_city_relation(text, uuid)', 'EXECUTE') THEN
    v_out := v_out || ' | C8 read by anyone, written by the service role only: PASS';
  ELSE v_out := v_out || ' | C8 grants wrong: FAIL'; v_fail := v_fail + 1; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
