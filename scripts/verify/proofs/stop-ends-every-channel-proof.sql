-- A STOP ON ANY CHANNEL ENDS EVERY CHANNEL OF THAT ORGANISER (V3 item 5: "Unsubscribe and suppression across every
-- campaign"; supabase/migrations/20261101071501_outreach_stop_ends_every_channel.sql). On TEST, rolled back by its own
-- closing raise. Window 6, 1 November 2026. Raw SQL, no application code: one organiser with an email contact on
-- express consent (so every purpose would otherwise be open) and an Instagram contact; the Instagram contact sends STOP.
-- RED before the migration (the email contact stays open to every purpose); GREEN after.

do $proof$
declare
  v_out text := '';
  v_fail int := 0;
  v_r text;
  v_user uuid;
  v_org uuid;
  v_mail uuid;
  v_ig uuid;
  v_why text;
begin
  select id into v_user from auth.users order by created_at limit 1;
  insert into public.organisers (name, created_by) values ('W6 Stop Proof Organiser ' || gen_random_uuid(), v_user) returning id into v_org;
  insert into public.organiser_contacts (organiser_id, role, channel, address, basis, consent_wording, seen_on, basis_recorded_by, basis_recorded_at, created_by)
    values (v_org, 'Owner', 'email', 'w6-stop-proof-' || substr(gen_random_uuid()::text, 1, 8) || '@example.com', 'express_consent',
            'Yes, send me the EventLinqs details by email.', current_date, v_user, now(), v_user)
    returning id into v_mail;
  insert into public.organiser_contacts (organiser_id, role, channel, address, basis, created_by)
    values (v_org, 'Owner', 'instagram', 'w6stopproof' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'none', v_user)
    returning id into v_ig;

  -- S0: before any stop, the email contact is open to a cadence message (the proof starts from an open door).
  v_why := public.outreach_contact_refusal_for(v_mail, 'cadence', null);
  v_r := case when v_why is null then 'PASS' else 'FAIL (' || v_why || ')' end;
  v_out := v_out || ' | S0 before the stop the email contact is open: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  insert into public.outreach_replies (contact_id, received_at, wording, outcome, logged_by)
    values (v_ig, now(), 'STOP', 'stop', v_user);

  -- S1 to S3: the organiser's OTHER contact, on another channel, is closed to every purpose.
  v_why := public.outreach_contact_refusal_for(v_mail, 'cadence', null);
  v_r := case when v_why ilike '%asked to stop%' then 'PASS' else 'FAIL (' || coalesce(v_why, 'open') || ')' end;
  v_out := v_out || ' | S1 cadence to their email after an Instagram stop refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_why := public.outreach_contact_refusal_for(v_mail, 'relationship', null);
  v_r := case when v_why ilike '%asked to stop%' then 'PASS' else 'FAIL (' || coalesce(v_why, 'open') || ')' end;
  v_out := v_out || ' | S2 a partner message to their email refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_why := public.outreach_contact_refusal_for(v_mail, 'reply', 'reply_cost');
  v_r := case when v_why is not null then 'PASS' else 'FAIL (open)' end;
  v_out := v_out || ' | S3 an answer to their email refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S4: the stopping contact itself may get no answer but the one confirmation that the stop is done.
  v_why := public.outreach_contact_refusal_for(v_ig, 'reply', 'reply_cost');
  v_r := case when v_why ilike '%asked to stop%' then 'PASS' else 'FAIL (' || coalesce(v_why, 'open') || ')' end;
  v_out := v_out || ' | S4 any other answer to the stopping contact refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_why := public.outreach_contact_refusal_for(v_ig, 'reply', 'reply_stop');
  v_r := case when v_why is null then 'PASS' else 'FAIL (' || v_why || ')' end;
  v_out := v_out || ' | S5 the one stop confirmation to the stopping contact allowed: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S6: the stored acquisition state reads suppressed, so the daily twenty never holds them.
  v_r := case when (select acquisition_state from public.organisers where id = v_org) = 'suppressed' then 'PASS'
              else 'FAIL (' || (select acquisition_state from public.organisers where id = v_org) || ')' end;
  v_out := v_out || ' | S6 the organiser reads suppressed: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  raise exception 'PROOF %: % | %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail || ' failure(s)', substr(v_out, 4);
end
$proof$;
