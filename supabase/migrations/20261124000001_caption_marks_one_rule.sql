-- ONE RULE FOR THE MARKS IN OUR SOCIAL WORDS, THE DATABASE'S AND THE CODE'S (the PM's intake read of 23 November 2026,
-- 22:15). The comedy weekend set was refused on production, quoted: "Not drawn: its words were not kept (new row for
-- relation "social_piece_revisions" violates check constraint "social_piece_revisions_caption_check")". The code
-- (src/lib/social/caption-marks.ts exclamationCount, 23 November 2026) counts a '!' as a mark only where it does not have a
-- letter on both sides, since 'Holy Sh!t Improv' writes a letter of the show's own name as '!'; the check, written on
-- 28 October 2026, refused every '!'. So the code drew a caption the database would never keep.
--
-- ONE DEFECT IS A CLASS (law 4): every check written the same way, '[' || chr(8211) || chr(8212) || '!]', on the social
-- words a person reads, takes the one rule:
--   social_piece_revisions.caption          (20261028141001), the defect;
--   social_image_requests.message           (20261028141001), the words asking an organiser for their night's image;
--   social_report_decisions.recommendation  (20261028151001), a week's recommendation, which quotes nights by name.
-- Each still refuses an en dash and an em dash anywhere, and now refuses a '!' unless it has a letter on both sides:
--   caption !~ ('[' || chr(8211) || chr(8212) || ']') and caption !~ '(^|[^[:alpha:]])!|![^[:alpha:]]|!$'
-- which is exclamationCount's own rule, /(?<!\p{L})!|!(?!\p{L})/u: a '!' is a mark when no letter is before it or no
-- letter is after it. The database stays stricter than the code in one way it always was: the code lets one '!' stand in
-- a caption's hook, and the database refuses it, as it did before.
-- Not in this class, and so unchanged: the older social_drafts trigger (20261027233001), whose code (words.ts
-- wordsRefusal) refuses every '!' too, so the two agree; and the outreach triggers (position('!') in a letter), whose
-- letters are our own words under the communication standard, which never quote a name that writes a letter as '!'.
--
-- Every row each check holds today passed the stricter rule, so it passes this one; the checks are made again and
-- validated. tests/unit/social/caption-marks-one-rule.test.ts holds this file's rule against the code's on a table of
-- cases; the post-conditions below hold the same table here, so a database whose regular expressions read otherwise
-- refuses this migration and changes nothing.
-- Reversal: the three checks made again with '[' || chr(8211) || chr(8212) || '!]'.

alter table public.social_piece_revisions drop constraint if exists social_piece_revisions_caption_check;
alter table public.social_piece_revisions add constraint social_piece_revisions_caption_check
  check (length(btrim(caption)) between 1 and 2200
         and caption !~ ('[' || chr(8211) || chr(8212) || ']')
         and caption !~ '(^|[^[:alpha:]])!|![^[:alpha:]]|!$');

alter table public.social_image_requests drop constraint if exists social_image_requests_message_check;
alter table public.social_image_requests add constraint social_image_requests_message_check
  check (message is null or (length(btrim(message)) between 20 and 3000
         and message !~ ('[' || chr(8211) || chr(8212) || ']')
         and message !~ '(^|[^[:alpha:]])!|![^[:alpha:]]|!$'));

alter table public.social_report_decisions drop constraint if exists social_report_decisions_recommendation_check;
alter table public.social_report_decisions add constraint social_report_decisions_recommendation_check
  check (length(btrim(recommendation)) between 10 and 600
         and recommendation !~ ('[' || chr(8211) || chr(8212) || ']')
         and recommendation !~ '(^|[^[:alpha:]])!|![^[:alpha:]]|!$');

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS: the three checks carry the one rule, and the rule reads the table of cases as the code does.
-- ---------------------------------------------------------------------------
do $post$
declare
  v_def text;
  v_case record;
  v_kept boolean;
begin
  for v_def in
    select pg_get_constraintdef(c.oid) from pg_constraint c
     where c.conname in ('social_piece_revisions_caption_check', 'social_image_requests_message_check', 'social_report_decisions_recommendation_check')
  loop
    if position('[^[:alpha:]]' in v_def) = 0 then
      raise exception 'a check does not carry the one rule: %', v_def;
    end if;
  end loop;
  if (select count(*) from pg_constraint where conname in ('social_piece_revisions_caption_check', 'social_image_requests_message_check', 'social_report_decisions_recommendation_check')) <> 3 then
    raise exception 'the three checks are not all in force';
  end if;
  for v_case in
    select * from (values
      ('Holy Sh!t Improv', true),
      ('Fri 27 Nov, 5 pm: Holy Sh!t Improv', true),
      ('Great night!', false),
      ('Wow! Tickets', false),
      ('!', false),
      ('!Wow', false),
      ('Sh!!t', false),
      ('A night out, all welcome.', true),
      ('A night ' || chr(8211) || ' out', false),
      ('A night ' || chr(8212) || ' out', false)
    ) as t(words, kept)
  loop
    v_kept := v_case.words !~ ('[' || chr(8211) || chr(8212) || ']') and v_case.words !~ '(^|[^[:alpha:]])!|![^[:alpha:]]|!$';
    if v_kept <> v_case.kept then
      raise exception 'the rule reads "%" as %, and the code reads it as %', v_case.words, case when v_kept then 'kept' else 'refused' end, case when v_case.kept then 'kept' else 'refused' end;
    end if;
  end loop;
end
$post$;
