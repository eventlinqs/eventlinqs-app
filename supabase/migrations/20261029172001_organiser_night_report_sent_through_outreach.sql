-- THE ORGANISER'S REPORT AFTER EACH NIGHT IS SENT BY THE OUTREACH RUN, NOT HELD (part H, 29 October 2026).
--
-- 20261028203001 described organiser_night_reports as "held for Lawal ... code never sends it". That was written at
-- 20:04 on 28 October, before Lawal's FULL AUTOMATION of 20:16 (C:\dev\START-16OCT\EVENTLINQS-ENGINE-PLAN-28OCT.md),
-- which names message 8, "after your night", among the messages that "send on their triggers without Lawal". The
-- project manager's 16:28 of 29 October (2) has message 8 built that way for car 5: window 6's outreach run drafts it
-- from this row to a contact who said yes, and records the send on its own outreach_touches row
-- (20261029171001_outreach_touch_names_its_night_report, night_report_id), once.
--
-- So a send is recorded in ONE place. This row keeps the figures only. sent_at and sent_by stay empty for an automatic
-- send: sent_by references auth.users, a person, and organiser_night_reports_sent_whole needs both or neither, so code
-- cannot fill them truthfully. They remain for a report Lawal sends by hand.
--
-- Comments only: no column, constraint, trigger, grant or row changes. Reversal: re-run the two comment statements of
-- 20261028203001.

comment on table public.organiser_night_reports is
  'Engine plan part H: the counted figures for one ended night, written once by the hourly sweep. Message 8, after your night, is sent from this row by the outreach run and recorded on outreach_touches.night_report_id; sent_at and sent_by record only a report a person sent by hand. A press out is never a sale.';

comment on column public.organiser_night_reports.sent_at is
  'Set only when a person sent this report by hand, with sent_by. An automatic send of message 8 is recorded on outreach_touches, not here.';

comment on column public.organiser_night_reports.sent_by is
  'The person who sent this report by hand (auth.users). Empty for an automatic send of message 8, which outreach_touches records.';
