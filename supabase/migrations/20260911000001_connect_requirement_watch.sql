-- ============================================================================
-- THE MONITOR'S OWN MEMORY. Close-out S1, the one clause that needs a clock.
--
-- S1 states the severity rules exactly, and one of them cannot be answered by
-- looking at a Stripe account:
--
--     "AMBER if anything is in currently_due, or a current_deadline falls
--      inside 14 days, or anything sits in pending_verification for more than
--      3 days."
--
-- Stripe publishes WHAT is pending verification and never WHEN it started.
-- `requirements.current_deadline` is Stripe's deadline for `currently_due`, not
-- an age for `pending_verification`, and the Account object carries no
-- per-requirement timestamp of any kind
-- (https://docs.stripe.com/api/accounts/object, fetched 2026-09-11). So "more
-- than 3 days" is only answerable if something on this side remembers the first
-- time it saw the requirement. This table is that memory and nothing else.
--
-- WHY THE AGE MATTERS RATHER THAN JUST THE PRESENCE. pending_verification is
-- the ORDINARY state of an account whose document Stripe is currently reading.
-- Reporting it the moment it appears would warn about every organiser who ever
-- uploads identification, which is the exact failure S1 exists to remove:
-- "Left in place, this check fires for nearly every organiser forever and
-- trains the owner to ignore the daily email." A requirement still pending
-- after three days is a different fact, and it is the one worth a line.
--
-- WHAT THIS TABLE IS NOT. It is not a ledger and must never be read as one. It
-- holds no money, no person and no decision, only "the monitor first saw this
-- string on this account at this time". Rows are DELETED when the requirement
-- clears, deliberately and unlike public.ledger_entries or
-- public.recovery_sends, because a requirement that clears and later returns is
-- a NEW wait and must be timed from its new beginning. A first_seen_at that
-- survived the clear would report an age of weeks for something that started
-- this morning, which is worse than having no age at all.
--
-- THE ONE INVARIANT THE DATABASE ENFORCES. first_seen_at never moves. An age
-- computed from a timestamp anything could rewrite is an assertion wearing a
-- measurement's clothes, so the trigger below refuses the rewrite rather than
-- trusting every future caller to leave it alone.
-- ============================================================================

create table if not exists public.connect_requirement_watch (
  stripe_account_id text not null,

  -- Which Stripe requirements list the string was observed in. Only
  -- pending_verification is written today, because it is the only bucket whose
  -- AGE any rule reads: currently_due and past_due are reported on presence,
  -- and past_due already carries Stripe's own deadline. The column is named for
  -- the bucket rather than hard-wired to one value so a later rule can add one
  -- without a table, but the constraint refuses anything nothing reads, so this
  -- can never quietly fill with data no code consults.
  bucket text not null,

  -- The Stripe requirement string itself, e.g. 'individual.verification.document'.
  requirement text not null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  constraint connect_requirement_watch_bucket_is_read
    check (bucket in ('pending_verification')),
  constraint connect_requirement_watch_account_shaped
    check (stripe_account_id like 'acct\_%'),
  constraint connect_requirement_watch_last_seen_not_before_first
    check (last_seen_at >= first_seen_at),

  primary key (stripe_account_id, bucket, requirement)
);

comment on table public.connect_requirement_watch is
  'Close-out S1: the health monitor''s own memory of when a Stripe requirement was first observed pending, so "pending for more than 3 days" is a measurement. Not a ledger: rows are deleted when the requirement clears, because a requirement that returns is a new wait.';
comment on column public.connect_requirement_watch.first_seen_at is
  'The first time the monitor saw this requirement on this account. Never moves: a trigger refuses the rewrite, because an age computed from an editable timestamp measures nothing.';
comment on column public.connect_requirement_watch.last_seen_at is
  'The most recent observation. Moves on every run, and is what a later cleanup would use to drop a row for an account the platform no longer reads.';

-- ---------------------------------------------------------------------------
-- first_seen_at NEVER MOVES.
--
-- The whole value of this table is that one column. Everything else may be
-- refreshed by an ordinary upsert; this one may not, and the refusal lives in
-- the database rather than in the one module that writes today, because the
-- module that writes tomorrow will not have read this comment.
-- ---------------------------------------------------------------------------
create or replace function public.connect_requirement_watch_first_seen_is_fixed()
returns trigger
language plpgsql
as $$
begin
  if new.first_seen_at is distinct from old.first_seen_at then
    raise exception
      'public.connect_requirement_watch: first_seen_at for % on % is % and does not move. An age measured from a rewritable timestamp measures nothing.',
      old.requirement, old.stripe_account_id, old.first_seen_at
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists connect_requirement_watch_first_seen_fixed on public.connect_requirement_watch;
create trigger connect_requirement_watch_first_seen_fixed
  before update on public.connect_requirement_watch
  for each row execute function public.connect_requirement_watch_first_seen_is_fixed();

alter table public.connect_requirement_watch enable row level security;

-- No policies, so RLS denies every anon and authenticated read outright. This
-- table names connected account ids and Stripe requirement strings, which are
-- platform operational detail and belong to nobody who is merely signed in.
revoke all on public.connect_requirement_watch from anon, authenticated;

-- ---------------------------------------------------------------------------
-- THE PROBE, so a build can ask the DATABASE whether this is really installed
-- rather than reading a migration file and believing it. Same shape as
-- ledger_guards() and recovery_guards().
-- ---------------------------------------------------------------------------
create or replace function public.connect_watch_guards()
returns table (guard text, holds boolean)
language sql
stable
as $$
  select 'table exists'::text,
         to_regclass('public.connect_requirement_watch') is not null
  union all
  select 'first_seen_at is trigger protected'::text,
         exists (
           select 1 from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           where c.relname = 'connect_requirement_watch'
             and t.tgname = 'connect_requirement_watch_first_seen_fixed'
             and not t.tgisinternal
         )
  union all
  select 'row level security is on'::text,
         coalesce((
           select c.relrowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'connect_requirement_watch'
         ), false)
  union all
  select 'no policy grants a signed-in reader access'::text,
         not exists (
           select 1 from pg_policies
           where schemaname = 'public' and tablename = 'connect_requirement_watch'
         )
  union all
  select 'only a bucket something reads may be written'::text,
         exists (
           select 1 from pg_constraint
           where conrelid = 'public.connect_requirement_watch'::regclass
             and conname = 'connect_requirement_watch_bucket_is_read'
         );
$$;

comment on function public.connect_watch_guards is
  'Close-out S1: five clauses a build can ask the live database, so "the watch table is installed" is answered by the database rather than by a migration file.';
