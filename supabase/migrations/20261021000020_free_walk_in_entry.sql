-- ============================================================================
-- WI1, FREE WALK-IN EVENTS. Part 2 of 2: the entry mode, the guide, Remind me.
--
-- WHY IT EXISTS. EventLinqs had two ways to list a free event and both were
-- wrong for the free nights and festivals that need no ticket at all: a $0 tier
-- makes people register for something that needs no registration, and an
-- external link says "Get tickets". WI1 (approved by Lawal Adams, 21 October
-- 2026) adds a third entry mode, free walk-in, no ticket needed. The market has
-- no such mode: Eventbrite, "By default, free events are registration only."
-- "This can't be changed." (help article 250995, read 2026-10-21). The full
-- reading is docs/walk-in/LAW7-READING-2026-10-21.md.
--
-- WHAT THIS FILE ADDS.
--   1. events.entry_mode, 'tickets' (every existing row, the default) or
--      'walk_in'. A walk-in event is in person, carries no external ticket
--      link, can never hold a ticket type, is always is_free, and keeps its
--      mode once it has left draft, so nobody who asked to be reminded of a
--      free night is later sent to a checkout.
--   2. events.listing_source, 'organiser' (the default) or 'eventlinqs'.
--      Lawal's ruling of 21 October 2026: only words EventLinqs writes are
--      under the walk-in page's word and dollar ban, including the line we
--      write for an unclaimed listing from public information. This column is
--      how the code knows whose words a listing carries. WI2's import sets it.
--   3. organisations.instagram_handle and organisations.short_name, both shown
--      in the walk-in page's organiser band (locked design A draws "amcf.org.au
--      . @AMCFOZ" and a "Follow AMCF" button beside the full name).
--      Instagram's own username rules could not be read on 21 October 2026, so
--      the handle's check claims nothing about them: it only refuses what
--      would break a link. Both are granted to anon and authenticated beside
--      the six columns 20260819000002 grants, because this table carries
--      column grants and a new column is otherwise invisible to the public.
--   4. public.event_guides, one row per walk-in event: the hours of each day,
--      the day-by-day program, highlights, at a glance, the quote, getting
--      there, access, the photo credit, and the moment the organiser published
--      the full program (set once, never moved).
--   5. public.event_reminders, the Remind me list. One row per event and
--      address. It is a reminder request for that one event and never a
--      marketing consent: WI1 rules it sends at most the full program once and
--      one reminder the day before, each with a working one-click stop.
--   6. public.event_reminder_sends, one row per reminder per message, written
--      BEFORE the send. The UNIQUE pair is what makes "at most once" a fact the
--      database keeps rather than a promise the code makes, which is the shape
--      recovery_sends already proved.
--   7. The ledger demand-shape CHECK admits the three actions part 1 added as
--      anonymous rows: an add to calendar, a share and a follow carry no
--      address, exactly as a page view carries none.
--   8. public.stored_aggregate_drift: events.is_free is true for a walk-in
--      event by definition, so the recount says so too. Without this every
--      walk-in event would read as drift.
--   9. DATA API GRANTS, WRITTEN DOWN FOR EACH OF THE THREE NEW TABLES. From
--      30 October 2026 Supabase stops granting new public tables to anon,
--      authenticated and service_role: "New tables in the public schema will
--      no longer be exposed to the Data API automatically"
--      (https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically,
--      read 21 October 2026). Lawal's rule of the same day: every migration
--      that creates a public table grants it in that migration, to exactly the
--      roles its row security policies serve, never wider. Each table below
--      REVOKES everything first and then grants, so it ends in the same state
--      whichever default the database applies: the old one (everything to all
--      three roles) or the new one (nothing). The post-condition checks every
--      cell of that grant table. Guarded by
--      scripts/guards/public-tables-carry-their-grants.mjs.
--
-- OBSERVED BEFORE WRITING (source, worktree at fd9e7411): no entry mode, rsvp
-- or registration mode exists on events; is_free is set only by
-- trg_update_event_is_free on ticket_tiers (20260418000001), so a tierless
-- event kept false and missed /events?preset=free; organisations is column
-- granted (20260819000002); events is not.
--
-- REVERSIBLE AND ADDITIVE. No existing row changes value: entry_mode and
-- listing_source arrive at their defaults, instagram_handle arrives null, and
-- the three new tables arrive empty. To reverse: drop the four triggers and
-- their functions, the three tables, the three columns, and restore the two
-- CHECK and view definitions from 20260910000002 and 20260825000004. A rollback
-- discards Remind me rows, which are people's requests, so export them first.
--
-- TRANSACTION SHAPE: CREATE INDEX statements split this file into several
-- implicit transactions under the Supabase CLI (it flushes the batch before
-- each one). Every statement is idempotent (IF NOT EXISTS, DROP ... IF EXISTS
-- then CREATE, CREATE OR REPLACE), so a failed later batch is repaired by
-- running the same push again.
--
-- Lawal applies it with `npm run migrate:production` from PowerShell.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. EVENTS: THE ENTRY MODE AND WHOSE WORDS A LISTING CARRIES.
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists entry_mode text not null default 'tickets';

alter table public.events
  add column if not exists listing_source text not null default 'organiser';

alter table public.events drop constraint if exists events_entry_mode_known;
alter table public.events add constraint events_entry_mode_known
  check (entry_mode in ('tickets', 'walk_in'));

alter table public.events drop constraint if exists events_listing_source_known;
alter table public.events add constraint events_listing_source_known
  check (listing_source in ('organiser', 'eventlinqs'));

-- A walk-in event happens somewhere a person can walk into, and nothing sells
-- it anywhere else.
alter table public.events drop constraint if exists events_walk_in_is_in_person_and_sells_nothing;
alter table public.events add constraint events_walk_in_is_in_person_and_sells_nothing
  check (
    entry_mode <> 'walk_in'
    or (external_ticket_url is null and event_type = 'in_person')
  );

comment on column public.events.entry_mode is
  'How a person gets in. tickets: ticket types sold or registered here (every event before WI1). walk_in: free entry, no ticket needed, no ticket types ever, always is_free. Fixed once the event leaves draft. WI1, 21 October 2026.';
comment on column public.events.listing_source is
  'Whose words the listing carries. organiser: the organiser wrote it, and it shows as written. eventlinqs: EventLinqs wrote it from public information, so it falls under the walk-in word and dollar ban (Lawal, 21 October 2026). WI2''s import sets eventlinqs.';

-- A walk-in event is free by definition. Set here so /events?preset=free,
-- which reads is_free, finds it without a ticket type ever existing.
create or replace function public.walk_in_event_is_free()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.entry_mode = 'walk_in' then
    new.is_free := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_walk_in_event_is_free on public.events;
create trigger trg_walk_in_event_is_free
  before insert or update on public.events
  for each row execute function public.walk_in_event_is_free();

-- The mode is fixed once the event leaves draft, and an event that holds ticket
-- types cannot become walk-in. Anyone who asked to be reminded of a free night
-- is never later sent to a checkout.
create or replace function public.entry_mode_holds()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.entry_mode is distinct from old.entry_mode then
    if old.status::text <> 'draft' then
      raise exception 'entry mode cannot change after an event leaves draft (event %, % to %)',
        old.id, old.entry_mode, new.entry_mode
        using errcode = '23514';
    end if;
    if new.entry_mode = 'walk_in'
       and exists (select 1 from public.ticket_tiers t where t.event_id = new.id) then
      raise exception 'an event with ticket types cannot become walk-in (event %)', new.id
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Its event list names every column entry_mode_holds() reads, status as well
-- as entry_mode (scripts/guards/a-referential-null-is-not-an-edit.mjs). A change
-- to status alone finds the mode unchanged and returns at once, and a
-- referential set null touches neither column, so it never fires on one.
drop trigger if exists trg_entry_mode_holds on public.events;
create trigger trg_entry_mode_holds
  before update of entry_mode, status on public.events
  for each row execute function public.entry_mode_holds();

-- A walk-in event never holds a ticket type, whichever path tries to add one.
create or replace function public.walk_in_event_has_no_ticket_types()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.events e
     where e.id = new.event_id and e.entry_mode = 'walk_in'
  ) then
    raise exception 'a walk-in event has no ticket types (event %)', new.event_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_walk_in_event_has_no_ticket_types on public.ticket_tiers;
create trigger trg_walk_in_event_has_no_ticket_types
  before insert or update of event_id on public.ticket_tiers
  for each row execute function public.walk_in_event_has_no_ticket_types();

-- ---------------------------------------------------------------------------
-- 2. ORGANISATIONS: THE INSTAGRAM HANDLE IN THE ORGANISER BAND.
-- ---------------------------------------------------------------------------
alter table public.organisations
  add column if not exists instagram_handle text null;

alter table public.organisations drop constraint if exists organisations_instagram_handle_link_safe;
alter table public.organisations add constraint organisations_instagram_handle_link_safe
  check (
    instagram_handle is null
    or (char_length(instagram_handle) between 1 and 64
        and instagram_handle !~ '[[:space:]/@?#]')
  );

alter table public.organisations
  add column if not exists short_name text null;

alter table public.organisations drop constraint if exists organisations_short_name_bounded;
alter table public.organisations add constraint organisations_short_name_bounded
  check (short_name is null or char_length(btrim(short_name)) between 1 and 24);

comment on column public.organisations.short_name is
  'The short name the organiser goes by, for a button too narrow for the full name ("Follow AMCF" beside "African Music and Cultural Festival"). Optional; without it the button says Follow.';

comment on column public.organisations.instagram_handle is
  'The organiser''s Instagram handle without the @, shown and linked in the walk-in organiser band. Checked only for what would break a link; Instagram''s own username rules are UNSOURCED (docs/walk-in/LAW7-READING-2026-10-21.md).';

grant select (instagram_handle, short_name) on public.organisations to anon;
grant select (instagram_handle, short_name) on public.organisations to authenticated;

-- ---------------------------------------------------------------------------
-- 3. THE GUIDE: EVERYTHING ON A WALK-IN PAGE BEYOND THE EVENT ROW.
--
-- The lists are jsonb because each is read and written whole, with one shape
-- that src/lib/walk-in/guide.ts parses on every write and every read. The
-- database holds the outer shape and the bounds, so no path can store a list
-- the page was never drawn to show.
-- ---------------------------------------------------------------------------
create table if not exists public.event_guides (
  event_id uuid primary key references public.events(id) on delete cascade,
  days jsonb not null default '[]'::jsonb,
  at_a_glance jsonb not null default '[]'::jsonb,
  highlights jsonb not null default '[]'::jsonb,
  highlights_note text null,
  program_note text null,
  quote_text text null,
  quote_attribution text null,
  getting_there text null,
  access_notes text null,
  photos_heading text null,
  cover_credit text null,
  photo_credit text null,
  program_published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_guides_days_shape
    check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) <= 31),
  constraint event_guides_at_a_glance_shape
    check (jsonb_typeof(at_a_glance) = 'array' and jsonb_array_length(at_a_glance) <= 4),
  constraint event_guides_highlights_shape
    check (jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 6),
  constraint event_guides_text_bounded check (
        coalesce(char_length(highlights_note), 0) <= 600
    and coalesce(char_length(program_note), 0) <= 600
    and coalesce(char_length(quote_text), 0) <= 600
    and coalesce(char_length(quote_attribution), 0) <= 120
    and coalesce(char_length(getting_there), 0) <= 800
    and coalesce(char_length(access_notes), 0) <= 800
    and coalesce(char_length(photos_heading), 0) <= 60
    and coalesce(char_length(cover_credit), 0) <= 120
    and coalesce(char_length(photo_credit), 0) <= 120
  )
);

comment on table public.event_guides is
  'The festival guide behind a walk-in event page (WI1, locked design A): hours per day, the program, highlights, at a glance, quote, getting there, access, photo credit. One row per walk-in event. Read publicly only while the event is published and public.';
comment on column public.event_guides.program_published_at is
  'When the organiser published the full program, which sends the one program update to everyone who asked to be reminded. Set once, never moved or cleared.';

-- Published once. A second press, or a clear, would send a second update.
create or replace function public.guide_program_published_once()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.program_published_at is not null
     and new.program_published_at is distinct from old.program_published_at then
    raise exception 'the full program was already published for event % and cannot be published again',
      old.event_id using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guide_program_published_once on public.event_guides;
create trigger trg_guide_program_published_once
  before update on public.event_guides
  for each row execute function public.guide_program_published_once();

alter table public.event_guides enable row level security;

drop policy if exists "Walk-in guides of published public events are public" on public.event_guides;
create policy "Walk-in guides of published public events are public"
  on public.event_guides for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.events e
       where e.id = event_guides.event_id
         and e.status = 'published'
         and e.visibility = 'public'
         and e.entry_mode = 'walk_in'
    )
  );

drop policy if exists "Organisers read their own walk-in guides" on public.event_guides;
create policy "Organisers read their own walk-in guides"
  on public.event_guides for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
       where e.id = event_guides.event_id
         and e.organisation_id in (select public.el_member_organisation_ids())
    )
  );

-- GRANTS (header item 9). The two policies above serve SELECT to anon (the
-- public walk-in page reads through the anon key) and to authenticated (the
-- organiser's edit page reads through their session). Nothing else is served to
-- either. Writes go through the server action with the service role, after the
-- action's own ownership check, as save_event_ticket_tiers does; the service
-- role also reads it for the publish gate, the scheduled publish run and the
-- reminder emails. No path deletes a guide: it goes with its event, and a
-- cascade runs as the table owner, so service_role holds no DELETE.
revoke all on public.event_guides from public, anon, authenticated, service_role;
grant select on public.event_guides to anon, authenticated;
grant select, insert, update on public.event_guides to service_role;

-- ---------------------------------------------------------------------------
-- 4. REMIND ME: THE REQUESTS, AND THE SENDS CLAIMED BEFORE THEY GO.
-- ---------------------------------------------------------------------------
create table if not exists public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null,
  consent_version text not null,
  consent_text text not null,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requested_at timestamptz not null default now(),
  unsubscribed_at timestamptz null,

  constraint event_reminders_one_per_address unique (event_id, email),
  constraint event_reminders_token_unique unique (unsubscribe_token),
  constraint event_reminders_email_normalised
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and position('@' in email) > 1),
  constraint event_reminders_consent_present
    check (char_length(consent_version) > 0 and char_length(consent_text) > 0)
);

comment on table public.event_reminders is
  'Remind me on a walk-in event page. A request about ONE event, never a marketing consent: it is sent the full program once when the organiser publishes it, and one reminder the day before, each with a one-click stop. Service role only.';
comment on column public.event_reminders.requested_at is
  'The latest request. A person who stopped and asked again is asked again from this moment, so a program published before it is not sent.';
comment on column public.event_reminders.unsubscribed_at is
  'Set by the one-click stop. A stopped row is sent nothing.';

create index if not exists event_reminders_event_active_idx
  on public.event_reminders (event_id)
  where unsubscribed_at is null;

alter table public.event_reminders enable row level security;
-- GRANTS (header item 9). No policy, so nothing is served to anon or
-- authenticated: only the service role reads or writes Remind me requests. It
-- inserts and restarts them (the Remind me action), stops them (the stop link),
-- reads them (the hourly run, the organiser's numbers) and deletes them (the
-- retention purge, which runs as its caller).
revoke all on public.event_reminders from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.event_reminders to service_role;

create table if not exists public.event_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.event_reminders(id) on delete cascade,
  kind text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz null,
  provider_message_id text null,
  error text null,

  constraint event_reminder_sends_kind_known check (kind in ('program', 'day_before')),
  constraint event_reminder_sends_once unique (reminder_id, kind),
  constraint event_reminder_sends_error_bounded check (coalesce(char_length(error), 0) <= 1000)
);

comment on table public.event_reminder_sends is
  'One row per Remind me message, inserted BEFORE the send. The unique (reminder_id, kind) pair is what makes each of the two messages go at most once, across retries and overlapping runs. Service role only.';

alter table public.event_reminder_sends enable row level security;
-- GRANTS (header item 9). No policy, service role only: the hourly run reads
-- what was claimed, claims a send by inserting it and records the outcome by
-- updating it. A send row goes only with its reminder (cascade, as the owner).
revoke all on public.event_reminder_sends from public, anon, authenticated, service_role;
grant select, insert, update on public.event_reminder_sends to service_role;

-- Who is owed a message NOW, answered by the database in one statement: the
-- due, not-yet-claimed rows, never a page of rows filtered afterwards (a select
-- stops at 1,000 rows without saying so). For 'program': active rows that asked
-- before the organiser published the program. For 'day_before': active rows of
-- a published walk-in event when, in that event's own zone, today is the day
-- before its first day and the hour is p_local_hour or later. The hour is passed
-- in from DAY_BEFORE_LOCAL_HOUR (src/lib/walk-in/reminder-sends.ts), the one
-- place it is written. p_limit bounds a batch; the sender claims each row, so
-- the next batch never returns it again.
drop function if exists public.walk_in_reminders_due(text, uuid, integer);
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
     and e.status = 'published'
     and e.entry_mode = 'walk_in'
     and (p_event_id is null or e.id = p_event_id)
     and p_kind in ('program', 'day_before')
     and (p_kind <> 'program' or (g.program_published_at is not null and r.requested_at <= g.program_published_at))
     and (
       p_kind <> 'day_before'
       or (
         (p_now at time zone e.timezone)::date
           = (case when g.days -> 0 ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (g.days -> 0 ->> 'date')::date else (e.start_date at time zone e.timezone)::date end) - 1
         and extract(hour from (p_now at time zone e.timezone)) >= p_local_hour
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
  'The Remind me rows owed a program update or a day-before reminder and not yet claimed (WI1). Service role only; the sender claims each row in event_reminder_sends before it sends.';

revoke all on function public.walk_in_reminders_due(text, uuid, integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.walk_in_reminders_due(text, uuid, integer, timestamptz, integer) to service_role;

-- Retention (the new dated privacy version, decision 1 for Lawal): a Remind me
-- request is deleted once its event ended more than p_days ago. The sends go
-- with it (on delete cascade). Returns how many requests were deleted, so the
-- hourly run can say so. The period is passed in from
-- REMIND_ME_RETENTION_DAYS_AFTER_EVENT, the one place it is written.
create or replace function public.purge_walk_in_reminders(p_days integer)
returns integer
language sql
volatile
set search_path = public, pg_temp
as $fn$
  with gone as (
    delete from public.event_reminders r
     using public.events e
     where e.id = r.event_id
       and e.end_date < now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
    returning r.id
  )
  select count(*)::integer from gone
$fn$;

comment on function public.purge_walk_in_reminders(integer) is
  'Deletes Remind me requests whose event ended more than p_days ago (WI1 retention). Service role only.';

revoke all on function public.purge_walk_in_reminders(integer) from public, anon, authenticated;
grant execute on function public.purge_walk_in_reminders(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. THE LEDGER: THREE MORE ACTIONS THAT CARRY NOBODY.
-- ---------------------------------------------------------------------------
alter table public.ledger_entries drop constraint if exists ledger_entries_demand_shape;
alter table public.ledger_entries add constraint ledger_entries_demand_shape check (
  kind <> 'demand' or (
    demand_action is not null
    and (
      demand_action in ('page_view', 'sold_out_view', 'calendar_add', 'share', 'follow')
      or contact_email is not null
    )
  )
);

-- ---------------------------------------------------------------------------
-- 5b. THE SWITCH THAT KEEPS REMIND ME OFF IN PRODUCTION UNTIL LAWAL APPROVES.
--
-- Lawal, 21 October 2026: "Remind me does not go live in production until he
-- approves" the privacy version that names it. Seeded OFF here, so the capture
-- is dark on every database this file reaches; it is turned on per database by
-- a row change (scripts/ops/walk-in-remind-me-flag.mjs, APPLY typed by Lawal on
-- production), never by a deploy.
-- ---------------------------------------------------------------------------
insert into public.feature_flags (flag, enabled, description)
values (
  'walk_in_remind_me',
  false,
  'WI1 Remind me on walk-in event pages. OFF until Lawal approves the privacy policy version that names it (ruling of 21 October 2026).'
)
on conflict (flag) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- 6. THE RECOUNT: A WALK-IN EVENT IS FREE BY DEFINITION.
--
-- The whole view as 20260825000004 wrote it, with one change: the
-- events.is_free truth is (entry_mode = 'walk_in') OR the tier recount.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.stored_aggregate_drift AS

-- events.is_free: the model. A trigger recomputes it from the whole tier set on
-- INSERT, UPDATE and DELETE of ticket_tiers.
-- A walk-in event is free by definition (WI1, 20261021000020), so its truth is
-- true whatever the (always empty) tier set says.
SELECT
  'events.is_free'::text                                   AS column_name,
  e.id::text                                               AS key,
  (e.is_free)::text                                        AS stored,
  (e.entry_mode = 'walk_in' OR coalesce(max(t.price), 0) = 0)::text AS truth
FROM public.events e
LEFT JOIN public.ticket_tiers t ON t.event_id = e.id
GROUP BY e.id, e.is_free, e.entry_mode

UNION ALL

-- event_addons.sold_count: recomputed from confirmed order items since
-- migration 20260825000001. Nothing wrote it before that.
SELECT
  'event_addons.sold_count'::text,
  a.id::text,
  a.sold_count::text,
  coalesce(sum(oi.quantity) FILTER (WHERE o.status = 'confirmed'), 0)::text
FROM public.event_addons a
LEFT JOIN public.order_items oi ON oi.addon_id = a.id
LEFT JOIN public.orders o ON o.id = oi.order_id
GROUP BY a.id, a.sold_count

UNION ALL

-- organisations.total_event_count: recomputed from events since migration
-- 20260825000003. Incremented with no decrement anywhere before that.
SELECT
  'organisations.total_event_count'::text,
  o.id::text,
  o.total_event_count::text,
  count(e.id)::text
FROM public.organisations o
LEFT JOIN public.events e ON e.organisation_id = o.id
GROUP BY o.id, o.total_event_count

UNION ALL

-- ticket_tiers.reserved_count: acquired under a row lock by create_reservation,
-- returned by on_reservation_released and by the expire sweeper.
SELECT
  'ticket_tiers.reserved_count'::text,
  t.id::text,
  t.reserved_count::text,
  coalesce((
    SELECT sum((i->>'quantity')::int)
    FROM public.reservations r, jsonb_array_elements(r.items) i
    WHERE r.status = 'active'
      AND r.expires_at > now()
      AND (i->>'ticket_tier_id')::uuid = t.id
  ), 0)::text
FROM public.ticket_tiers t

UNION ALL

-- ticket_tiers.sold_count: FOUNDER RULING 25 August 2026, stays as it is.
-- Reconciled anyway so a drift is visible while it is unfixed.
SELECT
  'ticket_tiers.sold_count'::text,
  t.id::text,
  t.sold_count::text,
  coalesce((
    SELECT count(*)
    FROM public.tickets k
    WHERE k.ticket_tier_id = t.id AND k.status IN ('valid', 'scanned')
  ), 0)::text
FROM public.ticket_tiers t

UNION ALL

-- discount_codes.current_uses: FOUNDER RULING 25 August 2026, stays as it is.
SELECT
  'discount_codes.current_uses'::text,
  d.id::text,
  d.current_uses::text,
  count(u.id) FILTER (WHERE o.status = 'confirmed')::text
FROM public.discount_codes d
LEFT JOIN public.discount_code_usages u ON u.discount_code_id = d.id
LEFT JOIN public.orders o ON o.id = u.order_id
GROUP BY d.id, d.current_uses

UNION ALL

-- organisations.total_volume_cents: DEFERRED 25 August 2026. The recount is the
-- gross of confirmed orders, so a partial refund makes the stored value read
-- LOWER by design; a stored value HIGHER than the recount is real drift.
SELECT
  'organisations.total_volume_cents'::text,
  o.id::text,
  o.total_volume_cents::text,
  coalesce(sum(ord.total_cents) FILTER (WHERE ord.status = 'confirmed'), 0)::text
FROM public.organisations o
LEFT JOIN public.orders ord ON ord.organisation_id = o.id
GROUP BY o.id, o.total_volume_cents

UNION ALL

-- organisations.hold_amount_cents: DEFERRED 25 August 2026. Four money-path
-- writers, three of them SQL functions on the payout path.
SELECT
  'organisations.hold_amount_cents'::text,
  o.id::text,
  o.hold_amount_cents::text,
  coalesce(sum(h.amount_cents) FILTER (
    WHERE h.hold_type = 'reserve' AND h.released_at IS NULL
  ), 0)::text
FROM public.organisations o
LEFT JOIN public.payout_holds h ON h.organisation_id = o.id
GROUP BY o.id, o.hold_amount_cents;

COMMENT ON VIEW public.stored_aggregate_drift IS
  'Every stored count or total, beside a live recount of the rows it summarises. One row per (column, entity). Reported by scripts/verify/aggregate-reconcile.mjs and by the daily /api/cron/aggregate-reconcile. The prose verdict for each column is scripts/lib/stored-aggregates.mjs. It reports; it never repairs.';

-- ---------------------------------------------------------------------------
-- PRIVILEGES: nobody untrusted reads this.
-- ---------------------------------------------------------------------------
--
-- It exposes per-organisation lifetime volume and per-tier sold counts, which is
-- exactly the commercial data the column lockdown of migration 20260808000010
-- revoked from anon and authenticated. A view inherits nothing useful here, so
-- it is stated: the service role reads it, and nobody else.
REVOKE ALL ON public.stored_aggregate_drift FROM PUBLIC;
REVOKE ALL ON public.stored_aggregate_drift FROM anon, authenticated;
GRANT SELECT ON public.stored_aggregate_drift TO service_role;

-- ---------------------------------------------------------------------------
-- 7. POST-CONDITION. The file proves what it promised before anything trusts
-- it, so a partly applied file fails loudly here rather than quietly later.
-- ---------------------------------------------------------------------------
DO $post$
DECLARE
  v_missing text := '';
  v_cell record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'entry_mode') THEN
    v_missing := v_missing || ' events.entry_mode';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'listing_source') THEN
    v_missing := v_missing || ' events.listing_source';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'organisations' AND column_name = 'instagram_handle') THEN
    v_missing := v_missing || ' organisations.instagram_handle';
  END IF;
  IF to_regclass('public.event_guides') IS NULL THEN
    v_missing := v_missing || ' event_guides';
  END IF;
  IF to_regclass('public.event_reminders') IS NULL THEN
    v_missing := v_missing || ' event_reminders';
  END IF;
  IF to_regclass('public.event_reminder_sends') IS NULL THEN
    v_missing := v_missing || ' event_reminder_sends';
  END IF;
  IF to_regprocedure('public.purge_walk_in_reminders(integer)') IS NULL THEN
    v_missing := v_missing || ' purge_walk_in_reminders';
  END IF;
  IF to_regprocedure('public.walk_in_reminders_due(text, uuid, integer, timestamptz, integer)') IS NULL THEN
    v_missing := v_missing || ' walk_in_reminders_due';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_walk_in_event_is_free') THEN
    v_missing := v_missing || ' trg_walk_in_event_is_free';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_entry_mode_holds') THEN
    v_missing := v_missing || ' trg_entry_mode_holds';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_walk_in_event_has_no_ticket_types') THEN
    v_missing := v_missing || ' trg_walk_in_event_has_no_ticket_types';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guide_program_published_once') THEN
    v_missing := v_missing || ' trg_guide_program_published_once';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'event_reminders' AND c.relrowsecurity) THEN
    v_missing := v_missing || ' event_reminders.rls';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'event_reminder_sends' AND c.relrowsecurity) THEN
    v_missing := v_missing || ' event_reminder_sends.rls';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'event_guides' AND c.relrowsecurity) THEN
    v_missing := v_missing || ' event_guides.rls';
  END IF;
  IF NOT has_column_privilege('anon', 'public.organisations', 'instagram_handle', 'SELECT') THEN
    v_missing := v_missing || ' organisations.instagram_handle.anon_select';
  END IF;
  IF NOT has_column_privilege('anon', 'public.organisations', 'short_name', 'SELECT') THEN
    v_missing := v_missing || ' organisations.short_name.anon_select';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'event_guides' AND column_name = 'cover_credit') THEN
    v_missing := v_missing || ' event_guides.cover_credit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag = 'walk_in_remind_me') THEN
    v_missing := v_missing || ' feature_flags.walk_in_remind_me';
  END IF;
  -- Every cell of the grant table in header item 9, both ways: what is granted
  -- must be held, and what is not granted must not be, so the result is exact
  -- under the old default and the new one alike.
  FOR v_cell IN
    SELECT t.tbl, r.role, p.priv,
           (t.tbl, r.role, p.priv) IN (
             ('event_guides', 'anon', 'SELECT'),
             ('event_guides', 'authenticated', 'SELECT'),
             ('event_guides', 'service_role', 'SELECT'),
             ('event_guides', 'service_role', 'INSERT'),
             ('event_guides', 'service_role', 'UPDATE'),
             ('event_reminders', 'service_role', 'SELECT'),
             ('event_reminders', 'service_role', 'INSERT'),
             ('event_reminders', 'service_role', 'UPDATE'),
             ('event_reminders', 'service_role', 'DELETE'),
             ('event_reminder_sends', 'service_role', 'SELECT'),
             ('event_reminder_sends', 'service_role', 'INSERT'),
             ('event_reminder_sends', 'service_role', 'UPDATE')
           ) AS expected
      FROM (VALUES ('event_guides'), ('event_reminders'), ('event_reminder_sends')) AS t(tbl)
     CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role)
     CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
  LOOP
    IF has_table_privilege(v_cell.role, 'public.' || v_cell.tbl, v_cell.priv) IS DISTINCT FROM v_cell.expected THEN
      v_missing := v_missing || ' ' || v_cell.tbl || '.' || v_cell.role || '.' || v_cell.priv
                   || CASE WHEN v_cell.expected THEN '_must_be_granted' ELSE '_must_not_be_granted' END;
    END IF;
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'WI1 walk-in migration post-condition failed:%', v_missing;
  END IF;
END
$post$;
