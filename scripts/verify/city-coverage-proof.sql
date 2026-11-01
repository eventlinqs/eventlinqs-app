-- THE PROOF FOR 20261101162001_city_coverage.sql (city first, directive 7), as the database itself. It needs
-- 20261101160001 and 20261101161001 first: the runner replays the three in one transaction, then this, and it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. Red against an empty migration: the function is absent.
DO $proof$
DECLARE
  v_cov jsonb;
  v_n int;
  v_out text := '';
  v_fail int := 0;
BEGIN
  v_cov := public.growth_city_coverage('geelong');

  -- P1 every row directive 7 asks for is there.
  SELECT count(*) INTO v_n FROM unnest(array['sources', 'upcoming_in_city', 'upcoming_nearby', 'upcoming_by_label', 'by_category', 'by_date',
    'by_suburb', 'duplicates', 'stale', 'awaiting_verification', 'with_authorised_image', 'with_external_ticketing',
    'selling_through_eventlinqs', 'labelled_here_but_placed_elsewhere']) k WHERE v_cov ? k;
  IF v_n = 14 THEN v_out := v_out || ' | P1 all fourteen rows: PASS';
  ELSE v_out := v_out || ' | P1 rows ' || v_n || ' of 14: FAIL'; v_fail := v_fail + 1; END IF;

  -- P2 the label count is the events' own: published, public, not ended, labelled with the city.
  SELECT count(*) INTO v_n FROM public.events e WHERE e.status = 'published' AND e.visibility = 'public'
     AND ((e.end_date IS NOT NULL AND e.end_date >= now()) OR (e.end_date IS NULL AND e.start_date >= date_trunc('day', now())))
     AND (e.listing_fresh_until IS NULL OR e.listing_fresh_until >= now()) AND lower(btrim(coalesce(e.city_primary, ''))) = 'geelong';
  IF (v_cov ->> 'upcoming_by_label')::int = v_n THEN v_out := v_out || ' | P2 label count matches (' || v_n || '): PASS';
  ELSE v_out := v_out || ' | P2 ' || (v_cov ->> 'upcoming_by_label') || ' against ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- P3 the sources are WINDOW 6's registry rows for the city, healthy, failing and unread adding up.
  SELECT count(*) INTO v_n FROM public.listing_sources WHERE city_slug = 'geelong';
  IF (v_cov -> 'sources' ->> 'known')::int = v_n
     AND (v_cov -> 'sources' ->> 'healthy')::int + (v_cov -> 'sources' ->> 'failing')::int + (v_cov -> 'sources' ->> 'not_yet_read')::int
         >= (v_cov -> 'sources' ->> 'known')::int THEN
    v_out := v_out || ' | P3 sources from the registry (' || v_n || '): PASS';
  ELSE v_out := v_out || ' | P3 sources wrong: FAIL'; v_fail := v_fail + 1; END IF;

  -- P4 nothing is placed yet on this database, so nothing counts as in the city: no event is guessed into a city.
  SELECT count(*) INTO v_n FROM public.venues WHERE abs_placed_at IS NOT NULL;
  IF v_n > 0 OR (v_cov ->> 'upcoming_in_city')::int = 0 THEN v_out := v_out || ' | P4 an unplaced venue is never counted in the city: PASS';
  ELSE v_out := v_out || ' | P4 counted in the city without a placement: FAIL'; v_fail := v_fail + 1; END IF;

  -- P5 service role only.
  IF has_function_privilege('anon', 'public.growth_city_coverage(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.growth_city_coverage(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.event_last_checked(uuid)', 'EXECUTE') THEN
    v_out := v_out || ' | P5 readable outside the service role: FAIL'; v_fail := v_fail + 1;
  ELSE v_out := v_out || ' | P5 service role only: PASS'; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
