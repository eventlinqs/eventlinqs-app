-- THE PUBLISHING RECOVERY (Lawal's hardening order of 22 November 2026, 09:27, sections 2 B, 2 E and 4; the PM's 09:32
-- item 2 (b), (d), (e)). Three parts, each additive:
--
-- (B) THE SUBMISSION ID IS KEPT. The publisher writes submission_ref ('blotato:<id>') the moment Blotato accepts a post,
--     while its row still reads scheduled, so a later run reads the submission before it would ever send again (store.ts
--     publishDuePieces, 'its earlier submission ... not sent again'). Migration 20261028210501 granted update on four
--     columns only, so every such write was refused and the 02:59 pair of 22 November kept no submission id. One column,
--     to the production worker only (least privilege): service_role.
--
-- (E) EVERY RUN WRITES ITS OWN ROW. social_publish_runs: one row per run of the social publish route, its start and end,
--     the deployment it ran on, and what it drew, approved, scheduled, published, held and failed. An HTTP 200 is not
--     proof; this row is. Written by the route through the service role only; nobody signed in reads or writes it.
--
-- (4) ONE PUBLISHING RUN AT A TIME. social_publish_lease holds one row; claim_social_publish_lease takes it atomically
--     only when it is free or expired, so the hourly cron, a repeated invocation and the five minute watchdog can never
--     run two publishing processes at once; release_social_publish_lease frees it only for its own holder.
--
-- Forward recovery: each part stands alone and is safe to run again (if not exists, on conflict do nothing, create or
-- replace). To withdraw the lease, the route reads a failed claim as 'another run holds it' and does nothing, so
-- dropping the two functions after a code revert leaves the publisher as it was.

grant update (submission_ref) on public.social_piece_schedules to service_role;

create table if not exists public.social_publish_runs (
  id uuid primary key default gen_random_uuid(),
  route text not null default '/api/cron/social-publish',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  deployment text,
  switch_on boolean not null,
  drawn integer not null default 0 check (drawn >= 0),
  approved integer not null default 0 check (approved >= 0),
  scheduled integer not null default 0 check (scheduled >= 0),
  due integer not null default 0 check (due >= 0),
  published integer not null default 0 check (published >= 0),
  held integer not null default 0 check (held >= 0),
  failed integer not null default 0 check (failed >= 0),
  ok boolean not null,
  result text not null check (char_length(result) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists social_publish_runs_started_at_idx on public.social_publish_runs (started_at desc);
alter table public.social_publish_runs enable row level security;
revoke all on public.social_publish_runs from public, anon, authenticated, service_role;
grant select, insert on public.social_publish_runs to service_role;

create table if not exists public.social_publish_lease (
  id smallint primary key default 1 check (id = 1),
  holder text,
  claimed_at timestamptz,
  expires_at timestamptz not null default 'epoch'
);
insert into public.social_publish_lease (id) values (1) on conflict (id) do nothing;
alter table public.social_publish_lease enable row level security;
revoke all on public.social_publish_lease from public, anon, authenticated, service_role;
grant select on public.social_publish_lease to service_role;

create or replace function public.claim_social_publish_lease(p_holder text, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if p_holder is null or length(p_holder) = 0 or p_seconds is null or p_seconds < 1 or p_seconds > 3600 then
    raise exception 'refused: a lease needs a holder and between 1 and 3600 seconds' using errcode = '23514';
  end if;
  update public.social_publish_lease
     set holder = p_holder, claimed_at = now(), expires_at = now() + make_interval(secs => p_seconds)
   where id = 1 and expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

create or replace function public.release_social_publish_lease(p_holder text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.social_publish_lease set expires_at = now() where id = 1 and holder = p_holder and expires_at > now();
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

revoke all on function public.claim_social_publish_lease(text, integer) from public, anon, authenticated;
revoke all on function public.release_social_publish_lease(text) from public, anon, authenticated;
grant execute on function public.claim_social_publish_lease(text, integer) to service_role;
grant execute on function public.release_social_publish_lease(text) to service_role;
