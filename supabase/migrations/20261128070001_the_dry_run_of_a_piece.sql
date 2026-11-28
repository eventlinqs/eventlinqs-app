-- WINDOW 5C, 28 November 2026, car T, T5 and car U, U5 (the PM's 02:05: "Take Monday's piece through scheduling
-- preparation in a dry mode up to the Blotato call: render, payload, validation, intake, approval record (a test approval
-- in a test campaign, never Lawal's), the schedule prepared and not sent. Every stage's row is read back."; the PM's
-- 02:12, U5: the test piece mel-comingsoon-2026-12-01 "through to a prepared, unsent schedule, with no publication").
--
-- THE DRY RUN'S OWN RECORD. A row asked here names a piece and the slot it is prepared for. The social run (each ten
-- minutes, src/lib/social/store.ts runAskedDryRuns) takes it through every stage the real path runs, in order, and writes
-- each stage's result, the schedule rows it would insert and the payload it would hand Blotato into THIS row only. The
-- test approval is this row itself, by its asker and never Lawal's: nothing is written to social_piece_approvals,
-- social_piece_schedules or the intake record, and no provider is called. Server jobs only: no visitor or signed in role
-- reads it.
create table if not exists public.social_dry_runs (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.social_pieces (id) on delete cascade,
  go_at timestamptz not null,
  asked_by text not null check (length(trim(asked_by)) >= 2 and asked_by !~* 'lawal'),
  asked_at timestamptz not null default now(),
  state text not null default 'asked' check (state in ('asked', 'done', 'failed')),
  stages jsonb not null default '[]'::jsonb check (jsonb_typeof(stages) = 'array'),
  schedule jsonb not null default '[]'::jsonb check (jsonb_typeof(schedule) = 'array'),
  payload jsonb not null default '[]'::jsonb check (jsonb_typeof(payload) = 'array'),
  done_at timestamptz,
  error text,
  check ((state = 'asked') = (done_at is null))
);

create index if not exists social_dry_runs_asked on public.social_dry_runs (asked_at) where state = 'asked';

alter table public.social_dry_runs enable row level security;
revoke all on public.social_dry_runs from anon, authenticated, service_role;
grant select, insert, update on public.social_dry_runs to service_role;
