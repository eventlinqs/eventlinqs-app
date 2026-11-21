-- THE IMAGE LOCK: EVERY EVENT'S STAND IN IS ITS OWN (Lawal, 21 November 2026, 20:50 to 21:40, through the PM's 21:42;
-- the project doc 'strategy/The image lock, Lawal's ruling, locked 21 November 2026.md'). WINDOW 5A.
--
-- What he saw: the Festivals page showed ONE illustrative photo on five different events, because every surface picked
-- a picture by category at render time (src/lib/images/illustrative.ts, now removed). His ruling: an event with its own
-- permitted photograph shows that only; an event without one gets ITS OWN licensed photo, assigned once, stored with
-- the event, labelled 'Illustrative photo', the same wherever it appears; never the same photo on two events; else the
-- brand panel (law 46 (f)).
--
-- The root already exists: public.photo_assignments (20261031010001, 'no photo is ever reused') stores every photo shown
-- for a night once, unique by its SHA-256, a near copy refused by its 64 bit difference hash, never moved, and its source
-- may be 'licensed'. This adds:
--   stand_in_photos             the licensed pool: each photo's fingerprint, what it shows (kind, subject, place) as it
--                               was looked at, its alt words, licence, photographer and page; written by the service role
--                               only after the photo was looked at (law 5);
--   photo_assignments.stand_in_photo_id, and one live stand in per night or series (unique indexes);
--   assign_stand_in(event, photo)  the one way a stand in is given to a night (service role): once, never shared;
--   event_stand_ins_for(events)    what a page reads (anon): each asked night's own stand in and its alt words;
--   event_covers_cleared_for(events)  what a page reads (anon): the asked nights whose CURRENT cover has its rights on
--                               record (organiser_authorised or separately_licensed), so the card chain needs no service
--                               role to tell an own permitted photograph from one we may not show.
-- Additive: one table, one column, one index, three functions. Nothing existing is altered or removed.

create table if not exists public.stand_in_photos (
  id uuid primary key default gen_random_uuid(),
  photo_sha256 text not null unique check (photo_sha256 ~ '^[0-9a-f]{64}$'),
  photo_dhash bigint not null,
  image_url text not null unique check (image_url ~* '^https://[^[:space:]]+$'),
  -- The kind of night it may stand for (an event_categories slug), what it shows, and the city it shows, if any.
  kind text not null check (kind ~ '^[a-z][a-z0-9-]*$'),
  subject text not null check (length(btrim(subject)) between 3 and 200),
  place text check (place is null or place ~ '^[a-z][a-z0-9-]*$'),
  alt text not null check (length(btrim(alt)) between 3 and 200),
  licence text not null check (licence in ('pexels')),
  photographer text not null check (length(btrim(photographer)) between 1 and 200),
  source_url text not null check (source_url ~* '^https://www\.pexels\.com/'),
  looked_at timestamptz not null,
  looked_at_by text not null check (length(btrim(looked_at_by)) between 2 and 80),
  created_at timestamptz not null default now()
);

comment on table public.stand_in_photos is
  'The image lock (21 November 2026): licensed photos, each looked at, each given to at most one night through assign_stand_in.';

alter table public.stand_in_photos enable row level security;
-- The 21 October 2026 grant rule: no visitor reaches the pool; the service role reads it and adds to it. Pages read a
-- night's stand in only through event_stand_ins_for.
revoke all on table public.stand_in_photos from anon, authenticated, service_role;
grant select, insert on table public.stand_in_photos to service_role;

alter table public.photo_assignments
  add column if not exists stand_in_photo_id uuid references public.stand_in_photos (id) on delete restrict;

create unique index if not exists photo_assignments_one_stand_in_per_night on public.photo_assignments (event_id)
  where role = 'cover' and source = 'licensed' and stand_in_photo_id is not null and event_id is not null and retired_at is null;
-- A recurring series is one event (the photo system's P4): its stand in belongs to the series, the same on every date.
create unique index if not exists photo_assignments_one_stand_in_per_series on public.photo_assignments (listing_series_id)
  where role = 'cover' and source = 'licensed' and stand_in_photo_id is not null and listing_series_id is not null and retired_at is null;

-- The one way a stand in is given: to one event, once (a night, or the series a recurring night belongs to). The
-- photo's own fingerprint goes with it, so the unique hash and the near copy trigger on photo_assignments refuse it for
-- any second event. Answers the assignment's id.
create or replace function public.assign_stand_in(p_event uuid, p_photo uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_photo public.stand_in_photos;
  v_series uuid;
  v_id uuid;
begin
  select * into v_photo from public.stand_in_photos where id = p_photo;
  if v_photo.id is null then
    raise exception 'refused: no such stand in photo' using errcode = '23514';
  end if;
  if not exists (select 1 from public.events where id = p_event) then
    raise exception 'refused: no such night' using errcode = '23514';
  end if;
  select listing_series_id into v_series from public.events where id = p_event;
  insert into public.photo_assignments (photo_sha256, photo_dhash, image_url, event_id, listing_series_id, role, source, stand_in_photo_id)
  values (v_photo.photo_sha256, v_photo.photo_dhash, v_photo.image_url,
          case when v_series is null then p_event end, v_series, 'cover', 'licensed', v_photo.id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.assign_stand_in(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_stand_in(uuid, uuid) to service_role;

create or replace function public.event_stand_ins_for(p_events uuid[])
returns table (event_id uuid, image_url text, alt text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, a.image_url, s.alt
    from public.events e
    join public.photo_assignments a
      on (a.event_id = e.id or (e.listing_series_id is not null and a.listing_series_id = e.listing_series_id))
     and a.role = 'cover' and a.source = 'licensed' and a.retired_at is null
    join public.stand_in_photos s on s.id = a.stand_in_photo_id
   where e.id = any (p_events)
$$;

revoke all on function public.event_stand_ins_for(uuid[]) from public;
grant execute on function public.event_stand_ins_for(uuid[]) to anon, authenticated, service_role;

create or replace function public.event_covers_cleared_for(p_events uuid[])
returns table (event_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
    from public.events e
   where e.id = any (p_events)
     and public.event_has_own_photo(e.cover_image_url)
     and exists (
       select 1 from public.event_image_rights r
        where r.event_id = e.id and r.image_role = 'cover' and r.image_url = e.cover_image_url
          and r.rights_state in ('organiser_authorised', 'separately_licensed')
     )
$$;

revoke all on function public.event_covers_cleared_for(uuid[]) from public;
grant execute on function public.event_covers_cleared_for(uuid[]) to anon, authenticated, service_role;
