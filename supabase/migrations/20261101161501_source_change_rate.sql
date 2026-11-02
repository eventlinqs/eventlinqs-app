-- EACH SOURCE's MEASURED CHANGE RATE AND RE-READ INTERVAL, IN THE REGISTRY (the CONTROLLER's 1 November 2026 16:15,
-- Lawal's ruling on the re-read schedule: "every registered source is read AT LEAST ONCE A DAY ... ADAPTIVE: each
-- source's interval is learned from its own measured change rate (ETag, Last-Modified, content hash), between 6 and 24
-- hours ... CHEAP CHECKS: conditional requests ... a feed's own REFRESH-INTERVAL and each site's crawl delay and limits
-- are honoured, and a source stops on its first 403 or 429 ... WINDOW 3 builds this schedule ...; WINDOW 1 records
-- each source's measured change rate and interval in the registry and dashboard").
--
-- The registry is public.listing_sources (WINDOW 6). These columns are what WINDOW 3's schedule writes on every check and
-- what the coverage drill down shows: the validators for a conditional request, the counts the change rate is measured
-- from, the interval in force (6 to 24 hours, never longer than a day) and why, and a stop on 403 or 429.

alter table public.listing_sources add column if not exists last_etag text;
alter table public.listing_sources add column if not exists last_modified_header text;
alter table public.listing_sources add column if not exists last_content_hash text;
alter table public.listing_sources add column if not exists last_changed_at timestamptz;
alter table public.listing_sources add column if not exists checks_counted integer not null default 0 check (checks_counted >= 0);
alter table public.listing_sources add column if not exists changes_counted integer not null default 0
  check (changes_counted >= 0);
alter table public.listing_sources add column if not exists feed_refresh_interval interval;
alter table public.listing_sources add column if not exists crawl_delay_seconds integer check (crawl_delay_seconds is null or crawl_delay_seconds >= 0);
alter table public.listing_sources add column if not exists refresh_interval_hours integer not null default 24
  check (refresh_interval_hours between 6 and 24);
alter table public.listing_sources add column if not exists refresh_interval_reason text;
alter table public.listing_sources add column if not exists next_check_at timestamptz;
alter table public.listing_sources add column if not exists stopped_at timestamptz;
alter table public.listing_sources add column if not exists stopped_because text;

alter table public.listing_sources drop constraint if exists listing_sources_changes_within_checks;
alter table public.listing_sources add constraint listing_sources_changes_within_checks check (changes_counted <= checks_counted);
alter table public.listing_sources drop constraint if exists listing_sources_stop_says_why;
alter table public.listing_sources add constraint listing_sources_stop_says_why
  check (stopped_at is null or length(btrim(coalesce(stopped_because, ''))) > 0);

-- The measured change rate: the share of checks that found a change. Null until a source has been checked.
create or replace function public.listing_source_change_rate(p_source uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when checks_counted = 0 then null else round(changes_counted::numeric / checks_counted, 3) end
    from public.listing_sources where id = p_source
$$;

revoke all on function public.listing_source_change_rate(uuid) from public, anon, authenticated;
grant execute on function public.listing_source_change_rate(uuid) to service_role;

comment on column public.listing_sources.refresh_interval_hours is
  'The re-read interval in force, learned from this source''s measured change rate, 6 to 24 hours (Lawal''s ruling relayed by the CONTROLLER 1 November 2026 16:15). Written by WINDOW 3''s schedule.';
