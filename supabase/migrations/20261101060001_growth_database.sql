-- THE GROWTH DATABASE, V3 ITEM 2 (Lawal's order of 1 November 2026 05:45 through the CONTROLLER: "add
-- conversion_opportunities and ticketing_activations, reuse every existing table, stable id, source, timestamps,
-- audit trail"). Nothing here sends anything to anyone: the engine is built and proved, not used.
--
-- Reused, never copied: organisers (and their acquisition_state, proved by organiser_acquisition_transitions),
-- organiser_contacts, listing_claims, events, ticket_tiers, orders. The two new tables hold only what no table holds:
--   conversion_opportunities: one organiser (or one venue with ticketed nights) that could sell through EventLinqs,
--     with its plan bucket (close_the_ticketing_gap.who_first), its city, where it was found, and whether it is open.
--   ticketing_activations: each step an organiser takes from a verified claim to a first sale through EventLinqs
--     (item 6's steps as WINDOW 3's activationOf names them: claim_verified, organisation, payouts, tickets,
--     checkout_ready, published, first_sale),
--     append only, each step pointing at the row that proves it, so a drop off is the step that never came.
-- conversion_opportunity_changes is the audit trail: every insert and change of an opportunity, written by trigger.
-- All three are service role only; no signed out visitor and no signed in user reads or writes them.

create table if not exists public.conversion_opportunities (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid references public.organisers (id) on delete restrict,
  venue_id uuid references public.venues (id) on delete restrict,
  city_slug text not null check (city_slug ~ '^[a-z0-9-]{2,60}$'),
  -- growth/plan.json close_the_ticketing_gap.who_first, in its order: organisers whose paid events sell through small
  -- independent sellers; venues with ticketed nights; community and cultural organisers with paid events.
  who_first text not null check (who_first in ('independent_seller_organiser', 'ticketed_venue', 'community_paid_organiser')),
  -- Where it was found, and the id of the row or file line that found it.
  source text not null check (source in ('listing', 'outreach_queue', 'listing_claim', 'organiser_signup', 'manual')),
  source_ref text check (source_ref is null or length(btrim(source_ref)) between 1 and 200),
  state text not null default 'open' check (state in ('open', 'won', 'lost', 'withdrawn')),
  closed_reason text check (closed_reason is null or length(btrim(closed_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversion_opportunities_one_target check ((organiser_id is null) <> (venue_id is null)),
  constraint conversion_opportunities_closed_says_why check ((state = 'open') = (closed_reason is null))
);
-- One open opportunity per organiser and per venue: a second find adds nothing but noise.
create unique index if not exists conversion_opportunities_one_open_organiser
  on public.conversion_opportunities (organiser_id) where state = 'open' and organiser_id is not null;
create unique index if not exists conversion_opportunities_one_open_venue
  on public.conversion_opportunities (venue_id) where state = 'open' and venue_id is not null;
create index if not exists conversion_opportunities_by_city on public.conversion_opportunities (city_slug, state);

create table if not exists public.conversion_opportunity_changes (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.conversion_opportunities (id) on delete restrict,
  action text not null check (action in ('insert', 'update')),
  old_row jsonb,
  new_row jsonb not null,
  changed_by text not null default coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), current_user),
  at timestamptz not null default now()
);
create index if not exists conversion_opportunity_changes_by_opportunity on public.conversion_opportunity_changes (opportunity_id, at);

create table if not exists public.ticketing_activations (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.organisers (id) on delete restrict,
  opportunity_id uuid references public.conversion_opportunities (id) on delete restrict,
  event_id uuid references public.events (id) on delete restrict,
  -- WINDOW 3's activationOf steps (item 6, 1 November 2026 05:47), each from a record the platform already writes.
  step text not null check (step in ('claim_verified', 'organisation', 'payouts', 'tickets', 'checkout_ready', 'published', 'first_sale')),
  -- The table and row that prove the step happened: a claim, a payout account, a ticket tier, an order.
  -- Only tables that exist: payout readiness is the organisation's Stripe account (organisations.stripe_account_id
  -- with stripe_charges_enabled); checkout_ready is the sale decision on a paid tier, so its proof is the tier.
  proved_by text not null check (proved_by in ('listing_claims', 'organisations', 'ticket_tiers', 'events', 'orders')),
  proof_id text not null check (length(btrim(proof_id)) between 1 and 80),
  source text not null check (source in ('claim_flow', 'organiser_dashboard', 'admin', 'webhook')),
  at timestamptz not null default now(),
  -- A step is recorded once per organiser and event (a first sale is first once).
  constraint ticketing_activations_once unique nulls not distinct (organiser_id, event_id, step),
  -- A sale is an EventLinqs order: an outside ticket click or a claim is never counted as one.
  constraint ticketing_activations_sale_is_an_order check (step <> 'first_sale' or proved_by = 'orders'),
  constraint ticketing_activations_claim_is_a_claim check (step <> 'claim_verified' or proved_by = 'listing_claims')
);
create index if not exists ticketing_activations_by_organiser on public.ticketing_activations (organiser_id, at);

-- The audit trail, by trigger, so no writer can forget it.
create or replace function public.conversion_opportunity_touch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.conversion_opportunity_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.conversion_opportunity_changes (opportunity_id, action, old_row, new_row)
  values (new.id, lower(tg_op), case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists trg_conversion_opportunity_touch on public.conversion_opportunities;
create trigger trg_conversion_opportunity_touch
  before update on public.conversion_opportunities
  for each row execute function public.conversion_opportunity_touch();
drop trigger if exists trg_conversion_opportunity_record on public.conversion_opportunities;
create trigger trg_conversion_opportunity_record
  after insert or update on public.conversion_opportunities
  for each row execute function public.conversion_opportunity_record();

-- The audit trail and the activation steps are append only, even for the service role.
create or replace function public.growth_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% is append only', tg_table_name using errcode = 'P0001';
end;
$$;
drop trigger if exists trg_conversion_opportunity_changes_append_only on public.conversion_opportunity_changes;
create trigger trg_conversion_opportunity_changes_append_only
  before update or delete on public.conversion_opportunity_changes
  for each row execute function public.growth_append_only();
drop trigger if exists trg_ticketing_activations_append_only on public.ticketing_activations;
create trigger trg_ticketing_activations_append_only
  before update or delete on public.ticketing_activations
  for each row execute function public.growth_append_only();

revoke all on function public.conversion_opportunity_touch() from public, anon, authenticated;
revoke all on function public.conversion_opportunity_record() from public, anon, authenticated;
revoke all on function public.growth_append_only() from public, anon, authenticated;

-- Grants (the 21 October 2026 rule): revoke everything, then give the service role exactly what the server jobs do.
alter table public.conversion_opportunities enable row level security;
alter table public.conversion_opportunity_changes enable row level security;
alter table public.ticketing_activations enable row level security;
revoke all on public.conversion_opportunities from anon, authenticated, service_role;
revoke all on public.conversion_opportunity_changes from anon, authenticated, service_role;
revoke all on public.ticketing_activations from anon, authenticated, service_role;
grant select, insert, update on public.conversion_opportunities to service_role;
grant select on public.conversion_opportunity_changes to service_role;
grant select, insert on public.ticketing_activations to service_role;

comment on table public.conversion_opportunities is
  'V3 item 2 (Lawal 1 November 2026 05:45): an organiser or ticketed venue that could sell through EventLinqs, its who_first bucket, city, source and state. Service role only; every change kept in conversion_opportunity_changes.';
comment on table public.conversion_opportunity_changes is
  'V3 item 2: the audit trail of conversion_opportunities, written by trigger, append only.';
comment on table public.ticketing_activations is
  'V3 item 2 with item 6: each activation step from a verified claim to a first EventLinqs sale, each proved by a named row, append only. An outside ticket or a claim is never a sale.';

do $post$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_conversion_opportunity_record') then
    raise exception 'trg_conversion_opportunity_record is missing';
  end if;
  if has_table_privilege('anon', 'public.conversion_opportunities', 'SELECT')
     or has_table_privilege('authenticated', 'public.ticketing_activations', 'SELECT') then
    raise exception 'a growth table is readable outside the service role';
  end if;
end
$post$;
