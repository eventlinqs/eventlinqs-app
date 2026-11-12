-- THE GROWTH OS'S TASKS, OWNERS AND ORGANISER MERGES (Release 1, the Growth OS directive of 11 November 2026, PM order 4:
-- "Every record and every task carries status, owner, due date, last action, next action and a link; overdue items rise
-- to the top of the queue; failed jobs are never lost"; Lawal's directive section 4: "Assigned owner ... Prevent
-- duplicate records and preserve the history of merged records").
--
-- WHAT IS NEW, AND WHY IT IS A TABLE. /admin/today derives its queue each time it is read, so nothing records who owns an
-- item, when it is due, or that a job failed once its source stops showing it. growth_tasks keeps each one until it is
-- done or cancelled. A task names the record it serves (record_type, record_id) and the workflow it belongs to; it is
-- made by the system, never typed: source_key is unique, so the run that generates tasks can run again and make nothing
-- twice (idempotent), and a failed job writes its failure here with its attempts instead of vanishing.
--
-- OWNER. organisers.owner_id and growth_tasks.owner_id name a staff user; null means the founder, who owns everything
-- until a task or a record is given to someone else, so no record is ever without an owner.
--
-- MERGES. organiser_merges keeps the history of two organiser rows found to be one (the unique name, website and
-- Instagram keys stop most duplicates; the rest are merged by a reviewed write that records what moved), as
-- venue_merges already does for venues.
--
-- Additive only: two new tables, one new column with no default rewrite, no change to any existing row or function.
-- Granted in this migration (the 21 October 2026 rule): service_role reads and writes the tasks and reads and inserts the
-- merges; anon and authenticated nothing. No delete is granted on either: a task is cancelled, never deleted, and a merge
-- is history.

alter table public.organisers add column if not exists owner_id uuid references auth.users (id) on delete set null;
comment on column public.organisers.owner_id is
  'The staff user who owns this organiser; null means the founder (Growth OS, 11 November 2026).';

create table if not exists public.growth_tasks (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('organiser', 'venue', 'event', 'submission', 'claim', 'permission', 'campaign', 'message', 'source', 'social_piece', 'removal', 'job')),
  record_id uuid,
  workflow text not null check (workflow in ('organiser_acquisition', 'venue_partnership', 'listing_claim', 'media_permission', 'marketing', 'operations')),
  kind text not null check (length(btrim(kind)) between 2 and 60),
  title text not null check (length(btrim(title)) between 3 and 300),
  status text not null default 'open' check (status in ('open', 'waiting_approval', 'in_progress', 'done', 'failed', 'cancelled')),
  owner_id uuid references auth.users (id) on delete set null,
  due_on date,
  last_action text check (last_action is null or length(btrim(last_action)) between 2 and 500),
  last_action_at timestamptz,
  next_action text check (next_action is null or length(btrim(next_action)) between 2 and 500),
  -- One task per source event: the generator's key (for example 'held_touch:<touch id>'), so a rerun makes nothing twice.
  source_key text not null unique check (length(btrim(source_key)) between 3 and 200),
  attempts integer not null default 0 check (attempts >= 0),
  failure_reason text check (failure_reason is null or length(btrim(failure_reason)) between 2 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  constraint growth_tasks_done_is_whole check ((status in ('done', 'cancelled')) = (done_at is not null)),
  constraint growth_tasks_failed_says_why check (status <> 'failed' or failure_reason is not null),
  constraint growth_tasks_record_is_named check (record_type = 'job' or record_id is not null)
);
comment on table public.growth_tasks is
  'Every task the Growth OS tracks, until done or cancelled; made by the system from a source event (source_key), never typed (11 November 2026).';

create index if not exists growth_tasks_open_by_due on public.growth_tasks (due_on nulls last, created_at) where status not in ('done', 'cancelled');
create index if not exists growth_tasks_by_record on public.growth_tasks (record_type, record_id);

alter table public.growth_tasks enable row level security;
revoke all on public.growth_tasks from anon, authenticated, service_role;
grant select, insert, update on public.growth_tasks to service_role;

create table if not exists public.organiser_merges (
  id uuid primary key default gen_random_uuid(),
  kept_organiser_id uuid not null references public.organisers (id) on delete restrict,
  dropped_organiser_name text not null check (length(btrim(dropped_organiser_name)) between 2 and 200),
  dropped_organiser_id uuid not null unique,
  reason text not null check (length(btrim(reason)) between 5 and 500),
  moved jsonb not null,
  merged_by uuid not null references auth.users (id) on delete restrict,
  merged_at timestamptz not null default now(),
  constraint organiser_merges_two_organisers check (kept_organiser_id <> dropped_organiser_id)
);
comment on table public.organiser_merges is
  'The history of two organiser rows found to be one: what moved to the kept row, by whom and why (11 November 2026).';

alter table public.organiser_merges enable row level security;
revoke all on public.organiser_merges from anon, authenticated, service_role;
grant select, insert on public.organiser_merges to service_role;
