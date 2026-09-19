-- ===========================================================================
-- AQ2. THE GROUP RATE, AND THE FLOOR THE DATABASE REFUSES TO GO BELOW.
--
-- AQ2: "Group purchase of three or more at a rate the organiser sets once,
-- above the price floor." Acceptance: "a test proving a group rate below the
-- floor is refused by the database."
--
-- REFUSED BY THE DATABASE IS THE POINT, and it is why this is a trigger rather
-- than a check in a form. A group rate is a price, and a price somebody can get
-- wrong by hand is a price that will be wrong on a Friday night. The refusal
-- lives where a backfill, a hand-run INSERT and a future admin screen all meet
-- it.
--
-- WHAT THE FLOOR IS, AND WHY IT IS NOT A NUMBER TYPED IN HERE.
--
-- The constitution's fee doctrine is explicit: the platform fee lives in ONE
-- place, public.pricing_rules, and nothing anywhere hardcodes it. A floor typed
-- into this file would be a second copy of the fee that stops agreeing with the
-- first the day the founder changes it in /admin/pricing.
--
-- So the floor is DERIVED. The platform fee on one ticket priced P is
--
--     fee(P) = round(P * pct / 100 + fixed)
--
-- which is src/lib/payments/fee-math.ts computeFeeLineCents at ticketCount = 1.
-- A ticket that does not clear its own fee leaves the organiser nothing, so the
-- floor is the smallest price at which it does:
--
--     P - P * pct / 100 - fixed > 0
--     P * (1 - pct / 100)       > fixed
--     P                         > fixed / (1 - pct / 100)
--
-- Both terms come out of pricing_rules at the scope that governs THIS event, by
-- the same precedence the application resolver uses. Change the fee and the
-- floor moves with it, in both languages, on the next insert.
--
-- THE TWO LANGUAGES, stated because this platform has been bitten by them.
-- public.group_rate_floor_cents() below and groupRateFloorCents() in
-- src/lib/pricing/group-rate.ts are one decision written twice, for the same
-- reason the price bands and the community map are: a trigger cannot call
-- TypeScript. A test compares them across a matrix rather than assuming they
-- agree.
--
-- WHAT THIS FILE DOES NOT DO, so nobody reads it as more than it is. It does
-- not charge anybody the group rate. The squad payment step reads
-- ticket_tiers.price directly and lives in the checkout payment intent, which
-- belongs to another lane under the three-lane protocol. The rate, its floor
-- and its refusal are here; the one line that spends it is a BORDER, recorded
-- in C:\dev\REVIEW-QUEUE-B.md.
--
-- Additive and reversible: drop the table and the two functions.
-- TEST database only, applied with `supabase db push --linked` from PowerShell.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE PLATFORM FEE, RESOLVED IN SQL, BY THE APPLICATION'S OWN PRECEDENCE.
--
-- Mirrors getPricingRule in src/lib/payments/pricing-rules.ts:
--
--     0. (rule_type, event_id = E)                       per event   [highest]
--     1. (country, currency, rule_type, organisation_id) per organiser
--     2. (country, currency, rule_type, org IS NULL)     region default
--     3. ('GLOBAL', currency, rule_type, org IS NULL)    global currency default
--     4. ('GLOBAL', any currency, rule_type, org IS NULL) global wildcard
--
-- An event-scoped rule is matched on (rule_type, event_id) ALONE and ignores
-- country and currency, exactly as the application does, because an event id
-- already names one event.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_pricing_value(
  p_rule_type text,
  p_event_id uuid,
  p_organisation_id uuid,
  p_country_code text,
  p_currency text
) returns public.pricing_rules
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_row public.pricing_rules%rowtype;
  v_now timestamptz := now();
begin
  select * into v_row from public.pricing_rules
   where rule_type = p_rule_type and event_id = p_event_id
     and effective_from <= v_now
     and (effective_until is null or effective_until > v_now)
   order by version desc limit 1;
  if found then return v_row; end if;

  select * into v_row from public.pricing_rules
   where rule_type = p_rule_type and country_code = p_country_code
     and currency = p_currency and event_id is null
     and organisation_id = p_organisation_id
     and effective_from <= v_now
     and (effective_until is null or effective_until > v_now)
   order by version desc limit 1;
  if found then return v_row; end if;

  select * into v_row from public.pricing_rules
   where rule_type = p_rule_type and country_code = p_country_code
     and currency = p_currency and event_id is null
     and organisation_id is null
     and effective_from <= v_now
     and (effective_until is null or effective_until > v_now)
   order by version desc limit 1;
  if found then return v_row; end if;

  select * into v_row from public.pricing_rules
   where rule_type = p_rule_type and country_code = 'GLOBAL'
     and currency = p_currency and event_id is null
     and organisation_id is null
     and effective_from <= v_now
     and (effective_until is null or effective_until > v_now)
   order by version desc limit 1;
  if found then return v_row; end if;

  select * into v_row from public.pricing_rules
   where rule_type = p_rule_type and country_code = 'GLOBAL'
     and event_id is null and organisation_id is null
     and effective_from <= v_now
     and (effective_until is null or effective_until > v_now)
   order by version desc limit 1;
  return v_row;
end;
$$;

comment on function public.resolve_pricing_value(text, uuid, uuid, text, text) is
  'AQ2. The platform fee resolved in SQL, by the same five-step precedence as getPricingRule in src/lib/payments/pricing-rules.ts. It exists because a trigger cannot call TypeScript, and a test compares the two rather than assuming they agree.';

-- ---------------------------------------------------------------------------
-- 2. THE FLOOR, DERIVED FROM THAT FEE AND NOTHING ELSE.
--
-- Returns the LOWEST PRICE THAT IS STILL ALLOWED, in cents: the smallest whole
-- number of cents strictly above fixed / (1 - pct/100). A rate at or below the
-- value this returns minus one cent does not clear its own fee.
--
-- A fee of 100 per cent or more would make the floor infinite, which is a
-- misconfiguration rather than a price, and the function says so rather than
-- dividing by zero.
-- ---------------------------------------------------------------------------
create or replace function public.group_rate_floor_cents(
  p_event_id uuid,
  p_organisation_id uuid,
  p_country_code text,
  p_currency text
) returns integer
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_pct_row public.pricing_rules%rowtype;
  v_fixed_row public.pricing_rules%rowtype;
  v_pct numeric := 0;
  v_fixed numeric := 0;
  v_floor numeric;
  v_candidate integer;
  v_step integer;
begin
  v_pct_row := public.resolve_pricing_value(
    'platform_fee_percentage', p_event_id, p_organisation_id, p_country_code, p_currency);
  v_fixed_row := public.resolve_pricing_value(
    'platform_fee_fixed', p_event_id, p_organisation_id, p_country_code, p_currency);

  if v_pct_row.id is not null then v_pct := coalesce(v_pct_row.value_percentage, 0); end if;
  if v_fixed_row.id is not null then v_fixed := coalesce(v_fixed_row.value_cents, 0); end if;

  if v_pct >= 100 then
    raise exception
      'the platform fee resolves to %%%, so no ticket price clears it. Fix pricing_rules before setting a group rate.',
      v_pct;
  end if;

  /*
   * THE ANALYTIC ANSWER IS A CENT SHORT, AND A BOUNDARY TEST IS WHAT SAID SO.
   * fixed / (1 - pct/100) solves the inequality over the reals, but the fee is
   * charged in WHOLE CENTS. At 3.5% + 99c that gives 103, where the rounded fee
   * is also 103 and the organiser nets exactly nothing. So the analytic value
   * is the starting point and the rounded fee is then asked the real question.
   * Bounded, and in practice it steps once.
   */
  v_floor := greatest(1, floor(v_fixed / (1 - v_pct / 100)));
  v_candidate := v_floor::integer;
  for v_step in 1..1000 loop
    if v_candidate - round(v_candidate * v_pct / 100 + v_fixed) > 0 then
      return v_candidate;
    end if;
    v_candidate := v_candidate + 1;
  end loop;
  raise exception
    'no price within a thousand cents of % clears a fee of %%% plus %c', v_floor, v_pct, v_fixed;
end;
$$;

comment on function public.group_rate_floor_cents(uuid, uuid, text, text) is
  'AQ2. The lowest group rate that still clears the platform fee on itself, derived from pricing_rules at the scope governing this event. Never a number typed into a migration: change the fee and this moves with it.';

-- ---------------------------------------------------------------------------
-- 3. THE GROUP RATE. ONE PER TIER, SET ONCE.
--
-- "a rate the organiser sets once" is the unique constraint on ticket_tier_id.
-- Changing it is an UPDATE of that row, which the trigger judges again, so a
-- rate can never be edited under the floor either.
-- ---------------------------------------------------------------------------
create table if not exists public.event_group_rates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  min_group_size integer not null default 3,
  unit_price_cents integer not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- AQ2 says "three or more" and means it: a group of two is two people buying
  -- tickets, and a discount for it is just a lower price.
  constraint event_group_rates_min_size check (min_group_size >= 3),
  constraint event_group_rates_price_positive check (unit_price_cents > 0),
  constraint event_group_rates_one_per_tier unique (ticket_tier_id)
);

comment on table public.event_group_rates is
  'AQ2. The per-ticket rate for a group of three or more, set once per tier. Refused below the floor derived from pricing_rules, and refused at or above the tier own price, by trigger. It does not charge anybody: the squad payment step still reads ticket_tiers.price, and that line belongs to another lane.';
comment on column public.event_group_rates.min_group_size is
  'AQ2. Three or more. A group of two is two people buying tickets.';

create index if not exists idx_event_group_rates_event on public.event_group_rates(event_id);

alter table public.event_group_rates enable row level security;

-- ---------------------------------------------------------------------------
-- 4. THE REFUSAL.
--
-- Three things a group rate must be, and every one of them is a fact about
-- other rows rather than about this one, which is why a CHECK constraint cannot
-- express them and a trigger can.
-- ---------------------------------------------------------------------------
create or replace function public.refuse_group_rate_below_the_floor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tier public.ticket_tiers%rowtype;
  v_org uuid;
  v_country text;
  v_floor integer;
begin
  select * into v_tier from public.ticket_tiers where id = new.ticket_tier_id;
  if not found then
    raise exception 'no such ticket tier: %', new.ticket_tier_id;
  end if;
  if v_tier.event_id <> new.event_id then
    raise exception
      'the tier % belongs to event %, not to event %', new.ticket_tier_id, v_tier.event_id, new.event_id;
  end if;

  -- A group rate on a free ticket is not a rate. AQ2 is about a A$35 ticket
  -- reaching more people, not about discounting nothing.
  if v_tier.price <= 0 then
    raise exception 'a group rate needs a paid ticket: tier % is free', new.ticket_tier_id;
  end if;

  -- A "group rate" at or above the ordinary price is not a group rate.
  if new.unit_price_cents >= v_tier.price then
    raise exception
      'a group rate of % is not below the ticket price of %. A group rate that saves nothing is a price rise waiting to be explained.',
      new.unit_price_cents, v_tier.price;
  end if;

  select e.organisation_id into v_org from public.events e where e.id = new.event_id;

  /*
   * THE COUNTRY COMES FROM THE CURRENCY, because that is where the application
   * gets it. src/lib/payments/payment-calculator.ts derives the pricing country
   * with countryFromCurrency and NOT from the organisation, so a trigger that
   * read organisations would resolve a different fee from the one actually
   * charged and refuse the wrong prices. The map is the second half of this
   * decision written in SQL, and tests/unit/growth/group-rate.test.ts compares
   * the two entry by entry rather than assuming they agree.
   */
  v_country := case upper(v_tier.currency)
    when 'AUD' then 'AU'
    when 'USD' then 'US'
    when 'GBP' then 'GB'
    when 'EUR' then 'IE'
    when 'CAD' then 'CA'
    when 'NZD' then 'NZ'
    when 'NGN' then 'NG'
    when 'GHS' then 'GH'
    when 'KES' then 'KE'
    when 'ZAR' then 'ZA'
    else 'GLOBAL'
  end;

  v_floor := public.group_rate_floor_cents(new.event_id, v_org, v_country, v_tier.currency);

  if new.unit_price_cents < v_floor then
    raise exception
      'a group rate of % is below the floor of % for this event. Below it the ticket does not clear the EventLinqs fee on itself, so the organiser is paying to sell it. The floor is derived from pricing_rules and moves when the fee does.',
      new.unit_price_cents, v_floor;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.refuse_group_rate_below_the_floor() is
  'AQ2. Refuses a group rate that is not below the ticket price, that is on a free tier, or that does not clear the platform fee on itself. Judged again on UPDATE, so a rate cannot be edited under the floor after the fact.';

drop trigger if exists trg_event_group_rates_floor on public.event_group_rates;
create trigger trg_event_group_rates_floor
  before insert or update on public.event_group_rates
  for each row execute function public.refuse_group_rate_below_the_floor();

commit;
