-- THE SUPPLY HORIZON'S RULES ON TEST (the engine plan of 28 October 2026, parts A and E; 20261028204001). Run with
--   scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs scripts/verify/supply-horizon-proof.sql
-- Every row it writes carries bp-proof in its name or address, and the DO block ends by raising its verdict, so the
-- transaction rolls back and TEST is left exactly as found.
do $proof$
declare
  v_lines text[] := '{}';
  v_fail int := 0;
  v_src uuid;
  v_event uuid;
  v_run uuid;
  v_n int;
begin
  -- The horizon, across the April change back to standard time (Melbourne days, never hours).
  if public.listing_horizon(timestamptz '2027-04-06 12:00+10', timestamptz '2027-04-03 13:00+11') = 'publish'
     and public.listing_horizon(timestamptz '2026-10-28 23:30+11', timestamptz '2026-10-28 20:00+11') = 'publish'
     and public.listing_horizon(timestamptz '2026-10-27 23:30+11', timestamptz '2026-10-28 20:00+11') = 'past'
     and public.listing_horizon(timestamptz '2027-01-26 12:00+11', timestamptz '2026-10-28 20:00+11') = 'relationships' then
    v_lines := v_lines || 'PASS listing_horizon counts Melbourne days across daylight saving, 90 days is still relationships'::text;
  else
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL listing_horizon bounds'::text;
  end if;

  -- A daily pace is taken, an unknown one is not.
  insert into public.listing_sources (name, kind, page_url, collection, changes)
  values ('bp-proof supply', 'venue', 'https://bp-proof-supply.example.com/feed.ics', 'ask', 'daily')
  returning id into v_src;
  v_lines := v_lines || 'PASS a daily source is taken'::text;
  begin
    update public.listing_sources set changes = 'hourly' where id = v_src;
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL an hourly pace was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS an unknown pace is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  select id into v_event from public.events order by created_at limit 1;

  -- The partner rule: only accepted, high, new or adds_links, and no person named.
  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, venue_address, page_url, confidence, reasons, decided_by, status, reviewed_at)
  values (v_src, 'new', 'bp-proof partner night', now() + interval '5 days', 'bp-proof hall', '1 bp-proof st', 'https://bp-proof-supply.example.com/e/1', 'high', '{}', 'partner_rule', 'accepted', now());
  v_lines := v_lines || 'PASS a high confidence new night is accepted by the partner rule'::text;
  begin
    insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, confidence, reasons, decided_by, status, reviewed_at)
    values (v_src, 'new', 'bp-proof low night', now() + interval '5 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/2', 'low', '{no_venue_address}', 'partner_rule', 'accepted', now());
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a low confidence row was accepted by the rule'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a low confidence row is refused to the rule (' || replace(sqlerrm, '"', '') || ')')::text;
  end;
  begin
    insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, venue_address, page_url, confidence, reasons, decided_by)
    values (v_src, 'new', 'bp-proof waiting night', now() + interval '5 days', 'bp-proof hall', '1 bp-proof st', 'https://bp-proof-supply.example.com/e/3', 'high', '{}', 'partner_rule');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a waiting row was marked decided by the rule'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS the rule never leaves a row waiting (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  -- A changed fact names its change, is low by that reason, and is never the rule's.
  if v_event is not null then
    insert into public.listing_candidates (source_id, kind, event_id, change, title, starts_at, venue_name, page_url, confidence, reasons)
    values (v_src, 'changes_facts', v_event, 'time_changed', 'bp-proof moved night', now() + interval '6 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/4', 'low', '{time_changed}');
    v_lines := v_lines || 'PASS a changed time lands for a person, naming its event'::text;
    begin
      insert into public.listing_candidates (source_id, kind, event_id, change, title, starts_at, venue_name, page_url, confidence, reasons, decided_by, status, reviewed_at)
      values (v_src, 'changes_facts', v_event, 'time_changed', 'bp-proof ruled move', now() + interval '6 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/5', 'high', '{}', 'partner_rule', 'accepted', now());
      v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a changed fact was accepted by the rule'::text;
    exception when check_violation then
      v_lines := v_lines || ('PASS a changed fact is never the rule''s (' || replace(sqlerrm, '"', '') || ')')::text;
    end;
    begin
      insert into public.listing_candidates (source_id, kind, event_id, title, starts_at, venue_name, page_url, confidence, reasons)
      values (v_src, 'changes_facts', v_event, 'bp-proof no change named', now() + interval '6 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/6', 'low', '{time_changed}');
      v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a changed fact with no change named was taken'::text;
    exception when check_violation then
      v_lines := v_lines || ('PASS a changed fact names its change (' || replace(sqlerrm, '"', '') || ')')::text;
    end;
    begin
      insert into public.listing_candidates (source_id, kind, event_id, title, starts_at, venue_name, page_url)
      values (v_src, 'new', v_event, 'bp-proof new naming an event', now() + interval '6 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/7');
      v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a new listing naming an event was taken'::text;
    exception when check_violation then
      v_lines := v_lines || ('PASS a new listing names no event (' || replace(sqlerrm, '"', '') || ')')::text;
    end;
  else
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL TEST holds no event to name'::text;
  end if;

  -- Confidence and its reasons agree, and only known reasons are taken.
  begin
    insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, confidence, reasons)
    values (v_src, 'new', 'bp-proof high with a reason', now() + interval '5 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/8', 'high', '{midnight_start}');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a high row with a reason was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS high confidence carries no reason (' || replace(sqlerrm, '"', '') || ')')::text;
  end;
  begin
    insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, confidence, reasons)
    values (v_src, 'new', 'bp-proof low with none', now() + interval '5 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/9', 'low', '{}');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a low row with no reason was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS low confidence states its reason (' || replace(sqlerrm, '"', '') || ')')::text;
  end;
  begin
    insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, confidence, reasons)
    values (v_src, 'new', 'bp-proof made up reason', now() + interval '5 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/10', 'low', '{looks_odd}');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL an unknown reason was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS an unknown reason is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;
  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url)
  values (v_src, 'new', 'bp-proof unjudged', now() + interval '5 days', 'bp-proof hall', 'https://bp-proof-supply.example.com/e/11');
  select count(*) into v_n from public.listing_candidates
   where page_url = 'https://bp-proof-supply.example.com/e/11' and confidence = 'low' and reasons = '{judged_before_the_queue}' and decided_by = 'person';
  if v_n = 1 then
    v_lines := v_lines || 'PASS a row written without a judgement waits as low, judged_before_the_queue'::text;
  else
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL an unjudged row took other defaults'::text;
  end if;

  -- The run log: a failure lands nothing, the counts add up, and the service role may only add and read.
  begin
    insert into public.listing_source_runs (source_id, succeeded, outcome, found, landed) values (v_src, false, 'bp-proof failed', 2, 0);
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a failed run with finds was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a failed run lands nothing (' || replace(sqlerrm, '"', '') || ')')::text;
  end;
  begin
    insert into public.listing_source_runs (source_id, succeeded, outcome, found, landed, queued, accepted_by_rule) values (v_src, true, 'bp-proof read', 3, 2, 2, 1);
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a run queuing more than it landed was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a run''s counts add up (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  execute 'set local role service_role';
  insert into public.listing_source_runs (source_id, succeeded, http_status, outcome, found, landed, queued, accepted_by_rule)
  values (v_src, true, 200, 'bp-proof read: 3 found', 3, 2, 1, 1)
  returning id into v_run;
  v_lines := v_lines || 'PASS the service role adds a run row'::text;
  begin
    update public.listing_source_runs set outcome = 'bp-proof rewritten' where id = v_run;
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL the service role rewrote a run row'::text;
  exception when insufficient_privilege then
    v_lines := v_lines || 'PASS a run row is never rewritten (permission denied)'::text;
  end;
  begin
    delete from public.listing_source_runs where id = v_run;
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL the service role deleted a run row'::text;
  exception when insufficient_privilege then
    v_lines := v_lines || 'PASS a run row is never deleted (permission denied)'::text;
  end;
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform 1 from public.listing_source_runs limit 1;
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a visitor read the run log'::text;
  exception when insufficient_privilege then
    v_lines := v_lines || 'PASS a visitor cannot read the run log (permission denied)'::text;
  end;
  begin
    perform public.listing_horizon(now());
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a visitor called listing_horizon'::text;
  exception when insufficient_privilege then
    v_lines := v_lines || 'PASS a visitor cannot call listing_horizon (permission denied)'::text;
  end;
  execute 'reset role';

  raise exception 'PROOF % | %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, array_to_string(v_lines, ' | ');
end
$proof$;
