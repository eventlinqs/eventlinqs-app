-- ============================================================================
-- WI3: ONE EVENT, EVERY PLACE IT SELLS (the project manager's 12:30 of 27 October
-- 2026, on Lawal's 12:23: one event is often sold on two, three or more
-- platforms at once, "He wants to sell tickets. That's all that matters to him").
--
-- 1. event_booking_links: each place an event is booked or seen, one row each:
--    provider, url, kind, availability, the lowest price including fees with the
--    moment it was checked, whether it is the organiser's own choice, who set
--    it, whether the organiser's own website or Instagram points to it, and its
--    place in the list. The kinds are Bandsintown's own set ("the only ticket
--    type options available are Tickets, Presale, VIP, Free and Sold Out",
--    https://help.artists.bandsintown.com/en/articles/2580594-how-do-i-add-multiple-ticket-links-to-an-event,
--    read 27 October 2026), with Free read as free with registration. The price
--    is Google's: "The lowest available price available for your tickets,
--    including service charges and fees"
--    (https://developers.google.com/search/docs/appearance/structured-data/event,
--    "Last updated 2026-09-08 UTC", read 27 October 2026).
-- 2. THE ONE BUTTON, event_booking_button(event): never a dead link; then the
--    organiser's own choice once claimed; then the link the organiser's own
--    website or Instagram points to; then on sale over not yet over sold out;
--    then the first found. Never by what pays EventLinqs.
-- 3. events.external_ticket_url becomes the button's mirror, kept by the
--    database from the links, so every reader that already refuses a checkout
--    on it (the sale gate, the reservation guard, the fee, the visibility
--    filters, the short link and attribution) reads one source. A direct write
--    of the column (an older path, an ops fixture) is turned into the
--    organiser's own link, or, written null, takes every link away, so the two
--    can never disagree.
-- 4. Every existing external_ticket_url becomes that event's organiser's own
--    primary link.
--
-- GRANTS (the 21 October 2026 rule): revoke all, then anon and authenticated
-- read the links of a published public or unlisted event, and the service role
-- reads and writes (the import, the daily link check, the claim's server
-- action). Nobody signed in writes the table directly.
--
-- REVERSIBLE? It adds a table, three functions and three triggers. A revert
-- drops them; external_ticket_url keeps the last value the mirror wrote.
-- ============================================================================

create table if not exists public.event_booking_links (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  provider          text not null,
  url               text not null,
  kind              text not null default 'tickets',
  availability      text not null default 'on_sale',
  price_from_cents  integer,
  price_checked_at  timestamptz,
  is_primary        boolean not null default false,
  set_by            text not null,
  pointed_to_by_organiser boolean not null default false,
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint event_booking_links_provider check (provider in (
    'humanitix', 'eventbrite', 'trybooking', 'moshtix', 'oztix', 'ticketek', 'ticketmaster', 'dice',
    'venue', 'organiser_site', 'other')),
  constraint event_booking_links_https_only check (url ~* '^https://[^[:space:]]+$'),
  constraint event_booking_links_kind check (kind in ('tickets', 'presale', 'vip', 'free_register', 'sold_out')),
  constraint event_booking_links_availability check (availability in ('on_sale', 'not_yet', 'sold_out', 'dead')),
  constraint event_booking_links_price check (price_from_cents is null or price_from_cents >= 0),
  constraint event_booking_links_price_with_its_check check ((price_from_cents is null) = (price_checked_at is null)),
  constraint event_booking_links_set_by check (set_by in ('organiser', 'curated')),
  constraint event_booking_links_primary_is_the_organisers check (not is_primary or set_by = 'organiser'),
  constraint event_booking_links_position check (position >= 0),
  constraint event_booking_links_once unique (event_id, url)
);

create unique index if not exists event_booking_links_one_primary
  on public.event_booking_links (event_id) where is_primary;
create index if not exists event_booking_links_by_event
  on public.event_booking_links (event_id, position);

comment on table public.event_booking_links is
  'WI3. Each place an event is booked or seen, one row each; the page shows one button, chosen by event_booking_button, and the rest as "Also on". events.external_ticket_url is its mirror.';
comment on column public.event_booking_links.price_from_cents is
  'Google''s offers.price: the lowest available price including service charges and fees, in cents; shown only when price_checked_at is within 24 hours.';
comment on column public.event_booking_links.pointed_to_by_organiser is
  'The organiser''s own website or Instagram links to this URL, as the import or the daily check read it.';

-- ---------------------------------------------------------------------------
-- 2. THE ONE BUTTON
-- ---------------------------------------------------------------------------
create or replace function public.event_booking_button(p_event uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $button$
  select l.id
    from public.event_booking_links l
   where l.event_id = p_event and l.availability <> 'dead'
   order by (l.is_primary and l.set_by = 'organiser') desc,
            l.pointed_to_by_organiser desc,
            case l.availability when 'on_sale' then 0 when 'not_yet' then 1 else 2 end,
            l.position,
            l.created_at,
            l.id
   limit 1
$button$;

comment on function public.event_booking_button(uuid) is
  'WI3, the 12:30 (3): the link the one button opens. Never a dead link; the organiser''s own choice; then what the organiser''s own pages point to; then on sale over not yet over sold out; then the first found. Never by what pays EventLinqs.';

-- ---------------------------------------------------------------------------
-- 3. THE MIRROR, BOTH WAYS
-- ---------------------------------------------------------------------------
create or replace function public.event_booking_links_mirror()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $mirror$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
  v_url   text;
begin
  select l.url into v_url from public.event_booking_links l where l.id = public.event_booking_button(v_event);
  perform set_config('eventlinqs.booking_mirror', 'on', true);
  update public.events e set external_ticket_url = v_url
   where e.id = v_event and e.external_ticket_url is distinct from v_url;
  perform set_config('eventlinqs.booking_mirror', 'off', true);
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    select l.url into v_url from public.event_booking_links l where l.id = public.event_booking_button(old.event_id);
    perform set_config('eventlinqs.booking_mirror', 'on', true);
    update public.events e set external_ticket_url = v_url
     where e.id = old.event_id and e.external_ticket_url is distinct from v_url;
    perform set_config('eventlinqs.booking_mirror', 'off', true);
  end if;
  return null;
end;
$mirror$;

drop trigger if exists trg_event_booking_links_mirror on public.event_booking_links;
create trigger trg_event_booking_links_mirror
  after insert or update or delete on public.event_booking_links
  for each row execute function public.event_booking_links_mirror();

create or replace function public.event_external_url_is_a_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $direct$
begin
  -- The mirror's own write.
  if coalesce(current_setting('eventlinqs.booking_mirror', true), 'off') = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.external_ticket_url is not distinct from old.external_ticket_url then
    return null;
  end if;
  if new.external_ticket_url is null then
    delete from public.event_booking_links where event_id = new.id;
  else
    update public.event_booking_links set is_primary = false, updated_at = now()
     where event_id = new.id and is_primary and url <> new.external_ticket_url;
    insert into public.event_booking_links (event_id, provider, url, kind, availability, is_primary, set_by)
    values (new.id, public.event_booking_provider_of(new.external_ticket_url), new.external_ticket_url, 'tickets', 'on_sale', true, 'organiser')
    on conflict (event_id, url) do update set is_primary = true, set_by = 'organiser', updated_at = now();
  end if;
  return null;
end;
$direct$;

create or replace function public.event_booking_provider_of(p_url text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $provider$
  select case
    when h ~ '(^|\.)humanitix\.com$' then 'humanitix'
    when h ~ '(^|\.)eventbrite\.(com|com\.au|co\.uk|ca)$' then 'eventbrite'
    when h ~ '(^|\.)trybooking\.com$' then 'trybooking'
    when h ~ '(^|\.)moshtix\.com\.au$' then 'moshtix'
    when h ~ '(^|\.)oztix\.com\.au$' then 'oztix'
    when h ~ '(^|\.)ticketek\.com\.au$' then 'ticketek'
    when h ~ '(^|\.)ticketmaster\.com\.au$' then 'ticketmaster'
    when h ~ '(^|\.)dice\.fm$' then 'dice'
    else 'other'
  end
  from (select lower(substring(p_url from '^https?://([^/:?#]+)')) as h) x
$provider$;

drop trigger if exists trg_event_external_url_is_a_link on public.events;
create trigger trg_event_external_url_is_a_link
  after insert or update of external_ticket_url on public.events
  for each row execute function public.event_external_url_is_a_link();

-- ---------------------------------------------------------------------------
-- 4. EVERY EXISTING EXTERNAL URL, ITS ORGANISER'S OWN PRIMARY LINK
-- ---------------------------------------------------------------------------
insert into public.event_booking_links (event_id, provider, url, kind, availability, is_primary, set_by)
select e.id, public.event_booking_provider_of(e.external_ticket_url), e.external_ticket_url, 'tickets', 'on_sale', true, 'organiser'
  from public.events e
 where e.external_ticket_url is not null
on conflict (event_id, url) do nothing;

-- ---------------------------------------------------------------------------
-- 5. ROW SECURITY AND GRANTS
-- ---------------------------------------------------------------------------
alter table public.event_booking_links enable row level security;

drop policy if exists "Links of a published event are public" on public.event_booking_links;
create policy "Links of a published event are public"
  on public.event_booking_links for select
  to anon, authenticated
  using (exists (select 1 from public.events e
                  where e.id = event_booking_links.event_id
                    and e.status = 'published' and e.visibility in ('public', 'unlisted')));

revoke all on public.event_booking_links from public, anon, authenticated, service_role;
grant select on public.event_booking_links to anon, authenticated;
grant select, insert, update, delete on public.event_booking_links to service_role;

revoke all on function public.event_booking_links_mirror() from public, anon, authenticated;
revoke all on function public.event_external_url_is_a_link() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_cell record;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'event_booking_links' and c.relrowsecurity) then
    v_missing := v_missing || ' event_booking_links.rls';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_event_booking_links_mirror') then
    v_missing := v_missing || ' trg_event_booking_links_mirror';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_event_external_url_is_a_link') then
    v_missing := v_missing || ' trg_event_external_url_is_a_link';
  end if;
  if public.event_booking_provider_of('https://events.humanitix.com/bp-night') is distinct from 'humanitix'
     or public.event_booking_provider_of('https://www.eventbrite.com.au/e/bp-123') is distinct from 'eventbrite'
     or public.event_booking_provider_of('https://beavsbar.com.au/whats-on') is distinct from 'other' then
    v_missing := v_missing || ' event_booking_provider_of.hosts';
  end if;
  -- Every external URL that stood has its link.
  if exists (select 1 from public.events e
              where e.external_ticket_url is not null
                and not exists (select 1 from public.event_booking_links l where l.event_id = e.id and l.url = e.external_ticket_url)) then
    v_missing := v_missing || ' event_booking_links.backfill';
  end if;
  -- Every cell of the new table's grants, both ways.
  for v_cell in
    select r.role, p.priv,
           (r.role, p.priv) in (
             ('anon', 'SELECT'), ('authenticated', 'SELECT'),
             ('service_role', 'SELECT'), ('service_role', 'INSERT'), ('service_role', 'UPDATE'), ('service_role', 'DELETE')
           ) as expected
      from (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, 'public.event_booking_links', v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' event_booking_links.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'WI3 booking links migration post-condition failed:%', v_missing;
  end if;
end
$post$;
