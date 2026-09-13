-- ===========================================================================
-- GA2. THE MATCHER. Who inside a consented audience should hear about an event,
-- decided by arithmetic a person can read, check and argue with.
--
-- WHY IT IS ARITHMETIC AND NOT A MODEL. A learned model over a few hundred
-- orders would be a guess wearing a lab coat, and the first time an organiser
-- asks why their event went to 340 people and not 3,400 the answer has to be on
-- screen. The arithmetic is also the baseline any later model has to beat,
-- which is the only honest way to know a model was worth building.
--
-- WHY EVERY NUMBER IS A ROW. Weights, the recency half life, the price band
-- tolerance, the postcode bands, the cooldown, the floor and the cap are all
-- configuration read at runtime. A weight tuned by editing code is a weight
-- nobody can tune, and GA2's acceptance 4 proves the ranking moves when a row
-- moves, with no deploy.
--
-- NOTHING SENDS. This migration creates no sender, no queue and no schedule.
--
-- Additive and reversible: drop the five tables and the two triggers and the
-- platform is exactly as it was. TEST database only, applied with
-- `supabase db query --linked -f` from the lane B worktree.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE CONFIGURATION. One row, and every number the matcher uses.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_match_config (
  id boolean primary key default true,
  method_name text not null,
  method_version text not null,
  recency_half_life_days integer not null,
  price_band_tolerance integer not null,
  send_cooldown_days integer not null,
  minimum_score_floor numeric not null,
  max_recipients_per_run integer not null,
  weight_sum_tolerance numeric not null default 0.001,
  updated_at timestamptz not null default now(),
  constraint marketing_match_config_single_row check (id),
  constraint marketing_match_config_half_life_sane check (recency_half_life_days between 1 and 3650),
  constraint marketing_match_config_tolerance_sane check (price_band_tolerance between 0 and 5),
  constraint marketing_match_config_cooldown_sane check (send_cooldown_days between 0 and 365),
  constraint marketing_match_config_floor_sane check (minimum_score_floor between 0 and 100),
  constraint marketing_match_config_cap_sane check (max_recipients_per_run between 1 and 1000000)
);

comment on table public.marketing_match_config is
  'GA2. Every number the matcher uses, as configuration rather than as a literal in code. The method name and version are printed by the code and by the admin view so a stored run can always say what produced it.';

insert into public.marketing_match_config
  (id, method_name, method_version, recency_half_life_days, price_band_tolerance,
   send_cooldown_days, minimum_score_floor, max_recipients_per_run)
values
  (true, 'weighted-additive', 'v1', 120, 1, 14, 20, 5000)
on conflict (id) do nothing;

alter table public.marketing_match_config enable row level security;

-- ---------------------------------------------------------------------------
-- 2. THE WEIGHTS, AND THE SENTENCE EACH ONE IS EXPLAINED BY.
--
-- The sentence lives beside the weight rather than in the page, because the
-- explanation an organiser reads and the number that produced it have to be one
-- thing. Change the weight without changing the sentence and the screen starts
-- lying quietly.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_match_weights (
  component text primary key,
  weight numeric not null,
  sentence text not null,
  constraint marketing_match_weights_range check (weight >= 0 and weight <= 1),
  constraint marketing_match_weights_sentence_present check (length(btrim(sentence)) > 0)
);

comment on table public.marketing_match_weights is
  'GA2. One row per scoring component: its weight and the one sentence that explains it to an organiser. The weights must sum to one within marketing_match_config.weight_sum_tolerance, and the resolver refuses to score at all when they do not.';

insert into public.marketing_match_weights (component, weight, sentence) values
  ('category',        0.24, 'They have bought a ticket in this category before.'),
  ('community',       0.16, 'This event belongs to a community they have bought from before.'),
  ('city',            0.14, 'They have bought a ticket in this city before.'),
  ('postcode',        0.07, 'The venue is near a postcode they have bought near before.'),
  ('price',           0.11, 'This ticket costs about what they usually pay.'),
  ('recency',         0.13, 'They bought recently, and the pull of a purchase halves as it ages.'),
  ('spend',           0.05, 'They have spent more with EventLinqs over time than most buyers.'),
  ('channel_consent', 0.10, 'They have agreed to hear from EventLinqs on the channel this campaign uses.')
on conflict (component) do update
  set weight = excluded.weight, sentence = excluded.sentence;

alter table public.marketing_match_weights enable row level security;

-- ---------------------------------------------------------------------------
-- 3. THE POSTCODE BANDS. Australian postcodes carry their geography in their
--    leading digits, so proximity is how many of them two postcodes share.
--    A row per band rather than a ladder in code, for the same reason as above.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_match_postcode_bands (
  band integer primary key,
  shared_prefix integer not null,
  fit numeric not null,
  label text not null,
  constraint marketing_match_postcode_bands_prefix check (shared_prefix between 0 and 4),
  constraint marketing_match_postcode_bands_fit check (fit >= 0 and fit <= 1),
  constraint marketing_match_postcode_bands_label_present check (length(btrim(label)) > 0)
);

insert into public.marketing_match_postcode_bands (band, shared_prefix, fit, label) values
  (1, 4, 1.00, 'the same postcode'),
  (2, 2, 0.60, 'the same postal district'),
  (3, 1, 0.30, 'the same state postcode range'),
  (4, 0, 0.00, 'nowhere near')
on conflict (band) do update
  set shared_prefix = excluded.shared_prefix, fit = excluded.fit, label = excluded.label;

alter table public.marketing_match_postcode_bands enable row level security;

-- ---------------------------------------------------------------------------
-- 4. THE RUN. One row per time somebody asked the question.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_match_run (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  method_name text not null,
  method_version text not null,
  config_snapshot jsonb not null,
  requested_cap integer not null,
  audience_considered integer not null default 0,
  suppressed_by_reason jsonb not null default '{}'::jsonb,
  returned_count integer not null default 0,
  truncated boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  actor_user_id uuid references auth.users(id) on delete set null,
  constraint marketing_match_run_cap_sane check (requested_cap between 1 and 1000000)
);

comment on table public.marketing_match_run is
  'GA2. One matcher run: the event, the method and version, the whole configuration as it stood, the funnel from audience considered to suppressed to returned, and whether the list was truncated by the cap. Truncation is RECORDED rather than hidden, because a list cut silently is a list nobody knows was cut.';

alter table public.marketing_match_run enable row level security;

-- ---------------------------------------------------------------------------
-- 5. THE SCORES. One row per person the run returned, with the breakdown.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_match_score (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.marketing_match_run(id) on delete cascade,
  audience_member_id uuid not null references public.audience_members(id) on delete cascade,
  score numeric not null,
  breakdown jsonb not null,
  rank integer not null,
  created_at timestamptz not null default now(),
  constraint marketing_match_score_bounded check (score >= 0 and score <= 100),
  constraint marketing_match_score_rank_positive check (rank >= 1),
  constraint marketing_match_score_one_per_member unique (run_id, audience_member_id),
  constraint marketing_match_score_one_per_rank unique (run_id, rank)
);

comment on table public.marketing_match_score is
  'GA2. One scored person inside one run, with the component breakdown that produced the number. The breakdown is stored rather than recomputed, so a run can always be explained exactly as it was even after the weights move.';

alter table public.marketing_match_score enable row level security;

-- ---------------------------------------------------------------------------
-- 6. THE INVARIANT, HELD BY THE DATABASE AND NOT BY THE CALLER.
--
--    GA2's guard states it: no score row may reference somebody the consent
--    resolver refuses, and no run may hold more score rows than its own cap.
--    Both are enforced here as well as checked by the guard, because a guard
--    reads what happened and a trigger stops it happening.
-- ---------------------------------------------------------------------------
create or replace function public.match_score_requires_live_consent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_permitted boolean;
  v_cap integer;
  v_rows integer;
begin
  select email into v_email from public.audience_members where id = new.audience_member_id;
  if v_email is null then
    raise exception 'marketing_match_score refused: audience member % does not exist', new.audience_member_id
      using errcode = '23503';
  end if;

  select permitted into v_permitted from public.audience_consent_is_live(v_email);
  if not coalesce(v_permitted, false) then
    raise exception
      'marketing_match_score refused for audience member % in run %: the consent resolver does not permit marketing to that person',
      new.audience_member_id, new.run_id
      using errcode = '23514';
  end if;

  select requested_cap into v_cap from public.marketing_match_run where id = new.run_id;
  select count(*) into v_rows from public.marketing_match_score where run_id = new.run_id;
  if v_rows >= coalesce(v_cap, 0) then
    raise exception
      'marketing_match_score refused: run % already holds % row(s) and its cap is %',
      new.run_id, v_rows, v_cap
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_match_score_requires_live_consent on public.marketing_match_score;
create trigger trg_match_score_requires_live_consent
  before insert on public.marketing_match_score
  for each row execute function public.match_score_requires_live_consent();

-- ---------------------------------------------------------------------------
-- 6b. THE SAME INVARIANT, READABLE. One view, so the guard and a person read
--     the same definition rather than two descriptions of it.
--
--     A trigger stops a bad row arriving. This says whether one is THERE, which
--     is a different question and the one a guard has to answer: a trigger that
--     was dropped, disabled or added after the fact leaves rows behind it, and
--     nothing about the trigger's existence proves the table is clean.
-- ---------------------------------------------------------------------------
create or replace view public.marketing_match_invariant_breaches as
  select
    'score_for_a_refused_subject'::text as breach,
    s.run_id,
    s.audience_member_id,
    format('audience member %s in run %s is scored and the consent resolver refuses them', s.audience_member_id, s.run_id) as detail
    from public.marketing_match_score s
    join public.audience_members a on a.id = s.audience_member_id
   cross join lateral public.audience_consent_is_live(a.email) v
   where not coalesce(v.permitted, false)
  union all
  select
    'run_over_its_own_cap'::text,
    r.id,
    null::uuid,
    format('run %s holds %s score row(s) and its cap is %s', r.id, count(s.id), r.requested_cap)
    from public.marketing_match_run r
    left join public.marketing_match_score s on s.run_id = r.id
   group by r.id, r.requested_cap
  having count(s.id) > r.requested_cap;

comment on view public.marketing_match_invariant_breaches is
  'GA2. Empty when the matcher invariant holds: no score row for somebody the consent resolver refuses, and no run holding more score rows than its own cap. scripts/guards/matcher-consented-and-capped.mjs reads it.';

-- ---------------------------------------------------------------------------
-- 7. THE REVERSAL SWITCH, on the governed flag system rather than a private one.
-- ---------------------------------------------------------------------------
insert into public.feature_flags (flag, enabled, description)
values (
  'marketing_matcher_enabled',
  true,
  'GA2. Whether a new matcher run may be produced. Set false and no new run starts and the admin view becomes a read of the runs already stored; every run, score and breakdown row is left exactly as it is.'
)
on conflict (flag) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- 8. THE INDEXES, AFTER THE COMMIT, for the reason recorded in the consent
--    ledger migration: CREATE INDEX is pipeline incompatible and flushes the
--    batch, so a file with one in the middle is not atomic.
-- ---------------------------------------------------------------------------
create index if not exists marketing_match_run_event_idx
  on public.marketing_match_run (event_id, started_at desc);
create index if not exists marketing_match_score_run_rank_idx
  on public.marketing_match_score (run_id, rank);
