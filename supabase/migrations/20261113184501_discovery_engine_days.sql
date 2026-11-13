-- THE EVENT DISCOVERY ENGINE'S OWN DAY LINE (WINDOW 5A, 13 November 2026; Lawal's 18:28 and 18:31: "the seven day proof
-- starts today"). One row per Melbourne day, written by the engine itself (the collection run's morning turn, a check that
-- reads the engine's own logs): each part of the acceptance test, (a) finds and registers sources, (b) reads every source
-- and raises a task on a failure, (c) publishes what passes and holds the rest with its reason, (d) attaches an organiser
-- and enters new organisers in the CRM, (e) merges duplicates and retires past and cancelled nights, (f) writes this line,
-- PASS or FAIL with its reason; the count of manual steps that day (a write by a window or a person to the sources, the
-- candidates or the listings); the day's numbers; and the consecutive days that read all PASS with no manual step, which a
-- FAIL or a manual step sets back to zero. The Command Centre shows the newest line. Nothing reads it to make a decision.
create table if not exists public.discovery_engine_days (
  day date primary key,
  checks jsonb not null check (jsonb_typeof(checks) = 'object'),
  manual_steps integer not null check (manual_steps >= 0),
  numbers jsonb not null check (jsonb_typeof(numbers) = 'object'),
  consecutive_days integer not null check (consecutive_days >= 0),
  all_passed boolean not null,
  written_at timestamptz not null default now(),
  constraint discovery_engine_days_count_is_honest check (all_passed or consecutive_days = 0),
  constraint discovery_engine_days_no_manual_step check (manual_steps = 0 or consecutive_days = 0)
);
comment on table public.discovery_engine_days is
  'The Event Discovery Engine''s own line for each Melbourne day (Lawal, 13 November 2026, 18:28 and 18:31): parts (a) to (f) PASS or FAIL with reasons, the manual steps that day, its numbers, and the consecutive days all PASS with no manual step. Written by the engine; shown on the Command Centre.';
alter table public.discovery_engine_days enable row level security;
revoke all on public.discovery_engine_days from anon, authenticated, service_role;
grant select, insert, update on public.discovery_engine_days to service_role;
