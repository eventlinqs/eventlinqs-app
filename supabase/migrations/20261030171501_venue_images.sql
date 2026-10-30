-- THE VENUE MEDIA MODEL: A GALLERY OF APPROVED PHOTOGRAPHS OF THE ACTUAL VENUE (the project manager's 16:42 of
-- 30 October 2026, decided with Lawal at 16:41: venue-first real photography).
--
-- The image chain for every event card and event page is (1) the organiser's approved photo of the night, (2) an
-- approved photo of THE ACTUAL VENUE from a source we have the right to show, (3) the honest fallback. This file is
-- (2): public.venue_images, one row per photograph of one venue, with where it came from, its licence, the credit the
-- licence asks for, what it may be used for, whether someone has checked it shows this venue, its quality, and its
-- approval. Lawal approves a photograph ONCE and it serves every night at that venue.
--
-- THE DATABASE REFUSES, so no screen or script can skip it:
--   an approval without a verified depiction of the venue, without an approver, or by someone who is not staff;
--   a Creative Commons photograph without its author, its licence link and a credit naming the author;
--   a venue's or organiser's own photograph without their yes in their own words;
--   a photograph from the EventLinqs stock library (it is never of this venue);
--   a second primary photograph for one venue.
-- A challenge or a withdrawal stops the photograph serving at once (it is no longer approved, and loses primary).
--
-- Nobody reads the table but the service role. Every visitor reads only through public.venue_photo_for(venue, use),
-- which answers the one photograph that may be shown for that use, or nothing.
--
-- The writers below (add, replace, challenge, withdraw for a claimed venue's people; approve for staff) are the only
-- way a screen changes a row, each a definer function the service role alone may call.
--
-- Additive: one new table, the guard trigger, the public read and six writer functions. Nothing existing is altered. Proved on TEST by
-- scripts/verify/venue-images-proof.sql through scripts/verify/replay-under-new-default.mjs (red without this file,
-- green with it), rolled back. Applying it to production is Lawal's.

create table if not exists public.venue_images (
  id uuid primary key default gen_random_uuid(),
  -- Null only for a harvested candidate not yet matched to one of our venues (the PM's 16:52, F: never auto-linked
  -- below both thresholds).
  venue_id uuid references public.venues (id) on delete cascade,
  -- The stored photograph we serve: our own bucket or the licensed source, never the stock library.
  image_url text not null check (image_url ~* '^https://[^[:space:]]+$'),
  source text not null check (source in ('venue', 'organiser', 'wikimedia_commons', 'licensed', 'commissioned', 'google_places')),
  -- Where it came from: the Commons file page, the licensor's page, or the email that carried the venue's yes.
  source_url text not null check (source_url ~* '^https://[^[:space:]]+$' or source_url ~* '^mailto:[^[:space:]]+$'),
  -- The PM's 16:52 (C): CC0, public domain, CC BY and CC BY-SA, any version; never NC, ND, fair use or unknown.
  licence text not null check (licence in ('owner_permission', 'cc0', 'public_domain', 'cc_by', 'cc_by_sa', 'commissioned', 'licensed', 'google_places_terms')),
  licence_url text check (licence_url is null or licence_url ~* '^https://[^[:space:]]+$'),
  author text check (author is null or length(btrim(author)) between 2 and 200),
  attribution_text text not null check (length(btrim(attribution_text)) between 2 and 200),
  permitted_uses text[] not null check (
    cardinality(permitted_uses) >= 1 and permitted_uses <@ array['event_card', 'event_page', 'venue_page', 'social']::text[]
  ),
  restrictions text check (restrictions is null or length(btrim(restrictions)) > 0),
  -- The yes, in the words of the venue or organiser who sent it.
  permission_evidence text,
  verified_depicts_venue boolean not null default false,
  verified_by uuid references auth.users (id) on delete restrict,
  verified_at timestamptz,
  quality_score smallint check (quality_score is null or quality_score between 0 and 100),
  -- candidate: harvested, waiting to be matched or reviewed; pending: sent by a venue or matched, waiting for staff.
  approval_state text not null default 'pending' check (approval_state in ('candidate', 'pending', 'approved', 'refused', 'challenged', 'withdrawn')),
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  is_primary boolean not null default false,
  challenge_reason text,
  challenged_by uuid references auth.users (id) on delete set null,
  challenged_at timestamptz,
  withdrawn_at timestamptz,
  replaced_by uuid references public.venue_images (id) on delete set null,
  submitted_by uuid references auth.users (id) on delete set null,
  -- The harvest (the PM's 16:52, A to F): the Wikidata item, the Commons file page, where it was taken, its size, and how
  -- it was matched to the venue.
  wikidata_id text check (wikidata_id is null or wikidata_id ~ '^Q[0-9]+$'),
  commons_file text check (commons_file is null or length(btrim(commons_file)) between 6 and 300),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  match_method text check (match_method is null or match_method in ('auto', 'review', 'manual')),
  match_distance_m numeric check (match_distance_m is null or match_distance_m >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint venue_images_never_the_library check (image_url !~ '/storage/v1/object/public/event-images/stock/'),
  constraint venue_images_verification_is_whole check (
    verified_depicts_venue = (verified_by is not null and verified_at is not null)
  ),
  -- Approved only once someone has checked it shows this venue, with an approver, a time and a quality score.
  constraint venue_images_approval_is_earned check (
    approval_state <> 'approved'
    or (verified_depicts_venue and approved_by is not null and approved_at is not null and quality_score is not null)
  ),
  constraint venue_images_waiting_is_unapproved check (
    approval_state not in ('candidate', 'pending') or (approved_by is null and approved_at is null)
  ),
  -- Only a harvested candidate may wait unmatched; anything sent, approved, challenged or withdrawn is of one venue.
  constraint venue_images_linked_unless_candidate check (venue_id is not null or approval_state in ('candidate', 'refused')),
  -- The PM's 16:52 (D): a Commons photograph 1200 pixels wide or more, its size on record.
  constraint venue_images_commons_is_large check (source <> 'wikimedia_commons' or (width >= 1200 and height is not null)),
  -- Creative Commons: the author, the licence link, and a credit that names the author.
  constraint venue_images_commons_is_credited check (
    licence not in ('cc_by', 'cc_by_sa')
    or (author is not null and licence_url is not null and strpos(lower(attribution_text), lower(btrim(author))) > 0)
  ),
  -- A venue's or organiser's own photograph: their yes, in their own words.
  constraint venue_images_owner_said_yes check (
    licence <> 'owner_permission' or length(btrim(coalesce(permission_evidence, ''))) >= 10
  ),
  constraint venue_images_challenge_is_explained check (
    approval_state <> 'challenged' or (length(btrim(coalesce(challenge_reason, ''))) >= 5 and challenged_at is not null)
  ),
  constraint venue_images_withdrawal_is_dated check (approval_state <> 'withdrawn' or withdrawn_at is not null),
  constraint venue_images_primary_is_approved check (not is_primary or approval_state = 'approved')
);

create unique index if not exists venue_images_once on public.venue_images (image_url, coalesce(venue_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists venue_images_candidates on public.venue_images (wikidata_id) where approval_state = 'candidate';
create unique index if not exists venue_images_one_primary on public.venue_images (venue_id) where is_primary;
create index if not exists venue_images_serving on public.venue_images (venue_id) where approval_state = 'approved';

comment on table public.venue_images is
  'Photographs of the actual venue, each with its source, licence, credit, permitted uses, a verified depiction, a quality score and an approval. Read by visitors only through public.venue_photo_for.';

alter table public.venue_images enable row level security;
-- The 21 October 2026 grant rule: the service role (the founder's screens, the claim flow's server, the jobs)
-- reads and writes it; no signed-in or signed-out visitor reaches the table itself.
revoke all on table public.venue_images from anon, authenticated, service_role;
grant select, insert, update, delete on table public.venue_images to service_role;

-- Staff only may verify or approve; a photograph that stops being approved stops being primary; updated_at follows.
create or replace function public.venue_images_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.verified_by is not null
     and (tg_op = 'INSERT' or new.verified_by is distinct from old.verified_by)
     and not exists (select 1 from public.admin_users a where a.id = new.verified_by) then
    raise exception 'venue_images: only staff may verify that a photograph shows the venue';
  end if;
  if new.approved_by is not null
     and (tg_op = 'INSERT' or new.approved_by is distinct from old.approved_by)
     and not exists (select 1 from public.admin_users a where a.id = new.approved_by) then
    raise exception 'venue_images: only staff may approve a venue photograph';
  end if;
  if new.approval_state <> 'approved' then
    new.is_primary := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.venue_images_guard() from public, anon, authenticated;

-- UPDATE OF the columns it judges, never challenged_by, replaced_by or submitted_by: those are `on delete set null`,
-- and a row the database rewrites when an account or a photograph goes is not an edit to judge
-- (scripts/guards/a-referential-null-is-not-an-edit.mjs).
drop trigger if exists venue_images_guard on public.venue_images;
create trigger venue_images_guard
  before insert or update of venue_id, image_url, source, licence, attribution_text, permitted_uses, verified_depicts_venue,
    verified_by, verified_at, quality_score, approval_state, approved_by, approved_at, is_primary, challenge_reason,
    challenged_at, withdrawn_at, restrictions
  on public.venue_images
  for each row execute function public.venue_images_guard();

-- The one photograph of a venue that may be shown for a use, or nothing: approved and verified, the use permitted,
-- the primary first, then the best quality, then the newest.
create or replace function public.venue_photo_for(p_venue uuid, p_use text)
returns table (image_url text, attribution_text text, licence text, licence_url text, author text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.image_url, i.attribution_text, i.licence, i.licence_url, i.author
    from public.venue_images i
   where i.venue_id = p_venue
     and i.approval_state = 'approved'
     and i.verified_depicts_venue
     and p_use = any (i.permitted_uses)
   order by i.is_primary desc, i.quality_score desc nulls last, i.approved_at desc
   limit 1
$$;

revoke all on function public.venue_photo_for(uuid, text) from public;
grant execute on function public.venue_photo_for(uuid, text) to anon, authenticated, service_role;

-- THE WRITERS (the claim flow's server and the founder's screen, through the service role only). Each refuses in its
-- own words, raised as 'refused: ...' with 23514, which the server shows as it stands.
--
-- Who may act for a venue: the people of the organisation that holds it once it is claimed (listing_source
-- 'organiser'), its owner, admins and managers, the rule the venues table's own policy already uses.
create or replace function public.venue_image_manager(p_user uuid, p_venue uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.venues v
     where v.id = p_venue
       and v.listing_source = 'organiser'
       and (exists (select 1 from public.organisations o where o.id = v.organisation_id and o.owner_id = p_user)
            or exists (select 1 from public.organisation_members m
                        where m.organisation_id = v.organisation_id and m.user_id = p_user and m.role in ('owner', 'admin', 'manager')))
  )
$$;

-- A venue sends its own photograph, with its yes in its own words: kept PENDING until staff check it and approve it.
create or replace function public.venue_image_add(
  p_user uuid, p_venue uuid, p_image_url text, p_source_url text, p_permission_words text, p_attribution text, p_uses text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.venue_image_manager(p_user, p_venue) then
    raise exception 'refused: only the people of a claimed venue may add its photographs' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_permission_words, ''))) < 10 then
    raise exception 'refused: say yes in your own words, so we can show these photographs' using errcode = '23514';
  end if;
  insert into public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, permission_evidence, submitted_by)
  values (p_venue, p_image_url, 'venue', p_source_url, 'owner_permission', coalesce(nullif(btrim(p_attribution), ''), 'Photo supplied by the venue'),
          coalesce(p_uses, array['event_card', 'event_page', 'venue_page']), btrim(p_permission_words), p_user)
  returning id into v_id;
  return v_id;
end;
$$;

-- A venue replaces one of its photographs: the new one is kept PENDING and named as the replacement; the old one keeps
-- serving until the new one is approved, and is withdrawn by that approval.
create or replace function public.venue_image_replace(p_user uuid, p_image uuid, p_image_url text, p_source_url text, p_permission_words text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.venue_images;
  v_id uuid;
begin
  select * into v_old from public.venue_images where id = p_image;
  if v_old.id is null or not public.venue_image_manager(p_user, v_old.venue_id) then
    raise exception 'refused: only the people of a claimed venue may replace its photographs' using errcode = '23514';
  end if;
  if v_old.approval_state = 'withdrawn' then
    raise exception 'refused: that photograph is already withdrawn; add a new one instead' using errcode = '23514';
  end if;
  v_id := public.venue_image_add(p_user, v_old.venue_id, p_image_url, p_source_url, p_permission_words, v_old.attribution_text, v_old.permitted_uses);
  update public.venue_images set replaced_by = v_id where id = p_image;
  return v_id;
end;
$$;

-- A venue, or an organiser with nights there, says a photograph is wrong: it stops serving at once, until staff look.
create or replace function public.venue_image_challenge(p_user uuid, p_image uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.venue_images where id = p_image;
  if v_venue is null
     or not (public.venue_image_manager(p_user, v_venue)
             or exists (select 1 from public.events e
                          join public.organisations o on o.id = e.organisation_id
                          left join public.organisation_members m on m.organisation_id = o.id and m.user_id = p_user
                         where e.venue_id = v_venue and (o.owner_id = p_user or m.user_id is not null))) then
    raise exception 'refused: only the venue, or an organiser with nights there, may challenge its photographs' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'refused: say what is wrong with the photograph' using errcode = '23514';
  end if;
  update public.venue_images
     set approval_state = 'challenged', challenge_reason = btrim(p_reason), challenged_by = p_user, challenged_at = now()
   where id = p_image and approval_state <> 'withdrawn';
end;
$$;

-- A venue withdraws one of its photographs: it stops serving at once.
create or replace function public.venue_image_withdraw(p_user uuid, p_image uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.venue_images where id = p_image;
  if v_venue is null or not public.venue_image_manager(p_user, v_venue) then
    raise exception 'refused: only the people of a claimed venue may withdraw its photographs' using errcode = '23514';
  end if;
  update public.venue_images set approval_state = 'withdrawn', withdrawn_at = now() where id = p_image;
end;
$$;

-- Lawal approves a photograph ONCE: staff check it shows the venue, give it a quality score, and it serves every night
-- there. Made primary on request (the old primary steps down); a replacement's approval withdraws what it replaces.
create or replace function public.venue_image_approve(p_admin uuid, p_image uuid, p_quality smallint, p_primary boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_img public.venue_images;
begin
  select * into v_img from public.venue_images where id = p_image;
  if v_img.id is null then
    raise exception 'refused: no such photograph' using errcode = '23514';
  end if;
  if v_img.approval_state = 'withdrawn' then
    raise exception 'refused: that photograph was withdrawn' using errcode = '23514';
  end if;
  if v_img.venue_id is null then
    raise exception 'refused: match the photograph to one of our venues first' using errcode = '23514';
  end if;
  if p_primary then
    update public.venue_images set is_primary = false where venue_id = v_img.venue_id and is_primary and id <> p_image;
  end if;
  update public.venue_images
     set verified_depicts_venue = true, verified_by = p_admin, verified_at = now(),
         approval_state = 'approved', approved_by = p_admin, approved_at = now(),
         quality_score = p_quality, is_primary = coalesce(p_primary, false),
         challenge_reason = null, challenged_by = null, challenged_at = null
   where id = p_image;
  update public.venue_images set approval_state = 'withdrawn', withdrawn_at = now()
   where replaced_by = p_image and approval_state <> 'withdrawn';
end;
$$;

-- Staff match a harvested candidate to one of our venues by hand (a 'review' match, the PM's 16:52 F): it is then of
-- that venue and still waits for approval.
create or replace function public.venue_image_link(p_admin uuid, p_image uuid, p_venue uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.admin_users a where a.id = p_admin) then
    raise exception 'refused: only staff may match a photograph to a venue' using errcode = '23514';
  end if;
  if not exists (select 1 from public.venues v where v.id = p_venue) then
    raise exception 'refused: no such venue' using errcode = '23514';
  end if;
  update public.venue_images set venue_id = p_venue, match_method = 'manual'
   where id = p_image and approval_state = 'candidate';
  if not found then
    raise exception 'refused: only a waiting candidate can be matched' using errcode = '23514';
  end if;
end;
$$;

-- Staff refuse a photograph, with the reason kept: it never serves.
create or replace function public.venue_image_refuse(p_admin uuid, p_image uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.admin_users a where a.id = p_admin) then
    raise exception 'refused: only staff may refuse a venue photograph' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'refused: say why it is refused' using errcode = '23514';
  end if;
  update public.venue_images
     set approval_state = 'refused', is_primary = false, restrictions = coalesce(restrictions || ' | ', '') || 'Refused: ' || btrim(p_reason)
   where id = p_image and approval_state in ('candidate', 'pending', 'challenged');
  if not found then
    raise exception 'refused: only a waiting or challenged photograph can be refused' using errcode = '23514';
  end if;
end;
$$;

-- Lawal's queue (the PM's 16:52, G): every photograph matched to a venue and waiting for a person, with its venue.
create or replace function public.venue_photo_queue()
returns table (
  id uuid, venue_id uuid, venue_name text, venue_city text, image_url text, source text, source_url text, licence text,
  attribution_text text, quality_score smallint, width integer, height integer, match_method text, match_distance_m numeric,
  permission_evidence text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.venue_id, v.name, v.city, i.image_url, i.source, i.source_url, i.licence, i.attribution_text, i.quality_score,
         i.width, i.height, i.match_method, i.match_distance_m, i.permission_evidence
    from public.venue_images i
    join public.venues v on v.id = i.venue_id
   where i.approval_state in ('candidate', 'pending')
   order by v.name, i.created_at
   limit 2000
$$;

-- How many harvested candidates match none of our venues yet.
create or replace function public.venue_photo_unmatched_count()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) from public.venue_images where approval_state = 'candidate' and venue_id is null
$$;

revoke all on function public.venue_image_refuse(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.venue_photo_queue() from public, anon, authenticated;
revoke all on function public.venue_photo_unmatched_count() from public, anon, authenticated;
grant execute on function public.venue_image_refuse(uuid, uuid, text) to service_role;
grant execute on function public.venue_photo_queue() to service_role;
grant execute on function public.venue_photo_unmatched_count() to service_role;
revoke all on function public.venue_image_link(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.venue_image_link(uuid, uuid, uuid) to service_role;
revoke all on function public.venue_image_manager(uuid, uuid) from public, anon, authenticated;
revoke all on function public.venue_image_add(uuid, uuid, text, text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.venue_image_replace(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.venue_image_challenge(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.venue_image_withdraw(uuid, uuid) from public, anon, authenticated;
revoke all on function public.venue_image_approve(uuid, uuid, smallint, boolean) from public, anon, authenticated;
grant execute on function public.venue_image_add(uuid, uuid, text, text, text, text, text[]) to service_role;
grant execute on function public.venue_image_replace(uuid, uuid, text, text, text) to service_role;
grant execute on function public.venue_image_challenge(uuid, uuid, text) to service_role;
grant execute on function public.venue_image_withdraw(uuid, uuid) to service_role;
grant execute on function public.venue_image_approve(uuid, uuid, smallint, boolean) to service_role;
