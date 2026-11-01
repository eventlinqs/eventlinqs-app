-- ============================================================================
-- OBJECTIONS RECORDED (Growth Engine V3 checklist, item 5: "Objections recorded"; the pilot: "every reply and
-- objection recorded, real rates measured"). Window 6, 1 November 2026.
--
-- An objection is part of a reply's classification, beside its outcome: what the organiser raised (the cost, their
-- own ticketing, who we are, why they are listed, not now, not interested, or something else Lawal names). The rules
-- set it from the same stored-answer match that drafts the reply (src/lib/outreach/objections.ts); Lawal sets or
-- corrects it by hand. outreach_reply_words_stay (20261028213001) keeps the words, the contact, the message and the
-- logging fixed and lets the classification be corrected, so this column is correctable with no change to it.
--
-- The closed list here equals OBJECTIONS in objections.ts; tests/unit/outreach/objections.test.ts holds them equal.
--
-- ADDITIVE AND REVERSIBLE: one nullable column with a check, on a service-role-only table (its grants and row
-- security unchanged), and one partial index for the pilot's count by objection. Every existing reply reads null,
-- which is the truth: no objection was recorded for it. Reversal: drop the index and the column.
-- ============================================================================

begin;

alter table public.outreach_replies add column if not exists objection text;

alter table public.outreach_replies drop constraint if exists outreach_replies_objection_check;
alter table public.outreach_replies add constraint outreach_replies_objection_check
  check (objection is null or objection in ('cost', 'existing_ticketing', 'who_are_you', 'why_listed', 'not_now', 'not_interested', 'other'));

create index if not exists outreach_replies_by_objection on public.outreach_replies (objection, received_at desc)
  where objection is not null;

comment on column public.outreach_replies.objection is
  'What the organiser raised, part of the classification: set by the rules from the stored-answer match, or by Lawal; correctable like the outcome. Null when none was raised or none was read.';

commit;
