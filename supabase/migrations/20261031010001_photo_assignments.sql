-- NO PHOTO IS EVER REUSED (Lawal's ruling of 31 October 2026, 00:14; C:\dev\START-16OCT\EVENTLINQS-PHOTO-SYSTEM-31OCT.md,
-- P1 to P4; the project manager's 00:22 (2)). Every photo shown for a night is ASSIGNED to that night, once, in the
-- database, and the card chain and the event page read the assignment; nothing picks a photo at render time.
--
-- P1 one photo, one event: a photo is its SHA-256 (of the original bytes) and its 64-bit difference hash (dHash, to catch a
--    resized or re-encoded copy); a unique index refuses a second assignment of the same bytes and a trigger refuses a
--    near-duplicate (Hamming distance 6 or less of 64, the usual dHash threshold for "the same picture").
-- P2 enforced here: an assignment never moves to another night or series; it stays when its night is deleted (the photo
--    is retired, never re-dealt).
-- P3 dealt, never shared: deal_venue_photos gives each venue's approved photos out one per upcoming night, the strongest
--    to the soonest; nights beyond the pool keep the typographic cover.
-- P4 a recurring series is one event: a series (events.listing_series_id) holds one photo, assigned to the series, and it
--    is read for the series' soonest open night only, so no list shows it twice.
--
-- Additive: two columns on venue_images, one table, four functions. Nothing existing is altered. Proved on TEST by
-- scripts/verify/photo-assignments-proof.sql through scripts/verify/replay-under-new-default.mjs, rolled back.

alter table public.venue_images
  add column if not exists photo_sha256 text check (photo_sha256 is null or photo_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists photo_dhash bigint;

comment on column public.venue_images.photo_sha256 is 'SHA-256 of the original bytes, hex; set before a photo can be dealt to a night.';
comment on column public.venue_images.photo_dhash is '64-bit difference hash (9x8 greyscale), as a signed bigint; near-duplicates are refused by photo_assignments.';

create table if not exists public.photo_assignments (
  id uuid primary key default gen_random_uuid(),
  photo_sha256 text not null check (photo_sha256 ~ '^[0-9a-f]{64}$'),
  photo_dhash bigint,
  image_url text not null check (image_url ~* '^https://[^[:space:]]+$'),
  -- The night it belongs to, or the series (P4). Exactly one when made; a deleted night leaves neither, and the photo
  -- stays retired.
  event_id uuid references public.events (id) on delete set null,
  listing_series_id uuid references public.event_series (id) on delete set null,
  role text not null default 'cover' check (role in ('cover', 'gallery')),
  source text not null check (source in ('venue', 'organiser', 'licensed', 'google_places', 'brand')),
  venue_image_id uuid references public.venue_images (id) on delete set null,
  assigned_at timestamptz not null default now(),
  -- Set when its photo stops being approved for the night: the photo stays used (never dealt again, P1), and the night
  -- may take another.
  retired_at timestamptz,
  constraint photo_assignments_one_target check (num_nonnulls(event_id, listing_series_id) <= 1)
);

create unique index if not exists photo_assignments_one_event_per_photo on public.photo_assignments (photo_sha256);
create unique index if not exists photo_assignments_one_cover_per_night on public.photo_assignments (event_id)
  where role = 'cover' and event_id is not null and retired_at is null;
create unique index if not exists photo_assignments_one_cover_per_series on public.photo_assignments (listing_series_id)
  where role = 'cover' and listing_series_id is not null and retired_at is null;
create index if not exists photo_assignments_by_venue_image on public.photo_assignments (venue_image_id);

comment on table public.photo_assignments is
  'Every photo shown for a night, assigned once (P1 to P4, 31 October 2026). Read by visitors only through public.event_cover_photos_for.';

alter table public.photo_assignments enable row level security;
-- The 21 October 2026 grant rule: the service role (the founder's screens, the jobs) reads it; it is written only by
-- deal_venue_photos and the database's own on delete set null. No visitor reaches the table itself.
revoke all on table public.photo_assignments from anon, authenticated, service_role;
grant select on table public.photo_assignments to service_role;

-- P1 and P2: a near-duplicate is the same photo; an assignment is made once, its photo and its target never change.
create or replace function public.photo_assignments_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if num_nonnulls(new.event_id, new.listing_series_id) <> 1 then
      raise exception 'photo_assignments: a photo is assigned to exactly one night or one series';
    end if;
    if new.photo_dhash is not null and exists (
      select 1 from public.photo_assignments a
       where a.photo_dhash is not null
         and bit_count((a.photo_dhash # new.photo_dhash)::bit(64)) <= 6
    ) then
      raise exception 'photo_assignments: that photo, or a near copy of it, is already assigned to another event';
    end if;
    return new;
  end if;
  if new.photo_sha256 is distinct from old.photo_sha256 or new.photo_dhash is distinct from old.photo_dhash
     or new.image_url is distinct from old.image_url or new.role is distinct from old.role
     or (old.retired_at is not null and new.retired_at is distinct from old.retired_at) then
    raise exception 'photo_assignments: an assignment is never edited';
  end if;
  if (new.event_id is not null and new.event_id is distinct from old.event_id)
     or (new.listing_series_id is not null and new.listing_series_id is distinct from old.listing_series_id) then
    raise exception 'photo_assignments: a photo never moves to another event';
  end if;
  return new;
end;
$$;

revoke all on function public.photo_assignments_guard() from public, anon, authenticated;

drop trigger if exists photo_assignments_guard on public.photo_assignments;
create trigger photo_assignments_guard
  before insert or update on public.photo_assignments
  for each row execute function public.photo_assignments_guard();

-- The night's own photograph, by the rule the card chain applies (src/lib/images/event-media.ts isOwnPhoto): a cover
-- that is not our composed cover, not a library photograph and not a placeholder service.
create or replace function public.event_has_own_photo(p_cover text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_cover is not null
     and btrim(p_cover) <> ''
     and p_cover !~ '/generated-covers/'
     and p_cover !~ '/storage/v1/object/public/event-images/stock/'
     and p_cover !~* '^https://picsum\.photos/'
$$;

revoke all on function public.event_has_own_photo(text) from public;
grant execute on function public.event_has_own_photo(text) to anon, authenticated, service_role;

-- A night is open from now until it ends; one without an end is open until it starts.
create or replace function public.event_is_open_night(p_start timestamptz, p_end timestamptz, p_now timestamptz)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_end is not null then p_end >= p_now else p_start >= p_now end
$$;

revoke all on function public.event_is_open_night(timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.event_is_open_night(timestamptz, timestamptz, timestamptz) to anon, authenticated, service_role;

-- P3 and P4. Deals each venue's approved, verified, hashed photos (card use) that are not yet assigned, strongest first,
-- to that venue's open public nights that have no own photo and no cover yet, soonest first; a series takes one photo
-- for all its nights, at the place of its soonest open night. Answers how many it assigned. Run after an approval and
-- daily; running it twice assigns nothing new.
create or replace function public.deal_venue_photos(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  -- A photo no longer approved and verified for cards retires from its night; the night may take another.
  update public.photo_assignments a
     set retired_at = p_now
   where a.retired_at is null and a.source = 'venue'
     and not exists (
       select 1 from public.venue_images i
        where i.id = a.venue_image_id and i.approval_state = 'approved' and i.verified_depicts_venue
          and 'event_card' = any (i.permitted_uses)
     );

  with units as (
    -- one row a standalone night, one row a series (its soonest open night places it)
    select distinct on (coalesce(e.listing_series_id, e.id))
           e.venue_id, e.id as event_id, e.listing_series_id, e.start_date
      from public.events e
     where e.status = 'published' and e.visibility = 'public' and e.venue_id is not null
       and public.event_is_open_night(e.start_date, e.end_date, p_now)
       and not public.event_has_own_photo(e.cover_image_url)
     order by coalesce(e.listing_series_id, e.id), e.start_date, e.id
  ),
  open_units as (
    select u.*, row_number() over (partition by u.venue_id order by u.start_date, u.event_id) as slot
      from units u
     where not exists (
       select 1 from public.photo_assignments a
        where a.role = 'cover' and a.retired_at is null
          and ((u.listing_series_id is not null and a.listing_series_id = u.listing_series_id)
            or (u.listing_series_id is null and a.event_id = u.event_id))
     )
  ),
  pool as (
    select i.*, row_number() over (partition by i.venue_id order by i.is_primary desc, i.quality_score desc nulls last, i.approved_at, i.id) as slot
      from public.venue_images i
     where i.approval_state = 'approved' and i.verified_depicts_venue and i.venue_id is not null
       and 'event_card' = any (i.permitted_uses)
       and i.photo_sha256 is not null
       and not exists (select 1 from public.photo_assignments a where a.photo_sha256 = i.photo_sha256)
  ),
  made as (
    insert into public.photo_assignments (photo_sha256, photo_dhash, image_url, event_id, listing_series_id, role, source, venue_image_id)
    select p.photo_sha256, p.photo_dhash, p.image_url,
           case when o.listing_series_id is null then o.event_id end, o.listing_series_id,
           'cover', 'venue', p.id
      from pool p
      join open_units o on o.venue_id = p.venue_id and o.slot = p.slot
    returning 1
  )
  select count(*) into v_n from made;
  return v_n;
end;
$$;

revoke all on function public.deal_venue_photos(timestamptz) from public, anon, authenticated;
grant execute on function public.deal_venue_photos(timestamptz) to service_role;

-- THE CARD CHAIN'S ONE READ: each night's assigned cover with its credit, for the nights asked. A series' photo is
-- answered for its soonest open public night only (P4), so a list never shows it twice. A venue photo stops showing
-- the moment it is no longer approved for the use. source_url only as an https page, as venue_photos_for answers it.
create or replace function public.event_cover_photos_for(p_events uuid[], p_use text, p_now timestamptz default now())
returns table (event_id uuid, image_url text, attribution_text text, licence text, licence_url text, author text, source_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with asked as (
    select e.id, e.listing_series_id
      from public.events e
     where e.id = any (p_events)
  ),
  series_first as (
    select distinct on (e.listing_series_id) e.listing_series_id, e.id
      from public.events e
     where e.listing_series_id in (select listing_series_id from asked where listing_series_id is not null)
       and e.status = 'published' and e.visibility = 'public'
       and public.event_is_open_night(e.start_date, e.end_date, p_now)
     order by e.listing_series_id, e.start_date, e.id
  )
  select q.id, a.image_url, i.attribution_text, i.licence, i.licence_url, i.author,
         case when i.source_url ~* '^https://' then i.source_url end
    from asked q
    join public.photo_assignments a
      on a.role = 'cover' and a.retired_at is null
     and (a.event_id = q.id
          or (q.listing_series_id is not null and a.listing_series_id = q.listing_series_id
              and exists (select 1 from series_first f where f.listing_series_id = q.listing_series_id and f.id = q.id)))
    join public.venue_images i on i.id = a.venue_image_id
   where i.approval_state = 'approved' and i.verified_depicts_venue and p_use = any (i.permitted_uses)
$$;

revoke all on function public.event_cover_photos_for(uuid[], text, timestamptz) from public;
grant execute on function public.event_cover_photos_for(uuid[], text, timestamptz) to anon, authenticated, service_role;
