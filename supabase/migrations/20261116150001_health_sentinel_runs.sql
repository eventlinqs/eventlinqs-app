-- THE VISITOR SENTINEL'S RUNS, KEPT (the PM's 12:35 item 5 of 16 November 2026, on Lawal's 12:13: 'the PM reported
-- green while his inbox held CRITICAL alerts'; 'EVERY REPORT READS THE SENTINEL: MARKET READY, every car's read back and
-- the PM's checks quote the sentinel's latest result from /admin/health'). The sentinel (src/app/api/cron/visitor-sentinel)
-- judged the live site every 6 hours and emailed its CRITICAL faults, but kept nothing: /admin/health could not show what
-- its last run found, so no report could quote it. Each run now writes one row: when it ran, whether it was a dry run,
-- whether every check passed, how many failed, and every check's result as the run judged it. Rows are kept, never
-- updated or deleted (four a day).
--
-- Granted in this migration (the 21 October 2026 rule): service_role reads and inserts, which is all the cron and the
-- admin page (through the service role, behind requireAdminSession) do; anon and authenticated nothing.

create table if not exists public.health_sentinel_runs (
  id uuid primary key default gen_random_uuid(),
  sentinel text not null check (sentinel in ('visitor')),
  ran_at timestamptz not null default now(),
  dry boolean not null default false,
  ok boolean not null,
  failing integer not null check (failing >= 0),
  results jsonb not null check (jsonb_typeof(results) = 'array')
);

create index if not exists health_sentinel_runs_latest on public.health_sentinel_runs (sentinel, ran_at desc);

alter table public.health_sentinel_runs enable row level security;
revoke all on public.health_sentinel_runs from anon, authenticated, service_role;
grant select, insert on public.health_sentinel_runs to service_role;
