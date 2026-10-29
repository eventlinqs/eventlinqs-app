-- A NIGHT REPORT CAN BE DELETED WITHOUT ITS MESSAGE REFUSING IT (window 6, 29 October 2026; the guard
-- a-referential-null-is-not-an-edit, quoted on 78522fa2: "outreach_touches.trg_outreach_touch_is_lawful
-- (20261028201001_organiser_crm.sql) is BROKEN: outreach_touch_is_lawful() can raise and returns early for nothing, so
-- blanking any of night_report_id re-judges the whole row.").
--
-- 20261029171001 gave outreach_touches night_report_id ... on delete set null. The lawfulness trigger fired on every
-- update, and it refuses any change to a sent message ("a sent message is the record and is never changed"), so a night
-- report's deletion, by its event's cascade or by hand, would have been refused by a trigger that has nothing to do with it.
--
-- So the trigger names its columns: every column outreach_touches has except night_report_id, which keeps everything it
-- judged before exactly as it was (the shape organisations.trg_founding_waiver_cap uses). No trigger judges
-- night_report_id at all, by the same guard's rule (a trigger naming a set-null column is judged broken, whatever it
-- returns): the unique index outreach_touches_one_per_night_report keeps one live message per report, and no code
-- updates the column; a re-pointing of it is not refused by a trigger, said plainly.
--
-- No data, grant or constraint changes. The function outreach_touch_is_lawful() is untouched.

drop trigger if exists trg_outreach_touch_is_lawful on public.outreach_touches;
create trigger trg_outreach_touch_is_lawful
  before insert or update of
    basis_at_send, body, contact_id, drafted_at, drafted_by, failed_reason, held_because, id, in_reply_to,
    internet_message_id, play_id, provider, purpose, scheduled_for, sending_at, sent_at, sent_by, state, step, subject,
    template_id, tracked_link, void_reason
  on public.outreach_touches
  for each row execute function public.outreach_touch_is_lawful();
