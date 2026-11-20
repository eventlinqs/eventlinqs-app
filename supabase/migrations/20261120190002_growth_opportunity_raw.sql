-- THE OPPORTUNITY SCORE'S NUMBERS IN ONE READ (law 41, Lawal, 20 November 2026, 16:08; the PM's 18:42 order, item 2:
-- /admin/opportunity took 11.9 s to its whole document, timed with an owner session).
--
-- src/lib/growth/opportunity.ts read, for each chunk of the published events not over before the 14 day window, their
-- ledger slots, then their demand rows slot chunk by slot chunk, then their saves, their orders, their tracked links and
-- the presses out on those links, every read awaited after the one before, and every row brought back to be counted on
-- the server. This counts the same rows the same way inside the database and answers once, one object per event:
--   attention   distinct visitors to its page: ledger demand page views on any slot whose source_ref is the event, by
--               visitor key, a row with no visitor key counted as itself (the code's 'row:' + id);
--   engaged     calendar adds, shares and follows on those slots, plus saves of the event made in the window;
--   conversion  its orders in the window whose status is a sale (p_sold, the platform's one definition, passed in by
--               the caller from src/lib/broadcast/sales-attribution.ts), plus presses out (share_link_events 'outbound',
--               never a test press) on its tracked links in the window;
--   health      over those sold orders that record both, the fee kept less Stripe's processing estimate, never below 0.
-- Relevance and the score stay in the code (opportunity-math.ts), unchanged. The window is [p_from, p_now).
--
-- Proved before it was kept: built inside a rolled back transaction on production, its answer compared with the same
-- figures counted the code's way, event by event, and both timed (C:\dev\EVIDENCE\EL-20NOV\speed\opp-proof-tx.sql).
-- Read only (stable), service role only, as growth_acquisition_facts is.
create or replace function public.growth_opportunity_raw(p_from timestamptz, p_now timestamptz, p_sold text[])
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
with ev as (
  select e.id, e.title, e.slug, e.city_primary, e.category_id, e.published_at, e.end_date
    from public.events e
   where e.status = 'published' and e.end_date >= p_from
),
demand as (
  select s.source_ref as event_id,
         count(distinct coalesce(le.visitor_hash, 'row:' || le.id::text)) filter (where le.demand_action = 'page_view') as attention,
         count(*) filter (where le.demand_action in ('calendar_add', 'share', 'follow')) as engaged
    from public.ledger_slots s
    join public.ledger_entries le on le.slot_id = s.id
   where s.source_ref in (select id from ev)
     and le.kind = 'demand'
     and le.demand_action in ('page_view', 'calendar_add', 'share', 'follow')
     and le.occurred_at >= p_from and le.occurred_at < p_now
   group by s.source_ref
),
saves as (
  select sv.event_id, count(*) as n
    from public.saved_events sv
   where sv.event_id in (select id from ev) and sv.created_at >= p_from and sv.created_at < p_now
   group by sv.event_id
),
sold as (
  select o.event_id, count(*) as n,
         sum(greatest(0, o.platform_fee_retained_cents - o.stripe_processing_estimate_cents))
           filter (where o.platform_fee_retained_cents is not null and o.stripe_processing_estimate_cents is not null) as health
    from public.orders o
   where o.event_id in (select id from ev) and o.created_at >= p_from and o.created_at < p_now
     and o.status::text = any (p_sold)
   group by o.event_id
),
presses as (
  select l.event_id, count(*) as n
    from public.share_links l
    join public.share_link_events x on x.link_id = l.id
   where l.event_id in (select id from ev)
     and x.kind = 'outbound' and x.is_test = false
     and x.occurred_at >= p_from and x.occurred_at < p_now
   group by l.event_id
)
select coalesce(jsonb_agg(jsonb_build_object(
         'id', ev.id, 'title', ev.title, 'slug', ev.slug, 'city_primary', ev.city_primary, 'category_id', ev.category_id,
         'published_at', ev.published_at, 'end_date', ev.end_date,
         'attention', coalesce(d.attention, 0),
         'engaged', coalesce(d.engaged, 0) + coalesce(sv.n, 0),
         'conversion', coalesce(so.n, 0) + coalesce(p.n, 0),
         'health', coalesce(so.health, 0)) order by ev.id), '[]'::jsonb)
  from ev
  left join demand d on d.event_id = ev.id
  left join saves sv on sv.event_id = ev.id
  left join sold so on so.event_id = ev.id
  left join presses p on p.event_id = ev.id
$function$;

revoke all on function public.growth_opportunity_raw(timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.growth_opportunity_raw(timestamptz, timestamptz, text[]) to service_role;
