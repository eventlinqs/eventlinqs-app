-- ONE EDITORIAL CALENDAR PER CITY (C:\dev\GROWTH\GROWTH-SYSTEM-DIRECTIVE-1NOV.md s5: "Create one editorial calendar
-- per active city. Generate draft weekly guides and social content from verified event records ... Require review
-- before publication"; the accepted plan C:\dev\GROWTH\growth-30-day-schedule.md (b) 3, owner WINDOW 2).
--
-- (1) public.city_editorial_slots: one row per city, week and day of the directive's Monday to Sunday rhythm, holding
--     the nights the slot drafted (src/lib/growth/editorial-calendar-math.ts decides which). A slot is a DRAFT until a
--     person approves it; an approved slot names who and when, and a re-draft never overwrites it (the store skips it,
--     and the trigger refuses a change to an approved slot's nights).
-- (2) public.city_editorial_events(city, from, to): the published, public nights starting in a window with their
--     venue's relation to the city (venue_city_relation, 20261101160001), their guide category, organiser, and whether
--     a photograph with AUTHORISED rights is recorded for them (event_image_rights: organiser_authorised or
--     separately_licensed, unexpired). The calendar reads only through it, so a night at a surrounding, regional,
--     outside or unplaced venue is never in a city's slot.
-- Service role only: drafts and approvals are server jobs and the admin's server actions; nothing here is public.
-- Depends on 20261101160001 (venue_city_relation). Proved on TEST by scripts/verify/proofs/city-editorial-calendar-proof.sql.

create table if not exists public.city_editorial_slots (
  id uuid primary key default gen_random_uuid(),
  city text not null check (city ~ '^[a-z][a-z0-9-]*$'),
  week_start date not null check (extract(isodow from week_start) = 1),
  day text not null check (day in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  slot_date date not null,
  theme text not null check (length(btrim(theme)) > 0),
  event_ids uuid[] not null default '{}',
  total integer not null default 0 check (total >= 0),
  empty_note text,
  spotlight_organisation_id uuid references public.organisations (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'withdrawn')),
  drafted_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  unique (city, week_start, day),
  -- The day's date is its place in the week.
  check (slot_date = week_start + (array_position(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], day) - 1)),
  -- An empty slot says so; a slot with nights says nothing of the kind.
  check ((cardinality(event_ids) = 0) = (empty_note is not null)),
  -- An approval names who and when.
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

comment on table public.city_editorial_slots is
  'The editorial calendar: one draft per city, week and day of the growth directive''s rhythm, from verified nights only; published only once a person approves it (C:\dev\GROWTH\GROWTH-SYSTEM-DIRECTIVE-1NOV.md s5).';

create or replace function public.city_editorial_slots_keep_approved()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' and new.status = 'approved'
     and (new.event_ids is distinct from old.event_ids or new.theme is distinct from old.theme) then
    raise exception 'an approved slot keeps its nights; withdraw it first (city %, week %, day %)', old.city, old.week_start, old.day
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_city_editorial_slots_keep_approved on public.city_editorial_slots;
-- An event list naming the columns the function reads, so blanking spotlight_organisation_id when an organisation is
-- deleted is never judged as an edit of the slot (scripts/guards/a-referential-null-is-not-an-edit.mjs).
create trigger trg_city_editorial_slots_keep_approved
  before update of status, event_ids, theme, city, week_start, day on public.city_editorial_slots
  for each row execute function public.city_editorial_slots_keep_approved();

alter table public.city_editorial_slots enable row level security;
revoke all on table public.city_editorial_slots from anon, authenticated, service_role;
grant select, insert, update on table public.city_editorial_slots to service_role;

create or replace function public.city_editorial_events(p_city text, p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  visibility text,
  city_relation text,
  category text,
  venue_name text,
  suburb text,
  organisation_id uuid,
  organisation_name text,
  has_authorised_media boolean
)
language sql
stable
set search_path = public
as $$
  select e.id,
         e.title,
         e.start_date,
         e.end_date,
         e.status::text,
         e.visibility::text,
         case when e.venue_id is null then 'unplaced' else public.venue_city_relation(p_city, e.venue_id) end,
         c.slug,
         e.venue_name,
         e.suburb_primary,
         e.organisation_id,
         o.name,
         exists (
           select 1 from public.event_image_rights r
            where r.event_id = e.id
              and r.rights_state in ('organiser_authorised', 'separately_licensed')
              and (r.rights_expire_at is null or r.rights_expire_at > now())
         )
    from public.events e
    left join public.event_categories c on c.id = e.category_id
    left join public.organisations o on o.id = e.organisation_id
   where e.start_date >= p_from
     and e.start_date < p_to
     and e.status = 'published'
     and e.visibility = 'public'
$$;

revoke all on function public.city_editorial_events(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.city_editorial_events(text, timestamptz, timestamptz) to service_role;

comment on function public.city_editorial_events(text, timestamptz, timestamptz) is
  'The nights the editorial calendar may draft from: published and public, starting in the window, each with its venue''s relation to the city (never a city label alone), its guide category, organiser and whether authorised media is recorded.';
