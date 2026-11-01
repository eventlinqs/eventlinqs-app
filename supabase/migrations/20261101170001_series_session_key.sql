-- ============================================================================
-- A MATINEE AND AN EVENING ARE TWO NIGHTS (directive 6, Lawal's engine directive of 1 November 2026: deduplicate
-- without deleting legitimate separate performances).
--
-- WHY. event_series_once_per_host keyed a regular night on (venue, name, rule, anchor date) with no start time, so a
-- show's second session on the same day (a matinee and an evening) was refused as a repeat: the Geelong Arts Centre
-- batch of 1 November lost 15 sessions to it (The Little Mermaid, Mary Poppins, Psychic Medium John Edward, and more).
-- The key now carries the local start time: two sessions are two series, each with its own dated events.
--
-- WHAT IT CHANGES. (1) The unique rule on event_series: (venue_id, name, rule, anchor_date, starts_at). Every row that
-- was unique under the old key is unique under the new one, so the swap cannot fail on existing data.
-- (2) listing_publish_partner_night, the partner accept path, conflicts on the same key (its body is otherwise as in
-- 20261028204001), so a second session a partner's feed carries is written, never silently dropped.
-- The import (src/lib/listings/import-plan.ts) keys a night the same way, and a second session's dated event takes an
-- address ending in its start when the first holds the plain one (occurrence-plan.ts occurrenceSlug).
--
-- No new table, so no grant. REVERSIBLE: put event_series_once_per_host back (it fails only if two sessions exist,
-- which is the point) and the function's old conflict target.
-- Held by tests/unit/listings/same-day-sessions.test.ts. Lawal applies it with `supabase db push --linked`.
-- ============================================================================
begin;

alter table public.event_series drop constraint if exists event_series_once_per_host;
alter table public.event_series drop constraint if exists event_series_once_per_session;
alter table public.event_series
  add constraint event_series_once_per_session unique (venue_id, name, rule, anchor_date, starts_at);

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
  on conflict (venue_id, name, rule, anchor_date, starts_at) do nothing
  returning id into v_series;
  if v_series is null then
    select id into v_series from public.event_series
     where venue_id = v_c.venue_id and name = v_name and rule = 'once' and anchor_date = v_local::date
       and starts_at = v_local::time;
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

commit;
