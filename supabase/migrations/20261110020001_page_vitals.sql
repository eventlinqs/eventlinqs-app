-- THE REAL VISITOR RECORD, INTERNAL ONLY (Lawal's law of 10 November 2026, 13:30: every page's main content in one
-- second, 'Measured as the main content visible (Largest Contentful Paint) at the 75th percentile of real visitors on
-- mobile, kept internally'; the PM's ruling of 15:05 (2); WINDOW 5A).
--
-- One row per measurement a real visitor's browser reported through Next.js's own useReportWebVitals hook: which kind
-- of page, phone or desktop, which of the three measures (LCP, INP, CLS), its value, and when. Numbers only: no address,
-- no URL, no user, no session, no device string, no identifier of any kind, and no cookie anywhere in the path. It is
-- read by the service role alone, at the 75th percentile, phone apart from desktop, by page type
-- (public.page_vitals_p75), and shown on no page.
--
-- Inside the live rules: the privacy policy already names 'browser and device type, ... pages viewed, and timestamps'
-- as technical information collected, and this keeps less than that; the cookie page puts cookieless measurement that
-- 'stores nothing on your device and cannot recognise you anywhere else' outside the consent question, and this sets
-- nothing on the device.

create table if not exists public.page_vitals (
  id bigint generated always as identity primary key,
  recorded_at timestamptz not null default now(),
  page_type text not null check (page_type ~ '^[a-z][a-z0-9-]{0,39}$'),
  device text not null check (device in ('mobile', 'desktop')),
  metric text not null check (metric in ('LCP', 'INP', 'CLS')),
  value double precision not null check (value >= 0 and value < 600000),
  rating text check (rating is null or rating in ('good', 'needs-improvement', 'poor'))
);

comment on table public.page_vitals is
  'Real visitor web vitals (LCP, INP, CLS), numbers only, no identifiers; internal only (Lawal''s law of 10 November 2026, 13:30). Read with page_vitals_p75.';

create index if not exists page_vitals_read on public.page_vitals (page_type, device, metric, recorded_at desc);

-- Only the server's own beacon route writes, and only the service role reads; no visitor role reaches a row.
alter table public.page_vitals enable row level security;
revoke all on public.page_vitals from anon, authenticated, service_role;
grant select, insert on public.page_vitals to service_role;

-- The reading the law names: the 75th percentile of each measure, phone apart from desktop, by page type, over the last
-- `days` days, with the number of measurements behind it.
create or replace function public.page_vitals_p75(days integer default 28)
returns table (page_type text, device text, metric text, p75 double precision, measurements bigint)
language sql
stable
set search_path = public, pg_temp
as $p75$
  select v.page_type, v.device, v.metric,
         percentile_cont(0.75) within group (order by v.value) as p75,
         count(*) as measurements
    from public.page_vitals v
   where v.recorded_at > now() - make_interval(days => greatest(1, least(days, 366)))
   group by v.page_type, v.device, v.metric
   order by v.page_type, v.device, v.metric;
$p75$;

revoke all on function public.page_vitals_p75(integer) from public, anon, authenticated;
grant execute on function public.page_vitals_p75(integer) to service_role;
