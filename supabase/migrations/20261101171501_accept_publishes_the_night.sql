-- ============================================================================
-- A PERSON'S ACCEPT PUBLISHES THE NIGHT (window 6, 1 November 2026; the engine final directive, Release A).
--
-- FOUND ON MAIN 54c7c3ed: accepting a 'new' candidate at /admin/collected only set its status to 'accepted'.
-- Nothing made it a night, and the database refused a published series on any candidate the partner rule had not
-- decided (listing_candidates_published_by_rule, 20261028204001). So the collector's review path ended in a dead end for
-- every source but a partner's own feed: of 470 found, 0 could ever reach the site by a person's accept.
--
-- NOW: listing_publish_accepted_night(candidate, venue, category, reviewer), called by the accept action, turns one
-- waiting 'new' candidate into a dated series on the SAME shape the partner path and the curated import write:
--   * at a HELD venue (never one invented from the candidate's words), not removed, in a city with a timezone;
--   * in a category named by the reviewer;
--   * as an EventLinqs listing (listing_source 'eventlinqs', the eventlinqs-listings organisation), so no page claims
--     an organiser we do not hold (the CONTROLLER's 16:35 (1));
--   * facts only: the candidate's own title, its start and end, its booking links; never its description or image;
--     the summary is the facts in our words (title at venue);
--   * with a listing_checks row citing the candidate's own page, reuse_basis 'manual_research_facts_only', so the
--     21-day freshness rule and the daily re-read govern it like every other listing;
--   * the candidate marked accepted, decided by a person, reviewed by the reviewer, linked to its series.
-- Idempotent: a second call returns the same series. A second SESSION of a show on the same day is refused in words
-- until WINDOW 3's series session key (20261101170001) lands; then it publishes as its own night.
--
-- Reversal: drop the function and restore listing_candidates_published_by_rule to its 20261028204001 form (no row it
-- wrote is touched; their series stay, as the curated import's do).
-- ============================================================================

begin;

alter table public.listing_candidates drop constraint if exists listing_candidates_published_by_rule;
alter table public.listing_candidates add constraint listing_candidates_published_by_rule check (
  published_series_id is null
  or (decided_by = 'partner_rule' and kind = 'new' and status = 'accepted')
  or (decided_by = 'person' and kind = 'new' and status = 'accepted' and reviewed_by is not null)
);

create or replace function public.listing_publish_accepted_night(p_candidate uuid, p_venue uuid, p_category uuid, p_reviewer uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_c record;
  v_v record;
  v_org uuid;
  v_tz text;
  v_local timestamp;
  v_end_local timestamp;
  v_series uuid;
  v_name text;
begin
  select c.id, c.kind, c.status, c.decided_by, c.published_series_id, c.title, c.starts_at, c.ends_at, c.page_url,
         c.links, c.found_at, c.source_id
    into v_c
    from public.listing_candidates c
   where c.id = p_candidate
     for update;
  if not found then
    raise exception 'listing_publish_accepted_night: no candidate %', p_candidate using errcode = 'P0002';
  end if;
  if v_c.published_series_id is not null then
    return v_c.published_series_id;  -- published before: the same series, nothing written twice
  end if;
  if v_c.kind <> 'new' or v_c.status <> 'waiting' then
    raise exception 'refused: only a new night still waiting for review is published by an accept' using errcode = '23514';
  end if;
  if p_reviewer is null then
    raise exception 'refused: an accept names the person who made it' using errcode = '23514';
  end if;
  if v_c.starts_at < now() then
    raise exception 'refused: this night has already started' using errcode = '23514';
  end if;

  select v.id, v.name, v.city_slug, v.removed_at into v_v from public.venues v where v.id = p_venue;
  if v_v.id is null or v_v.removed_at is not null then
    raise exception 'refused: name a held venue that is not removed' using errcode = '23514';
  end if;
  if p_category is null or not exists (select 1 from public.event_categories where id = p_category) then
    raise exception 'refused: name the night''s category' using errcode = '23514';
  end if;
  select c.timezone into v_tz from public.cities c where c.slug = v_v.city_slug;
  if v_tz is null then
    raise exception 'refused: the venue''s city % has no timezone', v_v.city_slug using errcode = '23514';
  end if;
  select o.id into v_org from public.organisations o where o.slug = 'eventlinqs-listings';
  if v_org is null then
    raise exception 'refused: the EventLinqs listings organisation is missing' using errcode = '23514';
  end if;

  v_local := v_c.starts_at at time zone v_tz;
  v_end_local := case when v_c.ends_at is null then null else v_c.ends_at at time zone v_tz end;
  v_name := left(btrim(v_c.title), 80);

  insert into public.event_series (venue_id, organisation_id, name, category_id, rule, anchor_date, day, starts_at, ends_at,
                                   timezone, summary, booking_links, listing_source, status)
  values (v_v.id, v_org, v_name, p_category, 'once', v_local::date, extract(dow from v_local::date)::smallint,
          v_local::time, v_end_local::time, v_tz, v_name || ' at ' || v_v.name || '.',
          coalesce((select jsonb_agg(jsonb_build_object(
                      'url', l->>'url',
                      'kind', 'tickets',
                      'price_from_cents', case when l->>'priceFromCents' is null then null else (l->>'priceFromCents')::int end,
                      'price_checked_on', case when l->>'priceFromCents' is null then null else (v_c.found_at at time zone v_tz)::date end))
                      from jsonb_array_elements(coalesce(v_c.links, '[]'::jsonb)) l), '[]'::jsonb),
          'eventlinqs', 'active')
  on conflict do nothing
  returning id into v_series;
  if v_series is null then
    -- The same night already stands (the same venue, name and day): it is that series only if it starts at this time.
    select id into v_series from public.event_series
     where venue_id = v_v.id and name = v_name and rule = 'once' and anchor_date = v_local::date and starts_at = v_local::time;
    if v_series is null then
      raise exception 'refused: a night of this name at this venue already stands on % at another time (a second session waits for the session key)', v_local::date
        using errcode = '23505';
    end if;
  end if;

  insert into public.listing_checks (series_id, source_url, source_date, import_file, outcome, reuse_basis)
  values (v_series, v_c.page_url, (now() at time zone v_tz)::date, 'collected:' || v_c.source_id, 'confirmed', 'manual_research_facts_only');

  update public.listing_candidates
     set status = 'accepted', decided_by = 'person', reviewed_by = p_reviewer, reviewed_at = now(), published_series_id = v_series
   where id = p_candidate;
  return v_series;
end
$fn$;

comment on function public.listing_publish_accepted_night(uuid, uuid, uuid, uuid) is
  'A person''s accept of a new candidate: a dated EventLinqs listing at a held venue, facts only, with a listing check citing the candidate''s page; the listings run makes the event. Idempotent.';

revoke all on function public.listing_publish_accepted_night(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.listing_publish_accepted_night(uuid, uuid, uuid, uuid) to service_role;

commit;
