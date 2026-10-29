-- email_delivery_events (20261029223001) on TEST, rolled back by its closing raise. Window 6, 29 October 2026.
create function pg_temp.refused(p_sql text, p_like text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'FAIL (kept)';
exception when others then
  if sqlerrm ilike '%' || p_like || '%' then return 'PASS'; end if;
  return 'FAIL (' || replace(replace(sqlerrm, '"', ''), '|', '/') || ')';
end
$f$;
create function pg_temp.ok(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'PASS';
exception when others then
  return 'FAIL (' || replace(replace(sqlerrm, '"', ''), '|', '/') || ')';
end
$f$;
do $proof$
declare v_out text := ''; v_fail int := 0; v_r text;
begin
  v_r := pg_temp.ok($s$insert into public.email_delivery_events (provider, provider_event_id, event_type, email_id, address, bounce_type, bounce_subtype, undeliverable, occurred_at) values ('resend', 'msg_proof_1', 'email.bounced', 'em_1', 'proof.bounce@example.com', 'Permanent', 'General', true, now())$s$);
  v_out := v_out || ' | D1 a permanent bounce, undeliverable: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused($s$insert into public.email_delivery_events (provider, provider_event_id, event_type, address, bounce_type, undeliverable, occurred_at) values ('resend', 'msg_proof_2', 'email.bounced', 'proof.temp@example.com', 'Temporary', true, now())$s$, 'email_delivery_events_undeliverable_is_a_permanent_bounce');
  v_out := v_out || ' | D2 a temporary bounce can never be undeliverable: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused($s$insert into public.email_delivery_events (provider, provider_event_id, event_type, address, undeliverable, occurred_at) values ('resend', 'msg_proof_3', 'email.complained', 'proof.complaint@example.com', true, now())$s$, 'email_delivery_events_undeliverable_is_a_permanent_bounce');
  v_out := v_out || ' | D3 a complaint is never undeliverable (it is a consent stop, written elsewhere): ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused($s$insert into public.email_delivery_events (provider, provider_event_id, event_type, address, occurred_at) values ('resend', 'msg_proof_1', 'email.bounced', 'proof.bounce@example.com', now())$s$, 'email_delivery_events_once');
  v_out := v_out || ' | D4 the same webhook twice for one address is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused($s$insert into public.email_delivery_events (provider, provider_event_id, event_type, address, occurred_at) values ('resend', 'msg_proof_4', 'email.opened', 'a@b.com', now())$s$, 'event_type');
  v_out := v_out || ' | D5 an open is not an event this table keeps: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused($s$insert into public.email_delivery_events (provider, provider_event_id, event_type, address, occurred_at) values ('resend', 'msg_proof_5', 'email.bounced', 'Upper@Example.com', now())$s$, 'check');
  v_out := v_out || ' | D6 an address is stored lowercase only: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused($s$update public.email_delivery_events set undeliverable = false where provider_event_id = 'msg_proof_1'$s$, '');
  v_out := v_out || ' | D7 a recorded fact is never changed: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  if has_table_privilege('anon', 'public.email_delivery_events', 'SELECT') or has_table_privilege('authenticated', 'public.email_delivery_events', 'SELECT')
     or has_table_privilege('service_role', 'public.email_delivery_events', 'UPDATE')
     or not (select relrowsecurity from pg_class where relname = 'email_delivery_events' and relnamespace = 'public'::regnamespace) then
    v_out := v_out || ' | G1 a path is open: FAIL'; v_fail := v_fail + 1;
  else v_out := v_out || ' | G1 service role reads and inserts only, row security on: PASS'; end if;
  raise exception 'PROOF % (% failure(s), rolled back):%', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail, v_out;
end
$proof$;
