-- EVERY ORGANISATION HAS ITS ORGANISER (WINDOW 3's question of 1 November 2026 12:12, answered by WINDOW 1 at 12:30;
-- V3 items 2, 3 and 6). public.organisers is the acquisition spine: the funnel (item 3) and ticketing_activations
-- (20261101060001, organiser_id required) both count organisers. It held only the hosts EventLinqs found and contacted,
-- so an organisation that signed up on its own was counted nowhere and its activation steps could not be recorded.
--
-- NOTHING IS INVENTED. The row is proved by the organisation row itself: organisation_id names it, its name is the
-- organisation's own name, created_by is the account that owns it, and the acquisition state is derived from that link
-- by organiser_acquisition_refresh like every other ('their own account linked', 20261030034001). found_on stays null:
-- it holds the public page a host was found on, and a sign up was found on none.
--
-- A NAME ALREADY HELD BY A FOUND HOST IS NEVER LINKED BY NAME. organisers.name_key is unique, and an organisation named
-- like a host we found may be that host or may not; linking them by name would hand a stranger the found host's record
-- without the claim flow's proof of ownership. So no row is written for it here: it stays countable as an organisation
-- without an organiser, and the claim flow (listing_claims, WINDOW 3) is the one path that links the two.
--
-- It never blocks a sign up: a row it cannot write (a name that collides, or one outside the organisers name check) is
-- left unwritten, and the organisation is created as before.

-- One writer, the trigger itself (a function that returns trigger is not callable through the API, so no new callable
-- object reaches the generated types). It writes nothing when the organisation already has its organiser.
create or replace function public.organisation_created_gets_its_organiser()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $trg$
declare
  v_id uuid;
begin
  if exists (select 1 from public.organisers where organisation_id = new.id) then
    return new;
  end if;
  if length(btrim(coalesce(new.name, ''))) not between 2 and 200 then
    return new;
  end if;
  insert into public.organisers (name, organisation_id, created_by, notes)
  values (btrim(new.name), new.id, new.owner_id, 'Signed up on EventLinqs: proved by its organisations row.')
  on conflict do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.organiser_acquisition_refresh_quietly(v_id, 'organisations', new.id::text);
  end if;
  return new;
end
$trg$;

revoke all on function public.organisation_created_gets_its_organiser() from public, anon, authenticated;

drop trigger if exists trg_organisation_gets_its_organiser on public.organisations;
create trigger trg_organisation_gets_its_organiser
  after insert on public.organisations
  for each row execute function public.organisation_created_gets_its_organiser();

-- Once, for every organisation that already exists without one, by the same rules; each new row's state is derived.
do $backfill$
declare
  r record;
begin
  for r in
    insert into public.organisers (name, organisation_id, created_by, notes)
    select btrim(o.name), o.id, o.owner_id, 'Signed up on EventLinqs: proved by its organisations row.'
      from public.organisations o
     where not exists (select 1 from public.organisers g where g.organisation_id = o.id)
       and length(btrim(coalesce(o.name, ''))) between 2 and 200
     order by o.created_at, o.id
    on conflict do nothing
    returning id, organisation_id
  loop
    perform public.organiser_acquisition_refresh_quietly(r.id, 'organisations', r.organisation_id::text);
  end loop;
end
$backfill$;

do $post$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_organisation_gets_its_organiser') then
    raise exception 'trg_organisation_gets_its_organiser is missing';
  end if;
end
$post$;
