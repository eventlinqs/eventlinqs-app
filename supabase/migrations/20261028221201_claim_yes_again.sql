-- THE YES GIVEN AFTER THE CLAIM (the engine plan of 28 October 2026, part D; the final directive, section 15:
-- "Grant clearly scoped promotional permission ... Withdraw or update permissions"). Follows
-- 20261028220201_claim_acceptance.sql, already on TEST, so it is its own file rather than an edit of that one.
--
-- An organiser who claimed without ticking the permission, or who withdrew it, gives it from their own page with the
-- same two ticks. organiser_permission_give writes a new yes citing their verified claim, only for a member of the
-- organisation the claim moved the listing to, and only while no current yes stands for that claim. So a claim holds
-- at most one CURRENT yes, and its withdrawn ones stay as history: the unique claim_id of 220201 becomes unique among
-- current rows.
--
-- The host's own posts registered as a native share take the yes as listing_claim_check's does; that step is now one
-- function, organiser_yes_takes_native_shares, called by both, so the rule is said once.
--
-- Reversal: drop organiser_permission_give and the index, re-add the unique constraint (only if no claim holds two
-- rows), and re-create listing_claim_check from 220201.

alter table public.organiser_permissions drop constraint if exists organiser_permissions_claim_id_key;
create unique index if not exists organiser_permissions_one_current_per_claim
  on public.organiser_permissions (claim_id) where claim_id is not null and withdrawn_at is null;

-- As social_log_organiser_yes (153001): the host's own posts already registered as a native share become organiser
-- authorised under the yes and go back to pending, so a person approves the new use.
create or replace function public.organiser_yes_takes_native_shares(v_perm public.organiser_permissions)
returns void
language sql
security definer
set search_path = public, pg_temp
as $takes$
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
     and a.asset_state = 'native_share'
$takes$;

-- The claim's check (220201), its native share step now the shared function.
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

  if c.permission_words is not null and length(btrim(coalesce(v_host, ''))) >= 2 then
    insert into public.organiser_permissions
      (host_name, granted_at, wording, scope, event_id, channel, logged_by, claim_id, organisation_id)
    values
      (btrim(v_host), least(c.permission_given_at, p_at), c.permission_words, c.permission_scope,
       case when c.permission_scope = 'this_event' then c.event_id end, 'claim', c.claimant_user_id, c.id, p_organisation)
    returning * into v_perm;
    perform public.organiser_yes_takes_native_shares(v_perm);
  end if;
  return 'verified';
end;
$check$;

create or replace function public.organiser_permission_give(p_user uuid, p_claim uuid, p_words text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $give$
declare
  c public.listing_claims%rowtype;
  v_host text;
  v_perm public.organiser_permissions;
begin
  select * into c from public.listing_claims where id = p_claim;
  if not found or c.status not in ('verified', 'manual_approved') or not exists (
    select 1 from public.organisation_members m where m.organisation_id = c.target_organisation_id and m.user_id = p_user
  ) then
    raise exception 'refused: that listing is not yours.' using errcode = '23514';
  end if;
  if exists (select 1 from public.organiser_permissions p where p.claim_id = p_claim and p.withdrawn_at is null) then
    raise exception 'refused: your permission is already on record.' using errcode = '23514';
  end if;
  if c.venue_id is not null then
    select v.name into v_host from public.venues v where v.id = c.venue_id;
  else
    select e.venue_name into v_host from public.events e where e.id = c.event_id;
  end if;
  if length(btrim(coalesce(v_host, ''))) < 2 then
    raise exception 'refused: that listing has no host name to give the permission for.' using errcode = '23514';
  end if;

  -- now and for future events, as the words say (organiser_permissions_future_is_said refuses words that do not)
  insert into public.organiser_permissions
    (host_name, granted_at, wording, scope, event_id, channel, logged_by, claim_id, organisation_id)
  values
    (btrim(v_host), now(), p_words, 'current_and_future', null, 'claim', p_user, p_claim, c.target_organisation_id)
  returning * into v_perm;
  perform public.organiser_yes_takes_native_shares(v_perm);
  return v_perm.id;
end
$give$;

do $grants$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.organiser_yes_takes_native_shares(public.organiser_permissions)',
    'public.organiser_permission_give(uuid, uuid, text)',
    'public.listing_claim_check(uuid, text, uuid, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;

-- POST-CONDITIONS
do $post$
declare
  v_missing text := '';
begin
  if exists (select 1 from pg_constraint where conname = 'organiser_permissions_claim_id_key') then
    v_missing := v_missing || ' claim_id.still_unique_for_all';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'organiser_permissions_one_current_per_claim') then
    v_missing := v_missing || ' one_current_per_claim';
  end if;
  if has_function_privilege('authenticated', 'public.organiser_permission_give(uuid, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.organiser_permission_give(uuid, uuid, text)', 'EXECUTE') then
    v_missing := v_missing || ' organiser_permission_give.execute';
  end if;
  if v_missing <> '' then
    raise exception 'claim yes again post-conditions failed:%', v_missing;
  end if;
end
$post$;
