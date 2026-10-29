-- A play's learning-loop test may change the OFFER (the growth blueprint's ruling 1: variants A and B run as the first
-- test). Window 6, 30 October 2026. TEST only, inside begin ... rollback; the closing raise rolls back every row.
-- RED before 20261030014001 (an 'offer' play refused); GREEN after. An unknown change stays refused either way.
do $proof$
declare
  v_lines text[] := '{}';
  v_fail int := 0;
  v_user uuid;
  v_a uuid;
  v_b uuid;
  v_why text;
begin
  select id into v_user from auth.users order by created_at limit 1;
  insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by)
    values ('w6_proof_first', 901, 'email', 'cadence', 1, 'A subject', 'Hi [first name],', 'proof', v_user) returning id into v_a;
  insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by)
    values ('w6_proof_first', 902, 'email', 'cadence', 1, 'A subject', 'Hi [first name], B', 'proof', v_user) returning id into v_b;

  begin
    insert into public.outreach_plays (name, cohort_rule, step1_template_id, variant_template_id, variant_change, test_per_half, created_by)
      values ('W6 proof offer play', '{}'::jsonb, v_a, v_b, 'offer', 31, v_user);
    v_lines := v_lines || text 'PASS a play may test a change of offer';
  exception when check_violation then
    get stacked diagnostics v_why = message_text;
    v_lines := v_lines || ('FAIL a play testing a change of offer was refused: ' || v_why); v_fail := v_fail + 1;
  end;

  begin
    insert into public.outreach_plays (name, cohort_rule, step1_template_id, variant_template_id, variant_change, test_per_half, created_by)
      values ('W6 proof unknown play', '{}'::jsonb, v_a, v_b, 'colour', 31, v_user);
    v_lines := v_lines || text 'FAIL a play testing an unknown change was accepted'; v_fail := v_fail + 1;
  exception when check_violation then
    v_lines := v_lines || text 'PASS an unknown change is still refused';
  end;

  begin
    insert into public.outreach_plays (name, cohort_rule, step1_template_id, variant_template_id, variant_change, test_per_half, created_by)
      values ('W6 proof question play', '{}'::jsonb, v_a, v_b, 'question', 31, v_user);
    v_lines := v_lines || text 'PASS the three changes already allowed still are (question)';
  exception when check_violation then
    v_lines := v_lines || text 'FAIL a question change was refused'; v_fail := v_fail + 1;
  end;

  raise exception 'PROOF %: % | %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail || ' failure(s)', array_to_string(v_lines, ' | ');
end
$proof$;
