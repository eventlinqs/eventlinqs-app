-- ============================================================================
-- FASTER PAYOUTS FOR PROVEN ORGANISERS, OFF UNTIL LAWAL SWITCHES IT ON PER ORGANISER (window 6, 27 October 2026; the
-- locked foundation's item 21: "Faster payouts for proven organisers, within Stripe's rules, off until Lawal switches it
-- on per organiser ... The rule is built and refuses anyone who does not qualify").
--
-- WHO IS PROVEN is already locked, and nothing here invents it: docs/m6/m6-implementation-plan.md section 1.4 (LOCKED
-- 2026-04-28), "Tier 3 (Trusted) | 5+ events, $50,000+ lifetime gross, no disputes, M7 admin approval required |
-- Scheduled + on-demand + faster cadence". So a faster payout needs Tier 3 (Lawal's approval), five events, 5,000,000
-- cents of lifetime gross, no dispute on the record, a standard risk tier, and a Stripe account that is paying out.
--
-- HOW MUCH FASTER is not in the plan, so it is Lawal's per organiser: the grant holds the buffer after the event's end
-- before its held funds are transferred, shorter than the platform's (pricing_rules payout_schedule_days). Faster here
-- is only ever an earlier transfer from the platform to the organiser's connected account, never a shorter Stripe
-- delay, because Stripe's own page refuses one: "The delay_days value can't be less than your own payout schedule or
-- less than the default payout schedule for the account." (https://docs.stripe.com/connect/manage-payout-schedule, read
-- 27 October 2026). And Stripe's payouts page: "New Stripe users aren't immediately eligible for Instant Payouts", and
-- a first payout "typically ... within 7-14 days" (https://docs.stripe.com/payouts, read 27 October 2026), which is why
-- an account not yet paying out never qualifies.
--
--   faster_payout_grants   Lawal's switch per organiser: the buffer in days, who granted it and when, and when revoked.
--                          Private: row security with no policy, service_role alone (the 21 October 2026 grant rule).
--   faster_payout_check    whether an organiser qualifies now, and if not, the first reason in plain words.
--   a hold on the grants   the database refuses a grant to an organiser who does not qualify, with that reason.
--
-- Reversal: revoke every grant (revoked_at), and the disbursement run returns to the platform's buffer for everyone;
-- drop the function, the hold and the table and the platform is as it was.
-- ============================================================================

begin;

create table if not exists public.faster_payout_grants (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  buffer_days      integer not null,
  granted_by       uuid not null references auth.users (id) on delete restrict,
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  note             text,

  constraint faster_payout_grants_buffer check (buffer_days between 0 and 30),
  constraint faster_payout_grants_revoked check (revoked_at is null or revoked_at >= granted_at)
);

create unique index if not exists faster_payout_grants_one_live
  on public.faster_payout_grants (organisation_id) where revoked_at is null;

alter table public.faster_payout_grants enable row level security;
revoke all on public.faster_payout_grants from anon, authenticated, service_role;
grant select, insert, update on public.faster_payout_grants to service_role;

comment on table public.faster_payout_grants is
  'Item 21: Lawal''s switch for faster payouts per organiser, with the buffer he chose. Private: no policy, service_role only.';

-- The proof, without the grant: why an organiser does not qualify, or null where they do.
create or replace function public.faster_payout_unproven(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $unproven$
  select case
    when o.id is null then 'There is no such organiser.'
    when o.payout_tier <> 'tier_3' then 'Faster payouts need Tier 3 (Trusted), which Lawal approves.'
    when o.risk_tier <> 'standard' then 'Their risk tier is not standard.'
    when o.payout_status <> 'active' or o.stripe_account_id is null or not o.stripe_payouts_enabled
      then 'Their Stripe account is not paying out yet.'
    when o.total_event_count < 5 then 'They have run fewer than five events.'
    when o.total_volume_cents < 5000000 then 'Their lifetime gross is under $50,000.'
    when exists (select 1 from public.organiser_balance_ledger l where l.organisation_id = o.id and l.reference_type = 'dispute')
      or exists (select 1 from public.payout_holds h where h.organisation_id = o.id and h.hold_type = 'chargeback')
      then 'A dispute is on their record.'
    else null
  end
  from (select p_org as id) want
  left join public.organisations o on o.id = want.id;
$unproven$;

create or replace function public.faster_payout_check(p_org uuid)
returns table (qualifies boolean, buffer_days integer, reason text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $check$
declare
  g public.faster_payout_grants%rowtype;
  v_why text;
begin
  select * into g from public.faster_payout_grants
   where organisation_id = p_org and revoked_at is null
   order by granted_at desc limit 1;
  if not found then
    return query select false, null::integer, 'Faster payouts are off for this organiser.'::text;
    return;
  end if;
  v_why := public.faster_payout_unproven(p_org);
  if v_why is not null then
    return query select false, null::integer, v_why;
    return;
  end if;
  return query select true, g.buffer_days, null::text;
end;
$check$;

create or replace function public.faster_payout_grants_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $hold$
declare
  v_why text;
begin
  if new.revoked_at is not null then
    return new;
  end if;
  v_why := public.faster_payout_unproven(new.organisation_id);
  if v_why is not null then
    raise exception 'refused: %', v_why using errcode = '23514';
  end if;
  return new;
end;
$hold$;

drop trigger if exists faster_payout_grants_hold on public.faster_payout_grants;
create trigger faster_payout_grants_hold
  before insert on public.faster_payout_grants
  for each row execute function public.faster_payout_grants_hold();

revoke all on function public.faster_payout_unproven(uuid) from public, anon, authenticated;
revoke all on function public.faster_payout_check(uuid) from public, anon, authenticated;
grant execute on function public.faster_payout_unproven(uuid) to service_role;
grant execute on function public.faster_payout_check(uuid) to service_role;

commit;
