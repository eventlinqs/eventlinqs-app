-- THE GROWTH DESK'S ACQUISITION FACTS, V3 ITEM 10 (Lawal's Growth Engine V3 build checklist, decided 1 November 2026
-- 05:12): how many suitable prospects exist, who to approach today and why, how many contacts are legally eligible,
-- how many replied, how many qualified opportunities, how many switched on ticketing, made a first paid sale and came
-- back with another, revenue, which channel works, every number split by city, organiser group and source.
--
-- ONE READ, ONE ROW PER ORGANISER, EACH FACT FROM THE ROW THAT PROVES IT, so the desk's totals are the database's
-- (the checklist's acceptance test 'Desk totals match the database'). The arithmetic (the ten stages and their rates,
-- the priority score and its reasons) stays in src/lib/growth/acquisition-funnel-math.ts and priority-math.ts; this
-- only gathers. The rules are the ones already written, never a second copy of a different one:
--   their nights        events at their venues (organiser_venues, venue not removed) or under their own organisation,
--                       published and public, starting within 90 days either side of now (the acquisition state).
--   their city          the city of most of those nights (the scorecard's city words: city_primary, else venue_city).
--   group and source    their newest conversion opportunity (20261101060001), else null, said 'not recorded'.
--   permitted contact   a contact with a whole basis (organiser_contacts.basis other than 'none').
--   eligible contact    a permitted contact outreach_contact_refusal() does not refuse (the send path's own check).
--   contacted, replied  a touch sent (sent_at set); any reply; a reply whose outcome is yes or interested.
--   ownership verified  the acquisition state reached verified or beyond (organiser_acquisition_state_of).
--   ticketing on        an active paid tier (above A$0) on a night under their own organisation.
--   paid sale           an order confirmed or partly refunded above A$0 (the scorecard's paid_orders), on their events.
-- An outside ticket link is returned only as the link, for the ticketing ties, and is never a sale.
-- Service role only.

create or replace function public.growth_acquisition_facts()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with o as (
  select g.id, g.name, g.organisation_id, g.acquisition_state from public.organisers g
),
nights as (
  select o.id organiser_id, e.id event_id, e.start_date, e.is_free, e.external_ticket_url,
         initcap(lower(btrim(coalesce(e.city_primary, e.venue_city)))) city
    from o
    join public.events e
      on (e.venue_id in (select ov.venue_id from public.organiser_venues ov join public.venues v on v.id = ov.venue_id
                          where ov.organiser_id = o.id and v.removed_at is null)
          or (o.organisation_id is not null and e.organisation_id = o.organisation_id))
   where e.status = 'published' and e.visibility = 'public'
     and e.start_date >= now() - interval '90 days' and e.start_date < now() + interval '90 days'
),
city_of as (
  select distinct on (organiser_id) organiser_id, city
    from (select organiser_id, city, count(*) n from nights where city is not null and city <> '' group by 1, 2) c
   order by organiser_id, n desc, city
),
opp as (
  select distinct on (organiser_id) organiser_id, who_first, source, state
    from public.conversion_opportunities where organiser_id is not null
   order by organiser_id, created_at desc, id
),
contacts as (
  select c.organiser_id, c.id, c.basis <> 'none' permitted,
         (c.basis <> 'none' and public.outreach_contact_refusal(c.id) is null) eligible
    from public.organiser_contacts c
),
paid_orders as (
  select ord.* from public.orders ord where ord.status in ('confirmed', 'partially_refunded') and ord.total_cents > 0
)
select coalesce(jsonb_agg(jsonb_build_object(
  'organiser_id', o.id,
  'name', o.name,
  'city', (select city from city_of where city_of.organiser_id = o.id),
  'group', (select who_first from opp where opp.organiser_id = o.id),
  'source', (select source from opp where opp.organiser_id = o.id),
  'opportunity_open', coalesce((select state = 'open' from opp where opp.organiser_id = o.id), false),
  'nights_90', (select count(*) from nights n where n.organiser_id = o.id),
  'paid_nights_90', (select count(*) from nights n where n.organiser_id = o.id and not coalesce(n.is_free, false)),
  'next_night_at', (select min(n.start_date) from nights n where n.organiser_id = o.id and n.start_date >= now()),
  'outside_ticket_urls', (select coalesce(jsonb_agg(distinct n.external_ticket_url), '[]'::jsonb) from nights n
                           where n.organiser_id = o.id and n.external_ticket_url is not null),
  'permitted_contacts', (select count(*) from contacts c where c.organiser_id = o.id and c.permitted),
  'eligible_contacts', (select count(*) from contacts c where c.organiser_id = o.id and c.eligible),
  'touches_sent', (select count(*) from public.outreach_touches t join contacts c on c.id = t.contact_id
                    where c.organiser_id = o.id and t.sent_at is not null),
  'replies', (select count(*) from public.outreach_replies r join contacts c on c.id = r.contact_id where c.organiser_id = o.id),
  'interested_replies', (select count(*) from public.outreach_replies r join contacts c on c.id = r.contact_id
                          where c.organiser_id = o.id and r.outcome in ('yes', 'interested')),
  'ownership_verified', o.acquisition_state in ('verified', 'media_approved', 'active', 'recurring'),
  'paid_tiers', (select count(*) from public.ticket_tiers t join public.events e on e.id = t.event_id
                  where o.organisation_id is not null and e.organisation_id = o.organisation_id and t.is_active and t.price > 0),
  'paid_events', (select count(distinct p.event_id) from paid_orders p join public.events e on e.id = p.event_id
                   where o.organisation_id is not null and e.organisation_id = o.organisation_id),
  'platform_fee_cents', (select coalesce(sum(p.platform_fee_cents), 0) from paid_orders p join public.events e on e.id = p.event_id
                          where o.organisation_id is not null and e.organisation_id = o.organisation_id)
) order by o.name), '[]'::jsonb)
from o
$$;

revoke all on function public.growth_acquisition_facts() from public, anon, authenticated;
grant execute on function public.growth_acquisition_facts() to service_role;
