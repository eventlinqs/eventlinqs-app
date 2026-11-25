-- LAW 49'S TWO FOLLOW UPS TAKE THEIR CLASS (WINDOW 5C, 25 November 2026; the PM's 14:15 item D: "The three law 49 follow
-- ups ... are APPROVED by the PM ... Wire them as the car after #358"; law 24: every CRM message carries exactly one
-- category and subtype).
--
-- The template map gains the two follow ups, each in its first letter's category (src/lib/comms/categories.ts):
--   lifecycle_perm_follow_up  PERM-REMINDER  the photo request's one follow up (src/lib/outreach/perm-follow-up.ts)
--   lifecycle_acq_follow_up   ACQ-FOLLOWUP   the free listing offer's one follow up (src/lib/outreach/acq-follow-up.ts)
-- Without them a draft from either template answers null here and takes no class, so it has no mailbox either (law 33
-- (a): src/lib/outreach/addresses.ts mailboxFor refuses a message with no category). So this lands before any template
-- row of either key is written.
--
-- CHANGED IN PLACE from the function in force (law 14 (z)), as 20261123130001 did for the source ask, never a whole new
-- text: for each row the definition is read with pg_get_functiondef, the row is put right after its one anchor (its own
-- first letter's row), which must occur exactly once or this raises and changes nothing, and that definition is executed
-- as it reads, so its language, volatility, search path and grants are unchanged and every key it held keeps its
-- subtype. A second run finds each row and changes nothing. Nothing is backfilled, hidden or removed: no message of
-- either key exists yet. tests/unit/comms/categories.test.ts reads each row from its v_row below.
--
-- Reversal: the same in place change, each row v_row taken out of the definition in force.

do $migrate_perm$
declare
  v_def text;
  v_anchor constant text := '(''lifecycle_perm'', ''PERM-IMAGE''),';
  v_row constant text := '(''lifecycle_perm_follow_up'', ''PERM-REMINDER''),';
  v_count int;
begin
  v_def := pg_get_functiondef('public.comms_subtype_of_template_key(text)'::regprocedure);
  if position('(''lifecycle_perm_follow_up'',' in v_def) > 0 then
    -- Already in force: a second run changes nothing (the post-conditions below still read it).
    return;
  end if;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception 'the template map in force holds the anchor % % times, not once; nothing changed', v_anchor, v_count;
  end if;
  v_def := replace(v_def, v_anchor, v_anchor || E'\n    ' || v_row);
  execute v_def;
end
$migrate_perm$;

do $migrate_acq$
declare
  v_def text;
  v_anchor constant text := '(''lifecycle_acq'', ''ACQ-FIRST''),';
  v_row constant text := '(''lifecycle_acq_follow_up'', ''ACQ-FOLLOWUP''),';
  v_count int;
begin
  v_def := pg_get_functiondef('public.comms_subtype_of_template_key(text)'::regprocedure);
  if position('(''lifecycle_acq_follow_up'',' in v_def) > 0 then
    return;
  end if;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception 'the template map in force holds the anchor % % times, not once; nothing changed', v_anchor, v_count;
  end if;
  v_def := replace(v_def, v_anchor, v_anchor || E'\n    ' || v_row);
  execute v_def;
end
$migrate_acq$;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_def text := pg_get_functiondef('public.comms_subtype_of_template_key(text)'::regprocedure);
begin
  if public.comms_subtype_of_template_key('lifecycle_perm_follow_up') is distinct from 'PERM-REMINDER' then
    raise exception 'post-condition: lifecycle_perm_follow_up answers %, not PERM-REMINDER', public.comms_subtype_of_template_key('lifecycle_perm_follow_up');
  end if;
  if public.comms_subtype_of_template_key('lifecycle_acq_follow_up') is distinct from 'ACQ-FOLLOWUP' then
    raise exception 'post-condition: lifecycle_acq_follow_up answers %, not ACQ-FOLLOWUP', public.comms_subtype_of_template_key('lifecycle_acq_follow_up');
  end if;
  if (length(v_def) - length(replace(v_def, '(''lifecycle_perm_follow_up'',', ''))) / length('(''lifecycle_perm_follow_up'',') <> 1
     or (length(v_def) - length(replace(v_def, '(''lifecycle_acq_follow_up'',', ''))) / length('(''lifecycle_acq_follow_up'',') <> 1 then
    raise exception 'post-condition: the map does not hold each follow up exactly once';
  end if;
  -- Every key it held keeps its subtype: one of each category, and the rows either side of the new ones.
  if public.comms_subtype_of_template_key('lifecycle_perm') is distinct from 'PERM-IMAGE'
     or public.comms_subtype_of_template_key('source_ask') is distinct from 'PERM-SOURCE'
     or public.comms_subtype_of_template_key('lifecycle_acq') is distinct from 'ACQ-FIRST'
     or public.comms_subtype_of_template_key('acq_first') is distinct from 'ACQ-FIRST'
     or public.comms_subtype_of_template_key('segment_a_day10') is distinct from 'PERM-REMINDER'
     or public.comms_subtype_of_template_key('featured') is distinct from 'LIST-FEATURED'
     or public.comms_subtype_of_template_key('after_your_night') is distinct from 'RET-PERFORMANCE'
     or public.comms_subtype_of_template_key('reply_existing_ticketing') is distinct from 'TKT-REPLY'
     or public.comms_subtype_of_template_key('reply_stop') is distinct from 'SYS-UNSUBSCRIBE' then
    raise exception 'post-condition: a key the map held no longer answers its subtype';
  end if;
  if public.comms_subtype_of_template_key('no_such_template') is not null then
    raise exception 'post-condition: an unknown key answers a subtype';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.comms_subtype_of_template_key(text)'::regprocedure and provolatile = 'i' and not prosecdef) then
    raise exception 'post-condition: the map is no longer an immutable function of its invoker';
  end if;
end
$post$;
