-- THE GROWTH EXPERIMENTS REGISTER (Lawal's growth system directive, 1 November 2026 16:59, section 7: "Every experiment
-- must record: hypothesis, target audience, budget, start and end dates, primary metric, baseline, results, decision to
-- stop, improve or scale. Start with organic search, organiser distribution, weekly guides and direct partnerships.
-- Introduce paid advertising only after conversion tracking and contribution economics are reliable." The CONTROLLER's
-- 17:04 set it first in WINDOW 1's build order.)
--
-- One row per experiment, in the existing Growth Desk. Rules the database holds, so no screen can skip them:
--   a decision (stop, improve, scale) is taken only on a recorded result against a recorded baseline, with who and when;
--   a paid experiment (a budget for advertising) names the proof that tracking and contribution are reliable;
--   the end is on or after the start. Service role only.

create table if not exists public.growth_experiments (
  id uuid primary key default gen_random_uuid(),
  city_slug text references public.cities (slug) on update cascade on delete restrict,
  title text not null check (length(btrim(title)) between 3 and 200),
  hypothesis text not null check (length(btrim(hypothesis)) > 0),
  audience text not null check (length(btrim(audience)) > 0),
  channel text not null check (channel in ('organic_search', 'organiser_distribution', 'weekly_guide', 'partnership',
                                           'email', 'social', 'paid_advertising', 'other')),
  budget_cents integer not null default 0 check (budget_cents >= 0),
  starts_on date not null,
  ends_on date not null,
  primary_metric text not null check (length(btrim(primary_metric)) > 0),
  baseline numeric,
  baseline_note text,
  result numeric,
  result_note text,
  decision text check (decision is null or decision in ('stop', 'improve', 'scale')),
  decided_at timestamptz,
  decided_by text,
  tracking_proof text,
  created_at timestamptz not null default now(),
  constraint growth_experiments_ends_after_start check (ends_on >= starts_on),
  constraint growth_experiments_decided_on_a_result check (
    decision is null or (result is not null and baseline is not null and decided_at is not null
                         and length(btrim(coalesce(decided_by, ''))) > 0)),
  constraint growth_experiments_paid_needs_tracking_proof check (
    channel <> 'paid_advertising' or length(btrim(coalesce(tracking_proof, ''))) > 0)
);

alter table public.growth_experiments enable row level security;
revoke all on table public.growth_experiments from anon, authenticated, service_role;
grant select, insert, update, delete on table public.growth_experiments to service_role;

comment on table public.growth_experiments is
  'The growth directive''s section 7 (Lawal 1 November 2026): every experiment with its hypothesis, audience, budget, dates, metric, baseline, result and the decision to stop, improve or scale. Service role only.';
