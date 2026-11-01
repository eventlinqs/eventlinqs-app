-- THE DESK's WEEKLY ROWS BY CITY AND CHANNEL (Lawal's growth system directive, 1 November 2026 16:59, section 6: "Report
-- weekly by city and channel ... Use real transactions as the source of truth for sales"; second in the CONTROLLER's
-- 17:04 build order).
--
-- (1) growth_visit_channel(utm_medium, referrer, utm_source): WINDOW 2's channel rule (V3 item 7d, C:\dev\GROWTH\v3\
--     item7d-visit-to-paid-order.sql) as ONE function, so the desk and every later read classify a visit the same way.
-- (2) growth_channel_weekly(city): the last eight weeks (Monday, platform zone) for one city:
--       visits by channel: visitors, event page views, checkouts started, paid sales, tickets (ledger_entries, the
--       first touch the beacon and the webhook already carry; crawlers refused at the beacon);
--       new and returning visitors (returning = seen on an event of this city in an earlier week);
--       paid orders, gross ticket value and EventLinqs fee revenue from orders confirmed or partly refunded above A$0 on
--       this city's events (the scorecard's paid order rule), never a click and never gross as revenue;
--       newsletter confirmations, ALL cities until email_subscribers carries its city (WINDOW 2), said so in the row.
-- Service role only.

create or replace function public.growth_visit_channel(p_utm_medium text, p_referrer text, p_utm_source text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_utm_medium ilike '%email%' or p_referrer ~* '(mail\.|outlook|gmail)' then 'email'
    when p_utm_medium ilike any (array['%social%', '%paid%']) or p_referrer ~* '(facebook|instagram|fb\.|t\.co|twitter|x\.com|tiktok|linkedin|reddit)' then 'social'
    when p_referrer ~* '(google\.|bing\.|duckduckgo|yahoo\.|ecosia)' then 'search'
    when p_referrer ~* 'eventlinqs' or p_utm_source is not null then 'our links'
    when p_referrer is null then 'direct'
    else 'other'
  end
$$;

revoke all on function public.growth_visit_channel(text, text, text) from public, anon, authenticated;
grant execute on function public.growth_visit_channel(text, text, text) to service_role;

create or replace function public.growth_channel_weekly(p_city text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with city_events as (
  select e.id from public.events e where lower(coalesce(e.city_primary, e.venue_city, '')) = lower(p_city)
),
entries as (
  select le.kind, le.demand_action, le.quantity, le.visitor_hash,
         date_trunc('week', le.occurred_at at time zone 'Australia/Sydney')::date wk,
         public.growth_visit_channel(le.utm_medium, le.referrer, le.utm_source) channel
    from public.ledger_entries le
    join public.ledger_slots s on s.id = le.slot_id
   where s.source_ref::text in (select id::text from city_events)
     and le.occurred_at > now() - interval '56 days'
),
first_seen as (
  select visitor_hash, min(wk) wk from entries where kind = 'demand' and demand_action = 'page_view' and visitor_hash is not null group by 1
),
weeks as (select distinct wk from entries
          union select date_trunc('week', now() at time zone 'Australia/Sydney')::date),
orders as (
  select date_trunc('week', coalesce(o.confirmed_at, o.created_at) at time zone 'Australia/Sydney')::date wk, o.total_cents, o.platform_fee_cents
    from public.orders o
   where o.status in ('confirmed', 'partially_refunded') and o.total_cents > 0
     and o.event_id in (select id from city_events)
     and coalesce(o.confirmed_at, o.created_at) > now() - interval '56 days'
)
select coalesce(jsonb_agg(jsonb_build_object(
  'week', to_char(w.wk, 'YYYY-MM-DD'),
  'by_channel', (select coalesce(jsonb_object_agg(channel, jsonb_build_object(
       'visitors', v, 'event_page_views', pv, 'checkouts_started', co, 'paid_sales', ps, 'tickets', t)), '{}'::jsonb)
     from (select channel,
                  count(distinct visitor_hash) filter (where kind = 'demand' and demand_action = 'page_view') v,
                  count(*) filter (where kind = 'demand' and demand_action = 'page_view') pv,
                  count(*) filter (where kind = 'demand' and demand_action = 'checkout_started') co,
                  count(*) filter (where kind = 'sale') ps,
                  coalesce(sum(quantity) filter (where kind = 'sale'), 0) t
             from entries where entries.wk = w.wk group by channel) c),
  'new_visitors', (select count(*) from first_seen f where f.wk = w.wk),
  'returning_visitors', (select count(distinct e.visitor_hash) from entries e join first_seen f on f.visitor_hash = e.visitor_hash
                          where e.wk = w.wk and e.kind = 'demand' and e.demand_action = 'page_view' and f.wk < w.wk),
  'paid_orders', (select count(*) from orders o where o.wk = w.wk),
  'gross_ticket_cents', (select coalesce(sum(total_cents), 0) from orders o where o.wk = w.wk),
  'fee_revenue_cents', (select coalesce(sum(platform_fee_cents), 0) from orders o where o.wk = w.wk),
  'newsletter_confirmations_all_cities', (select count(*) from public.email_subscribers s
      where s.confirmed and date_trunc('week', coalesce(s.confirmed_at, s.subscribed_at) at time zone 'Australia/Sydney')::date = w.wk)
) order by w.wk), '[]'::jsonb)
from weeks w
$$;

revoke all on function public.growth_channel_weekly(text) from public, anon, authenticated;
grant execute on function public.growth_channel_weekly(text) to service_role;
