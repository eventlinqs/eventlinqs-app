-- MESSAGE 8, AFTER YOUR NIGHT, ONCE PER NIGHT (window 6, 29 October 2026; the project manager's ruling of 16:28:
-- "build them for CAR 5 tonight as written (yes-contacts only, each once, held on a missing field, nothing sends on
-- hold)"; window 5's 16:33: "the sending is recorded once, on WINDOW 6's outreach_touches row ... with the report's
-- event_id").
--
-- The planner drafts message 8 from one organiser_night_reports row (20261028203001). So that a night is reported to
-- its organiser once and never twice, the message names the report it was drafted from, and the database holds one
-- live message per report: a voided draft frees the report for a fresh one, nothing else does.
--
-- Additive only: one nullable column, one partial unique index. outreach_touches is not a new table, so its grants stand
-- as 20261028201001 wrote them (the 21 October grant rule binds a NEW table). organiser_night_reports keeps its own
-- sent_at and sent_by for a report Lawal sends by hand (window 5's 16:33).

alter table public.outreach_touches
  add column if not exists night_report_id uuid references public.organiser_night_reports (id) on delete set null;

create unique index if not exists outreach_touches_one_per_night_report
  on public.outreach_touches (night_report_id)
  where night_report_id is not null and state <> 'void';

comment on column public.outreach_touches.night_report_id is
  'Message 8 (after your night): the organiser_night_reports row it was drafted from. One live message per report; a void draft frees it.';
