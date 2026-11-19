-- THE REPLY CLASSES AN ORGANISER'S ANSWER OFTEN IS (WINDOW 5A, 19 November 2026; law 30, the CRM directive's section 4:
-- A photographs, C a correction, and the permission they give). Aria's reply of 19 November held all three and was
-- logged as 'referred' at 0.6. The inbox run now names each (src/lib/outreach/replies.ts DECISION_CLASSES) and holds it
-- for Lawal's decision in /admin/comms. The outcome rule gains the three words; every existing row already passes.
--
-- Reversal: put back the rule of 20261028213001 once no row carries a new word.

alter table public.outreach_replies drop constraint if exists outreach_replies_outcome_check;
alter table public.outreach_replies add constraint outreach_replies_outcome_check
  check (outcome in ('yes', 'interested', 'question', 'later', 'no', 'stop', 'take_down', 'referred', 'bounce', 'unclear',
                     'photographs', 'correction', 'permission'));
