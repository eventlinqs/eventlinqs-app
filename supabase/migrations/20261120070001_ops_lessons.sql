-- THE ENGINE LEARNS INSIDE ITSELF (Lawal, 20 November 2026, 06:07, through the PM's 06:10; law 33 (e) made real in the
-- platform): every lesson is a row on production, not only a line in a file. Each holds when it was learned, the phase it
-- belongs to (when it belongs to one), what went wrong, its cause, what the engine now does instead, the guard or test that
-- holds it, and its evidence. C:\dev\START-16OCT\LEARNED-LOG.md's lines are imported once (source 'learned_log'); every
-- new fault found by a window ('window') or by the engine's own checks ('engine': a phase late, failed or silent the day
-- before, recorded by the morning run) writes its row the same hour. /admin/today and the 08:00 report read them from here.
--
-- Append only, idempotent by source_key: a lesson is written once and never updated or deleted, so the record of what was
-- learned and when cannot be rewritten. Written and read by the service role only.
create table if not exists public.ops_lessons (
  id uuid primary key default gen_random_uuid(),
  learned_at timestamptz not null,
  phase text check (phase is null or phase in ('prepare', 'collect', 'verify', 'freeze', 'schedule', 'live', 'queue', 'report', 'send', 'inbox', 'midday', 'tonight', 'evening')),
  went_wrong text not null check (length(btrim(went_wrong)) between 3 and 2000),
  cause text check (cause is null or length(btrim(cause)) between 3 and 2000),
  now_does text not null check (length(btrim(now_does)) between 3 and 2000),
  held_by text check (held_by is null or length(btrim(held_by)) between 3 and 1000),
  evidence text check (evidence is null or length(btrim(evidence)) between 3 and 1000),
  source text not null check (source in ('learned_log', 'window', 'engine')),
  source_key text not null unique check (length(btrim(source_key)) between 3 and 200),
  created_at timestamptz not null default now()
);
create index if not exists ops_lessons_learned_at on public.ops_lessons (learned_at desc);
comment on table public.ops_lessons is
  'What the engine learned (law 33 (e); Lawal 06:07 of 20 November 2026): one row per lesson, its cause, what the engine now does instead and what holds it. Append only, one row per source_key. Written and read by the service role.';

alter table public.ops_lessons enable row level security;
revoke all on table public.ops_lessons from anon, authenticated, service_role;
grant select, insert on table public.ops_lessons to service_role;
