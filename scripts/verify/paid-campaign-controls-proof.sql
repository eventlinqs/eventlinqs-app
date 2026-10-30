-- paid_campaign_controls (20261030204501) on TEST, rolled back by its closing raise. Window 5, 30 October 2026.
do $proof$
declare
  v_out text := ''; v_fail int := 0; v_user uuid; v_piece uuid; v_link uuid; v_bad uuid; v_good uuid; v_ok boolean; v_why text; v_problems text[]; v_paused boolean;
begin
  select id into v_user from auth.users limit 1;
  select piece_id into v_piece from public.social_piece_approvals limit 1;
  select id into v_link from public.share_links limit 1;
  if v_user is null or v_link is null then raise exception 'TEST holds no user or share link to try with'; end if;

  -- P1 starts off with a zero cap.
  if (select not enabled and monthly_cap_cents = 0 from public.paid_settings) then v_out := v_out || ' | P1 starts OFF, cap 0: PASS';
  else v_out := v_out || ' | P1: FAIL'; v_fail := v_fail + 1; end if;

  -- P2 an empty plan is refused with every reason, and stays a draft.
  insert into public.paid_campaigns (scope, city_slug, created_by) values ('city_guide', 'geelong', v_user) returning id into v_bad;
  select r.approved, r.problems into v_ok, v_problems from public.paid_campaign_approve(v_bad, v_user) r;
  if v_ok is false and array_length(v_problems, 1) = 7 and (select status from public.paid_campaigns where id = v_bad) = 'draft' then
    v_out := v_out || ' | P2 an empty plan refused with all 7 reasons, still a draft: PASS';
  else v_out := v_out || format(' | P2: FAIL (%s, %s)', v_ok, array_length(v_problems, 1)); v_fail := v_fail + 1; end if;

  if v_piece is not null then
    -- P3 a plan with an http destination and a limit over its budget names those two.
    insert into public.paid_campaigns (scope, city_slug, created_by, destination_url, piece_id, share_link_id, budget_cents, daily_limit_cents, objective, permission_note)
      values ('city_guide', 'geelong', v_user, 'http://example.com', v_piece, v_link, 1000, 2000, 'qualified_referral', 'proof') returning id into v_bad;
    select r.problems into v_problems from public.paid_campaign_approve(v_bad, v_user) r;
    if array_length(v_problems, 1) = 2 then v_out := v_out || ' | P3 http and a limit over budget refused: PASS';
    else v_out := v_out || format(' | P3: FAIL (%s)', array_to_string(v_problems, ';')); v_fail := v_fail + 1; end if;

    -- P4 a whole plan is approved; starting it while off is refused, and nothing has moved.
    insert into public.paid_campaigns (scope, city_slug, created_by, destination_url, piece_id, share_link_id, budget_cents, daily_limit_cents, objective, permission_note)
      values ('city_guide', 'geelong', v_user, 'https://www.eventlinqs.com.au/city/geelong', v_piece, v_link, 1000, 500, 'qualified_referral', 'proof') returning id into v_good;
    select r.approved into v_ok from public.paid_campaign_approve(v_good, v_user) r;
    select r.reason into v_why from public.paid_campaign_start(v_good) r;
    if v_ok and v_why = 'Paid promotion is switched off: it waits for Lawal''s word.' and (select status from public.paid_campaigns where id = v_good) = 'approved' then
      v_out := v_out || ' | P4 approved, and start refused while off: PASS';
    else v_out := v_out || format(' | P4: FAIL (%s, %s)', v_ok, v_why); v_fail := v_fail + 1; end if;

    -- P5 on, a budget past the month cap is refused; within it, it starts; a charge reaching the budget pauses it.
    update public.paid_settings set enabled = true, monthly_cap_cents = 500;
    select r.reason into v_why from public.paid_campaign_start(v_good) r;
    if v_why = 'This plan''s budget could pass this month''s cap.' then v_out := v_out || ' | P5a over the month cap refused: PASS';
    else v_out := v_out || format(' | P5a: FAIL (%s)', v_why); v_fail := v_fail + 1; end if;
    update public.paid_settings set monthly_cap_cents = 5000;
    select r.started into v_ok from public.paid_campaign_start(v_good) r;
    select r.paused into v_paused from public.paid_campaign_record_spend(v_good, current_date, 1000, 'proof', v_user) r;
    if v_ok and v_paused and (select status from public.paid_campaigns where id = v_good) = 'paused' then v_out := v_out || ' | P5b starts, the charge reaching budget pauses it: PASS';
    else v_out := v_out || format(' | P5b: FAIL (%s, %s)', v_ok, v_paused); v_fail := v_fail + 1; end if;

    -- P6 the counter reads the ledger.
    if (select paused = 1 and spent_this_month_cents = 1000 and enabled from public.paid_state()) then v_out := v_out || ' | P6 the counter reads 1 paused, A$10.00: PASS';
    else v_out := v_out || ' | P6: FAIL'; v_fail := v_fail + 1; end if;
  else
    v_out := v_out || ' | P3 to P6 NOT RUN: TEST holds no approved piece'; v_fail := v_fail + 1;
  end if;

  -- G1 the paths: a plan cannot be updated by the server role; spend written only by the function; nobody else reaches anything.
  if has_table_privilege('service_role', 'public.paid_campaigns', 'UPDATE') or has_table_privilege('service_role', 'public.paid_campaign_spend', 'INSERT')
     or has_table_privilege('anon', 'public.paid_campaigns', 'SELECT') or has_table_privilege('authenticated', 'public.paid_settings', 'SELECT')
     or has_function_privilege('anon', 'public.paid_campaign_start(uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'public.paid_state()', 'EXECUTE')
     or not (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('paid_settings', 'paid_campaigns', 'paid_campaign_spend')) then
    v_out := v_out || ' | G1 a path is open: FAIL'; v_fail := v_fail + 1;
  else v_out := v_out || ' | G1 no update of a plan, spend only through its function, nobody else reaches it: PASS'; end if;

  raise exception 'PROOF % (% failure(s), rolled back):%', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail, v_out;
end
$proof$;
