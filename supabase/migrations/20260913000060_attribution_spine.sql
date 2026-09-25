-- ===========================================================================
-- GA3. THE TRACKED LINK AND ATTRIBUTION SPINE.
--
-- WHY THIS IS NOT REPORTING. Fullproof AI charges on sales it produced, so
-- every row below is the basis of an invoice. A gap is money never collected;
-- a wrong row is money billed and then argued about, and the second one is
-- worse, because a client who finds a fee charged on a sale we did not produce
-- never believes another number we show them.
--
-- THE CODE CARRIES THE IDENTIFIERS, NOT THE QUERY STRING. marketing_link is
-- keyed by the code itself, and the campaign, channel, partner and recipient
-- hang off that key. A messaging app that strips every parameter therefore
-- strips nothing that matters: the code is still in the path. The query
-- parameters appended on the redirect are a convenience copy for anything
-- downstream that wants to read them without a lookup.
--
-- BILLABLE IS COMPUTED AND NEVER TYPED, and it is computed from TWO facts,
-- which is why it is a trigger rather than a column somebody sets:
--   1. the rung. Rungs 1, 2 and 3 tie the order to a click through an
--      identifier or an identity. Rung 4 says only that a campaign click
--      happened near this order, and measured over 308 real TEST orders that
--      rung attributed 140 sales no campaign produced. It is kept, because it
--      is a true observation, and it is never billed.
--   2. whether the sale was reversed. Any reversal row at all, and billable is
--      false, computed the moment the reversal lands rather than on a later
--      backfill. Conservative on purpose: a partial refund takes the whole
--      sale off the invoice rather than leaving a fee on a partly reversed one.
--
-- WHAT IS NOT HERE. No fee, no percentage and no rate. This item stores the
-- BASIS a fee is computed from and never the fee, which lives in exactly one
-- place (the PRICING-LOCK block of docs/PRICING.md) and reaches every surface
-- through getPricingRule.
--
-- NOTHING SENDS. No transport, no queue and no schedule is created here.
--
-- Additive and reversible: drop the nine tables, the one view and the four
-- functions and the platform is exactly as it was. Applied to TEST
-- vkapkibzokmfaxqogypq from the lane B worktree. Production is the founder's
-- `npm run migrate:production`.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE CONFIGURATION. Every number this item uses, as a row.
--
-- A window tuned by editing code is a window nobody can tune, and GA3's
-- reversal condition requires the model to be re-chosen rather than patched, so
-- the model NAME and VERSION live here too and are copied onto every
-- attribution row. A stored decision that cannot say what produced it is not
-- evidence.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_attribution_config (
  id boolean primary key default true,
  model_name text not null,
  model_version text not null,
  attribution_window_days integer not null,
  click_cookie_days integer not null,
  rung_four_confidence numeric not null,
  link_code_length integer not null,
  updated_at timestamptz not null default now(),
  constraint marketing_attribution_config_single_row check (id),
  constraint marketing_attribution_config_window_sane
    check (attribution_window_days between 1 and 365),
  constraint marketing_attribution_config_cookie_sane
    check (click_cookie_days between 1 and 365),
  constraint marketing_attribution_config_rung_four_below_one
    check (rung_four_confidence > 0 and rung_four_confidence < 1),
  constraint marketing_attribution_config_code_length_sane
    check (link_code_length between 8 and 32)
);

comment on table public.marketing_attribution_config is
  'GA3. The attribution window, the click cookie lifetime, the confidence rung four carries and the chosen model name and version. One row. Every attribution record copies the model name and version off it, so a decision read back in six months can always say what produced it.';

insert into public.marketing_attribution_config
  (id, model_name, model_version, attribution_window_days, click_cookie_days,
   rung_four_confidence, link_code_length)
values
  (true, 'last-click-with-identity-ladder', 'v1', 30, 30, 0.5, 12)
on conflict (id) do nothing;

alter table public.marketing_attribution_config enable row level security;

/*
 * The campaign window default, as a FUNCTION, because Postgres will not accept
 * a subquery in a column default and a literal here would be a second place the
 * window is written down.
 */
create or replace function public.marketing_attribution_default_window()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select attribution_window_days from public.marketing_attribution_config where id
$$;

comment on function public.marketing_attribution_default_window() is
  'GA3. The configured attribution window, used as the default for a new campaign so the number is read rather than typed.';

-- ---------------------------------------------------------------------------
-- 2. THE CHANNELS, seeded here and never typed in code.
--
-- The code IS the identity of a channel, so it is the primary key. A uuid would
-- add a join to every read and buy nothing: there is no world in which `email`
-- is renamed while remaining the same channel.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_channel (
  code text primary key,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint marketing_channel_code_shape check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint marketing_channel_name_present check (length(btrim(display_name)) > 0)
);

comment on table public.marketing_channel is
  'GA3. The channels a campaign can reach somebody through. Seeded by migration so no channel code is ever written as a literal in application code.';

insert into public.marketing_channel (code, display_name) values
  ('email',   'Email'),
  ('sms',     'SMS'),
  ('partner', 'Partner'),
  ('social',  'Social'),
  ('direct',  'Direct')
on conflict (code) do nothing;

alter table public.marketing_channel enable row level security;

-- ---------------------------------------------------------------------------
-- 3. THE PARTNERS.
--
-- `revenue_share_basis` is a SENTENCE, not a number. What a partner is owed is
-- a commercial term that changes per agreement and belongs in a contract; what
-- the platform needs stored is which basis applies so an invoice line can name
-- it. Putting a percentage here would create a second place money is written
-- down, which is the one thing the fee doctrine forbids.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_partner (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  revenue_share_basis text not null,
  is_active boolean not null default true,
  reference text not null,
  created_at timestamptz not null default now(),
  constraint marketing_partner_name_present check (length(btrim(name)) > 0),
  constraint marketing_partner_basis_present check (length(btrim(revenue_share_basis)) > 0),
  constraint marketing_partner_reference_present check (length(btrim(reference)) > 0),
  constraint marketing_partner_reference_unique unique (reference)
);

comment on table public.marketing_partner is
  'GA3. A partner who brings an audience and is paid a share. The basis is a sentence naming which agreement applies; no rate is stored here, because a rate stored twice is a rate that disagrees with itself.';

alter table public.marketing_partner enable row level security;

-- ---------------------------------------------------------------------------
-- 4. THE CAMPAIGNS.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_campaign (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.marketing_tenants(id),
  event_id uuid not null references public.events(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  attribution_window_days integer not null default public.marketing_attribution_default_window(),
  state text not null default 'draft',
  reference text not null,
  created_at timestamptz not null default now(),
  constraint marketing_campaign_name_present check (length(btrim(name)) > 0),
  constraint marketing_campaign_reference_present check (length(btrim(reference)) > 0),
  constraint marketing_campaign_reference_unique unique (reference),
  constraint marketing_campaign_state_known check (state in ('draft', 'active', 'closed')),
  constraint marketing_campaign_window_sane check (attribution_window_days between 1 and 365)
);

comment on table public.marketing_campaign is
  'GA3. One campaign: whose it is, which event it sells, how long a click counts for, and what state it is in. The window is per campaign and defaults from configuration rather than from a literal.';

create index if not exists marketing_campaign_event_idx
  on public.marketing_campaign (event_id);
create index if not exists marketing_campaign_tenant_idx
  on public.marketing_campaign (tenant_id);

alter table public.marketing_campaign enable row level security;

-- ---------------------------------------------------------------------------
-- 5. THE RECIPIENTS.
--
-- The unique constraint is the point: one person, one campaign, one channel,
-- once. Without it a re-run of a send would mint a second recipient and the
-- same sale would be credited twice.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_recipient (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  audience_member_id uuid not null references public.audience_members(id) on delete cascade,
  channel_code text not null references public.marketing_channel(code),
  created_at timestamptz not null default now(),
  constraint marketing_recipient_once_per_campaign_and_channel
    unique (campaign_id, audience_member_id, channel_code),
  -- Lets a link prove its recipient belongs to its own campaign, below.
  constraint marketing_recipient_id_and_campaign unique (id, campaign_id)
);

comment on table public.marketing_recipient is
  'GA3. One row per person per campaign per channel. The unique constraint is what stops a re-sent campaign crediting the same sale twice.';

create index if not exists marketing_recipient_audience_idx
  on public.marketing_recipient (audience_member_id);

alter table public.marketing_recipient enable row level security;

-- ---------------------------------------------------------------------------
-- 6. THE LINKS. The code is the primary key and carries every identifier.
--
-- `target_path` is stored as a PATH, written by the route configuration module
-- at mint time rather than composed at redirect time, so a link printed on a
-- poster keeps pointing where it pointed when it was made.
--
-- The composite foreign key is doing real work: it makes it IMPOSSIBLE to mint
-- a link whose recipient belongs to a different campaign, which would credit
-- one client's campaign for another client's audience.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_link (
  code text primary key,
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  channel_code text not null references public.marketing_channel(code),
  partner_id uuid references public.marketing_partner(id) on delete set null,
  recipient_id uuid,
  target_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint marketing_link_code_shape check (code ~ '^[a-z0-9]{8,32}$'),
  constraint marketing_link_target_is_a_path check (target_path ~ '^/'),
  constraint marketing_link_recipient_belongs_to_campaign
    foreign key (recipient_id, campaign_id)
    references public.marketing_recipient (id, campaign_id) on delete set null
);

comment on table public.marketing_link is
  'GA3. An opaque code that IS the record. Every identifier hangs off the code, so a link whose query string was stripped by a messaging app still resolves completely.';

create index if not exists marketing_link_campaign_idx
  on public.marketing_link (campaign_id);
create index if not exists marketing_link_recipient_idx
  on public.marketing_link (recipient_id);

alter table public.marketing_link enable row level security;

-- ---------------------------------------------------------------------------
-- 7. THE CLICKS.
--
-- Every identifier is DENORMALISED onto the row and the trigger below is what
-- puts it there. A click is the evidence an invoice rests on, and evidence that
-- changes when somebody edits a link months later is not evidence.
--
-- A DEGRADED CLICK IS RECORDED WITH A REASON rather than dropped, because the
-- redirect must never block on a write: a buyer reaches the event page even
-- when tracking is broken, and a silent drop is indistinguishable from nobody
-- having clicked.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_click (
  id uuid primary key default gen_random_uuid(),
  link_code text not null references public.marketing_link(code) on delete cascade,
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  channel_code text not null references public.marketing_channel(code),
  partner_id uuid references public.marketing_partner(id) on delete set null,
  recipient_id uuid references public.marketing_recipient(id) on delete set null,
  occurred_at timestamptz not null default now(),
  user_agent_class text not null,
  cookie_was_present boolean not null default false,
  referrer_host text,
  forwarded_suspected boolean not null default false,
  degraded_reason text,
  constraint marketing_click_user_agent_class_known
    check (user_agent_class in ('mobile', 'tablet', 'desktop', 'bot', 'unknown'))
);

comment on table public.marketing_click is
  'GA3. One row per click on a tracked link, with every identifier copied onto it by trigger so a later edit to the link cannot rewrite the evidence.';

create index if not exists marketing_click_campaign_time_idx
  on public.marketing_click (campaign_id, occurred_at desc);
create index if not exists marketing_click_recipient_idx
  on public.marketing_click (recipient_id);
create index if not exists marketing_click_link_idx
  on public.marketing_click (link_code);

alter table public.marketing_click enable row level security;

create or replace function public.marketing_click_denormalise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.marketing_link%rowtype;
begin
  select * into v_link from public.marketing_link where code = new.link_code;
  if not found then
    raise exception 'marketing_click references a link code that does not exist: %', new.link_code;
  end if;
  new.campaign_id := v_link.campaign_id;
  new.channel_code := v_link.channel_code;
  new.partner_id := v_link.partner_id;
  new.recipient_id := v_link.recipient_id;
  return new;
end;
$$;

drop trigger if exists trg_marketing_click_denormalise on public.marketing_click;
create trigger trg_marketing_click_denormalise
  before insert on public.marketing_click
  for each row execute function public.marketing_click_denormalise();

-- ---------------------------------------------------------------------------
-- 8. THE ORDER SIGNAL. What the buyer's browser carried at the moment an order
-- id first existed.
--
-- Written from the checkout action beside the consent record, which is the
-- point lane B already owns. It never touches the payment intent, the Stripe
-- call or the refund path.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_order_signal (
  order_id uuid primary key references public.orders(id) on delete cascade,
  click_id uuid references public.marketing_click(id) on delete set null,
  link_code text references public.marketing_link(code) on delete set null,
  campaign_id uuid references public.marketing_campaign(id) on delete set null,
  cookie_present boolean not null default false,
  query_identifiers jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

comment on table public.marketing_order_signal is
  'GA3. The click identifiers present on the request that created an order. Rung one reads the cookie half of this and rung two the query half.';

create index if not exists marketing_order_signal_click_idx
  on public.marketing_order_signal (click_id);

alter table public.marketing_order_signal enable row level security;

-- ---------------------------------------------------------------------------
-- 9. THE ATTRIBUTION. One row per order, never zero and never two.
--
-- `order_id` is the PRIMARY KEY, so a second row for one order is refused by
-- the database rather than by a code path somebody can forget to call.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_attribution (
  order_id uuid primary key references public.orders(id) on delete cascade,
  decision text not null,
  rung smallint not null,
  model_name text not null,
  model_version text not null,
  campaign_id uuid references public.marketing_campaign(id) on delete set null,
  channel_code text references public.marketing_channel(code),
  partner_id uuid references public.marketing_partner(id) on delete set null,
  recipient_id uuid references public.marketing_recipient(id) on delete set null,
  click_id uuid references public.marketing_click(id) on delete set null,
  forwarded boolean not null default false,
  confidence numeric not null,
  candidate_clicks jsonb not null default '[]'::jsonb,
  explanation text not null,
  reason text,
  billable boolean not null default false,
  resolved_at timestamptz not null default now(),
  constraint marketing_attribution_decision_known check (decision in ('attributed', 'none')),
  constraint marketing_attribution_rung_range check (rung between 1 and 5),
  constraint marketing_attribution_rung_five_is_none check ((rung = 5) = (decision = 'none')),
  constraint marketing_attribution_none_states_its_reason
    check (decision = 'attributed' or length(btrim(coalesce(reason, ''))) > 0),
  constraint marketing_attribution_attributed_names_its_campaign
    check (decision = 'none' or campaign_id is not null),
  constraint marketing_attribution_explanation_present
    check (length(btrim(explanation)) > 0),
  constraint marketing_attribution_confidence_range check (confidence > 0 and confidence <= 1),
  -- GA3 acceptance 1: confidence below one ONLY on rung four.
  constraint marketing_attribution_confidence_below_one_only_on_rung_four
    check ((confidence < 1) = (rung = 4))
);

comment on table public.marketing_attribution is
  'GA3. Exactly one stored decision per order, including the orders no campaign produced, which say so with a reason rather than falling off the edge of a query. The model name and version travel with the row so a decision read back can always name what produced it.';

create index if not exists marketing_attribution_campaign_idx
  on public.marketing_attribution (campaign_id);
create index if not exists marketing_attribution_billable_idx
  on public.marketing_attribution (billable) where billable;
create index if not exists marketing_attribution_click_idx
  on public.marketing_attribution (click_id);

alter table public.marketing_attribution enable row level security;

-- ---------------------------------------------------------------------------
-- 10. THE REVERSALS.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_attribution_reversal (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  reason text not null,
  reversed_amount_cents integer not null,
  reversed_at timestamptz not null default now(),
  source text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  constraint marketing_attribution_reversal_reason_known
    check (reason in ('refund', 'chargeback', 'duplicate', 'manual')),
  constraint marketing_attribution_reversal_amount_sane check (reversed_amount_cents >= 0),
  constraint marketing_attribution_reversal_source_present check (length(btrim(source)) > 0),
  constraint marketing_attribution_reversal_manual_names_its_actor
    check (reason <> 'manual' or actor_user_id is not null),
  -- One reversal per order per reason per source. A reconciler that runs twice
  -- writes one row, so a repeated sweep cannot inflate the reversal count.
  constraint marketing_attribution_reversal_once_per_source
    unique (order_id, reason, source)
);

comment on table public.marketing_attribution_reversal is
  'GA3. A sale that was attributed and then taken back. Any row here makes the order not billable, computed the moment it lands rather than on a later backfill.';

create index if not exists marketing_attribution_reversal_order_idx
  on public.marketing_attribution_reversal (order_id);

alter table public.marketing_attribution_reversal enable row level security;

-- ---------------------------------------------------------------------------
-- 11. BILLABLE, COMPUTED AND NEVER TYPED.
--
-- Two triggers, one on each side, because the answer can change from either.
-- An application that supplies `billable` is simply overwritten: there is no
-- code path anywhere that can set it.
-- ---------------------------------------------------------------------------
create or replace function public.marketing_attribution_is_billable(
  p_decision text,
  p_rung smallint,
  p_order_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_decision = 'attributed'
     and p_rung <= 3
     and not exists (
       select 1 from public.marketing_attribution_reversal r where r.order_id = p_order_id
     )
$$;

comment on function public.marketing_attribution_is_billable(text, smallint, uuid) is
  'GA3. The ONE definition of billable: an attributed decision, reached on a rung that carries an identifier or an identity, on a sale nothing has reversed. Rung four is a true observation and is never an invoice line.';

create or replace function public.marketing_attribution_set_billable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.billable := public.marketing_attribution_is_billable(new.decision, new.rung, new.order_id);
  return new;
end;
$$;

drop trigger if exists trg_marketing_attribution_set_billable on public.marketing_attribution;
create trigger trg_marketing_attribution_set_billable
  before insert or update on public.marketing_attribution
  for each row execute function public.marketing_attribution_set_billable();

create or replace function public.marketing_attribution_reversal_recompute()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.marketing_attribution a
     set billable = public.marketing_attribution_is_billable(a.decision, a.rung, a.order_id)
   where a.order_id = v_order;
  return null;
end;
$$;

drop trigger if exists trg_marketing_attribution_reversal_recompute on public.marketing_attribution_reversal;
create trigger trg_marketing_attribution_reversal_recompute
  after insert or delete on public.marketing_attribution_reversal
  for each row execute function public.marketing_attribution_reversal_recompute();

-- ---------------------------------------------------------------------------
-- 12. WHAT AN INVOICE MAY ACTUALLY READ.
--
-- Billable answers "is this attribution sound". This view adds the second
-- question, "did the sale complete", by joining the order state lane A
-- maintains. It is a separate question on purpose: an order that expired
-- without payment was never reversed, because it never happened, so writing a
-- reversal row for it would put a retraction in the ledger for a sale that
-- never existed.
-- ---------------------------------------------------------------------------
create or replace view public.marketing_attribution_invoice_ready as
  select a.*, o.order_number, o.status as order_status, o.total_cents, o.event_id
    from public.marketing_attribution a
    join public.orders o on o.id = a.order_id
   where a.billable
     and o.status in ('confirmed', 'partially_refunded');

comment on view public.marketing_attribution_invoice_ready is
  'GA3. The attributions an invoice may quote: sound, and on an order that completed. Never queried to decide billable; billable is stored and this reads it.';

-- ---------------------------------------------------------------------------
-- 13. THE INVARIANT, DEFINED IN SQL SO THE GUARD AND A PERSON READ THE SAME
-- THING.
--
-- Two clauses, and both are checked on every build:
--   1. every order row has exactly one attribution row, so never zero and never
--      two, with unattributed orders carrying the decision none AND a stored
--      reason. Never two is the primary key's job and is checked anyway,
--      because a guard that trusts a constraint cannot notice the constraint
--      being dropped.
--   2. no attribution row reports billable true while any reversal row exists
--      for that order.
--
-- A VIEW rather than a query inside the guard, for the reason GA2 gives: a
-- person opening the database and the guard failing a build should be reading
-- one definition rather than two descriptions of it.
-- ---------------------------------------------------------------------------
create or replace view public.marketing_attribution_invariant_breaches as
  select
    'order has no attribution record' as breach,
    o.id as order_id,
    o.order_number as order_reference,
    'order ' || o.order_number || ' has no row in marketing_attribution. Every order carries exactly one stored decision, including the ones no campaign produced.' as detail
  from public.orders o
  where not exists (select 1 from public.marketing_attribution a where a.order_id = o.id)

  union all

  select
    'attribution says none without a reason' as breach,
    a.order_id,
    o.order_number,
    'order ' || o.order_number || ' resolved to none with no reason recorded. "We do not know" is an answer and it has to carry its cause.'
  from public.marketing_attribution a
  join public.orders o on o.id = a.order_id
  where a.decision = 'none' and length(btrim(coalesce(a.reason, ''))) = 0

  union all

  select
    'billable while reversed' as breach,
    a.order_id,
    o.order_number,
    'order ' || o.order_number || ' reports billable while ' ||
      (select count(*) from public.marketing_attribution_reversal r where r.order_id = a.order_id)::text ||
      ' reversal row(s) exist for it. A fee on a sale that was handed back is a debt to the client.'
  from public.marketing_attribution a
  join public.orders o on o.id = a.order_id
  where a.billable
    and exists (select 1 from public.marketing_attribution_reversal r where r.order_id = a.order_id)

  union all

  select
    'billable on a rung that is not evidence' as breach,
    a.order_id,
    o.order_number,
    'order ' || o.order_number || ' reports billable on rung ' || a.rung::text ||
      '. Only rungs 1, 2 and 3 tie an order to a click; rung 4 is an observation and is never an invoice line.'
  from public.marketing_attribution a
  join public.orders o on o.id = a.order_id
  where a.billable and (a.rung > 3 or a.decision <> 'attributed');

comment on view public.marketing_attribution_invariant_breaches is
  'GA3. Empty when the attribution spine is sound. One row per breach, naming the order reference a person can look up, so a failing build points at an order rather than at a count.';

commit;
