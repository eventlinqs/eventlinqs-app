-- THE CLAIM AS ACCEPTANCE (the EventLinqs engine plan of 28 October 2026, part D, window 2; Lawal's final directive of
-- 28 October 19:52, sections 8, 15 and 16): "the CLAIM writes the permission; organiser self-service add, replace,
-- withdraw".
--
-- Follows 20261028153001_organiser_permissions.sql (window 6: the organiser's yes, kept as given) and
-- 20261028205501_social_media_rights.sql (window 3: the media-rights record on social_assets, original_file,
-- received_on, permitted_uses, withdrawal_status, withdrawn_at, withdrawal_reason, replaced_by, and the rule that
-- nothing withdrawn or replaced is usable). Changes neither file; stamped after window 6's 20261028213001 too.
--
-- 1. THE CLAIM CARRIES THE YES. listing_claims keeps the claimant's two ticks, set beside the code (the project
--    manager's claim page words): the permission line's exact words (PERMISSION_WORDS, a constant), its scope, when it
--    was given, and that they confirmed they can give it. listing_claim_check, on the right code and in the same transaction as the move, writes the yes
--    into organiser_permissions (channel 'claim', citing the claim). A wrong code, an expired or locked claim, or a
--    claim with no tick writes none. The listing is claimed either way: a factual listing never waits for a permission.
-- 2. A YES CAN BE WITHDRAWN. organiser_permissions gains withdrawn_at and withdrawn_reason, written only by
--    organiser_permission_withdraw; organiser_permission_for never returns a withdrawn yes, so nothing new takes it.
--    The yes stays keyed by its host's name (window 6's 20:05: every curated night shares one organisation, so an
--    organisation cannot name a host); organisation_id here says only whose account may withdraw it.
-- 3. THE ORGANISER'S OWN IMAGES. Four definer functions, the service role alone may call them, each checking that the
--    user belongs to the night's organisation (organisation_members) before anything changes:
--      organiser_media_add        an image for one of their nights, organiser authorised and PENDING (a person
--                                 approves its use, J12), with the yes that covers the night as its evidence;
--      organiser_media_replace    a new image in place of one of theirs, the old one marked replaced;
--      organiser_media_withdraw   one image withdrawn, with their reason;
--      organiser_permission_withdraw  the yes withdrawn and every current image under it with it.
--    A withdrawn or replaced image is never usable again (social_asset_usable, 201001), and window 3's hourly sweep
--    takes it out of every unposted piece; posted pieces are not touched. Each answers the storage paths of the files
--    in the organiser-media bucket it took out of use, so the caller removes them. Their media-rights record is
--    whole: the original file as uploaded, received today, and the uses the yes gives (window 3's trigger
--    social_assets_whole_from_the_yes writes those words from the yes).
-- 4. The organiser's regular nights: organiser_series_keep keeps a series listing itself or pauses it (the claim
--    page's "Keep listing these automatically", on by default).
-- 5. A public bucket, organiser-media: an approved image must be readable by the slide renderer at a stable address,
--    as the platform's event images are; nothing in it is used until a person approves its row, and a withdrawal
--    removes the file.
--
-- Refusals are raised with errcode 23514 and the words "refused: ...", shown to the organiser as said.
--
-- Reversal: drop the four functions and the bucket's empty rows; re-create listing_claim_check and
-- organiser_permission_for from 20261027150001 and 20261028153001; the added columns are nullable and may stay.

-- ---------------------------------------------------------------------------
-- 1. The tick on the claim
-- ---------------------------------------------------------------------------
alter table public.listing_claims
  add column if not exists permission_words text,
  add column if not exists permission_scope text,
  add column if not exists permission_given_at timestamptz,
  add column if not exists permission_authority boolean;

alter table public.listing_claims drop constraint if exists listing_claims_yes_is_whole;
alter table public.listing_claims add constraint listing_claims_yes_is_whole check (
  (permission_words is null and permission_scope is null and permission_given_at is null and permission_authority is null)
  or (length(btrim(permission_words)) between 20 and 600
      and permission_scope in ('current_and_future', 'this_event')
      and permission_given_at is not null
      and permission_authority)
);
-- A venue has no one night to scope a yes to; future nights are covered only when the words say so.
alter table public.listing_claims drop constraint if exists listing_claims_yes_fits;
alter table public.listing_claims add constraint listing_claims_yes_fits check (
  permission_scope is null
  or (permission_scope = 'current_and_future' and permission_words ~* 'future')
  or (permission_scope = 'this_event' and event_id is not null and permission_words !~* 'future')
);

-- ---------------------------------------------------------------------------
-- 2. The yes: from a claim, and withdrawn
-- ---------------------------------------------------------------------------
alter table public.organiser_permissions
  add column if not exists claim_id uuid unique references public.listing_claims(id) on delete restrict,
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_reason text;

alter table public.organiser_permissions drop constraint if exists organiser_permissions_channel_check;
alter table public.organiser_permissions add constraint organiser_permissions_channel_check
  check (channel in ('email', 'instagram', 'facebook', 'website', 'phone', 'in_person', 'claim'));
alter table public.organiser_permissions drop constraint if exists organiser_permissions_claim_is_cited;
alter table public.organiser_permissions add constraint organiser_permissions_claim_is_cited
  check ((channel = 'claim') = (claim_id is not null));
alter table public.organiser_permissions drop constraint if exists organiser_permissions_withdrawal_is_whole;
alter table public.organiser_permissions add constraint organiser_permissions_withdrawal_is_whole
  check ((withdrawn_at is null) = (withdrawn_reason is null)
         and (withdrawn_reason is null or length(btrim(withdrawn_reason)) between 3 and 500));

comment on table public.organiser_permissions is
  'J14, K4, part D: an organiser''s yes to EventLinqs using their promotional material, kept as given: date, verbatim wording, scope (this event, or current and future events) and channel. Entered only through social_log_organiser_yes or a verified claim (listing_claim_check); withdrawn only through organiser_permission_withdraw.';

-- window 6's function with one line added: a withdrawn yes covers nothing.
create or replace function public.organiser_permission_for(p_event uuid)
returns public.organiser_permissions
language sql
stable
security definer
set search_path = public, pg_temp
as $for$
  select p.*
    from public.organiser_permissions p
    join public.events e on e.id = p_event
   where lower(btrim(p.host_name)) = lower(btrim(e.venue_name))
     and (p.scope = 'current_and_future' or p.event_id = p_event)
     and p.withdrawn_at is null
   order by p.granted_at desc, p.logged_at desc
   limit 1
$for$;

-- The claim's check (20261027150001), unchanged but for the yes written on the right code.
create or replace function public.listing_claim_check(p_claim uuid, p_code_hash text, p_organisation uuid, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $check$
declare
  c public.listing_claims%rowtype;
  v_host text;
  v_perm public.organiser_permissions;
begin
  select * into c from public.listing_claims where id = p_claim for update;
  if not found then
    return 'no_claim';
  end if;
  if c.status <> 'sent' then
    return c.status;
  end if;
  if p_at >= c.expires_at then
    update public.listing_claims set status = 'expired' where id = p_claim;
    return 'expired';
  end if;
  if c.code_hash is distinct from p_code_hash then
    update public.listing_claims set attempts = attempts + 1 where id = p_claim returning * into c;
    if c.attempts >= 5 then
      update public.listing_claims set status = 'locked' where id = p_claim;
      return 'locked';
    end if;
    return 'wrong';
  end if;
  -- The right code, and nowhere named to move the listing to: nothing changes, so the caller makes the claimant's
  -- organisation once, only now it is needed, and tries again.
  if p_organisation is null then
    return 'needs_organisation';
  end if;

  if c.venue_id is not null then
    update public.venues
       set organisation_id = p_organisation, listing_source = 'organiser', claimed_at = p_at
     where id = c.venue_id;
    update public.event_series
       set organisation_id = p_organisation, listing_source = 'organiser'
     where venue_id = c.venue_id;
    update public.events e
       set organisation_id = p_organisation
      from public.event_series s
     where s.venue_id = c.venue_id and e.listing_series_id = s.id and e.start_date >= p_at;
    select v.name into v_host from public.venues v where v.id = c.venue_id;
  else
    update public.events set organisation_id = p_organisation, listing_source = 'organiser' where id = c.event_id;
    select e.venue_name into v_host from public.events e where e.id = c.event_id;
  end if;

  update public.listing_claims
     set status = 'verified', verified_at = p_at, target_organisation_id = p_organisation
   where id = p_claim;

  -- THE CLAIM WRITES THE PERMISSION: the yes ticked on the claim, kept as given, now that the code proved the claimant.
  if c.permission_words is not null and length(btrim(coalesce(v_host, ''))) >= 2 then
    insert into public.organiser_permissions
      (host_name, granted_at, wording, scope, event_id, channel, logged_by, claim_id, organisation_id)
    values
      (btrim(v_host), least(c.permission_given_at, p_at), c.permission_words, c.permission_scope,
       case when c.permission_scope = 'this_event' then c.event_id end, 'claim', c.claimant_user_id, c.id, p_organisation)
    returning * into v_perm;

    -- As social_log_organiser_yes (153001): the host's own posts already registered as a native share become organiser
    -- authorised under the yes and go back to pending, so a person approves the new use.
    update public.social_assets a
       set asset_state = 'organiser_authorised',
           permission_evidence = public.organiser_permission_evidence(v_perm),
           permission_id = v_perm.id,
           approval_status = 'pending',
           approved_by = null,
           approved_at = null
      from public.events e
     where e.id = a.event_id
       and lower(btrim(e.venue_name)) = lower(btrim(v_perm.host_name))
       and (v_perm.scope = 'current_and_future' or a.event_id = v_perm.event_id)
       and a.asset_state = 'native_share';
  end if;
  return 'verified';
end;
$check$;

revoke all on function public.listing_claim_check(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.listing_claim_check(uuid, text, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The organiser's own images
-- ---------------------------------------------------------------------------

-- True when the user belongs to the organisation the night is run by now.
create or replace function public.organiser_runs_night(p_user uuid, p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $runs$
  select exists (
    select 1
      from public.events e
      join public.organisation_members m on m.organisation_id = e.organisation_id
     where e.id = p_event and m.user_id = p_user
  )
$runs$;

-- The storage path of an image in the organiser-media bucket; null for any other address (never removed by us).
create or replace function public.organiser_media_path(p_url text)
returns text
language sql
immutable
as $path$
  select substring(p_url from '/storage/v1/object/public/organiser-media/(.+)$')
$path$;

create or replace function public.organiser_media_add(
  p_user uuid,
  p_event uuid,
  p_asset_url text,
  p_original_name text,
  p_kind text,
  p_attribution text,
  p_restrictions text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $add$
declare
  v_perm public.organiser_permissions;
  v_holder text;
  v_id uuid;
begin
  if not public.organiser_runs_night(p_user, p_event) then
    raise exception 'refused: you do not run this night.' using errcode = '23514';
  end if;
  v_perm := public.organiser_permission_for(p_event);
  if v_perm.id is null then
    raise exception 'refused: there is no permission on record for this night. Give it on your listing first.' using errcode = '23514';
  end if;
  if public.organiser_media_path(p_asset_url) is null then
    raise exception 'refused: the image was not stored by EventLinqs.' using errcode = '23514';
  end if;
  if p_kind not in ('photo', 'artwork') then
    raise exception 'refused: an image is a photo or artwork.' using errcode = '23514';
  end if;
  select o.name into v_holder from public.events e join public.organisations o on o.id = e.organisation_id where e.id = p_event;

  insert into public.social_assets
    (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, permission_id,
     attribution_text, scope, restrictions, created_by, original_file, received_on)
  values
    ('organiser_authorised', p_kind, p_event, p_asset_url, p_asset_url, v_holder,
     public.organiser_permission_evidence(v_perm), v_perm.id,
     coalesce(nullif(btrim(p_attribution), ''), case p_kind when 'photo' then 'Photo: ' else 'Artwork: ' end || v_holder),
     'both', nullif(btrim(p_restrictions), ''), p_user, nullif(btrim(p_original_name), ''), (now() at time zone 'Australia/Melbourne')::date)
  returning id into v_id;
  return v_id;
end
$add$;

create or replace function public.organiser_media_replace(p_user uuid, p_asset uuid, p_asset_url text, p_original_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $replace$
declare
  v_old public.social_assets;
  v_perm public.organiser_permissions;
  v_id uuid;
begin
  select * into v_old from public.social_assets where id = p_asset for update;
  if not found or v_old.event_id is null or not public.organiser_runs_night(p_user, v_old.event_id) then
    raise exception 'refused: that image is not yours.' using errcode = '23514';
  end if;
  if v_old.withdrawal_status <> 'current' then
    raise exception 'refused: that image has already been withdrawn or replaced.' using errcode = '23514';
  end if;
  v_perm := public.organiser_permission_for(v_old.event_id);
  if v_perm.id is null then
    raise exception 'refused: there is no permission on record for this night. Give it on your listing first.' using errcode = '23514';
  end if;
  if public.organiser_media_path(p_asset_url) is null then
    raise exception 'refused: the image was not stored by EventLinqs.' using errcode = '23514';
  end if;

  insert into public.social_assets
    (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, permission_id,
     attribution_text, scope, restrictions, expires_at, created_by, original_file, received_on)
  values
    ('organiser_authorised', v_old.asset_type, v_old.event_id, p_asset_url, p_asset_url, v_old.rights_holder,
     public.organiser_permission_evidence(v_perm), v_perm.id, v_old.attribution_text, v_old.scope, v_old.restrictions,
     v_old.expires_at, p_user, nullif(btrim(p_original_name), ''), (now() at time zone 'Australia/Melbourne')::date)
  returning id into v_id;

  update public.social_assets
     set withdrawal_status = 'replaced', replaced_by = v_id, withdrawn_at = now(), withdrawal_reason = 'Replaced by the organiser'
   where id = p_asset;
  return jsonb_build_object('id', v_id, 'old_path', public.organiser_media_path(v_old.asset_url));
end
$replace$;

create or replace function public.organiser_media_withdraw(p_user uuid, p_asset uuid, p_reason text)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $withdraw$
declare
  v_old public.social_assets;
begin
  select * into v_old from public.social_assets where id = p_asset for update;
  if not found or v_old.event_id is null or v_old.asset_state <> 'organiser_authorised'
     or not public.organiser_runs_night(p_user, v_old.event_id) then
    raise exception 'refused: that image is not yours.' using errcode = '23514';
  end if;
  if v_old.withdrawal_status <> 'current' then
    raise exception 'refused: that image has already been withdrawn or replaced.' using errcode = '23514';
  end if;
  update public.social_assets
     set withdrawal_status = 'withdrawn', withdrawn_at = now(), withdrawal_reason = btrim(p_reason)
   where id = p_asset;
  return array_remove(array[public.organiser_media_path(v_old.asset_url)], null);
end
$withdraw$;

create or replace function public.organiser_permission_withdraw(p_user uuid, p_permission uuid, p_reason text)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $withdraw_yes$
declare
  v_perm public.organiser_permissions;
  v_paths text[];
begin
  select * into v_perm from public.organiser_permissions where id = p_permission for update;
  if not found or v_perm.organisation_id is null or not exists (
    select 1 from public.organisation_members m where m.organisation_id = v_perm.organisation_id and m.user_id = p_user
  ) then
    raise exception 'refused: that permission is not yours to withdraw.' using errcode = '23514';
  end if;
  if v_perm.withdrawn_at is not null then
    raise exception 'refused: that permission was already withdrawn.' using errcode = '23514';
  end if;

  update public.organiser_permissions set withdrawn_at = now(), withdrawn_reason = btrim(p_reason) where id = p_permission;

  with gone as (
    update public.social_assets
       set withdrawal_status = 'withdrawn', withdrawn_at = now(), withdrawal_reason = btrim(p_reason)
     where permission_id = p_permission and withdrawal_status = 'current'
    returning asset_url
  )
  select coalesce(array_agg(public.organiser_media_path(asset_url)) filter (where public.organiser_media_path(asset_url) is not null), '{}')
    into v_paths
    from gone;
  return v_paths;
end
$withdraw_yes$;

-- "Your regular nights: each series with 'Keep listing these automatically' on by default" (the project manager's claim
-- page words, C:\dev\START-16OCT\EVENTLINQS-ORGANISER-MESSAGES-28OCT.md section 6): the organiser keeps a series
-- listing itself (active) or pauses it. A removed series stays removed; only its own organisation may change it.
create or replace function public.organiser_series_keep(p_user uuid, p_series uuid, p_keep boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $keep$
declare
  v_series public.event_series;
begin
  select * into v_series from public.event_series where id = p_series for update;
  if not found or not exists (
    select 1 from public.organisation_members m where m.organisation_id = v_series.organisation_id and m.user_id = p_user
  ) then
    raise exception 'refused: those nights are not yours.' using errcode = '23514';
  end if;
  if v_series.status = 'removed' then
    raise exception 'refused: those nights were taken down. Ask us to list them again.' using errcode = '23514';
  end if;
  update public.event_series set status = case when p_keep then 'active' else 'paused' end where id = p_series;
  return case when p_keep then 'active' else 'paused' end;
end
$keep$;

do $grants$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.organiser_runs_night(uuid, uuid)',
    'public.organiser_media_add(uuid, uuid, text, text, text, text, text)',
    'public.organiser_media_replace(uuid, uuid, text, text)',
    'public.organiser_media_withdraw(uuid, uuid, text)',
    'public.organiser_permission_withdraw(uuid, uuid, text)',
    'public.organiser_series_keep(uuid, uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------------------
-- 5. The bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organiser-media', 'organiser-media', true, 10485760, array['image/webp', 'image/avif', 'image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_fn text;
begin
  if has_table_privilege('service_role', 'public.organiser_permissions', 'UPDATE')
     or has_table_privilege('service_role', 'public.organiser_permissions', 'INSERT') then
    v_missing := v_missing || ' organiser_permissions.write_by_function_only';
  end if;
  foreach v_fn in array array[
    'public.organiser_media_add(uuid, uuid, text, text, text, text, text)',
    'public.organiser_media_replace(uuid, uuid, text, text)',
    'public.organiser_media_withdraw(uuid, uuid, text)',
    'public.organiser_permission_withdraw(uuid, uuid, text)',
    'public.organiser_series_keep(uuid, uuid, boolean)',
    'public.listing_claim_check(uuid, text, uuid, timestamptz)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      v_missing := v_missing || ' ' || v_fn || '.execute';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      v_missing := v_missing || ' ' || v_fn || '.service_role';
    end if;
  end loop;
  if not exists (select 1 from storage.buckets where id = 'organiser-media') then
    v_missing := v_missing || ' bucket.organiser-media';
  end if;
  if v_missing <> '' then
    raise exception 'claim acceptance post-conditions failed:%', v_missing;
  end if;
end
$post$;
