-- ===========================================================================
-- FT1. THE FORECAST TOOL, AND THE RUNS IT KEEPS.
--
-- WHY EVERY RUN IS STORED. Two reasons, and the second is the one that makes
-- this product rather than marketing. First, AN1 has to be able to count tool
-- to signup, which needs the run and the arrival on the same row. Second, and
-- this is the whole plan: when the first real events have sold, the platform
-- can compare what the tool SAID against what actually happened, for the same
-- shape of event. That comparison is what turns the arithmetic line into a
-- measured one, and it cannot be made retrospectively if nobody kept the
-- inputs.
--
-- IT IS NOT A LEAD TABLE. An email is optional, is null for almost every row,
-- and is stored only when somebody asked for their result to be sent. A run
-- with no email is the normal case and is still worth keeping, because the
-- event shape is the valuable part.
--
-- THE PARAMETERS ARE STORED BESIDE THE FIGURES, deliberately. A fee rate moves,
-- and a stored output computed under the old rate is not wrong, it is historical
-- the same way a snapshot is. `source_parameters` records what the arithmetic
-- was run WITH, so a run can be re-read six months later and understood.
--
-- Additive and reversible. Applied to TEST vkapkibzokmfaxqogypq from the lane B
-- worktree. Production is the founder's `npm run migrate:production`.
-- ===========================================================================

begin;

create table if not exists public.forecast_runs (
  id uuid primary key default gen_random_uuid(),

  -- WHAT THEY TYPED. Columns rather than a blob, because the comparison this
  -- table exists for groups by event shape, and a group by over a JSONB key is
  -- a scan of the whole table.
  event_type text,
  city_slug text,
  capacity integer not null,
  ticket_price_cents integer not null,
  costs_cents integer not null default 0,
  days_until_event integer not null default 0,
  fee_pass_type text not null default 'pass_to_buyer',
  has_run_an_event_before boolean,

  -- WHAT THE TOOL ANSWERED, and what it answered it WITH.
  outputs jsonb not null,
  source_parameters jsonb not null,
  -- The method is a column rather than a key inside outputs, because "how many
  -- of these were arithmetic" is the question that tells us when the tool grew
  -- up, and it should not need a JSONB scan to answer.
  method text not null,

  -- WHERE THEY CAME FROM (AN1's two fields, same names, same meanings).
  src text,
  referrer_host text,

  -- OPTIONAL, and only when asked for.
  email text,
  email_consent_text text,
  email_consent_at timestamptz,

  created_at timestamptz not null default now(),

  constraint forecast_runs_capacity_sane check (capacity >= 0 and capacity <= 1000000),
  constraint forecast_runs_price_sane check (ticket_price_cents >= 0 and ticket_price_cents <= 100000000),
  constraint forecast_runs_costs_sane check (costs_cents >= 0 and costs_cents <= 1000000000),
  constraint forecast_runs_days_sane check (days_until_event >= 0 and days_until_event <= 3650),
  constraint forecast_runs_method_known check (method in ('arithmetic', 'measured')),
  constraint forecast_runs_fee_pass_known check (fee_pass_type in ('pass_to_buyer', 'absorb')),
  -- AN EMAIL CANNOT BE STORED WITHOUT THE WORDS SOMEBODY AGREED TO. The whole
  -- of GA1 is that consent which cannot say what it was for is consent that
  -- cannot be used, and a marketing tool collecting addresses is exactly where
  -- that rule gets forgotten. The database refuses it rather than a reviewer
  -- noticing.
  constraint forecast_runs_email_carries_its_consent
    check (email is null or (email_consent_text is not null and length(email_consent_text) > 0 and email_consent_at is not null))
);

comment on table public.forecast_runs is
  'FT1. One row per run of the public forecast tool: what was typed, what was answered, the parameters it was answered with, and where the visitor came from. The email is optional and is refused without the consent wording it was given under.';

comment on column public.forecast_runs.source_parameters is
  'FT1. The fee rates and the threshold the arithmetic actually used, so a stored output can be understood after the configuration moves.';

create index if not exists forecast_runs_shape_idx
  on public.forecast_runs (event_type, city_slug, created_at desc);

create index if not exists forecast_runs_src_idx
  on public.forecast_runs (src, created_at desc)
  where src is not null;

-- ---------------------------------------------------------------------------
-- NOBODY READS THIS FROM A BROWSER.
--
-- RLS on with NO policy: the anon and authenticated roles can neither read nor
-- write it. The tool inserts with the service role from a server action, and
-- the owner reads it with the service role. A public page that collects event
-- shapes and addresses must not be a public page that hands them back.
-- ---------------------------------------------------------------------------
alter table public.forecast_runs enable row level security;

commit;
