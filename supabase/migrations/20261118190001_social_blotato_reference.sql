-- THE BLOTATO REFERENCE IS KEPT, AND EVERY ACCEPTED POST IS READ BACK TO ITS PUBLIC URL (WINDOW 5A, 18 November 2026; the
-- PM's 18:40 item 1 (a)).
--
-- WHAT WAS WRONG (read on production 18 November 2026, 17:39): five posts Blotato accepted that day (GroovyTown, AMCF and
-- LANY on Instagram, the organisers and GroovyTown stories) lost their postSubmissionId. The publisher's only record of
-- it was the 'blotato:<id>' reference in the update that marks the row published; social_piece_schedules_published_ref_check
-- took only an instagram.com or facebook.com URL, so it refused that update, and the row kept the refusal, not the id.
--
-- WHAT CHANGES:
--   1. submission_ref: the submission ('blotato:<id>'), written while the row still reads scheduled, before the update that
--      marks it published (src/lib/social/store.ts publishDuePieces), checked for its own shape only.
--   2. published_ref also takes a pending Blotato reference 'blotato:<id>' beside a public post URL.
--   3. social_piece_schedule_may_publish, changed IN PLACE from the function in force (law 14 (z): a DO block reads
--      pg_get_functiondef, counts the exact text once, replaces): a published row may change one thing, a 'blotato:'
--      reference to the post's public URL, so the social run's read back (readBackPendingPosts) can write it; every other
--      change of a published or held row is refused exactly as before.
-- No table, no foreign key, no grant changes. Proved on production's rows in a block that rolled itself back before it was
-- kept (C:\dev\EVIDENCE\EL-18NOV\outside-ids\migration-dry-run.sh).

alter table public.social_piece_schedules add column if not exists submission_ref text;

alter table public.social_piece_schedules drop constraint if exists social_piece_schedules_submission_ref_check;
alter table public.social_piece_schedules add constraint social_piece_schedules_submission_ref_check
  check (submission_ref is null or submission_ref ~ '^blotato:[A-Za-z0-9_-]{1,200}$');

alter table public.social_piece_schedules drop constraint social_piece_schedules_published_ref_check;
alter table public.social_piece_schedules add constraint social_piece_schedules_published_ref_check
  check (
    published_ref is null
    or published_ref ~* '^https://(www\.)?(instagram\.com|facebook\.com|fb\.com)/[^[:space:]]+$'
    or published_ref ~ '^blotato:[A-Za-z0-9_-]{1,200}$'
  );

do $migrate$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.social_piece_schedule_may_publish()'::regprocedure);
  v_old := $q$  if old.state <> 'scheduled' then$q$;
  v_new := $q$  if old.state = 'published' and old.published_ref like 'blotato:%'
     and new.published_ref ~* '^https://(www\.)?(instagram\.com|facebook\.com|fb\.com)/[^[:space:]]+$'
     and (new.state, new.go_at, new.published_at, new.held_reason, new.piece_id, new.approval_id, new.platform, new.submission_ref)
         is not distinct from (old.state, old.go_at, old.published_at, old.held_reason, old.piece_id, old.approval_id, old.platform, old.submission_ref) then
    return new;
  end if;
$q$ || v_old;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'social_piece_schedule_may_publish: the text to change is not there exactly once';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migrate$;
