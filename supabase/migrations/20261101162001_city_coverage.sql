-- CITY FIRST, DIRECTIVE 7: REAL COVERAGE REPORTING, PER CITY, IN THE EXISTING GROWTH DESK (the CONTROLLER's 1 November
-- 2026 15:32 and 15:39 (4); the model at C:\dev\EVIDENCE\CITY-FIRST-1NOV\data-model.md sections 4 and 4b).
--
-- growth_city_coverage(city): one read, service role only, every row from the record that proves it, by the rules
-- already written and never a second copy of a different one:
--   place                 venue_city_relation (20261101160001): city, surrounding, region, outside, unplaced. Until the
--                         venues are placed, the label city (events.city_primary) is reported beside it, named as such.
--   sources               WINDOW 6's registry, public.listing_sources: healthy when read successfully within the last
--                         two days (the daily refresh rule, WINDOW 3), failing when read since without success or never
--                         successfully, not yet read when never checked.
--   upcoming              published, public, not ended (the scorecard's own rule).
--   category              the primary (20261101161001), and 'needs a category' for category_review needed.
--   date, suburb          the next 14 days in the platform zone; the ABS suburb, else 'not placed'.
--   duplicates            two or more events with the same title, venue and start.
--   stale                 a listing whose series was last confirmed more than a day ago (event_last_checked), or past
--                         its listing_fresh_until.
--   awaiting verification listing_candidates still waiting, from this city's sources.
--   authorised images     the scorecard's own photo rule (20261101044501), the same predicate.
--   external ticketing    an outside ticket link.
--   selling here          the scorecard's own selling rule.
-- Plus event_last_checked(event): every event's last check by one rule (a listing: its series' last confirmed day; an
-- organiser's event: its own last change).

create or replace function public.event_last_checked(p_event uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when e.listing_series_id is not null then s.last_checked_on::timestamptz else e.updated_at end
    from public.events e
    left join public.event_series s on s.id = e.listing_series_id
   where e.id = p_event
$$;

revoke all on function public.event_last_checked(uuid) from public, anon, authenticated;
grant execute on function public.event_last_checked(uuid) to service_role;

create or replace function public.growth_city_coverage(p_city text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with up as (
  select e.*, public.venue_city_relation(p_city, e.venue_id) rel
    from public.events e
   where e.status = 'published' and e.visibility = 'public'
     and ((e.end_date is not null and e.end_date >= now()) or (e.end_date is null and e.start_date >= date_trunc('day', now())))
     and (e.listing_fresh_until is null or e.listing_fresh_until >= now())
),
mine as (select * from up where rel in ('city', 'surrounding')),
labelled as (select * from up where lower(btrim(coalesce(city_primary, ''))) = lower(p_city)),
src as (select * from public.listing_sources where city_slug = p_city),
sf as (select distinct on (e.listing_series_id) e.listing_series_id, e.id from public.events e
  where e.listing_series_id is not null and e.status = 'published' and e.visibility = 'public'
    and (case when e.end_date is not null then e.end_date >= now() else e.start_date >= now() end)
  order by e.listing_series_id, e.start_date, e.id),
photo as (select v.id,
  (v.cover_image_url is not null and v.cover_image_url not like '%/generated-covers/%' and v.cover_image_url not like '%/event-images/stock/%'
     and exists (select 1 from public.event_image_rights r where r.event_id = v.id and r.image_role = 'cover' and r.image_url = v.cover_image_url and r.rights_state in ('organiser_authorised', 'separately_licensed'))) own_rights,
  exists (select 1 from public.photo_assignments a join public.venue_images i on i.id = a.venue_image_id
     where a.role = 'cover' and a.source = 'venue' and a.retired_at is null
       and (a.event_id = v.id or (v.listing_series_id is not null and a.listing_series_id = v.listing_series_id and exists (select 1 from sf where sf.listing_series_id = v.listing_series_id and sf.id = v.id)))
       and i.approval_state = 'approved' and i.verified_depicts_venue and 'event_card' = any (i.permitted_uses)) venue_photo
  from mine v)
select jsonb_build_object(
  'city', p_city,
  'read_at', now(),
  'sources', jsonb_build_object(
    'known', (select count(*) from src),
    'healthy', (select count(*) from src where last_success_at >= now() - interval '2 days'),
    'failing', (select count(*) from src where last_checked_at is not null and (last_success_at is null or last_success_at < now() - interval '2 days')),
    'not_yet_read', (select count(*) from src where last_checked_at is null)),
  'upcoming_in_city', (select count(*) from mine where rel = 'city'),
  'upcoming_nearby', (select count(*) from mine where rel = 'surrounding'),
  'upcoming_by_label', (select count(*) from labelled),
  'labelled_here_but_placed_elsewhere', (select coalesce(jsonb_agg(jsonb_build_object('event', l.slug, 'venue', l.venue_name, 'relation', l.rel)), '[]'::jsonb)
                                           from labelled l where l.rel in ('region', 'outside')),
  'labelled_here_not_yet_placed', (select count(*) from labelled where rel = 'unplaced'),
  'by_category', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
      select coalesce(c.guide_label, case when m.category_review = 'needed' then 'needs a category' else 'not a guide category' end) k, count(*) n
        from mine m left join public.event_categories c on c.id = m.category_id and c.guide_order is not null group by 1) x),
  'by_date', (select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) from (
      select to_char((m.start_date at time zone 'Australia/Sydney')::date, 'YYYY-MM-DD') d, count(*) n from mine m
       where m.start_date < now() + interval '14 days' group by 1) x),
  'by_suburb', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
      select coalesce(v.abs_sal_name, 'not placed') k, count(*) n from mine m left join public.venues v on v.id = m.venue_id group by 1) x),
  'duplicates', (select count(*) from (select lower(btrim(title)), venue_id, start_date from mine group by 1, 2, 3 having count(*) > 1) d),
  'stale', (select count(*) from mine m where m.listing_series_id is not null
              and (public.event_last_checked(m.id) < now() - interval '1 day' or m.listing_fresh_until < now())),
  'awaiting_verification', (select count(*) from public.listing_candidates c join src on src.id = c.source_id where c.status = 'waiting'),
  'with_authorised_image', (select count(*) from photo where own_rights or venue_photo),
  'with_external_ticketing', (select count(*) from mine where external_ticket_url is not null),
  'selling_through_eventlinqs', (select count(*) from mine v where v.external_ticket_url is null
      and exists (select 1 from public.ticket_tiers t where t.event_id = v.id and t.is_active and t.is_visible and t.price > 0))
)
$$;

revoke all on function public.growth_city_coverage(text) from public, anon, authenticated;
grant execute on function public.growth_city_coverage(text) to service_role;
