-- THE ACQUISITION STATE MACHINE (window 6, 30 October 2026; the growth blueprint's "acquisition state machine" and the
-- project manager's ruling 4: "One acquisition state per organiser: DISCOVERED, QUALIFIED, ELIGIBILITY CHECKED, READY,
-- CONTACTED, ENGAGED, CLAIM INVITED, VERIFIED, MEDIA APPROVED, ACTIVE, RECURRING. Plus SUPPRESSED, REJECTED, EXPIRED,
-- DISPUTED and WITHDRAWN. Each transition is written by the system that proves it, never skipped; it maps onto the
-- existing CRM, plays, touches, claims, permissions and organiser funnel." The blueprint: "No record may bypass required
-- verification.").
--
-- THE STATE IS DERIVED FROM PROOF, NEVER TYPED. organiser_acquisition_state_of reads the rows that prove each step and
-- returns the furthest state whose proof holds now; organiser_acquisition_refresh writes it and one transition row when
-- it changes; a trigger refuses any other write to the field. So a state cannot be reached without its own proof row,
-- and an organiser who arrives by another road (a claim with no outreach) moves in one transition that names the claim,
-- never through a CONTACTED nothing proved (the organiser funnel's rule, src/lib/growth/organiser-funnel-math.ts).
--
-- EACH STATE's PROOF:
--   discovered           the organisers row.
--   qualified            a public night starting in the next 90 days at a venue linked to them, or under their account.
--   eligibility_checked  a contact with a whole basis (organiser_contacts.basis other than 'none').
--   ready                such a contact the database does not refuse (outreach_contact_refusal), inside an approved
--                        play's cohort (its organisers, else its cities, else any).
--   contacted            a touch sent to one of their contacts.
--   engaged              a reply: yes, interested, question or later.
--   claim_invited        a listing_claims row for their venue or one of their nights.
--   verified             a verified or manually approved claim, or their own account linked (organisation_id).
--   media_approved       verified, and a yes to their promotional material not withdrawn (organiser_permissions).
--   active               verified, and a public night in the next 90 days.
--   recurring            active, and public nights in two or more Melbourne months of the last and next 90 days.
-- THE SIDE STATES, first match wins:
--   withdrawn            a 'take_down' reply, or every yes they gave withdrawn.
--   disputed             a removal request open on their venue or one of their nights.
--   and only before verified:
--   suppressed           their latest reply is a stop or a bounce, or every email address of theirs unsubscribed.
--   rejected             their latest reply is a no.
--   expired              all three cadence steps sent, no reply, and no claim.
--
-- REFRESHED by triggers on the rows that prove each step: contacts, touches, replies, claims, permissions, removal
-- requests, venue links, unsubscribes, plays and the organiser's own account link. Each refresh inside a trigger is
-- guarded: a fault raises a warning and never blocks the write that fired it, because a stop, a claim or a take down must
-- never fail for the sake of a pipeline field. organiser_acquisition_refresh_all catches anything missed, and the nights
-- that move QUALIFIED, ACTIVE and RECURRING (no trigger is added to events) are caught by it on the hourly run.
--
-- Additive: one column with a default and a check, one new table granted in this migration (the 21 October 2026 grant
-- rule: service_role select only; anon and authenticated nothing), functions, triggers, and a backfill that writes only
-- the new column and the new table. Proved red then green on TEST by scripts/verify/proofs/acquisition-state-proof.sql.

begin;

alter table public.organisers add column if not exists acquisition_state text not null default 'discovered';
alter table public.organisers drop constraint if exists organisers_acquisition_state_known;
alter table public.organisers add constraint organisers_acquisition_state_known check (acquisition_state in (
  'discovered', 'qualified', 'eligibility_checked', 'ready', 'contacted', 'engaged', 'claim_invited', 'verified',
  'media_approved', 'active', 'recurring', 'suppressed', 'rejected', 'expired', 'disputed', 'withdrawn'));

create table if not exists public.organiser_acquisition_transitions (
  id bigint generated always as identity primary key,
  organiser_id uuid not null references public.organisers (id) on delete cascade,
  from_state text,
  to_state text not null,
  proved_by text not null check (length(btrim(proved_by)) between 3 and 80),
  proof_id text check (proof_id is null or length(proof_id) <= 80),
  at timestamptz not null default now(),
  constraint organiser_acquisition_transitions_known check (
    (from_state is null or from_state in ('discovered', 'qualified', 'eligibility_checked', 'ready', 'contacted', 'engaged',
      'claim_invited', 'verified', 'media_approved', 'active', 'recurring', 'suppressed', 'rejected', 'expired', 'disputed', 'withdrawn'))
    and to_state in ('discovered', 'qualified', 'eligibility_checked', 'ready', 'contacted', 'engaged', 'claim_invited',
      'verified', 'media_approved', 'active', 'recurring', 'suppressed', 'rejected', 'expired', 'disputed', 'withdrawn')
    and from_state is distinct from to_state)
);
create index if not exists organiser_acquisition_transitions_by_organiser on public.organiser_acquisition_transitions (organiser_id, at);

alter table public.organiser_acquisition_transitions enable row level security;
revoke all on public.organiser_acquisition_transitions from anon, authenticated, service_role;
grant select on public.organiser_acquisition_transitions to service_role;

comment on table public.organiser_acquisition_transitions is
  'Growth blueprint ruling 4: every change of an organiser''s acquisition_state, the table whose row proved it and that row''s id. Written only by organiser_acquisition_refresh. Service role reads only.';
comment on column public.organisers.acquisition_state is
  'Growth blueprint ruling 4: the furthest acquisition state whose proof holds now (organiser_acquisition_state_of). Written only by organiser_acquisition_refresh.';

-- ---------------------------------------------------------------------------------------------------------------------
-- The state, read from proof.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.organiser_acquisition_state_of(p_organiser uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $state$
declare
  o public.organisers;
  v_venues uuid[];
  v_nights uuid[];
  v_contacts uuid[];
  v_latest text;
  v_verified boolean;
  v_ahead boolean;
begin
  select * into o from public.organisers where id = p_organiser;
  if o.id is null then
    return null;
  end if;
  select coalesce(array_agg(ov.venue_id), '{}') into v_venues
    from public.organiser_venues ov join public.venues v on v.id = ov.venue_id
   where ov.organiser_id = o.id and v.removed_at is null;
  select coalesce(array_agg(e.id), '{}') into v_nights
    from public.events e
   where e.venue_id = any (v_venues) or (o.organisation_id is not null and e.organisation_id = o.organisation_id);
  select coalesce(array_agg(c.id), '{}') into v_contacts from public.organiser_contacts c where c.organiser_id = o.id;
  select r.outcome into v_latest from public.outreach_replies r where r.contact_id = any (v_contacts) order by r.received_at desc, r.id desc limit 1;

  -- WITHDRAWN: a take down asked for, or every yes they gave withdrawn.
  if exists (select 1 from public.outreach_replies r where r.contact_id = any (v_contacts) and r.outcome = 'take_down')
     or (exists (select 1 from public.organiser_permissions p
                  where (o.organisation_id is not null and p.organisation_id = o.organisation_id) or p.event_id = any (v_nights)
                     or p.claim_id in (select lc.id from public.listing_claims lc where lc.venue_id = any (v_venues) or lc.event_id = any (v_nights)))
         and not exists (select 1 from public.organiser_permissions p
                  where p.withdrawn_at is null
                    and ((o.organisation_id is not null and p.organisation_id = o.organisation_id) or p.event_id = any (v_nights)
                     or p.claim_id in (select lc.id from public.listing_claims lc where lc.venue_id = any (v_venues) or lc.event_id = any (v_nights))))) then
    return 'withdrawn';
  end if;
  -- DISPUTED: a removal request open on their venue or one of their nights.
  if exists (select 1 from public.removal_requests rr where rr.status = 'open' and (rr.venue_id = any (v_venues) or rr.event_id = any (v_nights))) then
    return 'disputed';
  end if;

  v_verified := o.organisation_id is not null
    or exists (select 1 from public.listing_claims lc where lc.status in ('verified', 'manual_approved') and (lc.venue_id = any (v_venues) or lc.event_id = any (v_nights)));

  if not v_verified then
    if v_latest in ('stop', 'bounce')
       or (exists (select 1 from public.organiser_contacts c where c.organiser_id = o.id and c.channel = 'email')
           and not exists (select 1 from public.organiser_contacts c where c.organiser_id = o.id and c.channel = 'email'
                            and not exists (select 1 from public.outreach_unsubscribes u where u.email = c.address))) then
      return 'suppressed';
    end if;
    if v_latest = 'no' then
      return 'rejected';
    end if;
    if v_latest is null
       and (select count(distinct t.step) from public.outreach_touches t where t.contact_id = any (v_contacts) and t.state = 'sent' and t.purpose = 'cadence') >= 3
       and not exists (select 1 from public.listing_claims lc where lc.venue_id = any (v_venues) or lc.event_id = any (v_nights)) then
      return 'expired';
    end if;
  end if;

  v_ahead := exists (select 1 from public.events e
                      where e.id = any (v_nights) and e.status = 'published' and e.visibility = 'public'
                        and e.start_date >= now() and e.start_date <= now() + interval '90 days'
                        and (e.listing_fresh_until is null or e.listing_fresh_until >= now()));

  if v_verified then
    if v_ahead and (select count(distinct date_trunc('month', e.start_date at time zone 'Australia/Melbourne'))
                      from public.events e
                     where e.id = any (v_nights) and e.status = 'published' and e.visibility = 'public'
                       and e.start_date >= now() - interval '90 days' and e.start_date <= now() + interval '90 days') >= 2 then
      return 'recurring';
    end if;
    if v_ahead then
      return 'active';
    end if;
    if exists (select 1 from public.organiser_permissions p
                where p.withdrawn_at is null
                  and ((o.organisation_id is not null and p.organisation_id = o.organisation_id) or p.event_id = any (v_nights)
                   or p.claim_id in (select lc.id from public.listing_claims lc where lc.venue_id = any (v_venues) or lc.event_id = any (v_nights)))) then
      return 'media_approved';
    end if;
    return 'verified';
  end if;
  if exists (select 1 from public.listing_claims lc where lc.venue_id = any (v_venues) or lc.event_id = any (v_nights)) then
    return 'claim_invited';
  end if;
  if exists (select 1 from public.outreach_replies r where r.contact_id = any (v_contacts) and r.outcome in ('yes', 'interested', 'question', 'later')) then
    return 'engaged';
  end if;
  if exists (select 1 from public.outreach_touches t where t.contact_id = any (v_contacts) and t.state = 'sent') then
    return 'contacted';
  end if;
  if exists (select 1 from public.organiser_contacts c
              where c.organiser_id = o.id and c.channel = 'email' and c.basis <> 'none' and public.outreach_contact_refusal(c.id) is null)
     and exists (select 1 from public.outreach_plays pl
                  where pl.state = 'approved'
                    and (case
                           when jsonb_typeof(pl.cohort_rule -> 'organisers') = 'array' and jsonb_array_length(pl.cohort_rule -> 'organisers') > 0
                             then (pl.cohort_rule -> 'organisers') ? o.id::text
                           when jsonb_typeof(pl.cohort_rule -> 'cities') = 'array' and jsonb_array_length(pl.cohort_rule -> 'cities') > 0
                             then exists (select 1 from public.venues v where v.id = any (v_venues) and (pl.cohort_rule -> 'cities') ? v.city_slug)
                           else true
                         end)) then
    return 'ready';
  end if;
  if exists (select 1 from public.organiser_contacts c where c.organiser_id = o.id and c.basis <> 'none') then
    return 'eligibility_checked';
  end if;
  if v_ahead then
    return 'qualified';
  end if;
  return 'discovered';
end
$state$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The one writer of the field and the log.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.organiser_acquisition_refresh(p_organiser uuid, p_proved_by text, p_proof text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $refresh$
declare
  v_old text;
  v_new text;
begin
  select acquisition_state into v_old from public.organisers where id = p_organiser for update;
  if not found then
    return null;
  end if;
  v_new := public.organiser_acquisition_state_of(p_organiser);
  if v_new is distinct from v_old then
    perform set_config('eventlinqs.acquisition_refresh', 'on', true);
    update public.organisers set acquisition_state = v_new where id = p_organiser;
    perform set_config('eventlinqs.acquisition_refresh', 'off', true);
    insert into public.organiser_acquisition_transitions (organiser_id, from_state, to_state, proved_by, proof_id)
      values (p_organiser, v_old, v_new, p_proved_by, left(p_proof, 80));
  end if;
  return v_new;
end
$refresh$;

create or replace function public.organiser_acquisition_refresh_all(p_proved_by text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $all$
declare
  r record;
  v_before text;
  v_changed integer := 0;
begin
  for r in select id, acquisition_state from public.organisers order by id loop
    v_before := r.acquisition_state;
    if public.organiser_acquisition_refresh(r.id, p_proved_by, null) is distinct from v_before then
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
end
$all$;

-- A refresh inside a trigger never blocks the write that fired it.
create or replace function public.organiser_acquisition_refresh_quietly(p_organiser uuid, p_proved_by text, p_proof text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $quiet$
begin
  perform public.organiser_acquisition_refresh(p_organiser, p_proved_by, p_proof);
exception when others then
  raise warning 'organiser_acquisition_refresh(%) from % % did not run: %', p_organiser, p_proved_by, p_proof, sqlerrm;
end
$quiet$;

-- The organisers a venue, a night or an account belongs to.
create or replace function public.organisers_of(p_venue uuid, p_event uuid, p_organisation uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $of$
  select ov.organiser_id from public.organiser_venues ov where ov.venue_id = p_venue
  union
  select ov.organiser_id from public.events e join public.organiser_venues ov on ov.venue_id = e.venue_id where e.id = p_event
  union
  select o.id from public.organisers o where p_organisation is not null and o.organisation_id = p_organisation
  union
  select o.id from public.events e join public.organisers o on o.organisation_id = e.organisation_id where e.id = p_event
$of$;

revoke all on function public.organiser_acquisition_state_of(uuid) from public, anon, authenticated;
revoke all on function public.organiser_acquisition_refresh(uuid, text, text) from public, anon, authenticated;
revoke all on function public.organiser_acquisition_refresh_all(text) from public, anon, authenticated;
revoke all on function public.organiser_acquisition_refresh_quietly(uuid, text, text) from public, anon, authenticated;
revoke all on function public.organisers_of(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.organiser_acquisition_state_of(uuid) to service_role;
grant execute on function public.organiser_acquisition_refresh_all(text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- No other writer: the field moves only through the refresh; a new organiser starts DISCOVERED and says so in the log.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.organiser_acquisition_state_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $guard$
begin
  if tg_op = 'INSERT' then
    if new.acquisition_state <> 'discovered' then
      raise exception 'refused: an organiser starts discovered; its acquisition state moves only on proof.' using errcode = '42501';
    end if;
  elsif new.acquisition_state is distinct from old.acquisition_state
        and coalesce(current_setting('eventlinqs.acquisition_refresh', true), 'off') <> 'on' then
    raise exception 'refused: acquisition_state is written only by organiser_acquisition_refresh, from the row that proves it.' using errcode = '42501';
  end if;
  return new;
end
$guard$;
drop trigger if exists organisers_acquisition_state_guard on public.organisers;
create trigger organisers_acquisition_state_guard before insert or update of acquisition_state on public.organisers
  for each row execute function public.organiser_acquisition_state_guard();

create or replace function public.organiser_acquisition_on_organiser()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $on_org$
begin
  if tg_op = 'INSERT' then
    insert into public.organiser_acquisition_transitions (organiser_id, from_state, to_state, proved_by, proof_id)
      values (new.id, null, 'discovered', 'organisers', new.id::text);
  end if;
  perform public.organiser_acquisition_refresh_quietly(new.id, 'organisers', new.id::text);
  return null;
end
$on_org$;
drop trigger if exists organisers_acquisition_on_insert on public.organisers;
create trigger organisers_acquisition_on_insert after insert on public.organisers
  for each row execute function public.organiser_acquisition_on_organiser();
drop trigger if exists organisers_acquisition_on_account on public.organisers;
create trigger organisers_acquisition_on_account after update of organisation_id on public.organisers
  for each row when (new.organisation_id is distinct from old.organisation_id)
  execute function public.organiser_acquisition_on_organiser();

-- ---------------------------------------------------------------------------------------------------------------------
-- The rows that prove each step refresh their organiser.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.organiser_acquisition_on_proof()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $on_proof$
declare
  r record;
  v_org uuid;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  -- Each branch reads only the columns its own table has: a record's field is resolved when the line runs.
  if tg_table_name = 'organiser_contacts' then
    perform public.organiser_acquisition_refresh_quietly(r.organiser_id, tg_table_name, r.id::text);
  elsif tg_table_name = 'organiser_venues' then
    perform public.organiser_acquisition_refresh_quietly(r.organiser_id, tg_table_name, r.venue_id::text);
  elsif tg_table_name in ('outreach_touches', 'outreach_replies') then
    select c.organiser_id into v_org from public.organiser_contacts c where c.id = r.contact_id;
    if v_org is not null then
      perform public.organiser_acquisition_refresh_quietly(v_org, tg_table_name, r.id::text);
    end if;
  elsif tg_table_name in ('listing_claims', 'removal_requests') then
    for v_org in select * from public.organisers_of(r.venue_id, r.event_id, null) loop
      perform public.organiser_acquisition_refresh_quietly(v_org, tg_table_name, r.id::text);
    end loop;
  elsif tg_table_name = 'organiser_permissions' then
    for v_org in select * from public.organisers_of(
                   (select lc.venue_id from public.listing_claims lc where lc.id = r.claim_id), r.event_id, r.organisation_id) loop
      perform public.organiser_acquisition_refresh_quietly(v_org, tg_table_name, r.id::text);
    end loop;
  elsif tg_table_name = 'outreach_unsubscribes' then
    for v_org in select distinct c.organiser_id from public.organiser_contacts c where c.channel = 'email' and c.address = r.email loop
      perform public.organiser_acquisition_refresh_quietly(v_org, tg_table_name, r.id::text);
    end loop;
  end if;
  return null;
exception when others then
  raise warning 'organiser_acquisition_on_proof on % did not run: %', tg_table_name, sqlerrm;
  return null;
end
$on_proof$;

drop trigger if exists organiser_contacts_acquisition on public.organiser_contacts;
create trigger organiser_contacts_acquisition after insert or update on public.organiser_contacts
  for each row execute function public.organiser_acquisition_on_proof();
drop trigger if exists organiser_venues_acquisition on public.organiser_venues;
create trigger organiser_venues_acquisition after insert or delete on public.organiser_venues
  for each row execute function public.organiser_acquisition_on_proof();
drop trigger if exists outreach_touches_acquisition on public.outreach_touches;
create trigger outreach_touches_acquisition after insert or update of state on public.outreach_touches
  for each row execute function public.organiser_acquisition_on_proof();
drop trigger if exists outreach_replies_acquisition on public.outreach_replies;
create trigger outreach_replies_acquisition after insert on public.outreach_replies
  for each row execute function public.organiser_acquisition_on_proof();
drop trigger if exists listing_claims_acquisition on public.listing_claims;
create trigger listing_claims_acquisition after insert or update of status on public.listing_claims
  for each row execute function public.organiser_acquisition_on_proof();
drop trigger if exists removal_requests_acquisition on public.removal_requests;
create trigger removal_requests_acquisition after insert or update of status on public.removal_requests
  for each row execute function public.organiser_acquisition_on_proof();
drop trigger if exists organiser_permissions_acquisition on public.organiser_permissions;
create trigger organiser_permissions_acquisition after insert or update of withdrawn_at on public.organiser_permissions
  for each row execute function public.organiser_acquisition_on_proof();
drop trigger if exists outreach_unsubscribes_acquisition on public.outreach_unsubscribes;
create trigger outreach_unsubscribes_acquisition after insert on public.outreach_unsubscribes
  for each row execute function public.organiser_acquisition_on_proof();

-- A play approved, paused or ended moves READY for its whole cohort.
create or replace function public.organiser_acquisition_on_play()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $on_play$
declare
  v_org uuid;
begin
  for v_org in select id from public.organisers order by id loop
    perform public.organiser_acquisition_refresh_quietly(v_org, 'outreach_plays', new.id::text);
  end loop;
  return null;
exception when others then
  raise warning 'organiser_acquisition_on_play did not run: %', sqlerrm;
  return null;
end
$on_play$;
drop trigger if exists outreach_plays_acquisition on public.outreach_plays;
create trigger outreach_plays_acquisition after update of state on public.outreach_plays
  for each row when (new.state is distinct from old.state)
  execute function public.organiser_acquisition_on_play();

revoke all on function public.organiser_acquisition_on_organiser() from public, anon, authenticated;
revoke all on function public.organiser_acquisition_on_proof() from public, anon, authenticated;
revoke all on function public.organiser_acquisition_on_play() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Backfill: every organiser held now starts DISCOVERED in the log, then moves once to what its proof says.
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.organiser_acquisition_transitions (organiser_id, from_state, to_state, proved_by, proof_id)
  select o.id, null, 'discovered', 'organisers', o.id::text
    from public.organisers o
   where not exists (select 1 from public.organiser_acquisition_transitions t where t.organiser_id = o.id);
select public.organiser_acquisition_refresh_all('20261030034001 backfill');

commit;
