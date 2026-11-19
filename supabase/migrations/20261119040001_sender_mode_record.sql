-- CAR D'S ONE MIGRATION (WINDOW 5A, 19 November 2026; the PM's 03:38 of 19 November, item 'YOUR 03:14 CAR D PLAN, YES').
-- One thing, read from production before it was written (law 14 (z), read at 03:40:54). The PM's 03:38 also put
-- 'not_a_partner_source' in this migration; proved on production at 03:42:50 it cannot go in the reasons list, which
-- holds a find's doubts about its facts (listing_candidates_confidence: high confidence carries none), so the day
-- judge reads a hold's reason from its source's register instead, in code, with no migration.
--
-- A RECORD THAT ONLY A MODE CHANGE WRITES (the PM's 02:40 gap 2 and 03:38). The sender's own trigger stamped
--    changed_at on EVERY update, and outreach-run writes the DNS check every six hours, so changed_at read 10.15 pm on
--    18 November though the mode last changed at 1.50 pm (the APPROVE ACQ go, C:\dev\PRODUCTION-WRITES.txt line 269);
--    and the admin audit log holds no mode change because both goes wrote the table directly. Now the trigger in force,
--    changed in place, stamps changed_at only when the mode changes and writes one row of outreach_sender_mode_changes
--    (who, when, from and to) for each change, whatever path made it: the admin switch, a go's SQL, anything. Staff only,
--    through the service role. No row changes; the record begins with the next change.
--
-- Reversal: drop the table and put back the function's line 'new.changed_at := now();' (its text is in this file).

-- 1: the mode change record, granted in its own migration (the 21 October grant rule): the service role reads it for the
-- engine page and the trigger writes it; nobody else reaches it.
create table if not exists public.outreach_sender_mode_changes (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  from_mode text not null,
  to_mode text not null,
  constraint outreach_sender_mode_changes_a_change check (from_mode <> to_mode)
);
alter table public.outreach_sender_mode_changes enable row level security;
revoke all on public.outreach_sender_mode_changes from public, anon, authenticated, service_role;
grant select, insert on public.outreach_sender_mode_changes to service_role;
grant usage on sequence public.outreach_sender_mode_changes_id_seq to service_role;

-- 2: the sender's trigger in force, changed in place (law 14 (z)): found by its name and arguments, read from
-- pg_get_functiondef, its one stamp counted before it is replaced.
do $migrate$
declare
  v_def text;
  v_old text := 'new.changed_at := now();';
  v_new text := 'if new.mode is distinct from old.mode then
    new.changed_at := now();
    insert into public.outreach_sender_mode_changes (changed_at, changed_by, from_mode, to_mode) values (now(), new.changed_by, old.mode, new.mode);
  end if;';
  v_count int;
begin
  v_def := pg_get_functiondef('public.outreach_sender_goes_live_checked()'::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 1 then
    raise exception 'the sender trigger in force holds its changed_at stamp % times, not once; nothing changed', v_count;
  end if;
  execute replace(v_def, v_old, v_new);
end
$migrate$;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_def text := pg_get_functiondef('public.outreach_sender_goes_live_checked()'::regprocedure);
begin
  if position('insert into public.outreach_sender_mode_changes' in v_def) = 0 or position('if new.mode is distinct from old.mode then' in v_def) = 0 then
    v_missing := v_missing || ' trigger.records_a_mode_change';
  end if;
  if position('refused: the sender mode is changed by a named person.' in v_def) = 0 or position('refused: live sending needs a passing SPF, DKIM and DMARC check' in v_def) = 0 then
    v_missing := v_missing || ' trigger.kept_its_refusals';
  end if;
  if has_table_privilege('anon', 'public.outreach_sender_mode_changes', 'select') or has_table_privilege('authenticated', 'public.outreach_sender_mode_changes', 'select') then
    v_missing := v_missing || ' record.staff_only';
  end if;
  if not has_table_privilege('service_role', 'public.outreach_sender_mode_changes', 'select') then
    v_missing := v_missing || ' record.service_role_reads';
  end if;
  if v_missing <> '' then
    raise exception 'car D''s migration did not hold:%', v_missing;
  end if;
end
$post$;
