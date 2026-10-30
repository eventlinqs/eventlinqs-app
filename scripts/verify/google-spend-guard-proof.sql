-- google_spend_guard (20261030165501) on TEST, rolled back by its closing raise. Window 5, 30 October 2026.
do $proof$
declare v_out text := ''; v_fail int := 0; v_ok boolean; v_why text; s record;
begin
  -- P1 the migration starts shut: off, quota 0, cap 0, and a call is refused as off.
  select r.allowed, r.reason into v_ok, v_why from public.google_spend_reserve('places_photo', 1, 'proof P1') r;
  if v_ok is false and v_why = 'Google is switched off: it waits for Lawal''s word.'
     and (select not enabled and daily_call_quota = 0 and monthly_cap_micros = 0 from public.google_spend_settings) then
    v_out := v_out || ' | P1 starts OFF, quota 0, cap 0, a call refused as off: PASS';
  else v_out := v_out || ' | P1 starts shut: FAIL (' || coalesce(v_why, 'allowed') || ')'; v_fail := v_fail + 1; end if;

  -- P2 the daily quota: two of two allowed, the third refused.
  update public.google_spend_settings set enabled = true, daily_call_quota = 2, monthly_cap_micros = 1000000;
  select r.allowed into v_ok from public.google_spend_reserve('places_photo', 1, 'proof P2a') r;
  select r.allowed and v_ok into v_ok from public.google_spend_reserve('places_photo', 1, 'proof P2b') r;
  select r.reason into v_why from public.google_spend_reserve('places_photo', 1, 'proof P2c') r;
  if v_ok and v_why = 'Today''s Google call quota is reached.' then v_out := v_out || ' | P2 two of a quota of two allowed, the third refused: PASS';
  else v_out := v_out || ' | P2 daily quota: FAIL (' || coalesce(v_why, 'allowed') || ')'; v_fail := v_fail + 1; end if;

  -- P3 the monthly cap refuses the call that would pass it (14000 spent of a 20000 cap, a 7000 call would make 21000).
  update public.google_spend_settings set daily_call_quota = 100, monthly_cap_micros = 20000;
  select r.reason into v_why from public.google_spend_reserve('places_photo', 1, 'proof P3') r;
  if v_why = 'This month''s Google spend cap would be passed.' then v_out := v_out || ' | P3 the call that would pass the cap is refused: PASS';
  else v_out := v_out || ' | P3 monthly cap: FAIL (' || coalesce(v_why, 'allowed') || ')'; v_fail := v_fail + 1; end if;

  -- P4 an unpriced call and P5 a zero-unit call are refused.
  select r.reason into v_why from public.google_spend_reserve('places_nearby_search', 1, 'proof P4') r;
  if v_why = 'No price is recorded for this Google call, so it is not made.' then v_out := v_out || ' | P4 an unpriced call refused: PASS';
  else v_out := v_out || ' | P4 unpriced: FAIL (' || coalesce(v_why, 'allowed') || ')'; v_fail := v_fail + 1; end if;
  select r.reason into v_why from public.google_spend_reserve('places_photo', 0, 'proof P5') r;
  if v_why = 'A Google call must reserve at least one unit.' then v_out := v_out || ' | P5 a zero-unit call refused: PASS';
  else v_out := v_out || ' | P5 zero units: FAIL (' || coalesce(v_why, 'allowed') || ')'; v_fail := v_fail + 1; end if;

  -- P6 the counter reads the ledger: 2 calls, 14000 micro dollars, 5 refused (P1, P2c, P3, P4, P5).
  select * into s from public.google_spend_state();
  if s.calls_today = 2 and s.spent_this_month_micros = 14000 and s.refused_today = 5 and s.enabled then
    v_out := v_out || ' | P6 the counter reads 2 calls, US$0.014, 5 refused: PASS';
  else v_out := v_out || format(' | P6 counter: FAIL (calls %s, spent %s, refused %s)', s.calls_today, s.spent_this_month_micros, s.refused_today); v_fail := v_fail + 1; end if;

  -- G1 the paths: nobody but the service role reaches the tables or the functions; the ledger is written only by the function.
  if has_table_privilege('anon', 'public.google_spend_settings', 'SELECT') or has_table_privilege('authenticated', 'public.google_spend_ledger', 'SELECT')
     or has_table_privilege('service_role', 'public.google_spend_ledger', 'INSERT') or has_table_privilege('service_role', 'public.google_spend_prices', 'UPDATE')
     or has_function_privilege('anon', 'public.google_spend_reserve(text, integer, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.google_spend_state()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.google_spend_reserve(text, integer, text)', 'EXECUTE')
     or not (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('google_spend_settings', 'google_spend_prices', 'google_spend_ledger')) then
    v_out := v_out || ' | G1 a path is open: FAIL'; v_fail := v_fail + 1;
  else v_out := v_out || ' | G1 service role only, the ledger written by the function alone, row security on: PASS'; end if;

  raise exception 'PROOF % (% failure(s), rolled back):%', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail, v_out;
end
$proof$;
