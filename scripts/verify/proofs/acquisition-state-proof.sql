-- THE ACQUISITION STATE MACHINE PROOF (supabase/migrations/20261030034001_organiser_acquisition_state.sql), on TEST,
-- rolled back by its own closing raise. Window 6, 30 October 2026. Every step is driven by writing the row that proves
-- it, with raw SQL and no application code; the state is then read back, and the log of transitions with it.
-- RED before the migration (no acquisition_state column); GREEN after.

create function pg_temp.refused(p_sql text, p_like text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'FAIL (kept)';
exception when others then
  if sqlerrm ilike '%' || p_like || '%' then return 'PASS'; end if;
  return 'FAIL (' || replace(replace(sqlerrm, '"', ''), '|', '/') || ')';
end
$f$;

do $proof$
declare
  v_out text := '';
  v_fail int := 0;
  v_r text;
  v_user uuid;
  v_venue uuid;
  v_org uuid;
  v_org2 uuid;
  o2 uuid;
  v_tpl uuid;
  v_play uuid;
  o1 uuid; o3 uuid; o4 uuid;
  c1 uuid; c3 uuid; c4 uuid;
  t1 uuid; t3 uuid;
  v_claim uuid;
  v_yes uuid;
  v_removal uuid;
  v_state text;
  v_months int;
  v_expect text;
  v_log text;
  v_body text := 'Hi Sam,' || chr(10) || 'Your Saturday nights are on the EventLinqs Geelong guide. Would that work for you?' || chr(10) || chr(10) || 'Kind regards, Lawal Adams, Founder, EventLinqs' || chr(10) || 'Unsubscribe: https://www.eventlinqs.com.au/unsubscribe/outreach?t=proof';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organisers' and column_name = 'acquisition_state') then
    raise exception 'PROOF FAILED: 1 failure(s) | FAIL organisers.acquisition_state does not exist (the migration is not applied)';
  end if;

  select id into v_user from auth.users order by created_at limit 1;
  -- A venue with a public night in the next 90 days, no claim and no removal request on it or its nights.
  select v.id into v_venue
    from public.venues v join public.events e on e.venue_id = v.id
   where v.removed_at is null and e.status = 'published' and e.visibility = 'public'
     and e.start_date >= now() and e.start_date <= now() + interval '90 days'
     and (e.listing_fresh_until is null or e.listing_fresh_until >= now())
     and not exists (select 1 from public.listing_claims lc where lc.venue_id = v.id or lc.event_id in (select id from public.events where venue_id = v.id))
     and not exists (select 1 from public.removal_requests rr where rr.venue_id = v.id or rr.event_id in (select id from public.events where venue_id = v.id))
     and not exists (select 1 from public.organiser_permissions p where p.event_id in (select id from public.events where venue_id = v.id))
   group by v.id order by count(*) desc, v.id limit 1;
  if v_venue is null then
    raise exception 'PROOF FAILED: 1 failure(s) | FAIL TEST holds no venue with a public night ahead and no claim';
  end if;
  -- Free it from any organiser it is linked to (rolled back with everything else).
  delete from public.organiser_venues where venue_id = v_venue;

  -- G: grants. The log is read by the service role only; nobody else reads it, nobody writes it directly.
  v_r := case when has_table_privilege('service_role', 'public.organiser_acquisition_transitions', 'select')
               and not has_table_privilege('service_role', 'public.organiser_acquisition_transitions', 'insert')
               and not has_table_privilege('anon', 'public.organiser_acquisition_transitions', 'select')
               and not has_table_privilege('authenticated', 'public.organiser_acquisition_transitions', 'select') then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | G1 the log: service_role select only, anon and authenticated nothing: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S1: a new organiser starts DISCOVERED and the log says so.
  insert into public.organisers (name, created_by) values ('W6 Acquisition Proof One', v_user) returning id into o1;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'discovered' and (select count(*) from public.organiser_acquisition_transitions where organiser_id = o1 and from_state is null and to_state = 'discovered') = 1 then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S1 a new organiser is discovered, logged once: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- N: no state is typed.
  v_r := pg_temp.refused(format($s$update public.organisers set acquisition_state = 'verified' where id = %L$s$, o1), 'written only by organiser_acquisition_refresh');
  v_out := v_out || ' | N1 typing a state is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format($s$insert into public.organisers (name, created_by, acquisition_state) values ('W6 Typed', %L, 'active')$s$, v_user), 'starts discovered');
  v_out := v_out || ' | N2 an organiser born in a later state is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S2: QUALIFIED by its venue's public night ahead.
  insert into public.organiser_venues (venue_id, organiser_id, linked_by) values (v_venue, o1, v_user);
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'qualified' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S2 linked to a venue with a night ahead: qualified: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S3: ELIGIBILITY CHECKED by a contact with a whole basis.
  insert into public.organiser_contacts (organiser_id, role, channel, address, basis, published_on_url, seen_on, no_marketing_statement_checked, relevance, basis_recorded_by, basis_recorded_at, created_by)
    values (o1, 'Venue manager', 'email', 'w6.acquisition.proof1@venue.example', 'conspicuous_publication', 'https://w6crm.example/contact', current_date - 20, true, 'Runs the weekly night named on the page.', v_user, now(), v_user)
    returning id into c1;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'eligibility_checked' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S3 a contact with a whole basis: eligibility_checked: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S4: READY when an approved play's cohort names them.
  insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by)
    values ('w6_acq_proof', 901, 'email', 'cadence', 1, 'Your nights', 'Hi [first name], [true line]', 'proof', v_user) returning id into v_tpl;
  insert into public.outreach_plays (name, cohort_rule, step1_template_id, created_by)
    values ('W6 acquisition proof play', jsonb_build_object('organisers', jsonb_build_array(o1::text)), v_tpl, v_user) returning id into v_play;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'eligibility_checked' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S4a a DRAFT play does not make them ready: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  update public.outreach_plays set state = 'approved', approved_by = v_user, approved_at = now() where id = v_play;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'ready' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S4b the play approved: ready: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S5: CONTACTED by a sent touch (by hand, as markSent writes it).
  insert into public.outreach_touches (contact_id, purpose, step, subject, body, held_because, state, drafted_by)
    values (c1, 'cadence', 1, 'Your Saturday nights', v_body, '{}', 'held', v_user) returning id into t1;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'ready' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S5a a held draft is not contact: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  update public.outreach_touches set state = 'sent', sent_at = now(), sent_by = v_user, provider = 'by_hand' where id = t1;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'contacted' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S5b sent: contacted: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S6: ENGAGED by an interested reply.
  insert into public.outreach_replies (contact_id, touch_id, received_at, wording, outcome, classified_by, logged_by)
    values (c1, t1, now(), 'Sounds good, tell me more.', 'interested', 'lawal', v_user);
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'engaged' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S6 an interested reply: engaged: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S7: CLAIM INVITED by a claim opened on their venue.
  insert into public.listing_claims (venue_id, claimant_user_id, claimant_name, claimant_role, method, status)
    values (v_venue, v_user, 'Proof Manager', 'Manager', 'manual', 'manual_open') returning id into v_claim;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'claim_invited' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S7 a claim opened: claim_invited: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S8: VERIFIED by the claim approved; with nights ahead that is ACTIVE, or RECURRING across two months.
  insert into public.organisations (name, slug, owner_id, status) values ('W6 Acquisition Proof', 'w6-acq-proof-' || substr(md5(random()::text), 1, 8), v_user, 'active') returning id into v_org;
  update public.listing_claims set status = 'manual_approved', verified_at = now(), target_organisation_id = v_org where id = v_claim;
  select count(distinct date_trunc('month', e.start_date at time zone 'Australia/Melbourne')) into v_months
    from public.events e
   where (e.venue_id = v_venue or e.organisation_id = (select organisation_id from public.organisers where id = o1))
     and e.status = 'published' and e.visibility = 'public'
     and e.start_date >= now() - interval '90 days' and e.start_date <= now() + interval '90 days';
  v_expect := case when v_months >= 2 then 'recurring' else 'active' end;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = v_expect then 'PASS' else 'FAIL (' || v_state || ', expected ' || v_expect || ')' end;
  v_out := v_out || format(' | S8 the claim approved, nights in %s month(s): %s: %s', v_months, v_expect, v_r); if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- S9: a yes to their material keeps the furthest state.
  -- An email yes names the account; only a yes given in the claim cites it (organiser_permissions_claim_is_cited).
  insert into public.organiser_permissions (host_name, granted_at, wording, scope, channel, logged_by, organisation_id)
    values ('W6 Acquisition Proof', now(), 'Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.', 'current_and_future', 'email', v_user, v_org)
    returning id into v_yes;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = v_expect then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | S9 a yes logged, the night ahead keeps ' || v_expect || ': ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- D: DISPUTED while a removal request is open; back when it is declined.
  insert into public.removal_requests (venue_id, reason) values (v_venue, 'The details are wrong') returning id into v_removal;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'disputed' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | D1 a removal request open: disputed: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  update public.removal_requests set status = 'declined', actioned_at = now() where id = v_removal;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = v_expect then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | D2 declined: back to ' || v_expect || ': ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- W: WITHDRAWN when every yes they gave is withdrawn.
  update public.organiser_permissions set withdrawn_at = now(), withdrawn_reason = 'Proof' where id = v_yes;
  select acquisition_state into v_state from public.organisers where id = o1;
  v_r := case when v_state = 'withdrawn' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | W1 the yes withdrawn: withdrawn: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- L: the log holds each move once, in order, each naming the table that proved it; nothing it did not see.
  select string_agg(coalesce(from_state, '-') || '>' || to_state || ' (' || proved_by || ')', ', ' order by id) into v_log
    from public.organiser_acquisition_transitions where organiser_id = o1;
  v_r := case when v_log = format('->discovered (organisers), discovered>qualified (organiser_venues), qualified>eligibility_checked (organiser_contacts), eligibility_checked>ready (outreach_plays), ready>contacted (outreach_touches), contacted>engaged (outreach_replies), engaged>claim_invited (listing_claims), claim_invited>%1$s (listing_claims), %1$s>disputed (removal_requests), disputed>%1$s (removal_requests), %1$s>withdrawn (organiser_permissions)', v_expect)
               then 'PASS' else 'FAIL (' || v_log || ')' end;
  v_out := v_out || ' | L1 the log, each move once with its proving table: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- R: before verification, a no is REJECTED and a later stop SUPPRESSED.
  insert into public.organisers (name, created_by) values ('W6 Acquisition Proof Three', v_user) returning id into o3;
  insert into public.organiser_contacts (organiser_id, role, channel, address, basis, published_on_url, seen_on, no_marketing_statement_checked, relevance, basis_recorded_by, basis_recorded_at, created_by)
    values (o3, 'Venue manager', 'email', 'w6.acquisition.proof3@venue.example', 'conspicuous_publication', 'https://w6crm.example/contact', current_date - 20, true, 'Runs the weekly night named on the page.', v_user, now(), v_user)
    returning id into c3;
  insert into public.outreach_touches (contact_id, purpose, step, subject, body, held_because, state, drafted_by)
    values (c3, 'cadence', 1, 'Your Saturday nights', v_body, '{}', 'held', v_user) returning id into t3;
  update public.outreach_touches set state = 'sent', sent_at = now(), sent_by = v_user, provider = 'by_hand' where id = t3;
  insert into public.outreach_replies (contact_id, touch_id, received_at, wording, outcome, classified_by, logged_by)
    values (c3, t3, now() - interval '1 minute', 'No thanks.', 'no', 'lawal', v_user);
  select acquisition_state into v_state from public.organisers where id = o3;
  v_r := case when v_state = 'rejected' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | R1 a no: rejected: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  insert into public.outreach_replies (contact_id, touch_id, received_at, wording, outcome, classified_by, logged_by)
    values (c3, t3, now(), 'Stop emailing me.', 'stop', 'lawal', v_user);
  select acquisition_state into v_state from public.organisers where id = o3;
  v_r := case when v_state = 'suppressed' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | R2 then a stop: suppressed: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- E: EXPIRED when all three cadence steps went and nothing came back.
  insert into public.organisers (name, created_by) values ('W6 Acquisition Proof Four', v_user) returning id into o4;
  insert into public.organiser_contacts (organiser_id, role, channel, address, basis, published_on_url, seen_on, no_marketing_statement_checked, relevance, basis_recorded_by, basis_recorded_at, created_by)
    values (o4, 'Venue manager', 'email', 'w6.acquisition.proof4@venue.example', 'conspicuous_publication', 'https://w6crm.example/contact', current_date - 30, true, 'Runs the weekly night named on the page.', v_user, now(), v_user)
    returning id into c4;
  begin
    insert into public.outreach_touches (contact_id, purpose, step, subject, body, held_because, state, drafted_by)
      select c4, 'cadence', s, 'Your Saturday nights', v_body, '{}', 'held', v_user from generate_series(1, 3) s;
    update public.outreach_touches set state = 'sent', sent_at = now() - make_interval(days => 22 - 7 * step), sent_by = v_user, provider = 'by_hand'
     where contact_id = c4 and step = 1;
    update public.outreach_touches set state = 'sent', sent_at = now() - make_interval(days => 22 - 7 * step), sent_by = v_user, provider = 'by_hand'
     where contact_id = c4 and step = 2;
    update public.outreach_touches set state = 'sent', sent_at = now() - make_interval(days => 22 - 7 * step), sent_by = v_user, provider = 'by_hand'
     where contact_id = c4 and step = 3;
    select acquisition_state into v_state from public.organisers where id = o4;
    v_r := case when v_state = 'expired' then 'PASS' else 'FAIL (' || v_state || ')' end;
  exception when others then
    v_r := 'FAIL (' || replace(replace(sqlerrm, '"', ''), '|', '/') || ')';
  end;
  v_out := v_out || ' | E1 three steps sent, no reply: expired: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- U: an unsubscribe of their only address SUPPRESSES them, before verification.
  insert into public.outreach_unsubscribes (email, reason) values ('w6.acquisition.proof4@venue.example', null);
  select acquisition_state into v_state from public.organisers where id = o4;
  v_r := case when v_state = 'suppressed' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | U1 their only address unsubscribed: suppressed: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- T: a take down asked for by reply is WITHDRAWN, whatever came before.
  insert into public.outreach_replies (contact_id, touch_id, received_at, wording, outcome, classified_by, logged_by)
    values (c3, t3, now() + interval '1 minute', 'Please take our listing down.', 'take_down', 'lawal', v_user);
  select acquisition_state into v_state from public.organisers where id = o3;
  v_r := case when v_state = 'withdrawn' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | T1 a take down by reply: withdrawn: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- V: an account linked with no nights ahead is VERIFIED; their yes then makes it MEDIA APPROVED.
  insert into public.organisers (name, created_by) values ('W6 Acquisition Proof Two', v_user) returning id into o2;
  insert into public.organisations (name, slug, owner_id, status) values ('W6 Acquisition Proof Two', 'w6-acq-proof2-' || substr(md5(random()::text), 1, 8), v_user, 'active') returning id into v_org2;
  update public.organisers set organisation_id = v_org2 where id = o2;
  select acquisition_state into v_state from public.organisers where id = o2;
  v_r := case when v_state = 'verified' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | V1 their account linked, no nights ahead: verified: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  insert into public.organiser_permissions (host_name, granted_at, wording, scope, channel, logged_by, organisation_id)
    values ('W6 Acquisition Proof Two', now(), 'Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.', 'current_and_future', 'email', v_user, v_org2);
  select acquisition_state into v_state from public.organisers where id = o2;
  v_r := case when v_state = 'media_approved' then 'PASS' else 'FAIL (' || v_state || ')' end;
  v_out := v_out || ' | V2 their yes logged: media_approved: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- A: the refresh-all agrees with every organiser's own state.
  perform public.organiser_acquisition_refresh_all('proof');
  v_r := case when not exists (select 1 from public.organisers o where o.acquisition_state is distinct from public.organiser_acquisition_state_of(o.id)) then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | A1 every organiser''s field equals what its proof says: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  raise exception 'PROOF %: % | %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail || ' failure(s)', substr(v_out, 4);
end
$proof$;
