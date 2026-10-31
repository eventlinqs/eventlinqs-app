-- THE GROWTH SCORECARD HAS ONE DEFINITION (Law 8, Lawal 1 November 2026 03:27; the CONTROLLER's 03:32 G1 and G2).
-- WINDOW 6's daily scorecard (C:\dev\GROWTH\scorecard\scorecard.sql, run on production read only into
-- C:\dev\GROWTH\today.json) and the growth desk on /admin/growth must never disagree, so the query lives here once:
-- growth_scorecard_read() returns exactly that read, its body moved over unchanged, and the laptop script and the page
-- both call it. growth_scorecard_daily keeps one row a day (Melbourne's day) for the desk's weekly trend, written by
-- growth_scorecard_snapshot() from the daily route. Server only: no anon, no authenticated (the 21 October grant rule).

create or replace function public.growth_scorecard_read()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with vis as (
  select e.* from public.events e
   where e.status = 'published' and e.visibility = 'public'
     and ((e.end_date is not null and e.end_date >= now()) or (e.end_date is null and e.start_date >= date_trunc('day', now())))
     and (e.listing_fresh_until is null or e.listing_fresh_until >= now())),
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
  from vis v),
paid_orders as (select o.* from public.orders o where o.status in ('confirmed', 'partially_refunded') and o.total_cents > 0)
select jsonb_build_object(
  'read_at', now(),
  'visible_events', (select count(*) from vis),
  'checked_next_14_days_by_city', (select coalesce(jsonb_object_agg(city, n), '{}'::jsonb) from (
      select initcap(lower(btrim(coalesce(city_primary, venue_city)))) city, count(*) n from vis
       where start_date >= now() and start_date < now() + interval '14 days' group by 1) c),
  'photo_rights_recorded', (select count(*) from photo where own_rights or venue_photo),
  'photo_own_rights_recorded', (select count(*) from photo where own_rights),
  'photo_approved_venue', (select count(*) from photo where venue_photo),
  'claims_verified', (select count(*) from public.listing_claims where status = 'verified'),
  'claims_all', (select count(*) from public.listing_claims),
  'venues_claimed', (select count(*) from public.venues where claimed_at is not null),
  'frequent_paid_organisers_30d', (select count(distinct organisation_id) from paid_orders where coalesce(confirmed_at, created_at) >= now() - interval '30 days'),
  'paid_tickets_7d', (select count(*) from public.tickets t join paid_orders o on o.id = t.order_id
      where coalesce(o.confirmed_at, o.created_at) >= now() - interval '7 days' and t.refunded_at is null and coalesce(t.status, '') not in ('refunded', 'cancelled', 'void')),
  'remind_me_active', (select count(*) from public.event_reminders where unsubscribed_at is null),
  'remind_me_distinct_emails', (select count(distinct lower(email)) from public.event_reminders where unsubscribed_at is null),
  'subscribers_confirmed', (select count(*) from public.email_subscribers where confirmed and unsubscribed_at is null),
  'subscribers_all_active', (select count(*) from public.email_subscribers where unsubscribed_at is null),
  'outreach_sent_yesterday', (select count(*) from public.outreach_touches
      where sent_at >= (date_trunc('day', now() at time zone 'Australia/Melbourne') - interval '1 day') at time zone 'Australia/Melbourne'
        and sent_at < date_trunc('day', now() at time zone 'Australia/Melbourne') at time zone 'Australia/Melbourne'),
  'outreach_replies_yesterday', (select count(*) from public.outreach_replies
      where received_at >= (date_trunc('day', now() at time zone 'Australia/Melbourne') - interval '1 day') at time zone 'Australia/Melbourne'
        and received_at < date_trunc('day', now() at time zone 'Australia/Melbourne') at time zone 'Australia/Melbourne')
)
$$;

revoke all on function public.growth_scorecard_read() from public, anon, authenticated;
grant execute on function public.growth_scorecard_read() to service_role;

create table if not exists public.growth_scorecard_daily (
  -- Melbourne's calendar day the numbers were read on.
  day date primary key,
  read_at timestamptz not null default now(),
  -- The growth/plan.json version the desk measured against that day.
  plan_version integer not null check (plan_version >= 1),
  numbers jsonb not null
);

comment on table public.growth_scorecard_daily is
  'One read of growth_scorecard_read() a day (Melbourne), kept for the growth desk''s weekly trend (Law 8). Written by growth_scorecard_snapshot from the daily route; a second read the same day replaces that day''s row.';

alter table public.growth_scorecard_daily enable row level security;
revoke all on public.growth_scorecard_daily from anon, authenticated, service_role;
grant select, insert, update on public.growth_scorecard_daily to service_role;

create or replace function public.growth_scorecard_snapshot(p_plan_version integer)
returns public.growth_scorecard_daily
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into public.growth_scorecard_daily (day, read_at, plan_version, numbers)
  values ((now() at time zone 'Australia/Melbourne')::date, now(), p_plan_version, public.growth_scorecard_read())
  on conflict (day) do update set read_at = excluded.read_at, plan_version = excluded.plan_version, numbers = excluded.numbers
  returning *
$$;

revoke all on function public.growth_scorecard_snapshot(integer) from public, anon, authenticated;
grant execute on function public.growth_scorecard_snapshot(integer) to service_role;
