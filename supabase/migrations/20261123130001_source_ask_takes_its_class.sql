-- THE SOURCE ASK TAKES ITS CLASS (the founder, 12:14 of 23 November 2026, adopted: "Apply the already-approved
-- communication workflow to routine source requests."; law 24: every CRM message carries exactly one category and
-- subtype). WINDOW 5C.
--
-- The template map gains source_ask, the letter asking an event listing website for permission to show its event facts
-- (src/lib/outreach/source-asks.ts, the six of 23 November: C:\dev\EVIDENCE\EL-23NOV\source-asks\SET.md):
--   source_ask  PERM-SOURCE  a permission request, so PERM, and from hello@ (law 33 (a), src/lib/outreach/addresses.ts).
-- Without it a draft from that template answers null here and takes no class, so it has no mailbox either (law 33 (a):
-- addresses.ts mailboxFor refuses a message with no category). So this lands before any template row of that key is
-- written: the loader, scripts/ops/outreach-source-asks.ts, refuses to run until it is in force.
--
-- CHANGED IN PLACE from the function in force (law 14 (z)), never a whole new text: the definition is read with
-- pg_get_functiondef, the one row is put right after its one anchor ('lifecycle_perm', 'PERM-IMAGE'), which must occur
-- exactly once or this raises and changes nothing, and that definition is executed as it reads, so its language,
-- volatility, search path and grants are unchanged and every key it held keeps its subtype. A second run finds the row
-- and changes nothing. Nothing is backfilled, hidden or removed: no message of this key exists yet.
-- tests/unit/comms/categories.test.ts reads the row from v_row below; tests/unit/comms/source-ask-class.test.ts holds
-- this file's rules.
--
-- Reversal: the same in place change, the row v_row taken out of the definition in force.

do $migrate$
declare
  v_def text;
  v_anchor constant text := '(''lifecycle_perm'', ''PERM-IMAGE''),';
  v_row constant text := '(''source_ask'', ''PERM-SOURCE''),';
  v_count int;
begin
  v_def := pg_get_functiondef('public.comms_subtype_of_template_key(text)'::regprocedure);
  if position('(''source_ask'',' in v_def) > 0 then
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
$migrate$;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_def text := pg_get_functiondef('public.comms_subtype_of_template_key(text)'::regprocedure);
  v_count int;
begin
  if public.comms_subtype_of_template_key('source_ask') is distinct from 'PERM-SOURCE' then
    raise exception 'post-condition: source_ask answers %, not PERM-SOURCE', public.comms_subtype_of_template_key('source_ask');
  end if;
  v_count := (length(v_def) - length(replace(v_def, '(''source_ask'',', ''))) / length('(''source_ask'',');
  if v_count <> 1 then
    raise exception 'post-condition: the map holds source_ask % times, not once', v_count;
  end if;
  -- Every key it held keeps its subtype: one of each category, and the two either side of the new row.
  if public.comms_subtype_of_template_key('lifecycle_perm') is distinct from 'PERM-IMAGE'
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
