-- THE PRIVACY CAR'S DATABASE HALF (window 4, 27 October 2026; the project
-- manager's 21:38 and 21:51 (B), on Lawal's YES of 21:37 to the new privacy
-- version and his 21:22 "Finish up everything: the database changes").
--
-- 1. THE CALLED-OFF NOTE. The approved privacy version says Remind me sends
--    "at most two messages ... plus a short note if the event is called off".
--    event_reminder_sends allowed only 'program' and 'day_before'
--    (20261021000020), so no such note could be claimed or sent. 'called_off'
--    joins the list, and walk_in_reminders_due answers it: live requests of a
--    walk-in event that is now cancelled and whose first day has not passed,
--    stored under a Remind me version whose words promised the note (every
--    version after v1; a v1 request was told "Nothing else", operating rule 6:
--    existing consents keep the wording they agreed to). Same signature and
--    the same five arguments production's hourly cron passes, so the code
--    deployed today keeps working beside it.
--
-- 2. THE CONSENT LEDGER IS ONLY ADDED TO, FOR EVERY ROLE. Read on production
--    27 October 2026: consent_events and suppression_events refuse UPDATE,
--    DELETE and TRUNCATE by trigger; consent_wordings refuses UPDATE and DELETE
--    but had no TRUNCATE trigger, and anon, authenticated and service_role each
--    held UPDATE, DELETE and TRUNCATE on all three (row security with no policy
--    stops row access; TRUNCATE is not subject to row security). The missing
--    trigger is added and those three privileges are taken from every API role,
--    so the triggers are the second lock, not the only one. INSERT and SELECT
--    stay as they are: the ledger is still written and read by the server.

-- 1. -------------------------------------------------------------------------

alter table public.event_reminder_sends drop constraint if exists event_reminder_sends_kind_known;
alter table public.event_reminder_sends
  add constraint event_reminder_sends_kind_known check (kind in ('program', 'day_before', 'called_off'));

create or replace function public.walk_in_reminders_due(
  p_kind text,
  p_event_id uuid default null,
  p_limit integer default 500,
  p_now timestamptz default now(),
  p_local_hour integer default 9
)
returns table (
  reminder_id uuid,
  email text,
  unsubscribe_token uuid,
  event_id uuid,
  first_day text,
  timezone text
)
language sql
stable
set search_path = public, pg_temp
as $fn$
  select r.id, r.email, r.unsubscribe_token, e.id,
         to_char((case when g.days -> 0 ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (g.days -> 0 ->> 'date')::date else (e.start_date at time zone e.timezone)::date end), 'YYYY-MM-DD'),
         e.timezone
    from public.event_reminders r
    join public.events e on e.id = r.event_id
    left join public.event_guides g on g.event_id = e.id
   where r.unsubscribed_at is null
     and e.entry_mode = 'walk_in'
     and (p_event_id is null or e.id = p_event_id)
     and p_kind in ('program', 'day_before', 'called_off')
     -- The program and the day-before reminder go for a published event; the note for one called off.
     and e.status = (case when p_kind = 'called_off' then 'cancelled' else 'published' end)::event_status
     and (p_kind <> 'program' or (g.program_published_at is not null and r.requested_at <= g.program_published_at))
     and (
       p_kind <> 'day_before'
       or (
         (p_now at time zone e.timezone)::date
           = (case when g.days -> 0 ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (g.days -> 0 ->> 'date')::date else (e.start_date at time zone e.timezone)::date end) - 1
         and extract(hour from (p_now at time zone e.timezone)) >= p_local_hour
       )
     )
     and (
       p_kind <> 'called_off'
       or (
         r.consent_version not like 'remind-me-v1-%'
         and (p_now at time zone e.timezone)::date
           <= (case when g.days -> 0 ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (g.days -> 0 ->> 'date')::date else (e.start_date at time zone e.timezone)::date end)
       )
     )
     and not exists (
       select 1 from public.event_reminder_sends s
        where s.reminder_id = r.id and s.kind = p_kind
     )
   order by r.created_at
   limit greatest(1, least(coalesce(p_limit, 500), 1000))
$fn$;

comment on function public.walk_in_reminders_due(text, uuid, integer, timestamptz, integer) is
  'The Remind me rows owed a program update, a day-before reminder or a called-off note and not yet claimed (WI1; the called-off note from 27 October 2026). Service role only; the sender claims each row in event_reminder_sends before it sends.';

revoke all on function public.walk_in_reminders_due(text, uuid, integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.walk_in_reminders_due(text, uuid, integer, timestamptz, integer) to service_role;

-- 2. -------------------------------------------------------------------------

drop trigger if exists trg_consent_wordings_no_truncate on public.consent_wordings;
create trigger trg_consent_wordings_no_truncate
  before truncate on public.consent_wordings
  for each statement execute function public.refuse_ledger_mutation();

revoke update, delete, truncate on public.consent_events from anon, authenticated, service_role;
revoke update, delete, truncate on public.suppression_events from anon, authenticated, service_role;
revoke update, delete, truncate on public.consent_wordings from anon, authenticated, service_role;
