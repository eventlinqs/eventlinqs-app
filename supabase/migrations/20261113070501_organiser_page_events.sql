-- THE ORGANISER'S OWN NEXT EVENT, READ FROM THEIR OWN PAGE (Lawal, 13 November 2026, 06:50, ruling 1: "THE TRUE LINE may
-- name the organiser's own upcoming event as read from their own published page (the page URL and the date read
-- recorded on the draft, like the basis), when they have no night on EventLinqs. Never invented; never a past event as
-- upcoming." WINDOW 5A.)
--
-- Measured first (C:\dev\EVIDENCE\EL-13NOV\twenty\own-page-events.json): of the 23 organisers with a lawful email never
-- written to, none publishes its next event in structured data a machine can read, so an event is RECORDED here by the
-- research step, read from the organiser's own published page through the polite reader, with the page and the date it
-- was read and who read it, exactly as a contact's basis is recorded (organiser_contacts.basis). The day's twenty
-- (src/lib/outreach/twenty-drafts.ts) names an organiser's newest recorded event that is still ahead, read within its
-- freshness window, only where no night of theirs is listed on EventLinqs, and keeps the page and date on the draft.
--
-- 1. public.organiser_page_events: one row per event read; never edited in place (a later read is a new row).
-- 2. public.outreach_touches gains line_source_url and line_read_on: the page the draft's line about them was read from
--    and the date, set together or not at all. A draft naming a night listed on EventLinqs leaves both empty.
--
-- Grants (the founder ruling of 21 October 2026): the new table is read and written by the service role only (the
-- outreach run and the reviewed research writes); anon and authenticated get nothing. No delete: a wrong read is
-- superseded by a newer row, never erased.

create table if not exists public.organiser_page_events (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.organisers (id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 200),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  place text check (place is null or length(btrim(place)) between 2 and 200),
  page_url text not null check (page_url ~* '^https://[^\s/]+\.[^\s/]+'),
  read_on date not null,
  read_by text not null check (length(btrim(read_by)) between 2 and 100),
  created_at timestamptz not null default now(),
  constraint organiser_page_events_once unique (organiser_id, title, starts_on, page_url)
);

create index if not exists organiser_page_events_by_organiser on public.organiser_page_events (organiser_id, starts_on);

comment on table public.organiser_page_events is
  'An organiser''s own upcoming event as read from their own published page (Lawal, 13 November 2026, 06:50): the page, the date read and who read it, like a contact''s basis. The day''s twenty names it only where no night of theirs is listed on EventLinqs.';

alter table public.organiser_page_events enable row level security;
revoke all on public.organiser_page_events from anon, authenticated, service_role;
grant select, insert on public.organiser_page_events to service_role;

alter table public.outreach_touches add column if not exists line_source_url text
  check (line_source_url is null or line_source_url ~* '^https://[^\s/]+\.[^\s/]+');
alter table public.outreach_touches add column if not exists line_read_on date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_touches_line_source_whole') then
    alter table public.outreach_touches add constraint outreach_touches_line_source_whole
      check ((line_source_url is null) = (line_read_on is null));
  end if;
end
$$;

comment on column public.outreach_touches.line_source_url is
  'The organiser''s own page the draft''s line about their event was read from (organiser_page_events), null when the line names a night listed on EventLinqs.';
comment on column public.outreach_touches.line_read_on is
  'The date that page was read; set together with line_source_url or not at all.';
