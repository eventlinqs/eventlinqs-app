-- THE LEARNING LOOP PROOF (supabase/migrations/20261029210001_outreach_learning_loop.sql), on TEST, rolled back by its
-- own closing raise. Window 6, 29 October 2026. Every refusal is raw SQL with no application code in the path.

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
declare
  v_out text := '';
  v_fail int := 0;
  v_r text;
  v_user uuid;
  t1 uuid; tv uuid; tx uuid;
  v_play uuid; v_plain uuid;
  o uuid; c uuid; c2 uuid; c3 uuid; c4 uuid;
  v_body text := 'Hi Sam,' || chr(10) || 'Your Saturday nights are on the EventLinqs Geelong guide. Would that work for you?' || chr(10) || chr(10) || 'Kind regards, Lawal Adams, Founder, EventLinqs' || chr(10) || 'Unsubscribe: https://www.eventlinqs.com.au/unsubscribe/outreach?t=proof';
begin
  select id into v_user from auth.users order by created_at limit 1;
  insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by) values
    ('proof_learn_current', 999, 'email', 'cadence', 1, 'Your nights, could I ask you something?', 'Hi [first name], [true line]', 'proof', v_user) returning id into t1;
  insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by) values
    ('proof_learn_variant', 999, 'email', 'cadence', 1, 'A question about your nights', 'Hi [first name], [true line]', 'proof', v_user) returning id into tv;
  insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by) values
    ('proof_learn_other', 999, 'email', 'cadence', 1, 'Something else', 'Hi [first name], [true line]', 'proof', v_user) returning id into tx;

  -- V: a variant is whole or absent, and its half is more than 30.
  v_r := pg_temp.refused(format($s$insert into public.outreach_plays (name, cohort_rule, step1_template_id, variant_template_id, created_by) values ('Half a variant', '{}', %L, %L, %L)$s$, t1, tv, v_user), 'outreach_plays_variant_whole');
  v_out := v_out || ' | V1 a variant without its change and its size is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format($s$insert into public.outreach_plays (name, cohort_rule, step1_template_id, variant_template_id, variant_change, test_per_half, created_by) values ('Thirty a half', '{}', %L, %L, 'subject', 30, %L)$s$, t1, tv, v_user), 'test_per_half');
  v_out := v_out || ' | V2 thirty a half is refused (N > 30): ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format($s$insert into public.outreach_plays (name, cohort_rule, step1_template_id, variant_template_id, variant_change, test_per_half, created_by) values ('Same twice', '{}', %L, %L, 'subject', 31, %L)$s$, t1, t1, v_user), 'outreach_plays_variant_whole');
  v_out := v_out || ' | V3 a variant that is the current template is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format($s$insert into public.outreach_plays (name, cohort_rule, step1_template_id, variant_template_id, variant_change, test_per_half, created_by) values ('Bad change', '{}', %L, %L, 'colour', 31, %L)$s$, t1, tv, v_user), 'variant_change');
  v_out := v_out || ' | V4 a change outside subject, true line, question is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- P: approved once with both texts; the terms then hold.
  insert into public.outreach_plays (name, cohort_rule, step1_template_id, variant_template_id, variant_change, test_per_half, created_by)
    values ('Proof learning play', '{}', t1, tv, 'subject', 31, v_user) returning id into v_play;
  update public.outreach_plays set state = 'approved', approved_by = v_user, approved_at = now() where id = v_play;
  v_out := v_out || ' | P1 a play approved with its variant, its change and its size: PASS';
  v_r := pg_temp.refused(format('update public.outreach_plays set variant_template_id = %L where id = %L', tx, v_play), 'keeps the terms');
  v_out := v_out || ' | P2 the variant cannot be changed after approval: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format('update public.outreach_plays set test_per_half = 500 where id = %L', v_play), 'keeps the terms');
  v_out := v_out || ' | P3 nor the size of a half: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- M: a first message may carry the play's variant, never another text; a half only on a play's first message.
  insert into public.organisers (name, created_by) values ('W6 Learning Proof', v_user) returning id into o;
  insert into public.organiser_contacts (organiser_id, role, channel, address, basis, published_on_url, seen_on, no_marketing_statement_checked, relevance, basis_recorded_by, basis_recorded_at, created_by)
    values (o, 'Venue manager', 'email', 'w6.learning.proof@venue.example', 'conspicuous_publication', 'https://w6crm.example/contact', current_date - 20, true, 'Runs the weekly night named on the page.', v_user, now(), v_user)
    returning id into c;
  -- One organiser per contact: an organiser is written to through one address at a time.
  with orgs as (insert into public.organisers (name, created_by) select 'W6 Learning Proof ' || n, v_user from generate_series(2, 4) n returning id, name)
  insert into public.organiser_contacts (organiser_id, role, channel, address, basis, published_on_url, seen_on, no_marketing_statement_checked, relevance, basis_recorded_by, basis_recorded_at, created_by)
    select id, 'Venue manager', 'email', 'w6.learning.proof' || right(name, 1) || '@venue.example', 'conspicuous_publication', 'https://w6crm.example/contact', current_date - 20, true, 'Runs the weekly night named on the page.', v_user, now(), v_user from orgs;
  select id into c2 from public.organiser_contacts where address = 'w6.learning.proof2@venue.example';
  select id into c3 from public.organiser_contacts where address = 'w6.learning.proof3@venue.example';
  select id into c4 from public.organiser_contacts where address = 'w6.learning.proof4@venue.example';
  v_r := pg_temp.ok(format($s$insert into public.outreach_touches (contact_id, purpose, step, template_id, play_id, half, subject, body, held_because, state, provider, scheduled_for, drafted_by) values (%L, 'cadence', 1, %L, %L, 'b', 'A question about your nights', %L, '{}', 'queued', 'graph', now(), %L)$s$, c, tv, v_play, v_body, v_user));
  v_out := v_out || ' | M1 a first message QUEUED with the play''s variant, half b, is kept: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format($s$insert into public.outreach_touches (contact_id, purpose, step, template_id, play_id, half, subject, body, held_because, state, provider, scheduled_for, drafted_by) values (%L, 'cadence', 1, %L, %L, 'a', 'Something else', %L, '{}', 'queued', 'graph', now(), %L)$s$, c2, tx, v_play, v_body, v_user), 'not from the template version');
  v_out := v_out || ' | M2 a first message QUEUED with any other text is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format($s$insert into public.outreach_touches (contact_id, purpose, step, half, subject, body, held_because, state, drafted_by) values (%L, 'cadence', 1, 'a', 'Your nights', %L, '{proof}', 'held', %L)$s$, c3, v_body, v_user), 'outreach_touches_half_is_a_first_message');
  v_out := v_out || ' | M3 a half outside a play''s first message is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  insert into public.outreach_plays (name, cohort_rule, step1_template_id, created_by) values ('Proof plain play', '{}', t1, v_user) returning id into v_plain;
  update public.outreach_plays set state = 'approved', approved_by = v_user, approved_at = now() where id = v_plain;
  v_r := pg_temp.refused(format($s$insert into public.outreach_touches (contact_id, purpose, step, template_id, play_id, subject, body, held_because, state, provider, scheduled_for, drafted_by) values (%L, 'cadence', 1, %L, %L, 'A question', %L, '{}', 'queued', 'graph', now(), %L)$s$, c4, tv, v_plain, v_body, v_user), 'not from the template version');
  v_out := v_out || ' | M4 a play with no variant does not queue one: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- J: the judgement, once, with its figures, never changed.
  v_r := pg_temp.ok(format($s$insert into public.outreach_play_judgements (play_id, sent_a, claims_a, sent_b, claims_b, z, outcome, why, alpha, critical) values (%L, 200, 10, 200, 30, 3.333, 'variant_wins', 'z 3.333 > 1.645 (one-sided, alpha 0.05)', 0.05, 1.645)$s$, v_play));
  v_out := v_out || ' | J1 a judgement with its figures is written: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format($s$insert into public.outreach_play_judgements (play_id, sent_a, claims_a, sent_b, claims_b, z, outcome, why, alpha, critical) values (%L, 300, 10, 300, 10, 0, 'keep', 'again', 0.05, 1.645)$s$, v_play), 'duplicate key');
  v_out := v_out || ' | J2 a play is judged once: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format('update public.outreach_play_judgements set outcome = %L where play_id = %L', 'keep', v_play), '');
  v_out := v_out || ' | J3 a judgement is never changed: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format($s$insert into public.outreach_play_judgements (play_id, sent_a, claims_a, sent_b, claims_b, z, outcome, why, alpha, critical) values (%L, 10, 0, 10, 0, 1.0, 'not_enough', 'x', 0.05, 1.645)$s$, v_plain), 'outreach_play_judgements_z_when_judged');
  v_out := v_out || ' | J4 not enough carries no z: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- G: service role only, row security on.
  if has_table_privilege('anon', 'public.outreach_play_judgements', 'SELECT') or has_table_privilege('authenticated', 'public.outreach_play_judgements', 'SELECT')
     or has_table_privilege('service_role', 'public.outreach_play_judgements', 'UPDATE')
     or not (select relrowsecurity from pg_class where relname = 'outreach_play_judgements' and relnamespace = 'public'::regnamespace) then
    v_out := v_out || ' | G1 a path is open: FAIL'; v_fail := v_fail + 1;
  else v_out := v_out || ' | G1 service role reads and inserts only, row security on: PASS'; end if;

  raise exception 'PROOF % (% failure(s), rolled back):%', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail, v_out;
end
$proof$;
