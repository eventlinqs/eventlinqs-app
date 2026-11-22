-- WHAT MAKES A MESSAGE A DUPLICATE: ITS PURPOSE, ITS CONTEXT AND ITS STEP (Lawal, 23 November 2026, 01:51, through the
-- PM's 01:52, item 1: "the same letter about the same event never twice; a new event's letter later is allowed").
--
-- THE CASE. At 01:30 on 23 November the outreach run's own log said, for all twelve organisers of Monday's law 49 cohort:
-- "That step is already drafted or sent for this contact." (outreach_touches_one_per_step). Each had a permission letter
-- (PERM-IMAGE) sent at step 1 on 18 November (Geelong Gallery on 20 November), and the index of 28 October
-- (20261028201001_organiser_crm.sql) allowed one non void letter per contact per step, whatever its purpose or the event
-- it was about, so law 49's free promotion offer (ACQ, also step 1) was refused.
--
-- THE KEY, outreach_touches_one_per_step: one non void message per (contact, communication category, context, step):
--   comms_category  its purpose, one of the seven categories (law 24; set from its template by
--                   trg_outreach_touch_takes_its_class, migration 20261119125001, a BEFORE trigger, so it is set when the
--                   index is checked);
--   context_key     what it is about, written by the workflow that drafts it (src/lib/outreach/drafts.ts DraftRequest
--                   contextKey): 'event:<events.id>' for a letter about a night (law 49's PERM and ACQ, segment A, the
--                   twenty), 'play:<outreach_plays.id>' for a play's campaign letter with no night, 'page:<url>|<date>'
--                   for an event read from the organiser's own page, 'report:<id>', 'kit:<id>', 'withdrawal:<id>' and
--                   'reply:<message id>' for the partner and reply messages; a follow up carries its first letter's
--                   context, so one sequence is one context; the key reads a null context as one empty context;
--   step            1, 2 or 3 of a cadence; a partner message or a reply has no step and is never a duplicate here
--                   (its own keys hold it: one message 8 per night report, one stop confirmation).
-- So the same letter about the same event is refused at its second draft, and a letter of another purpose, or about
-- another event, is a different message. WHETHER the organiser may be written to at all, and when, is not this index's
-- question: every workflow reads ONE contact policy before drafting and again at send (src/lib/outreach/contact-policy.ts:
-- suppression, opt out and bounce; a reply; a claimed or partner organiser's own flow; at most one unsolicited first touch
-- inside its gap), so a new kind of message is never a way round it.
--
-- A MESSAGE WITH NO CONTEXT KEEPS THE RULE OF 28 OCTOBER, outreach_touches_one_per_step_without_context: one non void
-- message per (contact, step) among the messages no workflow gave a context. The pipeline applies this file BEFORE the
-- pull request merges (.github/workflows/ci.yml, migrate production), so for a while main's code, which has no contact
-- policy and writes no context, runs against this table: without this second index the looser key alone would let that
-- code draft and send law 49's offer to the twelve at 06:00, the loophole Lawal named. Every row main's code writes has no
-- context, so it is held exactly as it is today; the contact policy's code writes a context on every letter about an
-- event or a campaign, which this index leaves to the key above. It binds only what has no context: a direct message, a
-- letter written by hand, a send recorded from Sent Items, and every row before this migration.
--
-- EXISTING ROWS. Every existing row has context_key null. The key above is the old key with two more columns, so it is
-- looser and no existing row breaks it; the second index is the old index over exactly the rows the old index already
-- holds. Read on production before deploy, read only: C:\dev\EVIDENCE\EL-23NOV\contact-policy\key-against-existing-rows.sql
-- and its answer.
--
-- NEVER WITHOUT AN INDEX. CREATE INDEX and DROP INDEX each run alone outside the file's transaction (the CLI flushes
-- them), so both new indexes are made while the old one still stands, then the old one goes and the new key takes its
-- name, which src/lib/outreach/crm.ts maps to plain words. Re-running the file ends in the same two indexes. The column is
-- additive; nothing is backfilled and no sent record is touched (outreach_touch_is_lawful keeps a sent or void message
-- unchanged, and its trigger does not name this column).
--
-- Reversal: create unique index outreach_touches_one_per_step_old on public.outreach_touches (contact_id, step) where
-- state <> 'void' (it fails, and names the rows, if two letters of different purposes or contexts were drafted since),
-- drop both indexes made here, rename that one to outreach_touches_one_per_step, then drop the column.

alter table public.outreach_touches add column if not exists context_key text
  constraint outreach_touches_context_key_shape check (context_key is null or context_key ~ '^[a-z_]+:.+$');

comment on column public.outreach_touches.context_key is
  'What the message is about, written by the workflow that drafts it: event:<events.id>, play:<outreach_plays.id>, page:<url>|<date>, report:<id>, kit:<id>, withdrawal:<id> or reply:<message id>; a follow up carries its first letter''s. Part of the duplicate key outreach_touches_one_per_step (contact, category, context, step). Null: none, and outreach_touches_one_per_step_without_context keeps one per contact and step.';

create unique index if not exists outreach_touches_one_per_step_without_context
  on public.outreach_touches (contact_id, step)
  where state <> 'void' and context_key is null;

create unique index if not exists outreach_touches_one_per_purpose_context_step
  on public.outreach_touches (contact_id, coalesce(comms_category, ''), coalesce(context_key, ''), step)
  where state <> 'void';

drop index if exists public.outreach_touches_one_per_step;

alter index if exists public.outreach_touches_one_per_purpose_context_step rename to outreach_touches_one_per_step;

comment on index public.outreach_touches_one_per_step is
  'One non void message per contact, communication category, context (the event or campaign it is about) and step (Lawal, 23 November 2026, 01:51). Whether and when an organiser may be written to is the contact policy''s (src/lib/outreach/contact-policy.ts), read before drafting and at send.';

comment on index public.outreach_touches_one_per_step_without_context is
  'A message no workflow gave a context keeps the rule of 28 October: one non void message per contact and step. It holds main''s code, which writes no context, while this migration runs ahead of the contact policy''s code.';
