-- THE LEARNING LOOP: THE MISSES REGISTER (Lawal 1 November 2026 16:13, relayed by the CONTROLLER 16:14 (5): "every
-- event found by anyone (a window, the leaders' comparison, a visitor, an organiser) that the engine did not already
-- hold goes into a MISSES register with WHY it was missed (source not registered, no adapter, parse fault, wrong city,
-- filtered wrongly, too late), and the fix that stops that kind of miss is built; a weekly report shows misses
-- falling. WINDOW 1 builds the register and its weekly report into the Growth Desk.")
--
-- event_misses: one row per event found that the engine did not hold, with who found it and where, why the engine
-- missed it, and the fix (what was built, its reference, when). Service role only: it is the engine's own record.
-- growth_misses_weekly(city): misses per week (Monday, platform zone) by reason, and how many are fixed, for the
-- desk's trend.

create table if not exists public.event_misses (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null references public.cities (slug) on update cascade on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz,
  venue_name text,
  found_by text not null check (found_by in ('window', 'leaders', 'visitor', 'organiser', 'engine')),
  found_by_detail text,
  found_on_url text check (found_on_url is null or found_on_url ~* '^https://[^[:space:]]+$'),
  found_at timestamptz not null default now(),
  reason text not null check (reason in ('source_not_registered', 'no_adapter', 'parse_fault', 'wrong_city',
                                         'filtered_wrongly', 'too_late', 'not_yet_known')),
  reason_detail text,
  source_id uuid references public.listing_sources (id) on delete set null,
  candidate_id uuid references public.listing_candidates (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  fix text,
  fix_ref text,
  fixed_at timestamptz,
  constraint event_misses_fix_is_whole check (fixed_at is null or (fix is not null and length(btrim(fix)) > 0))
);

create index if not exists event_misses_city_found_idx on public.event_misses (city_slug, found_at desc);

alter table public.event_misses enable row level security;
revoke all on table public.event_misses from anon, authenticated, service_role;
grant select, insert, update, delete on table public.event_misses to service_role;

comment on table public.event_misses is
  'The learning loop (Lawal 16:13): every event the engine did not hold when someone found it, why, and the fix that stops that kind of miss. Service role only.';

create or replace function public.growth_misses_weekly(p_city text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('week', w, 'misses', n, 'fixed', f, 'by_reason', r) order by w), '[]'::jsonb)
    from (
      select to_char(date_trunc('week', found_at at time zone 'Australia/Sydney'), 'YYYY-MM-DD') w,
             count(*) n, count(*) filter (where fixed_at is not null) f,
             jsonb_object_agg(reason, rn) r
        from (select m.*, count(*) over (partition by date_trunc('week', m.found_at at time zone 'Australia/Sydney'), m.reason) rn
                from public.event_misses m where m.city_slug = p_city) x
       group by 1
    ) weeks
$$;

revoke all on function public.growth_misses_weekly(text) from public, anon, authenticated;
grant execute on function public.growth_misses_weekly(text) to service_role;
