-- THE ENGINE'S DAILY TIMETABLE, MEASURED (Lawal, 20 November 2026, 00:17; C:\dev\START-16OCT\DAILY-TIMETABLE-LOCKED-20NOV.md;
-- the PM's order of that night, train Y item 2): every run of a phase records its start, end, count of units and result,
-- so each morning a phase's start is worked backwards from its cutoff on measured times (src/lib/ops/timetable.ts), and
-- no phase is silent. IndexNow's answer for each hourly listings run is kept here too (the PM's 00:10 item 1), so it is
-- read from production, not from logs.
--
-- Append only: a run is written once, at its end, by the service role; nothing updates or deletes it.
create table if not exists public.ops_phase_runs (
  id uuid primary key default gen_random_uuid(),
  phase text not null check (phase in ('prepare', 'collect', 'verify', 'freeze', 'schedule', 'live', 'queue', 'report', 'send', 'inbox', 'midday', 'tonight', 'evening')),
  ride text not null check (length(btrim(ride)) between 3 and 60),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  units integer not null check (units >= 0),
  unit text not null check (length(btrim(unit)) between 2 and 30),
  result text not null check (length(btrim(result)) between 2 and 2000),
  failed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ops_phase_runs_ends_after_start check (ended_at >= started_at)
);
create index if not exists ops_phase_runs_phase_started on public.ops_phase_runs (phase, started_at desc);
comment on table public.ops_phase_runs is
  'The daily timetable, measured: one row per run of a phase (src/lib/ops/timetable.ts), its start, end, units and result. Append only. Written and read by the service role.';

alter table public.ops_phase_runs enable row level security;
revoke all on table public.ops_phase_runs from anon, authenticated, service_role;
grant select, insert on table public.ops_phase_runs to service_role;
