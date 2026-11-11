-- THE GROWTH OS'S TASKS, OWNERS AND ORGANISER MERGES, PROVED ON TEST (supabase/migrations/20261111230001_growth_os_tasks.sql;
-- the Growth OS directive of 11 November 2026, Release 1). Run by scripts/verify/replay-under-new-default.mjs, which
-- first takes away Supabase's automatic grants, so every grant read here is one the migration wrote itself; rolled back
-- by its own closing raise. WINDOW 5A, 11 November 2026. Raw SQL, no application code.

do $proof$
declare
  v_out text := '';
  v_fail int := 0;
  v_r text;
  v_user uuid;
  v_org uuid;
  v_task uuid;
  v_key text := 'proof:' || gen_random_uuid();
begin
  select id into v_user from auth.users order by created_at limit 1;
  insert into public.organisers (name, created_by) values ('W5A Growth OS Proof Organiser ' || gen_random_uuid(), v_user) returning id into v_org;

  -- G1 to G4: the grants are exactly the migration's, under the new default.
  v_r := case when has_table_privilege('service_role', 'public.growth_tasks', 'select') and has_table_privilege('service_role', 'public.growth_tasks', 'insert')
                and has_table_privilege('service_role', 'public.growth_tasks', 'update') and not has_table_privilege('service_role', 'public.growth_tasks', 'delete')
              then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | G1 service_role reads, adds and changes tasks, never deletes one: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := case when not has_table_privilege('anon', 'public.growth_tasks', 'select') and not has_table_privilege('authenticated', 'public.growth_tasks', 'select') then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | G2 anon and authenticated cannot read tasks: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := case when has_table_privilege('service_role', 'public.organiser_merges', 'select') and has_table_privilege('service_role', 'public.organiser_merges', 'insert')
                and not has_table_privilege('service_role', 'public.organiser_merges', 'update') and not has_table_privilege('service_role', 'public.organiser_merges', 'delete')
              then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | G3 merges are history: service_role reads and adds only: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := case when not has_table_privilege('anon', 'public.organiser_merges', 'select') and not has_table_privilege('authenticated', 'public.organiser_merges', 'select') then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | G4 anon and authenticated cannot read merges: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- O1: an organiser carries an owner, empty meaning the founder.
  update public.organisers set owner_id = v_user where id = v_org;
  v_r := case when (select owner_id from public.organisers where id = v_org) = v_user then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | O1 an organiser takes an owner: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- T1: a task is made with its record, workflow, owner, due date and next action.
  insert into public.growth_tasks (record_type, record_id, workflow, kind, title, owner_id, due_on, next_action, source_key)
    values ('organiser', v_org, 'organiser_acquisition', 'first_message', 'Approve the first message', v_user, current_date + 1, 'Approve their first message', v_key)
    returning id into v_task;
  v_r := case when v_task is not null and (select status from public.growth_tasks where id = v_task) = 'open' then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | T1 a task is made open: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- T2: the same source makes nothing twice (idempotent generation).
  begin
    insert into public.growth_tasks (record_type, record_id, workflow, kind, title, source_key) values ('organiser', v_org, 'organiser_acquisition', 'first_message', 'Again', v_key);
    v_r := 'FAIL (a second task from one source was accepted)';
  exception when unique_violation then v_r := 'PASS';
  end;
  v_out := v_out || ' | T2 one task per source: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- T3: a failure keeps its reason; a failure with none is refused.
  begin
    update public.growth_tasks set status = 'failed' where id = v_task;
    v_r := 'FAIL (a failure with no reason was accepted)';
  exception when check_violation then v_r := 'PASS';
  end;
  v_out := v_out || ' | T3 a failed task must say why: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  update public.growth_tasks set status = 'failed', failure_reason = 'Graph answered 503', attempts = 1 where id = v_task;
  v_r := case when (select failure_reason from public.growth_tasks where id = v_task) = 'Graph answered 503' then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | T4 a failed task keeps its reason and attempts: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- T5: done needs its time; done with its time is kept.
  begin
    update public.growth_tasks set status = 'done' where id = v_task;
    v_r := 'FAIL (done with no time was accepted)';
  exception when check_violation then v_r := 'PASS';
  end;
  v_out := v_out || ' | T5 done must carry its time: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  update public.growth_tasks set status = 'done', done_at = now() where id = v_task;
  v_r := case when (select status from public.growth_tasks where id = v_task) = 'done' then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | T6 done with its time is kept: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- T7: a task names its record, unless it is a job's.
  begin
    insert into public.growth_tasks (record_type, workflow, kind, title, source_key) values ('organiser', 'operations', 'check', 'No record', 'proof:' || gen_random_uuid());
    v_r := 'FAIL (an organiser task with no record was accepted)';
  exception when check_violation then v_r := 'PASS';
  end;
  v_out := v_out || ' | T7 an organiser task must name its organiser: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  insert into public.growth_tasks (record_type, workflow, kind, title, status, failure_reason, source_key)
    values ('job', 'operations', 'listing_run', 'The hourly listing run failed', 'failed', 'collection-run answered 500', 'proof:' || gen_random_uuid());
  v_r := 'PASS';
  v_out := v_out || ' | T8 a failed job is kept as a task with no record: ' || v_r;

  -- T9: a task names a message (a held touch or a reply) by its own id; an unknown record type is refused.
  insert into public.growth_tasks (record_type, record_id, workflow, kind, title, status, source_key)
    values ('message', gen_random_uuid(), 'organiser_acquisition', 'unclear_replies', 'A reply to read', 'open', 'proof:' || gen_random_uuid());
  begin
    insert into public.growth_tasks (record_type, record_id, workflow, kind, title, source_key) values ('spreadsheet', gen_random_uuid(), 'operations', 'x', 'Not a record type', 'proof:' || gen_random_uuid());
    v_r := 'FAIL (an unknown record type was accepted)';
  exception when check_violation then v_r := 'PASS';
  end;
  v_out := v_out || ' | T9 a message is a record type, an unknown one is refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- M1: a merge of an organiser into itself is refused.
  begin
    insert into public.organiser_merges (kept_organiser_id, dropped_organiser_name, dropped_organiser_id, reason, moved, merged_by)
      values (v_org, 'Itself', v_org, 'proof of the guard', '{}'::jsonb, v_user);
    v_r := 'FAIL (a merge into itself was accepted)';
  exception when check_violation then v_r := 'PASS';
  end;
  v_out := v_out || ' | M1 an organiser cannot be merged into itself: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  -- The verdict in the shape scripts/verify/replay-under-new-default.mjs reads: 'PROOF PASSED (0 failure(s), rolled back): ...'.
  raise exception 'PROOF % (% failure(s), rolled back): %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail, substr(v_out, 4);
end
$proof$;
