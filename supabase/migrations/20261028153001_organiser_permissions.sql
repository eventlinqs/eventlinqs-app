-- THE ORGANISER'S YES (checklist J14 and K4; Lawal's ruling of 28 October 14:37): "Permission is built into organiser
-- acquisition: one partnership message asks for permission once, covering current and future events, and the reply is
-- logged with date and wording."
--
-- Follows 20261028141001_social_campaigns.sql (the asset register, social_assets) and changes none of its grants: the
-- service role still updates an asset's approval columns alone. A logged yes changes an asset's state only inside
-- social_log_organiser_yes, which is the one way a yes is entered.
--
-- THE ORGANISER IS THE HOST'S NAME. Every curated night sits under the one "EventLinqs listings" organisation, and its
-- host is held in events.venue_name, so a yes is matched to a host by that name (case and outer spaces ignored).
--
-- A yes does three things:
--   1. it is kept as said: the date it was given, the organiser's words verbatim, the scope and the channel it came by;
--   2. that host's assets already in the register as a native share (their own post) become organiser authorised,
--      citing the yes, and go back to pending: an approval to share their post is not an approval to use its image,
--      so the founder approves the new use (J12). EventLinqs' own designs are untouched;
--   3. an asset recorded later as organiser authorised for any night the yes covers, with no evidence of its own,
--      takes the yes as its evidence. With no yes it is still refused by social_assets_permission_is_shown.

create table if not exists public.organiser_permissions (
  id uuid primary key default gen_random_uuid(),
  host_name text not null check (length(btrim(host_name)) between 2 and 200),
  -- The date the organiser gave it, not the date it was typed in.
  granted_at timestamptz not null,
  -- Their reply in their own words, as sent.
  wording text not null check (length(btrim(wording)) between 10 and 2000),
  scope text not null check (scope in ('current_and_future', 'this_event')),
  event_id uuid references public.events(id) on delete restrict,
  channel text not null check (channel in ('email', 'instagram', 'facebook', 'website', 'phone', 'in_person')),
  evidence_file text check (evidence_file is null or length(btrim(evidence_file)) > 0),
  logged_by uuid not null references auth.users(id) on delete restrict,
  logged_at timestamptz not null default now(),
  constraint organiser_permissions_scope_has_its_event check (
    (scope = 'this_event' and event_id is not null) or (scope = 'current_and_future' and event_id is null)
  ),
  -- Future nights are covered only when the organiser's own words say so.
  constraint organiser_permissions_future_is_said check (scope <> 'current_and_future' or wording ~* 'future')
);

create index if not exists organiser_permissions_host on public.organiser_permissions (lower(btrim(host_name)));

comment on table public.organiser_permissions is
  'J14, K4: an organiser''s yes to EventLinqs using their promotional material, kept as given: date, verbatim wording, scope (this event, or current and future events) and channel. Entered only through social_log_organiser_yes.';

alter table public.social_assets
  add column if not exists permission_id uuid references public.organiser_permissions(id) on delete restrict;

-- The yes that covers one night now, if any: the newest, of that night's host, for all its nights or for this one.
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
   order by p.granted_at desc, p.logged_at desc
   limit 1
$for$;

create or replace function public.organiser_permission_evidence(p public.organiser_permissions)
returns text
language sql
stable
as $ev$
  select format('"%s" (%s, %s, %s)', btrim(p.wording), p.host_name, to_char(p.granted_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'),
                case p.scope when 'current_and_future' then 'now and for future events' else 'this event' end)
$ev$;

create or replace function public.social_log_organiser_yes(
  p_host text,
  p_granted_at timestamptz,
  p_wording text,
  p_scope text,
  p_channel text,
  p_event uuid,
  p_logged_by uuid,
  p_evidence_file text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $yes$
declare
  v_perm public.organiser_permissions;
begin
  if not exists (select 1 from public.events e where lower(btrim(e.venue_name)) = lower(btrim(p_host))) then
    raise exception 'refused: no night on EventLinqs is hosted by "%".', p_host using errcode = '23514';
  end if;
  if p_event is not null and not exists (
    select 1 from public.events e where e.id = p_event and lower(btrim(e.venue_name)) = lower(btrim(p_host))
  ) then
    raise exception 'refused: that night is not hosted by "%".', p_host using errcode = '23514';
  end if;
  if p_granted_at > now() then
    raise exception 'refused: a yes cannot be dated after it was logged.' using errcode = '23514';
  end if;

  insert into public.organiser_permissions (host_name, granted_at, wording, scope, event_id, channel, evidence_file, logged_by)
  values (btrim(p_host), p_granted_at, p_wording, p_scope, p_event, p_channel, p_evidence_file, p_logged_by)
  returning * into v_perm;

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

  return v_perm.id;
end
$yes$;

-- An organiser-authorised asset entered with no evidence of its own takes the yes that covers its night.
create or replace function public.social_asset_takes_the_yes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $take$
declare
  v_perm public.organiser_permissions;
begin
  if new.asset_state = 'organiser_authorised' and new.event_id is not null
     and length(btrim(coalesce(new.permission_evidence, ''))) = 0 then
    v_perm := public.organiser_permission_for(new.event_id);
    if v_perm.id is not null then
      new.permission_evidence := public.organiser_permission_evidence(v_perm);
      new.permission_id := v_perm.id;
    end if;
  end if;
  return new;
end
$take$;

drop trigger if exists social_assets_take_the_yes on public.social_assets;
create trigger social_assets_take_the_yes
  before insert on public.social_assets
  for each row execute function public.social_asset_takes_the_yes();

alter table public.organiser_permissions enable row level security;
revoke all on public.organiser_permissions from public, anon, authenticated, service_role;
grant select on public.organiser_permissions to service_role;

revoke all on function public.social_log_organiser_yes(text, timestamptz, text, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.social_log_organiser_yes(text, timestamptz, text, text, text, uuid, uuid, text) to service_role;
revoke all on function public.organiser_permission_for(uuid) from public, anon, authenticated;
grant execute on function public.organiser_permission_for(uuid) to service_role;
revoke all on function public.social_asset_takes_the_yes() from public, anon, authenticated;

-- POST-CONDITIONS
do $post$
declare
  v_missing text := '';
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'organiser_permissions' and c.relrowsecurity) then
    v_missing := v_missing || ' organiser_permissions.rls';
  end if;
  if has_table_privilege('service_role', 'public.organiser_permissions', 'INSERT')
     or has_table_privilege('service_role', 'public.organiser_permissions', 'UPDATE')
     or has_table_privilege('service_role', 'public.organiser_permissions', 'DELETE') then
    v_missing := v_missing || ' organiser_permissions.write_by_function_only';
  end if;
  if has_column_privilege('service_role', 'public.social_assets', 'asset_state', 'UPDATE')
     or has_column_privilege('service_role', 'public.social_assets', 'permission_id', 'UPDATE') then
    v_missing := v_missing || ' social_assets.update_columns';
  end if;
  if has_function_privilege('anon', 'public.social_log_organiser_yes(text, timestamptz, text, text, text, uuid, uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.social_log_organiser_yes(text, timestamptz, text, text, text, uuid, uuid, text)', 'EXECUTE') then
    v_missing := v_missing || ' social_log_organiser_yes.execute';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'social_assets_take_the_yes' and not tgisinternal) then
    v_missing := v_missing || ' social_assets_take_the_yes';
  end if;
  if v_missing <> '' then
    raise exception 'organiser permissions post-conditions failed:%', v_missing;
  end if;
end
$post$;
