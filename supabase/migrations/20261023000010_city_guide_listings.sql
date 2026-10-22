-- ============================================================================
-- WI2 Part 1: THE CITY GUIDE'S LISTINGS (docs/walk-in/WI2-PLAN.md, section 5).
--
-- A host's regular night is stored once, as a series with its rule, and its
-- dated occurrences are ordinary walk-in events (WI1) that point back at it.
-- Every row the import makes is an EventLinqs listing: listed from public
-- information, last checked on a date, and off every guide 21 days after that
-- check unless it is checked again.
--
-- 1. cities: free_guide (which cities have a guide) and timezone (the zone a
--    city's dates are read in), backfilled from state.
-- 2. venues: slug, suburb, city_slug, website_url, instagram_handle,
--    published_email, listing_source, claimed_at, removed_at. The public ones
--    join the column grant list that 20260818000001 keeps for anon and
--    authenticated; published_email and removed_at stay service role only.
-- 3. event_series: what a host runs, with its rule. A one-off is a series of
--    one, so every listing has one home for its source, check and removal.
-- 4. listing_checks: the append-only history of each check. A trigger keeps
--    event_series.last_checked_on (the latest day the source was confirmed)
--    and the series' events' listing_fresh_until in step, and an occurrence
--    written later takes the same value, so the 21-day rule is one function,
--    listing_fresh_until_for, and runs from the day the source was read.
-- 5. events: series_id, occurrence_date (both set or both null, unique per
--    series) and listing_fresh_until. 5b: only the service role sets or
--    changes the listing columns on events and venues (the reason is there).
--
-- REMOVAL IS A STATUS, NEVER A DELETE. A series is removed by status and a venue
-- by removed_at, so history stays. The keys to a series therefore RESTRICT
-- rather than set null: the plan first said "on delete set null" for
-- events.series_id, and a set null would break the both-or-neither check on
-- (series_id, occurrence_date), so deleting a series would always fail.
--
-- GRANTS (the 21 October 2026 rule): each new table revokes all from public,
-- anon, authenticated and service_role, then grants exactly what its policies
-- serve. Writes come only from the import and the daily run, with the service
-- role; nobody signed in writes these tables directly.
--
-- REVERSIBLE? Every change adds: columns with defaults or nulls, two new
-- tables, three triggers. One existing behaviour narrows: a signed-in organiser
-- can no longer change events.listing_source directly (5b); no code path did.
-- A revert drops the three triggers, the two tables and the added columns; no
-- WI1 or earlier code reads them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CITIES
-- ---------------------------------------------------------------------------
alter table public.cities add column if not exists free_guide boolean not null default false;
alter table public.cities add column if not exists timezone text;

update public.cities set timezone = case state
    when 'VIC' then 'Australia/Melbourne'
    when 'NSW' then 'Australia/Sydney'
    when 'ACT' then 'Australia/Sydney'
    when 'QLD' then 'Australia/Brisbane'
    when 'SA' then 'Australia/Adelaide'
    when 'WA' then 'Australia/Perth'
    when 'TAS' then 'Australia/Hobart'
    when 'NT' then 'Australia/Darwin'
  end
 where timezone is null;

do $cities$
declare v_unzoned text;
begin
  select string_agg(slug || ' (' || state || ')', ', ') into v_unzoned from public.cities where timezone is null;
  if v_unzoned is not null then
    raise exception 'WI2 city guide: these cities have a state with no zone: %', v_unzoned;
  end if;
end
$cities$;

alter table public.cities alter column timezone set not null;

update public.cities set free_guide = true where slug in ('melbourne', 'geelong', 'ballarat', 'bendigo');

comment on column public.cities.free_guide is
  'The city has a free guide (WI2): its listings are imported and /free/<city>/this-week is built from its row.';
comment on column public.cities.timezone is
  'The IANA zone a city''s dates are read in, from its state. WI2, 23 October 2026.';

-- ---------------------------------------------------------------------------
-- 2. VENUES
-- ---------------------------------------------------------------------------
alter table public.venues add column if not exists slug text;
alter table public.venues add column if not exists suburb text;
alter table public.venues add column if not exists city_slug text references public.cities(slug) on delete restrict;
alter table public.venues add column if not exists website_url text;
alter table public.venues add column if not exists instagram_handle text;
alter table public.venues add column if not exists published_email text;
alter table public.venues add column if not exists listing_source text not null default 'organiser';
alter table public.venues add column if not exists claimed_at timestamptz;
alter table public.venues add column if not exists removed_at timestamptz;

alter table public.venues drop constraint if exists venues_listing_source_known;
alter table public.venues add constraint venues_listing_source_known
  check (listing_source in ('organiser', 'eventlinqs'));
-- The organisations rule from WI1: checked only for what would break a link.
alter table public.venues drop constraint if exists venues_instagram_handle_link_safe;
alter table public.venues add constraint venues_instagram_handle_link_safe
  check (instagram_handle is null or (char_length(instagram_handle) between 1 and 64 and instagram_handle !~ '[[:space:]/@?#]'));
alter table public.venues drop constraint if exists venues_website_url_https;
alter table public.venues add constraint venues_website_url_https
  check (website_url is null or website_url ~ '^https://');

create unique index if not exists venues_slug_key on public.venues (slug) where slug is not null;

grant select (slug, suburb, city_slug, website_url, instagram_handle, listing_source, claimed_at)
  on public.venues to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. EVENT SERIES
-- ---------------------------------------------------------------------------
create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category_id uuid references public.event_categories(id) on delete restrict,
  rule text not null check (rule in ('once', 'weekly', 'fortnightly', 'monthly-1', 'monthly-2', 'monthly-3', 'monthly-4', 'monthly-last')),
  anchor_date date not null,
  day int2 not null check (day between 0 and 6),
  starts_at time not null,
  -- Null only while the plan's question 1 (a night with no finish) is unruled;
  -- the import holds such rows, so none is written yet.
  ends_at time,
  timezone text not null,
  age_restriction_min int2 check (age_restriction_min is null or age_restriction_min in (0, 16, 18)),
  summary text not null,
  instagram_post_url text check (instagram_post_url is null or instagram_post_url ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]+/?'),
  skip_dates date[] not null default '{}',
  listing_source text not null default 'eventlinqs' check (listing_source in ('organiser', 'eventlinqs')),
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  -- The latest day the source was confirmed (a listing check's source_date),
  -- the date "Last checked" shows. Kept by listing_checks' trigger.
  last_checked_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_series_day_is_anchor_weekday check (day = extract(dow from anchor_date)::int2),
  constraint event_series_once_per_host unique (venue_id, name, rule, anchor_date)
);

comment on table public.event_series is
  'What a host runs, stored once with its rule; its dated occurrences are walk-in events pointing back at it. WI2 Part 1.';

alter table public.event_series enable row level security;

drop policy if exists "Active series are public" on public.event_series;
create policy "Active series are public"
  on public.event_series for select
  to anon, authenticated
  using (status = 'active');

revoke all on public.event_series from public, anon, authenticated, service_role;
grant select on public.event_series to anon, authenticated;
grant select, insert, update on public.event_series to service_role;

-- ---------------------------------------------------------------------------
-- 4. LISTING CHECKS
-- ---------------------------------------------------------------------------
create table if not exists public.listing_checks (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.event_series(id) on delete restrict,
  checked_at timestamptz not null default now(),
  source_url text not null,
  source_date date not null,
  import_file text not null,
  outcome text not null check (outcome in ('confirmed', 'changed', 'removed'))
);

create index if not exists listing_checks_series_idx on public.listing_checks (series_id, checked_at desc);

comment on table public.listing_checks is
  'Append-only: each time a listing''s source was checked. Its trigger keeps the 21-day rule''s one value in step. WI2 Part 1.';

alter table public.listing_checks enable row level security;

revoke all on public.listing_checks from public, anon, authenticated, service_role;
grant select, insert on public.listing_checks to service_role;

-- ---------------------------------------------------------------------------
-- 5. EVENTS
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists series_id uuid references public.event_series(id) on delete restrict;
alter table public.events add column if not exists occurrence_date date;
alter table public.events add column if not exists listing_fresh_until timestamptz;

alter table public.events drop constraint if exists events_series_and_date_together;
alter table public.events add constraint events_series_and_date_together
  check ((series_id is null) = (occurrence_date is null));

create unique index if not exists events_series_occurrence_key
  on public.events (series_id, occurrence_date) where series_id is not null;

comment on column public.events.listing_fresh_until is
  'For an EventLinqs listing: the end of the 21st day after its series'' source was last confirmed, in the series'' zone. Null for every event an organiser lists. WI2 Part 1.';

-- THE 21-DAY RULE, ONCE. A listing whose source was confirmed on day D stays
-- on the guides to the end of day D + 21 in its own zone, and is gone from the
-- first moment of D + 22. The import refuses a source older than 21 days by the
-- same count (SOURCE_MAX_AGE_DAYS in src/lib/listings/listing-rows.ts), so the
-- oldest row it accepts is on the guides for the rest of that day only. It runs
-- from the day the source was read, never from when the import happened to run.
create or replace function public.listing_fresh_until_for(p_checked_on date, p_timezone text)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select case when p_checked_on is null then null
              else ((p_checked_on + 22)::timestamp at time zone p_timezone) end
$$;

-- A check confirms (or changes) the source: the series keeps the latest day it
-- was confirmed, and every occurrence of it takes its freshness from that day.
-- A later check can only move the day forward.
create or replace function public.listing_check_keeps_freshness()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_on date;
  v_tz text;
begin
  update public.event_series
     set last_checked_on = greatest(coalesce(last_checked_on, new.source_date), new.source_date),
         updated_at = now()
   where id = new.series_id
  returning last_checked_on, timezone into v_on, v_tz;
  update public.events
     set listing_fresh_until = public.listing_fresh_until_for(v_on, v_tz)
   where series_id = new.series_id;
  return new;
end;
$$;

drop trigger if exists trg_listing_check_keeps_freshness on public.listing_checks;
create trigger trg_listing_check_keeps_freshness
  after insert on public.listing_checks
  for each row execute function public.listing_check_keeps_freshness();

-- An occurrence written after the series' last check takes the same freshness
-- the moment it is written, so no occurrence ever exists without it.
create or replace function public.event_takes_its_series_freshness()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.series_id is null then
    return new;
  end if;
  select public.listing_fresh_until_for(s.last_checked_on, s.timezone)
    into new.listing_fresh_until
    from public.event_series s
   where s.id = new.series_id;
  return new;
end;
$$;

drop trigger if exists trg_event_takes_its_series_freshness on public.events;
create trigger trg_event_takes_its_series_freshness
  before insert or update of series_id on public.events
  for each row execute function public.event_takes_its_series_freshness();

-- ---------------------------------------------------------------------------
-- 5b. ONLY THE IMPORT WRITES THE LISTING COLUMNS.
--
-- anon and authenticated hold UPDATE on events and venues (no migration revokes
-- the default), and the organiser policies let a member write their own rows.
-- Without this an organiser's direct REST call could attach their own event to
-- an EventLinqs series and take one of its dates (the unique index would then
-- refuse the real occurrence), mark their event or venue as listed by
-- EventLinqs, claim it, or take a slug the import needs. Every one of these is
-- written by the service role (the import, the daily run, Part 3's claim), so
-- the two signed-in roles may only leave them as they are. events.listing_source
-- is WI1's column and had the same gap; it is closed here and reported.
-- The event lists name exactly the columns each function reads, and none of
-- them is an on delete set null key.
-- ---------------------------------------------------------------------------
create or replace function public.event_listing_columns_are_the_imports()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.series_id is not null or new.occurrence_date is not null
       or new.listing_fresh_until is not null or new.listing_source <> 'organiser' then
      raise exception 'only EventLinqs'' import sets an event''s series, date, freshness or listing source'
        using errcode = '42501';
    end if;
  elsif new.series_id is distinct from old.series_id
     or new.occurrence_date is distinct from old.occurrence_date
     or new.listing_fresh_until is distinct from old.listing_fresh_until
     or new.listing_source is distinct from old.listing_source then
    raise exception 'only EventLinqs'' import changes an event''s series, date, freshness or listing source (event %)', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_listing_columns_are_the_imports on public.events;
create trigger trg_event_listing_columns_are_the_imports
  before insert or update of series_id, occurrence_date, listing_fresh_until, listing_source on public.events
  for each row execute function public.event_listing_columns_are_the_imports();

create or replace function public.venue_listing_columns_are_the_imports()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.slug is not null or new.published_email is not null or new.listing_source <> 'organiser'
       or new.claimed_at is not null or new.removed_at is not null then
      raise exception 'only EventLinqs sets a venue''s slug, published email, listing source, claim or removal'
        using errcode = '42501';
    end if;
  elsif new.slug is distinct from old.slug
     or new.published_email is distinct from old.published_email
     or new.listing_source is distinct from old.listing_source
     or new.claimed_at is distinct from old.claimed_at
     or new.removed_at is distinct from old.removed_at then
    raise exception 'only EventLinqs changes a venue''s slug, published email, listing source, claim or removal (venue %)', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_venue_listing_columns_are_the_imports on public.venues;
create trigger trg_venue_listing_columns_are_the_imports
  before insert or update of slug, published_email, listing_source, claimed_at, removed_at on public.venues
  for each row execute function public.venue_listing_columns_are_the_imports();

-- ---------------------------------------------------------------------------
-- 6. POST-CONDITION: the file proves what it promised before anything trusts it.
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_cell record;
begin
  if exists (select 1 from public.cities where timezone is null) then
    v_missing := v_missing || ' cities.timezone_backfill';
  end if;
  if (select count(*) from public.cities where free_guide and slug in ('melbourne', 'geelong', 'ballarat', 'bendigo')) <> 4 then
    v_missing := v_missing || ' cities.free_guide_four';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_listing_check_keeps_freshness') then
    v_missing := v_missing || ' trg_listing_check_keeps_freshness';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_event_takes_its_series_freshness') then
    v_missing := v_missing || ' trg_event_takes_its_series_freshness';
  end if;
  -- The rule's own arithmetic: confirmed on 1 October in Melbourne (UTC+10
  -- until 4 October), gone from midnight starting 23 October (UTC+11).
  if public.listing_fresh_until_for(date '2026-10-01', 'Australia/Melbourne')
     is distinct from timestamptz '2026-10-22 13:00:00+00' then
    v_missing := v_missing || ' listing_fresh_until_for.arithmetic';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_event_listing_columns_are_the_imports') then
    v_missing := v_missing || ' trg_event_listing_columns_are_the_imports';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_venue_listing_columns_are_the_imports') then
    v_missing := v_missing || ' trg_venue_listing_columns_are_the_imports';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'event_series' and c.relrowsecurity) then
    v_missing := v_missing || ' event_series.rls';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'listing_checks' and c.relrowsecurity) then
    v_missing := v_missing || ' listing_checks.rls';
  end if;
  -- The venue columns: the public ones readable by anon and authenticated, the
  -- two private ones by neither.
  for v_cell in
    select c.col, r.role, c.public
      from (values ('slug', true), ('suburb', true), ('city_slug', true), ('website_url', true),
                   ('instagram_handle', true), ('listing_source', true), ('claimed_at', true),
                   ('published_email', false), ('removed_at', false)) as c(col, public)
     cross join (values ('anon'), ('authenticated')) as r(role)
  loop
    if has_column_privilege(v_cell.role, 'public.venues', v_cell.col, 'SELECT') is distinct from v_cell.public then
      v_missing := v_missing || ' venues.' || v_cell.col || '.' || v_cell.role
                   || case when v_cell.public then '_must_read' else '_must_not_read' end;
    end if;
  end loop;
  -- Every cell of the two new tables' grants, both ways.
  for v_cell in
    select t.tbl, r.role, p.priv,
           (t.tbl, r.role, p.priv) in (
             ('event_series', 'anon', 'SELECT'),
             ('event_series', 'authenticated', 'SELECT'),
             ('event_series', 'service_role', 'SELECT'),
             ('event_series', 'service_role', 'INSERT'),
             ('event_series', 'service_role', 'UPDATE'),
             ('listing_checks', 'service_role', 'SELECT'),
             ('listing_checks', 'service_role', 'INSERT')
           ) as expected
      from (values ('event_series'), ('listing_checks')) as t(tbl)
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, 'public.' || v_cell.tbl, v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' ' || v_cell.tbl || '.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'WI2 city guide migration post-condition failed:%', v_missing;
  end if;
end
$post$;
