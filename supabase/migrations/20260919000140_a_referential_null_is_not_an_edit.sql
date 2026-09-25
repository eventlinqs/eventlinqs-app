-- ===========================================================================
-- A REFERENTIAL NULL IS NOT AN EDIT, AND THREE TRIGGERS WERE TREATING IT AS ONE.
--
-- ===========================================================================
-- THE DEFECT, MEASURED ON TEST ON 19 SEPTEMBER 2026
-- ===========================================================================
--
-- `on delete set null` is a standing instruction to the database: when the
-- parent row goes, issue
--
--     UPDATE ONLY public.child SET fk = NULL WHERE $1 = fk
--
-- That statement is how an account, an order or an event is deleted. It is not
-- an edit of the child row by anybody, and nothing about the child's own
-- contents has changed. But a BEFORE UPDATE ... FOR EACH ROW trigger with no
-- column list and no early return is re-run on it, and judges the WHOLE row
-- again, against TODAY'S configuration rather than the configuration in force
-- when the row was written.
--
-- So a delete fails with a complaint about something else entirely, and the
-- error names a subject the person deleting has never heard of.
--
-- BOTH OF THESE WERE DRIVEN AGAINST TEST, in transactions that were rolled
-- back, before a line of this file was written. Neither is hypothetical.
--
--   1. event_group_rates. Insert a group rate at 2000c, then move the fee in
--      /admin/pricing so the derived floor rises above it, then delete the
--      person who set the rate:
--
--        update public.event_group_rates set created_by = null where $1 = created_by
--        ERROR: P0001: a group rate of 2000 is below the floor of 2488 for this
--        event. Below it the ticket does not clear the EventLinqs fee on
--        itself, so the organiser is paying to sell it.
--
--      An account closure refused on the grounds of a price.
--
--   2. audience_members. The deciding consent for lawaladams9@gmail.com is 76
--      days old. Tighten public.consent_policy.max_age_months to 2, which is
--      inside its own `between 1 and 120` check, and then delete EITHER the
--      order that member last bought OR the account itself:
--
--        update public.audience_members set last_order_id = null where email = ...
--        ERROR: 23514: audience_members refused for lawaladams9@gmail.com: the
--        consent resolver does not currently permit marketing to this address
--
--      The same statement with the policy untouched succeeds, so the policy is
--      the arming and the trigger is the trap.
--
--      AND THIS ONE ARMS ITSELF WITH THE CALENDAR. Nothing has to be changed by
--      anybody: `max_age_months` defaults to 24, `refresh_audience_member` only
--      runs on a consent or suppression event, and no sweep exists. Every
--      audience member whose consent passes 24 months silently becomes an
--      anchor holding down their own account, their last order and their last
--      event.
--
--   3. marketing_send. The same shape, on `link_code` and `sequence_step_id`.
--      NOT ARMED TODAY and said so rather than dressed up: the approval it
--      re-judges is only removed by deleting the campaign, which cascades the
--      sends away with it. It is fixed here because it is the same three lines
--      and because "not armed today" is a fact about today.
--
-- ===========================================================================
-- THE FIX, AND WHY IT IS THE EVENT LIST RATHER THAN A WHEN CLAUSE
-- ===========================================================================
--
-- `BEFORE INSERT OR UPDATE OF (columns)` fires on every INSERT and, on UPDATE,
-- only when one of the named columns appears in the statement's SET list. A
-- referential null never names them, so the trigger does not run at all.
--
-- PROVEN ON TEST rather than taken from documentation, in a rolled-back
-- transaction, on a table made for the purpose: a trigger declared
-- `before insert or update of watched` recorded `INSERT;UPDATE;` across three
-- statements. The insert fired it, `set ignored = 99` did NOT, and
-- `set watched = 10` DID even though the value was unchanged.
--
-- A `WHEN` clause cannot do this job here: it may reference OLD, so a single
-- `before insert or update` trigger carrying one is rejected outright, and
-- every trigger below would have to be split in two and renamed. An early
-- `return new` in the function can do it, and `enforce_refund_policy_one_way`
-- on public.events already does exactly that, correctly, and is the reason that
-- table is not in this list. The event list is preferred where it fits because
-- the cheapest judgement is the one that never runs.
--
-- THE COLUMN LISTS ARE DERIVED FROM THE FUNCTION BODIES, not chosen:
--
--   refuse_group_rate_below_the_floor  reads new.event_id, new.ticket_tier_id,
--                                      new.unit_price_cents
--   audience_requires_live_consent     reads new.email
--   marketing_send_requires_approval   reads new.state, new.campaign_id,
--                                      new.segment_fingerprint
--
-- `scripts/guards/a-referential-null-is-not-an-edit.mjs` re-derives them on
-- every build and fails if a function grows a reference its trigger's list does
-- not cover, so the two cannot drift.
--
-- ===========================================================================
-- WHAT IS GIVEN UP, STATED PLAINLY
-- ===========================================================================
--
-- A group rate, an audience row and a send are no longer re-judged by an UPDATE
-- that touches none of the columns the judgement reads. That was never a
-- guarantee anything relied on: it was an accident of a missing column list.
-- Every rule still holds where it is written:
--
--   * the floor still refuses an insert and still refuses an EDIT of the price,
--     the tier or the event, which is what "a rate can never be edited under
--     the floor" meant;
--   * `min_group_size` is unaffected and was never judged by that trigger:
--     `event_group_rates_min_size` is a CHECK constraint and checks always run;
--   * an audience row still cannot be created, and its address still cannot be
--     changed, without live consent, and `refresh_audience_member` still
--     DELETES the row the moment consent is withdrawn or suppressed;
--   * a send still cannot leave draft without an approval for its segment.
--
-- Additive and reversible: every statement below is a `create or replace` or a
-- trigger re-declaration, and the previous shape is one file away.
-- TEST database only, applied with the TEST-only API route in
-- `scripts/verify/apply-migration-to-test.mjs`.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. event_group_rates.
--
-- `updated_at` was set by the refusal, so restricting the refusal would have
-- stopped the row's own timestamp moving. It becomes its own unconditional
-- trigger, because a referential null IS a change to the row and the row
-- should say so: what it is not is a re-pricing.
--
-- BEFORE ROW triggers fire in alphabetical order by name, so `..._floor` runs
-- before `..._touch`. Nothing depends on that order (one judges, the other
-- stamps) and it is written down so nobody has to work it out twice.
-- ---------------------------------------------------------------------------
create or replace function public.touch_event_group_rates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.touch_event_group_rates() is
  'AQ2. Stamps updated_at on every UPDATE of a group rate, including one the database issues itself when a parent row is deleted. Split out of refuse_group_rate_below_the_floor by migration 20260919000140 so the price check could stop judging statements that change no price.';

drop trigger if exists trg_event_group_rates_touch on public.event_group_rates;
create trigger trg_event_group_rates_touch
  before update on public.event_group_rates
  for each row execute function public.touch_event_group_rates();

-- The refusal, unchanged except that it no longer stamps updated_at.
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

  return new;
end;
$$;

comment on function public.refuse_group_rate_below_the_floor() is
  'AQ2. Refuses a group rate that is not below the ticket price, that is on a free tier, or that does not clear the platform fee on itself. Judged on INSERT and on any UPDATE that touches the event, the tier or the price, and NOT on an update that touches none of them: migration 20260919000140 found that deleting the account which set a rate re-judged the price and refused the deletion once the fee had moved.';

drop trigger if exists trg_event_group_rates_floor on public.event_group_rates;
create trigger trg_event_group_rates_floor
  before insert or update of event_id, ticket_tier_id, unit_price_cents
  on public.event_group_rates
  for each row execute function public.refuse_group_rate_below_the_floor();

-- ---------------------------------------------------------------------------
-- 2. audience_members.
--
-- The function reads `new.email` and nothing else about the row. The three
-- nullable keys are `user_id`, `last_order_id` and `last_event_id`, which are
-- an account, an order and an event: the three things most likely to be
-- deleted on a ticketing platform.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_audience_requires_live_consent on public.audience_members;
create trigger trg_audience_requires_live_consent
  before insert or update of email
  on public.audience_members
  for each row execute function public.audience_requires_live_consent();

comment on function public.audience_requires_live_consent() is
  'GA1. Refuses an audience row for an address the consent resolver does not currently permit. Judged on INSERT and on a change of address, and NOT on an update that changes neither: migration 20260919000140 found that consent ageing past consent_policy.max_age_months made the member undeletable, along with the order they last bought and the event they last attended.';

-- ---------------------------------------------------------------------------
-- 3. marketing_send.
--
-- Not armed today, and fixed anyway. The function reads `new.state`,
-- `new.campaign_id` and `new.segment_fingerprint`; the nullable keys are
-- `link_code` and `sequence_step_id`, neither of which it reads.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_marketing_send_requires_approval on public.marketing_send;
create trigger trg_marketing_send_requires_approval
  before insert or update of state, campaign_id, segment_fingerprint
  on public.marketing_send
  for each row execute function public.marketing_send_requires_approval();

comment on function public.marketing_send_requires_approval() is
  'GA4. A send may sit in draft unapproved, and may not move out of it. The approval is per campaign per segment fingerprint, so a repeat send to the same segment does not re-ask and any change to the segment does. Judged on INSERT and on a change of state, campaign or segment, and NOT when the database blanks link_code or sequence_step_id because a link or a sequence step was deleted (migration 20260919000140).';

commit;
