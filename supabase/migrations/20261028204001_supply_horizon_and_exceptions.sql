-- ============================================================================
-- THE SUPPLY HORIZON, THE RUN LOG AND THE EXCEPTION QUEUE (the engine plan of
-- 28 October 2026, parts A and E, window 4; START-16OCT/
-- EVENTLINQS-ENGINE-PLAN-28OCT.md; the directive's sections 17, 18 and 21).
--
-- A: "daily run with a horizon tag (0-14 publish, 15-45 acquire, 46-90
-- relationships), failure log per source, council sources only under their
-- terms." E: "partner calendar feeds (iCal or website), the horizon field, an
-- exception queue for low-confidence rows."
--
-- 1. listing_sources.changes gains 'daily', so a partner's own feed is read
--    every day (the run itself is daily from this release; a weekly source is
--    still read weekly, on its own pace).
-- 2. listing_sources.organisation_id and venue_id: a partner feed belongs to
--    its organiser, and one organiser may hold several venues' feeds. Read
--    only; window 6's organiser identity tables are not changed here.
-- 3. listing_source_runs: one row per source per run, so a source's failures
--    are a history and not only its last outcome. Insert only: the service
--    role is granted select and insert, never update or delete.
-- 4. listing_candidates: kind 'changes_facts' (a night EventLinqs already lists
--    whose time or venue the source now states differently; it names its event
--    and its change, and it is always a person's), confidence and reasons (the
--    judge in src/lib/listings/judge.ts; high has no reason, low has at least
--    one), and decided_by (a person, or the partner rule that accepts a high
--    confidence row from a partner's own feed).
-- 5. public.listing_horizon(starts_at, now): publish 0 to 14, acquire 15 to 45,
--    relationships 46 to 90, past and beyond outside, in Melbourne calendar
--    days. Computed, never stored, so it is right every morning; the TS twin is
--    src/lib/listings/horizon.ts.
-- 6. The partner publish: listing_sources.category_id (the category a
--    partner's nights take), listing_candidates.published_series_id, and
--    public.listing_publish_partner_night(candidate): an accepted partner rule
--    night becomes a dated series ('once') at the partner's venue, held by the
--    partner's organisation, with a listing check whose basis is
--    organiser_submission (20261028133001's column, which rides with this file).
--    The hourly listings run (/api/cron/listing-occurrences) then makes the
--    event through its publish gate, as it does for every listing. Nothing else
--    publishes, and only a row the partner rule accepted can be published here.
--
-- EXISTING ROWS. Candidates landed before this file were never judged: they
-- take confidence 'low' with the reason 'judged_before_the_queue', so the
-- queue shows them and nothing accepts them by rule.
--
-- GRANTS (the 21 October rule): listing_source_runs is new in public, so this
-- file revokes everything and grants the service role select and insert only.
-- listing_horizon is executable by the service role only.
--
-- REVERSIBLE? Drop listing_horizon, listing_source_runs, the new columns and
-- constraints, and restore the two checks as 20261027140001 wrote them (after
-- deleting any changes_facts candidate and any daily source's pace).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A daily pace.
-- ---------------------------------------------------------------------------
alter table public.listing_sources drop constraint if exists listing_sources_changes_check;
alter table public.listing_sources drop constraint if exists listing_sources_changes;
alter table public.listing_sources add constraint listing_sources_changes
  check (changes in ('daily', 'weekly', 'monthly', 'rarely'));

-- ---------------------------------------------------------------------------
-- 2. Whose feed it is.
-- ---------------------------------------------------------------------------
alter table public.listing_sources
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

create index if not exists listing_sources_organisation on public.listing_sources (organisation_id) where organisation_id is not null;
create index if not exists listing_sources_venue on public.listing_sources (venue_id) where venue_id is not null;

comment on column public.listing_sources.organisation_id is
  'The organiser whose own feed or page this is (a partner feed). One organiser may hold several sources, one per venue.';
comment on column public.listing_sources.venue_id is
  'The venue this source publishes the programme of, where it is one venue''s.';

-- ---------------------------------------------------------------------------
-- 3. The run log.
-- ---------------------------------------------------------------------------
create table if not exists public.listing_source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.listing_sources(id) on delete cascade,
  ran_at timestamptz not null default now(),
  succeeded boolean not null,
  http_status smallint check (http_status is null or http_status between 100 and 599),
  outcome text not null check (length(btrim(outcome)) between 1 and 500),
  found integer not null default 0 check (found >= 0),
  landed integer not null default 0 check (landed >= 0),
  queued integer not null default 0 check (queued >= 0),
  accepted_by_rule integer not null default 0 check (accepted_by_rule >= 0),
  constraint listing_source_runs_counts_add_up check (queued + accepted_by_rule <= landed and landed <= found),
  constraint listing_source_runs_failure_lands_nothing check (succeeded or (found = 0 and landed = 0))
);

create index if not exists listing_source_runs_by_source on public.listing_source_runs (source_id, ran_at desc);

comment on table public.listing_source_runs is
  'One row per source per collection run (the engine plan part A, failure log per source): whether the read succeeded, the page''s answer, and what it found, landed, queued for a person and accepted by the partner rule. Insert only.';

alter table public.listing_source_runs enable row level security;
revoke all on public.listing_source_runs from public, anon, authenticated, service_role;
grant select, insert on public.listing_source_runs to service_role;

-- ---------------------------------------------------------------------------
-- 4. Changed facts, confidence, reasons, and who decided.
-- ---------------------------------------------------------------------------
alter table public.listing_candidates drop constraint if exists listing_candidates_kind_check;
alter table public.listing_candidates drop constraint if exists listing_candidates_kind;
alter table public.listing_candidates add constraint listing_candidates_kind
  check (kind in ('new', 'adds_links', 'changes_facts'));

alter table public.listing_candidates
  add column if not exists change text,
  add column if not exists confidence text not null default 'low',
  add column if not exists reasons text[] not null default '{judged_before_the_queue}',
  add column if not exists decided_by text not null default 'person';

alter table public.listing_candidates drop constraint if exists listing_candidates_new_names_no_event;
alter table public.listing_candidates add constraint listing_candidates_new_names_no_event
  check (kind <> 'new' or event_id is null);

-- A changed fact names its kind of change; nothing else carries one. Its event may be deleted later (set null), as an
-- adds_links candidate's may. "change is not null" is written out because a CHECK whose answer is NULL passes: without
-- it a changed fact with no change named was taken (scripts/verify/supply-horizon-proof.sql, run 1, 28 October 2026).
alter table public.listing_candidates drop constraint if exists listing_candidates_change;
alter table public.listing_candidates add constraint listing_candidates_change check (
  (kind = 'changes_facts' and change is not null and change in ('time_changed', 'venue_changed'))
  or (kind <> 'changes_facts' and change is null)
);

alter table public.listing_candidates drop constraint if exists listing_candidates_confidence;
alter table public.listing_candidates add constraint listing_candidates_confidence check (
  (confidence = 'high' and cardinality(reasons) = 0)
  or (confidence = 'low' and cardinality(reasons) > 0)
);

alter table public.listing_candidates drop constraint if exists listing_candidates_reasons_known;
alter table public.listing_candidates add constraint listing_candidates_reasons_known check (
  reasons <@ array[
    'source_unverified', 'no_venue_address', 'midnight_start', 'called_off_words',
    'time_changed', 'venue_changed', 'similar_listing', 'judged_before_the_queue'
  ]::text[]
);

-- A changed fact is low by its own reason, so it can never be accepted by rule.
alter table public.listing_candidates drop constraint if exists listing_candidates_changed_fact_is_low;
alter table public.listing_candidates add constraint listing_candidates_changed_fact_is_low check (
  kind <> 'changes_facts' or (confidence = 'low' and change = any (reasons))
);

alter table public.listing_candidates drop constraint if exists listing_candidates_decided_by;
alter table public.listing_candidates add constraint listing_candidates_decided_by check (
  decided_by = 'person'
  or (decided_by = 'partner_rule' and status = 'accepted' and confidence = 'high' and kind in ('new', 'adds_links') and reviewed_by is null)
);

create index if not exists listing_candidates_queue on public.listing_candidates (starts_at) where status = 'waiting';

comment on column public.listing_candidates.confidence is
  'high: nothing about the row needs a person (src/lib/listings/judge.ts). low: at least one reason in reasons.';
comment on column public.listing_candidates.decided_by is
  'person, or partner_rule: a high confidence new or adds_links row from a partner''s own verified feed, accepted by the run.';

-- ---------------------------------------------------------------------------
-- 5. The horizon.
-- ---------------------------------------------------------------------------
create or replace function public.listing_horizon(p_starts_at timestamptz, p_now timestamptz default now())
returns text
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select case
    when d < 0 then 'past'
    when d <= 14 then 'publish'
    when d <= 45 then 'acquire'
    when d <= 90 then 'relationships'
    else 'beyond'
  end
  from (select (p_starts_at at time zone 'Australia/Melbourne')::date - (p_now at time zone 'Australia/Melbourne')::date as d) as days
$fn$;

comment on function public.listing_horizon(timestamptz, timestamptz) is
  'The rolling horizon of a night in Melbourne calendar days: publish 0 to 14, acquire 15 to 45, relationships 46 to 90, else past or beyond. Twin of src/lib/listings/horizon.ts.';

revoke all on function public.listing_horizon(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.listing_horizon(timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 6. The partner publish.
-- ---------------------------------------------------------------------------
alter table public.listing_sources
  add column if not exists category_id uuid references public.event_categories(id) on delete set null;
comment on column public.listing_sources.category_id is
  'The category a partner''s own nights are listed under (a partner feed names no category per night).';

alter table public.listing_candidates
  add column if not exists published_series_id uuid references public.event_series(id) on delete set null;
comment on column public.listing_candidates.published_series_id is
  'The series listing_publish_partner_night made from this accepted partner night; the hourly listings run makes its event.';

alter table public.listing_candidates drop constraint if exists listing_candidates_published_by_rule;
alter table public.listing_candidates add constraint listing_candidates_published_by_rule check (
  published_series_id is null or (decided_by = 'partner_rule' and kind = 'new' and status = 'accepted')
);

create or replace function public.listing_publish_partner_night(p_candidate uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_c record;
  v_org uuid;
  v_tz text;
  v_local timestamp;
  v_end_local timestamp;
  v_series uuid;
  v_name text;
  v_summary text;
begin
  select c.id, c.kind, c.status, c.decided_by, c.published_series_id, c.title, c.starts_at, c.ends_at, c.page_url,
         c.description, c.links, c.found_at, s.id as source_id, s.organisation_id, s.venue_id, s.category_id,
         v.organisation_id as venue_org, v.name as venue_name, v.city_slug
    into v_c
    from public.listing_candidates c
    join public.listing_sources s on s.id = c.source_id
    left join public.venues v on v.id = s.venue_id
   where c.id = p_candidate
     for update of c;
  if not found then
    raise exception 'listing_publish_partner_night: no candidate %', p_candidate using errcode = 'P0002';
  end if;
  if v_c.published_series_id is not null then
    return v_c.published_series_id;  -- published before: the same series, nothing written twice
  end if;
  if v_c.decided_by <> 'partner_rule' or v_c.status <> 'accepted' or v_c.kind <> 'new' then
    raise exception 'listing_publish_partner_night: only a new night the partner rule accepted is published here' using errcode = '23514';
  end if;
  if v_c.venue_id is null or v_c.category_id is null then
    raise exception 'listing_publish_partner_night: the partner source names no venue or no category' using errcode = '23514';
  end if;
  v_org := coalesce(v_c.organisation_id, v_c.venue_org);
  select c.timezone into v_tz from public.cities c where c.slug = v_c.city_slug;
  if v_tz is null then
    raise exception 'listing_publish_partner_night: the venue''s city % has no timezone', v_c.city_slug using errcode = '23514';
  end if;

  v_local := v_c.starts_at at time zone v_tz;
  v_end_local := case when v_c.ends_at is null then null else v_c.ends_at at time zone v_tz end;
  v_name := left(btrim(v_c.title), 80);
  -- The partner's own words where they gave them, else the facts alone; never a sentence nobody stated.
  v_summary := coalesce(nullif(btrim(v_c.description), ''), v_name || ' at ' || v_c.venue_name || '.');

  insert into public.event_series (venue_id, organisation_id, name, category_id, rule, anchor_date, day, starts_at, ends_at,
                                   timezone, summary, booking_links, listing_source, status)
  values (v_c.venue_id, v_org, v_name, v_c.category_id, 'once', v_local::date, extract(dow from v_local::date)::smallint,
          v_local::time, v_end_local::time, v_tz, v_summary,
          coalesce((select jsonb_agg(jsonb_build_object(
                      'url', l->>'url',
                      'kind', 'tickets',
                      'price_from_cents', case when l->>'priceFromCents' is null then null else (l->>'priceFromCents')::int end,
                      'price_checked_on', case when l->>'priceFromCents' is null then null else (v_c.found_at at time zone v_tz)::date end))
                      from jsonb_array_elements(v_c.links) l), '[]'::jsonb),
          'organiser', 'active')
  on conflict (venue_id, name, rule, anchor_date) do nothing
  returning id into v_series;
  if v_series is null then
    select id into v_series from public.event_series
     where venue_id = v_c.venue_id and name = v_name and rule = 'once' and anchor_date = v_local::date;
  end if;

  insert into public.listing_checks (series_id, source_url, source_date, import_file, outcome, reuse_basis)
  values (v_series, v_c.page_url, (now() at time zone v_tz)::date, 'partner-feed:' || v_c.source_id, 'confirmed', 'organiser_submission');

  update public.listing_candidates set published_series_id = v_series where id = p_candidate;
  return v_series;
end
$fn$;

comment on function public.listing_publish_partner_night(uuid) is
  'An accepted partner rule night becomes a dated series at the partner''s venue with an organiser_submission listing check; the hourly listings run makes the event. Idempotent.';

revoke all on function public.listing_publish_partner_night(uuid) from public, anon, authenticated;
grant execute on function public.listing_publish_partner_night(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_col text;
  v_con text;
  v_cell record;
begin
  foreach v_col in array array['organisation_id', 'venue_id'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'listing_sources' and column_name = v_col) then
      v_missing := v_missing || ' listing_sources.' || v_col;
    end if;
  end loop;
  foreach v_col in array array['change', 'confidence', 'reasons', 'decided_by'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'listing_candidates' and column_name = v_col) then
      v_missing := v_missing || ' listing_candidates.' || v_col;
    end if;
  end loop;
  foreach v_con in array array[
    'listing_candidates_kind', 'listing_candidates_new_names_no_event', 'listing_candidates_change',
    'listing_candidates_confidence', 'listing_candidates_reasons_known', 'listing_candidates_changed_fact_is_low',
    'listing_candidates_decided_by'
  ] loop
    if not exists (select 1 from pg_constraint where conname = v_con and conrelid = 'public.listing_candidates'::regclass) then
      v_missing := v_missing || ' ' || v_con;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'listing_sources_changes' and conrelid = 'public.listing_sources'::regclass) then
    v_missing := v_missing || ' listing_sources_changes';
  end if;
  if exists (select 1 from pg_constraint where conname = 'listing_sources_changes_check' and conrelid = 'public.listing_sources'::regclass) then
    v_missing := v_missing || ' listing_sources_changes_check_still_there';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'listing_source_runs' and c.relrowsecurity) then
    v_missing := v_missing || ' listing_source_runs.rls';
  end if;
  for v_cell in
    select r.role, p.priv, (r.role = 'service_role' and p.priv in ('SELECT', 'INSERT')) as expected
      from (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, 'public.listing_source_runs', v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' listing_source_runs.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.listing_horizon(timestamptz, timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.listing_horizon(timestamptz, timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.listing_horizon(timestamptz, timestamptz)', 'EXECUTE') then
    v_missing := v_missing || ' listing_horizon.execute';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'listing_sources' and column_name = 'category_id')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'listing_candidates' and column_name = 'published_series_id') then
    v_missing := v_missing || ' partner_publish.columns';
  end if;
  if has_function_privilege('anon', 'public.listing_publish_partner_night(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.listing_publish_partner_night(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.listing_publish_partner_night(uuid)', 'EXECUTE') then
    v_missing := v_missing || ' listing_publish_partner_night.execute';
  end if;
  if public.listing_horizon(timestamptz '2026-11-11 12:00+11', timestamptz '2026-10-28 20:00+11') <> 'publish'
     or public.listing_horizon(timestamptz '2026-11-12 12:00+11', timestamptz '2026-10-28 20:00+11') <> 'acquire'
     or public.listing_horizon(timestamptz '2026-12-13 12:00+11', timestamptz '2026-10-28 20:00+11') <> 'relationships'
     or public.listing_horizon(timestamptz '2027-01-27 12:00+11', timestamptz '2026-10-28 20:00+11') <> 'beyond' then
    v_missing := v_missing || ' listing_horizon.bounds';
  end if;

  if v_missing <> '' then
    raise exception 'Supply horizon migration post-condition failed:%', v_missing;
  end if;
end
$post$;
