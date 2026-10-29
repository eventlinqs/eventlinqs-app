-- EVERY EVENT IMAGE CARRIES ITS PROVENANCE AND RIGHTS STATE (Lawal's master mandate of 29 October 2026, section 5:
-- "Implement a media-provenance and rights-status field for each image"; the project manager's 21:42 (R1)).
--
-- One row per image a night shows, its cover and each gallery image, in public.event_image_rights. The rows are
-- DERIVED by the database from where the image came from, on every write that could change the answer, so no writer
-- can skip them or set them by hand:
--   an image that is a recorded social_assets row for that night, approved, current and unexpired, takes that row's
--     state (organiser_authorised or separately_licensed, the register's own words) and names the row;
--   our typographic cover (the generated-covers folder) is original_design;
--   an EventLinqs library photograph (event-images/stock) is platform_library: it is not of this night;
--   an upload by a member of the night's own organisation who is not platform staff is organiser_authorised;
--   anything else is unrecorded: the source is not on record, and it is never guessed.
-- A separate table rather than columns on events, so that the backfill and every later derivation write nothing to
-- events (whose set_updated_at and notification triggers would otherwise fire for every night).
--
-- Additive: one new table, three functions, two triggers, the backfill. Nothing existing is altered.
-- Proved on TEST by scripts/verify/event-image-rights-proof.sql (red without this file, green with it), rolled back.

create table if not exists public.event_image_rights (
  event_id uuid not null references public.events (id) on delete cascade,
  image_url text not null check (length(btrim(image_url)) > 0),
  image_role text not null check (image_role in ('cover', 'gallery')),
  rights_state text not null check (rights_state in ('organiser_authorised', 'separately_licensed', 'original_design', 'platform_library', 'unrecorded')),
  provenance text not null check (length(btrim(provenance)) between 2 and 300),
  social_asset_id uuid references public.social_assets (id) on delete set null,
  rights_expire_at timestamptz,
  derived_at timestamptz not null default now(),
  primary key (event_id, image_role, image_url)
);

comment on table public.event_image_rights is
  'One row per image a night shows (its cover, each gallery image), with where it came from and its rights state. Written only by public.derive_event_image_rights; never by hand.';
comment on column public.event_image_rights.rights_state is
  'organiser_authorised or separately_licensed (the asset register''s states), original_design (our typographic cover), platform_library (a library photograph, not of this night), unrecorded (the source is not on record).';

alter table public.event_image_rights enable row level security;
-- The founder's screens and the jobs read it through the service role; no signed-in or signed-out visitor reads it.
revoke all on table public.event_image_rights from anon, authenticated, service_role;
grant select on table public.event_image_rights to service_role;

-- What one image of one night is, by the rules above.
create or replace function public.event_image_right(p_event uuid, p_org uuid, p_url text, p_at timestamptz)
returns table (rights_state text, provenance text, social_asset_id uuid, rights_expire_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset record;
  v_uploader uuid;
begin
  select a.id, a.asset_state, a.rights_holder, a.expires_at
    into v_asset
    from public.social_assets a
   where a.event_id = p_event
     and a.asset_url = p_url
     and a.approval_status = 'approved'
     and a.withdrawal_status = 'current'
     and a.asset_state in ('organiser_authorised', 'separately_licensed')
     and (a.expires_at is null or a.expires_at > p_at)
   order by a.created_at desc
   limit 1;
  if found then
    return query select v_asset.asset_state::text,
      format('asset register row %s, rights holder %s', v_asset.id, v_asset.rights_holder),
      v_asset.id, v_asset.expires_at;
    return;
  end if;

  if p_url ~ '/generated-covers/' then
    return query select 'original_design'::text, 'EventLinqs typographic cover drawn from the listing''s own facts'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if p_url ~ '/event-images/stock/' then
    return query select 'platform_library'::text, 'EventLinqs library photograph; it is not of this night'::text, null::uuid, null::timestamptz;
    return;
  end if;

  -- An organiser's own upload: event-images/<uploader>/<event>/<file>, by a member of the night's organisation who is
  -- not platform staff (staff uploading on someone's behalf leaves the rights unrecorded until the register holds them).
  begin
    v_uploader := (regexp_match(p_url, '/event-images/([0-9a-f-]{36})/'))[1]::uuid;
  exception when others then
    v_uploader := null;
  end;
  if v_uploader is not null
     and p_org is not null
     and not exists (select 1 from public.admin_users s where s.id = v_uploader)
     and (exists (select 1 from public.organisation_members m where m.organisation_id = p_org and m.user_id = v_uploader)
          or exists (select 1 from public.organisations o where o.id = p_org and o.owner_id = v_uploader)) then
    return query select 'organiser_authorised'::text, format('uploaded by the organiser''s own account %s', v_uploader), null::uuid, null::timestamptz;
    return;
  end if;

  return query select 'unrecorded'::text, 'source not on record; to be verified before it is used anywhere else'::text, null::uuid, null::timestamptz;
end;
$$;

-- Re-derive every image row of one night from what it shows now.
create or replace function public.derive_event_image_rights(p_event uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_event record;
  v_url text;
begin
  select e.id, e.organisation_id, e.cover_image_url, e.gallery_urls into v_event from public.events e where e.id = p_event;
  delete from public.event_image_rights r where r.event_id = p_event;
  if v_event.id is null then
    return;
  end if;

  if nullif(btrim(coalesce(v_event.cover_image_url, '')), '') is not null then
    insert into public.event_image_rights (event_id, image_url, image_role, rights_state, provenance, social_asset_id, rights_expire_at)
    select p_event, v_event.cover_image_url, 'cover', r.rights_state, r.provenance, r.social_asset_id, r.rights_expire_at
      from public.event_image_right(p_event, v_event.organisation_id, v_event.cover_image_url, now()) r;
  end if;

  if jsonb_typeof(v_event.gallery_urls) = 'array' then
    for v_url in
      select distinct coalesce(case when jsonb_typeof(g) = 'string' then g #>> '{}' end, g ->> 'url')
        from jsonb_array_elements(v_event.gallery_urls) g
    loop
      if nullif(btrim(coalesce(v_url, '')), '') is not null then
        insert into public.event_image_rights (event_id, image_url, image_role, rights_state, provenance, social_asset_id, rights_expire_at)
        select p_event, v_url, 'gallery', r.rights_state, r.provenance, r.social_asset_id, r.rights_expire_at
          from public.event_image_right(p_event, v_event.organisation_id, v_url, now()) r;
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.event_image_right(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.derive_event_image_rights(uuid) from public, anon, authenticated;
grant execute on function public.derive_event_image_rights(uuid) to service_role;

-- A night's images change: its rows follow.
create or replace function public.trg_event_image_rights_follow_the_night()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.derive_event_image_rights(new.id);
  return null;
end;
$$;

drop trigger if exists event_image_rights_follow_the_night on public.events;
create trigger event_image_rights_follow_the_night
  after insert or update of cover_image_url, gallery_urls, organisation_id on public.events
  for each row execute function public.trg_event_image_rights_follow_the_night();

-- A register row is approved, withdrawn, replaced or re-pointed: the night it names follows (and the night it left).
create or replace function public.trg_event_image_rights_follow_the_register()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.event_id is not null then
    perform public.derive_event_image_rights(new.event_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.event_id is not null and (tg_op = 'DELETE' or old.event_id is distinct from new.event_id) then
    perform public.derive_event_image_rights(old.event_id);
  end if;
  return null;
end;
$$;

drop trigger if exists event_image_rights_follow_the_register on public.social_assets;
create trigger event_image_rights_follow_the_register
  after insert or update of approval_status, withdrawal_status, asset_state, asset_url, event_id, expires_at or delete on public.social_assets
  for each row execute function public.trg_event_image_rights_follow_the_register();

revoke all on function public.trg_event_image_rights_follow_the_night() from public, anon, authenticated;
revoke all on function public.trg_event_image_rights_follow_the_register() from public, anon, authenticated;

-- The backfill: every night that shows an image today. Writes only the new table.
do $backfill$
declare
  v_id uuid;
begin
  for v_id in
    select e.id from public.events e
     where e.cover_image_url is not null
        or (jsonb_typeof(e.gallery_urls) = 'array' and jsonb_array_length(e.gallery_urls) > 0)
  loop
    perform public.derive_event_image_rights(v_id);
  end loop;
end
$backfill$;
