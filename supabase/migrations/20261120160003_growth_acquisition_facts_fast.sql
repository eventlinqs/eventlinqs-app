-- growth_acquisition_facts, THE SAME ANSWER IN A FRACTION OF THE TIME (law 41, Lawal, 20 November 2026, 16:08: every
-- page in one second). pg_stat_statements read it at 5,264 ms a call (23 calls) on production, the slowest read
-- behind /admin/growth and the board: its nights joined every organiser to every night of 180 days through an OR with
-- a correlated subquery, then every field scanned them again once per organiser. Made again from the function in
-- force (pg_get_functiondef, read 20 November 2026 at 16:31), with the same signature, language, volatility,
-- security and search path: nights by two indexed joins (the organiser's venues, its organisation), UNION so a night
-- matched both ways is one row as before; every count once per organiser by GROUP BY. Proved on production in a
-- rolled back transaction at 16:37: the same 231 rows, compared as sets, 'same': true; 1,067 and 844 ms in force,
-- 74 and 62 ms reshaped. CREATE OR REPLACE keeps its grants.
create or replace function public.growth_acquisition_facts()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
with o as (
  select g.id, g.name, g.organisation_id, g.acquisition_state from public.organisers g
),
pairs as (
  select ov.organiser_id, e.id as event_id
    from public.organiser_venues ov
    join public.venues v on v.id = ov.venue_id and v.removed_at is null
    join public.events e on e.venue_id = ov.venue_id
   where e.status = 'published' and e.visibility = 'public'
     and e.start_date >= now() - interval '90 days' and e.start_date < now() + interval '90 days'
  union
  select o.id, e.id
    from o join public.events e on e.organisation_id = o.organisation_id
   where o.organisation_id is not null and e.status = 'published' and e.visibility = 'public'
     and e.start_date >= now() - interval '90 days' and e.start_date < now() + interval '90 days'
),
nights as (
  select p.organiser_id, e.id as event_id, e.start_date, e.is_free, e.external_ticket_url,
         initcap(lower(btrim(coalesce(e.city_primary, e.venue_city)))) city
    from pairs p join public.events e on e.id = p.event_id
),
night_agg as (
  select organiser_id, count(*) as nights_90, count(*) filter (where not coalesce(is_free, false)) as paid_nights_90,
         min(start_date) filter (where start_date >= now()) as next_night_at,
         coalesce(jsonb_agg(distinct external_ticket_url) filter (where external_ticket_url is not null), '[]'::jsonb) as urls
    from nights group by organiser_id
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
contact_agg as (
  select organiser_id, count(*) filter (where permitted) as permitted, count(*) filter (where eligible) as eligible from contacts group by organiser_id
),
touch_agg as (
  select c.organiser_id, count(*) as sent from public.outreach_touches t join contacts c on c.id = t.contact_id where t.sent_at is not null group by 1
),
reply_agg as (
  select c.organiser_id, count(*) as replies, count(*) filter (where r.outcome in ('yes', 'interested')) as interested
    from public.outreach_replies r join contacts c on c.id = r.contact_id group by 1
),
tier_agg as (
  select e.organisation_id, count(*) as paid_tiers
    from public.ticket_tiers t join public.events e on e.id = t.event_id
   where t.is_active and t.price > 0 group by 1
),
money_agg as (
  select e.organisation_id, count(distinct p.event_id) as paid_events, coalesce(sum(p.platform_fee_cents), 0) as fee
    from public.orders p join public.events e on e.id = p.event_id
   where p.status in ('confirmed', 'partially_refunded') and p.total_cents > 0 group by 1
)
select coalesce(jsonb_agg(jsonb_build_object(
  'organiser_id', o.id,
  'name', o.name,
  'city', ci.city,
  'group', op.who_first,
  'source', op.source,
  'opportunity_open', coalesce(op.state = 'open', false),
  'nights_90', coalesce(na.nights_90, 0),
  'paid_nights_90', coalesce(na.paid_nights_90, 0),
  'next_night_at', na.next_night_at,
  'outside_ticket_urls', coalesce(na.urls, '[]'::jsonb),
  'permitted_contacts', coalesce(ca.permitted, 0),
  'eligible_contacts', coalesce(ca.eligible, 0),
  'touches_sent', coalesce(ta.sent, 0),
  'replies', coalesce(ra.replies, 0),
  'interested_replies', coalesce(ra.interested, 0),
  'ownership_verified', o.acquisition_state in ('verified', 'media_approved', 'active', 'recurring'),
  'paid_tiers', case when o.organisation_id is null then 0 else coalesce(tg.paid_tiers, 0) end,
  'paid_events', case when o.organisation_id is null then 0 else coalesce(ma.paid_events, 0) end,
  'platform_fee_cents', case when o.organisation_id is null then 0 else coalesce(ma.fee, 0) end
) order by o.name), '[]'::jsonb) as v
from o
left join night_agg na on na.organiser_id = o.id
left join city_of ci on ci.organiser_id = o.id
left join opp op on op.organiser_id = o.id
left join contact_agg ca on ca.organiser_id = o.id
left join touch_agg ta on ta.organiser_id = o.id
left join reply_agg ra on ra.organiser_id = o.id
left join tier_agg tg on tg.organisation_id = o.organisation_id
left join money_agg ma on ma.organisation_id = o.organisation_id
$function$;

-- POST-CONDITION: the reshaped body is the one in force.
do $post$
begin
  if position('pairs as (' in pg_get_functiondef('public.growth_acquisition_facts()'::regprocedure)) = 0 then
    raise exception 'growth_acquisition_facts is not the reshaped body';
  end if;
end $post$;
