-- ===========================================================================
-- GA5. THE PROOF PAGE.
--
-- WHY EVERY FIGURE IS A READ. A client will not keep paying a commission they
-- cannot check. The moment anybody types a number onto this page it stops being
-- proof and becomes a claim, and not making claims is precisely what the
-- premium is for. So this migration adds the two CONFIGURATION values the page
-- needs and the snapshot table it writes, and not one figure.
--
-- THE COMMISSION IS A PRICING RULE, NOT A SECOND FEE TABLE. public.pricing_rules
-- is the platform's one money configuration: versioned, scoped by event then
-- organisation then region, audit logged and admin editable. GA5 says the fee
-- due is calculated by the EXISTING fee configuration, and this is it. A new
-- rule_type costs nothing and gains all of that; a new table would have been a
-- second place a money value lives, which is the one thing the fee doctrine
-- forbids.
--
-- AND IT IS NOT THE TICKETING FEE. The one fee law governs what a BUYER pays
-- for a ticket. This is what a CLIENT pays for sales a campaign produced:
-- different payer, different product, different surface. The proof page never
-- shows the ticketing fee and the checkout never shows this one.
--
-- Additive and reversible. Applied to TEST vkapkibzokmfaxqogypq from the lane B
-- worktree. Production is the founder's `npm run migrate:production`.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE COMMISSION, AS A PRICING RULE.
--
-- Seeded at a rate the owner changes in the admin pricing screen like any
-- other. It is written here ONCE, as a seed, and every surface reads it through
-- getPricingRule. Nothing in the application carries the number.
-- ---------------------------------------------------------------------------
/*
 * The rule_type CHECK is an explicit ARRAY, which is right: it means a typo in a
 * rule type is refused rather than silently becoming a rule nothing resolves.
 * So the new member is added to it, by name, rather than the constraint being
 * loosened.
 */
alter table public.pricing_rules drop constraint if exists pricing_rules_rule_type_check;
alter table public.pricing_rules add constraint pricing_rules_rule_type_check
  check (rule_type = any (array[
    'platform_fee_percentage',
    'platform_fee_fixed',
    'instant_payout_fee',
    'resale_fee',
    'featured_listing',
    'subscription_price',
    'processing_fee_percentage',
    'processing_fee_fixed_cents',
    'processing_fee_pass_through',
    'reserve_percentage',
    'payout_schedule_days',
    'application_fee_composition_mode',
    'venue_revenue_share_percentage',
    'marketing_commission_percentage'
  ]));

insert into public.pricing_rules
  (rule_type, value_type, value_percentage, country_code, currency, event_type, organiser_tier, effective_from)
select
  'marketing_commission_percentage', 'percentage', 10.0000, 'AU', 'AUD', 'all', 'all', now()
where not exists (
  select 1 from public.pricing_rules
   where rule_type = 'marketing_commission_percentage'
     and country_code = 'AU'
     and currency = 'AUD'
     and organisation_id is null
     and event_id is null
     and effective_until is null
);

-- ---------------------------------------------------------------------------
-- 2. THE COST OF A SEND, BESIDE THE CHANNEL IT DESCRIBES.
--
-- Cost per sale needs a cost per send and there was none anywhere. It lives on
-- the channel because it differs per channel by an order of magnitude, and it
-- is NULL rather than zero where it has not been set: a channel with no
-- recorded cost makes the page say the figure is unavailable, which is the
-- truth, instead of dividing by a zero somebody typed.
-- ---------------------------------------------------------------------------
alter table public.marketing_channel
  add column if not exists cost_per_send_cents integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_channel_cost_sane') then
    alter table public.marketing_channel
      add constraint marketing_channel_cost_sane
      check (cost_per_send_cents is null or cost_per_send_cents between 0 and 100000);
  end if;
end
$$;

comment on column public.marketing_channel.cost_per_send_cents is
  'GA5. What one message on this channel costs us, in cents. NULL means it has not been recorded, and the proof page says so rather than treating it as free.';

update public.marketing_channel set cost_per_send_cents = 2 where code = 'email' and cost_per_send_cents is null;
update public.marketing_channel set cost_per_send_cents = 6 where code = 'sms' and cost_per_send_cents is null;

-- ---------------------------------------------------------------------------
-- 3. THE MONTHLY SNAPSHOT.
--
-- Written when a month closes, holding the figures AND the source row ids as at
-- that date. A later reversal changes the live page and leaves the snapshot
-- alone, which is the whole point: an invoice raised in September is a
-- statement about September, and a chargeback in November corrects the current
-- number without rewriting what was true when the invoice went out.
--
-- `figures` and `sources` are jsonb rather than columns because the set of
-- figures is the page's business and will change; what must not change is that
-- every figure in `figures` has a key in `sources` naming the row ids or the
-- query it came from. That is a CHECK, below, rather than a convention.
-- ---------------------------------------------------------------------------
create or replace function public.marketing_proof_every_figure_is_sourced(
  p_figures jsonb,
  p_sources jsonb
) returns boolean
language sql
immutable
as $$
  select not exists (
    select 1 from jsonb_object_keys(p_figures) as k where not (p_sources ? k)
  )
$$;

comment on function public.marketing_proof_every_figure_is_sourced(jsonb, jsonb) is
  'GA5. True when every key in the figures object has a key in the sources object. The snapshot table checks it, so a figure nothing sources cannot be stored.';

create table if not exists public.marketing_proof_snapshot (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  period_start date not null,
  -- EXCLUSIVE: the first day NOT in the period. A month closing on the 30th
  -- stores period_end as the 1st of the next month, so the 30th itself is
  -- inside it. Written down because the alternative reading silently drops the
  -- last day of every month, which is where the sales are.
  period_end date not null,
  figures jsonb not null,
  sources jsonb not null,
  taken_at timestamptz not null default now(),
  constraint marketing_proof_snapshot_once unique (campaign_id, period_start),
  constraint marketing_proof_snapshot_period_ordered check (period_start < period_end),
  constraint marketing_proof_snapshot_figures_present check (jsonb_typeof(figures) = 'object'),
  constraint marketing_proof_snapshot_sources_present check (jsonb_typeof(sources) = 'object'),
  -- EVERY FIGURE CARRIES ITS SOURCE, checked by the database rather than hoped
  -- for. A snapshot with a figure nothing sources is the exact artefact this
  -- page exists to make impossible.
  --
  -- Through a FUNCTION because Postgres refuses a subquery in a check
  -- constraint, and the function is genuinely IMMUTABLE: it reads its two
  -- arguments and no table, so the same pair always gives the same answer and
  -- the constraint means what it says.
  constraint marketing_proof_snapshot_every_figure_is_sourced
    check (public.marketing_proof_every_figure_is_sourced(figures, sources))
);

comment on table public.marketing_proof_snapshot is
  'GA5. One row per campaign per closed month: the figures as at that date and, for every one of them, the row ids or the named query it came from. A later reversal changes the live page and never this.';

create index if not exists marketing_proof_snapshot_campaign_idx
  on public.marketing_proof_snapshot (campaign_id, period_start desc);

alter table public.marketing_proof_snapshot enable row level security;

-- ---------------------------------------------------------------------------
-- 4. THE REVERSAL CONDITION.
-- ---------------------------------------------------------------------------
alter table public.marketing_campaigner_config
  add column if not exists proof_page_enabled boolean not null default true;

comment on column public.marketing_campaigner_config.proof_page_enabled is
  'GA5. Set it false and the campaign proof route answers 404 while every aggregation, snapshot and source row stays intact and readable by the GA3 attribution reader.';

commit;
