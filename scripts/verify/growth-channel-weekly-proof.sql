-- THE PROOF FOR 20261101165501_growth_channel_weekly.sql, as the database itself. Run through
-- scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by RAISING its verdict,
-- so TEST is left exactly as it was found. Red against an empty migration: the functions are absent.
DO $proof$
DECLARE
  v_weeks jsonb;
  v_fee bigint;
  v_direct bigint;
  v_out text := '';
  v_fail int := 0;
BEGIN
  -- W1 the one channel rule places known visits where WINDOW 2's rule placed them.
  IF public.growth_visit_channel(null, 'https://www.google.com/', null) = 'search'
     AND public.growth_visit_channel(null, 'https://l.instagram.com/', null) = 'social'
     AND public.growth_visit_channel('email', null, null) = 'email'
     AND public.growth_visit_channel(null, 'https://www.eventlinqs.com.au/city/geelong', null) = 'our links'
     AND public.growth_visit_channel(null, null, null) = 'direct'
     AND public.growth_visit_channel(null, 'https://example.org/', null) = 'other' THEN
    v_out := v_out || ' | W1 one channel rule: PASS';
  ELSE v_out := v_out || ' | W1 a visit in the wrong channel: FAIL'; v_fail := v_fail + 1; END IF;

  -- W2 the weeks come back as an array, this week always among them.
  v_weeks := public.growth_channel_weekly('geelong');
  IF jsonb_typeof(v_weeks) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_weeks) w
       WHERE w ->> 'week' = to_char(date_trunc('week', now() at time zone 'Australia/Sydney')::date, 'YYYY-MM-DD')) THEN
    v_out := v_out || ' | W2 eight weeks, this week included: PASS';
  ELSE v_out := v_out || ' | W2 weeks wrong: FAIL'; v_fail := v_fail + 1; END IF;

  -- W3 fee revenue is the platform fees of the city's paid orders and nothing else.
  SELECT coalesce(sum((w ->> 'fee_revenue_cents')::bigint), 0) INTO v_fee FROM jsonb_array_elements(v_weeks) w;
  SELECT coalesce(sum(o.platform_fee_cents), 0) INTO v_direct FROM public.orders o
   WHERE o.status IN ('confirmed', 'partially_refunded') AND o.total_cents > 0
     AND o.event_id IN (SELECT e.id FROM public.events e WHERE lower(coalesce(e.city_primary, e.venue_city, '')) = 'geelong')
     AND coalesce(o.confirmed_at, o.created_at) > now() - interval '56 days';
  IF v_fee = v_direct THEN v_out := v_out || ' | W3 fee revenue equals the paid orders'' fees (' || v_direct || '): PASS';
  ELSE v_out := v_out || ' | W3 fees ' || v_fee || ' against ' || v_direct || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- W4 service role only.
  IF has_function_privilege('anon', 'public.growth_channel_weekly(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.growth_channel_weekly(text)', 'EXECUTE') THEN
    v_out := v_out || ' | W4 readable outside the service role: FAIL'; v_fail := v_fail + 1;
  ELSE v_out := v_out || ' | W4 service role only: PASS'; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
