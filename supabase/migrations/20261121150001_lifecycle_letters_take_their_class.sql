-- LAW 49'S TWO LETTERS TAKE THEIR CLASS (Lawal, 21 November 2026, 09:20, C:\dev\START-16OCT\EVENT-LIFECYCLE-ENGINE-LOCKED-21NOV.md;
-- law 24: every CRM message carries exactly one category and subtype). Train AT, WINDOW 5A.
--
-- The template map gains the two letters law 49's plays send on each event's clock (src/lib/outreach/lifecycle-letters.ts):
--   lifecycle_perm  PERM-IMAGE  the photo permission request, from hello@ (T-28 to T-21);
--   lifecycle_acq   ACQ-FIRST   the free promotion offer, from lawal@ (T-21 to T-14), never in the same letter.
-- Without them a draft from either template answers null here and the touch check refuses it, so this lands before any
-- template row of those keys is written. Changed in place from the function in force, read on production at 13:43 on
-- 21 November 2026 (C:\dev\EVIDENCE\EL-21NOV	rain-at\q-fn-in-force.sql): every key it held keeps its subtype; only the two
-- lines are added. Nothing is backfilled, hidden or removed: no message of either key exists yet. Its language, volatility,
-- search path and grants are unchanged (create or replace keeps the grants in force).

create or replace function public.comms_subtype_of_template_key(p_key text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $map$
  select m.subtype from (values
    ('acq_first', 'ACQ-FIRST'),
    ('twenty_advice', 'ACQ-FIRST'),
    ('twenty_offer', 'ACQ-FIRST'),
    ('twenty_own_page', 'ACQ-FIRST'),
    ('first_invitation', 'ACQ-FIRST'),
    ('first_invitation_referred', 'ACQ-FIRST'),
    ('first_dm', 'ACQ-FIRST'),
    ('who_looks_after_events', 'ACQ-FIRST'),
    ('twenty_day4', 'ACQ-FOLLOWUP'),
    ('twenty_day10', 'ACQ-FOLLOWUP'),
    ('day4_follow_up', 'ACQ-FOLLOWUP'),
    ('day10_close', 'ACQ-FOLLOWUP'),
    ('day4_dm', 'ACQ-FOLLOWUP'),
    ('reply_who_are_you', 'ACQ-REPLY'),
    ('reply_not_now', 'ACQ-REPLY'),
    ('reply_cost', 'ACQ-REPLY'),
    ('dm_on_yes', 'ACQ-REPLY'),
    ('segment_a_first', 'PERM-IMAGE'),
    ('segment_a_day4', 'PERM-REMINDER'),
    ('segment_a_day10', 'PERM-REMINDER'),
    ('lifecycle_perm', 'PERM-IMAGE'),
    ('lifecycle_acq', 'ACQ-FIRST'),
    ('featured', 'LIST-FEATURED'),
    ('reply_why_listed', 'LIST-REPLY'),
    ('reply_take_down', 'LIST-REPLY'),
    ('reply_change', 'LIST-REPLY'),
    ('withdrawal_confirmed', 'LIST-WITHDRAWN'),
    ('after_your_night', 'RET-PERFORMANCE'),
    ('anything_coming_up', 'RET-NEXT-EVENT'),
    ('thank_you', 'RET-THANK-YOU'),
    ('reply_existing_ticketing', 'TKT-REPLY'),
    ('reply_stop', 'SYS-UNSUBSCRIBE')
  ) as m(key, subtype)
  where m.key = p_key
$map$;

comment on function public.comms_subtype_of_template_key(text) is
  'Law 24: a CRM template''s communication subtype by its key; the category is its first word. Mirrors TEMPLATE_CLASS in src/lib/comms/categories.ts.';
