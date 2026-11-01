-- THE EDITORIAL CALENDAR'S RULES AT THE DATABASE (20261101190001; C:\dev\GROWTH\GROWTH-SYSTEM-DIRECTIVE-1NOV.md s5).
-- WINDOW 2, 1 November 2026. TEST only, inside begin ... rollback; the closing raise rolls back every row.
-- RED before 20261101190001 (the table and the function do not exist); GREEN after.
do $proof$
declare
  v_lines text[] := '{}';
  v_fail int := 0;
  v_user uuid;
  v_event uuid;
  v_n int;
begin
  select id into v_user from auth.users order by created_at limit 1;
  select id into v_event from public.events order by created_at limit 1;

  -- C1 a draft with its nights is written; the same city, week and day is one row.
  insert into public.city_editorial_slots (city, week_start, day, slot_date, theme, event_ids, total)
    values ('w2-proof', date '2026-11-02', 'mon', date '2026-11-02', 'This week''s events', array[v_event], 1);
  begin
    insert into public.city_editorial_slots (city, week_start, day, slot_date, theme, empty_note)
      values ('w2-proof', date '2026-11-02', 'mon', date '2026-11-02', 'This week''s events', 'No verified events.');
    v_lines := v_lines || text 'FAIL a second row for one city, week and day was accepted'; v_fail := v_fail + 1;
  exception when unique_violation then v_lines := v_lines || text 'PASS C1 one row per city, week and day';
  end;

  -- C2 a week that does not start on a Monday is refused.
  begin
    insert into public.city_editorial_slots (city, week_start, day, slot_date, theme, empty_note)
      values ('w2-proof', date '2026-11-03', 'mon', date '2026-11-03', 'x', 'No verified events.');
    v_lines := v_lines || text 'FAIL a Tuesday week start was accepted'; v_fail := v_fail + 1;
  exception when check_violation then v_lines := v_lines || text 'PASS C2 a week starts on a Monday';
  end;

  -- C3 a slot's date is its place in the week.
  begin
    insert into public.city_editorial_slots (city, week_start, day, slot_date, theme, empty_note)
      values ('w2-proof', date '2026-11-02', 'fri', date '2026-11-07', 'Tonight and tomorrow', 'No verified events.');
    v_lines := v_lines || text 'FAIL a Friday slot dated Saturday was accepted'; v_fail := v_fail + 1;
  exception when check_violation then v_lines := v_lines || text 'PASS C3 Friday is the week''s fifth day';
  end;

  -- C4 an empty slot says so, and a slot with nights does not.
  begin
    insert into public.city_editorial_slots (city, week_start, day, slot_date, theme)
      values ('w2-proof', date '2026-11-02', 'tue', date '2026-11-03', 'Live music, nightlife and comedy');
    v_lines := v_lines || text 'FAIL an empty slot with no note was accepted'; v_fail := v_fail + 1;
  exception when check_violation then v_lines := v_lines || text 'PASS C4 an empty slot must say so';
  end;
  begin
    insert into public.city_editorial_slots (city, week_start, day, slot_date, theme, event_ids, total, empty_note)
      values ('w2-proof', date '2026-11-02', 'wed', date '2026-11-04', 'Weekend planning guide', array[v_event], 1, 'No verified events.');
    v_lines := v_lines || text 'FAIL a slot with nights and an empty note was accepted'; v_fail := v_fail + 1;
  exception when check_violation then v_lines := v_lines || text 'PASS C4 a slot with nights carries no empty note';
  end;

  -- C5 an approval names who and when.
  begin
    update public.city_editorial_slots set status = 'approved' where city = 'w2-proof' and day = 'mon';
    v_lines := v_lines || text 'FAIL an approval naming nobody was accepted'; v_fail := v_fail + 1;
  exception when check_violation then v_lines := v_lines || text 'PASS C5 an approval names who and when';
  end;
  update public.city_editorial_slots set status = 'approved', approved_by = v_user, approved_at = now() where city = 'w2-proof' and day = 'mon';

  -- C6 an approved slot keeps its nights.
  begin
    update public.city_editorial_slots set event_ids = '{}', total = 0, empty_note = 'No verified events.' where city = 'w2-proof' and day = 'mon';
    v_lines := v_lines || text 'FAIL an approved slot''s nights were changed'; v_fail := v_fail + 1;
  exception when check_violation then v_lines := v_lines || text 'PASS C6 an approved slot keeps its nights';
  end;

  -- C7 the read returns only published, public nights, each with a relation from venue_city_relation or 'unplaced'.
  select count(*) into v_n from public.city_editorial_events('geelong', now() - interval '1 year', now() + interval '2 years') x
   where x.status <> 'published' or x.visibility <> 'public'
      or x.city_relation not in ('city', 'surrounding', 'region', 'outside', 'unplaced');
  if v_n = 0 then v_lines := v_lines || text 'PASS C7 the read holds only published public nights with a known relation';
  else v_lines := v_lines || ('FAIL C7 the read returned ' || v_n || ' row(s) outside its rule'); v_fail := v_fail + 1;
  end if;

  -- C8 no visitor role reaches the slots or the read.
  if not has_table_privilege('anon', 'public.city_editorial_slots', 'select')
     and not has_table_privilege('authenticated', 'public.city_editorial_slots', 'select')
     and has_table_privilege('service_role', 'public.city_editorial_slots', 'insert')
     and not has_function_privilege('anon', 'public.city_editorial_events(text, timestamptz, timestamptz)', 'execute')
     and not has_function_privilege('authenticated', 'public.city_editorial_events(text, timestamptz, timestamptz)', 'execute')
     and has_function_privilege('service_role', 'public.city_editorial_events(text, timestamptz, timestamptz)', 'execute') then
    v_lines := v_lines || text 'PASS C8 service role only';
  else v_lines := v_lines || text 'FAIL C8 a visitor role reaches the calendar'; v_fail := v_fail + 1;
  end if;

  raise exception 'PROOF %: % | %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail || ' failure(s)', array_to_string(v_lines, ' | ');
end;
$proof$;
