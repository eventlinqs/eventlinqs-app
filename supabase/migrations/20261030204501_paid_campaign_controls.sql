-- PAID CAMPAIGN CONTROLS, BUILT AND OFF (D7x of Lawal's DemandOS directive of 30 October 2026, section 7: "Require:
-- verified destination, approved creative, working attribution, defined budget, campaign objective, spending limits,
-- appropriate permissions, performance monitoring. Do not automatically spend advertising money without explicit founder
-- authorisation. Do not launch paid campaigns for every discovered event.")
--
-- A PLAN IS A RECORD. Nothing here or in the application calls an advertising platform, so nothing can spend. A person
-- places the advert by hand once Lawal has approved the plan, and enters what the platform charged.
--
-- THE DATABASE DECIDES. A plan once written cannot be changed (no update grant): a changed plan is a new plan. Its status
-- moves only through the functions below, each taking the one settings row FOR UPDATE. Approval refuses a plan short of
-- any requirement, with every reason. Start refuses while the switch is off, which is how it ships.
--
-- Money is in Australian cents, the platform's own currency. Additive: three new tables, each granted in this migration
-- (the 21 October 2026 grant rule), four functions.

create table if not exists public.paid_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  monthly_cap_cents bigint not null default 0 check (monthly_cap_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
comment on table public.paid_settings is
  'One row: whether a paid plan may start at all, and the monthly cap across every plan. Starts off with a zero cap.';
insert into public.paid_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.paid_campaigns (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('event', 'city_guide')),
  event_id uuid references public.events (id) on delete restrict,
  city_slug text,
  objective text check (objective in ('verified_purchase', 'qualified_referral', 'returning_visitor')),
  destination_url text,
  piece_id uuid references public.social_pieces (id) on delete restrict,
  share_link_id uuid references public.share_links (id) on delete restrict,
  budget_cents bigint not null default 0 check (budget_cents >= 0),
  daily_limit_cents bigint not null default 0 check (daily_limit_cents >= 0),
  permission_note text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'live', 'paused', 'ended')),
  status_reason text,
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint paid_campaigns_scope_names_its_subject check (
    (scope = 'event' and event_id is not null) or (scope = 'city_guide' and city_slug is not null)
  ),
  constraint paid_campaigns_approved_by_someone check (status = 'draft' or (approved_by is not null and approved_at is not null))
);
comment on table public.paid_campaigns is
  'A plan for one paid promotion. A record only: nothing calls an advertising platform. Written once; its status moves only through the paid_campaign_* functions.';

create table if not exists public.paid_campaign_spend (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.paid_campaigns (id) on delete restrict,
  spend_day date not null,
  amount_cents bigint not null check (amount_cents > 0),
  source_note text not null check (length(btrim(source_note)) > 0),
  entered_by uuid not null references auth.users (id) on delete restrict,
  entered_at timestamptz not null default now(),
  unique (campaign_id, spend_day)
);
comment on table public.paid_campaign_spend is
  'What an advertising platform charged a plan on a day, entered by a person from the platform''s own figure. Written only by paid_campaign_record_spend.';
create index if not exists paid_campaign_spend_by_day on public.paid_campaign_spend (spend_day);

alter table public.paid_settings enable row level security;
alter table public.paid_campaigns enable row level security;
alter table public.paid_campaign_spend enable row level security;

revoke all on table public.paid_settings from anon, authenticated, service_role;
revoke all on table public.paid_campaigns from anon, authenticated, service_role;
revoke all on table public.paid_campaign_spend from anon, authenticated, service_role;
grant select, update on table public.paid_settings to service_role;
grant select, insert on table public.paid_campaigns to service_role;
grant select on table public.paid_campaign_spend to service_role;

create or replace function public.paid_campaign_approve(p_campaign uuid, p_by uuid)
returns table (approved boolean, problems text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.paid_campaigns;
  v_problems text[] := '{}';
begin
  perform 1 from public.paid_settings where id for update;
  select * into c from public.paid_campaigns where id = p_campaign;
  if not found then
    raise exception 'paid_campaign_approve: no such plan %', p_campaign;
  end if;
  if c.status <> 'draft' then
    raise exception 'paid_campaign_approve: only a draft is approved (this one is %)', c.status;
  end if;

  if c.destination_url is null or c.destination_url !~ '^https://[^[:space:]]+$' then
    v_problems := array_append(v_problems, 'No verified destination: an https address is required.'::text);
  end if;
  if c.piece_id is null or not exists (select 1 from public.social_piece_approvals a where a.piece_id = c.piece_id) then
    v_problems := array_append(v_problems, 'No approved creative: the piece must be approved first.'::text);
  end if;
  if c.share_link_id is null then
    v_problems := array_append(v_problems, 'No working attribution: the plan needs its tracked link.'::text);
  end if;
  if c.budget_cents <= 0 then
    v_problems := array_append(v_problems, 'No defined budget.'::text);
  end if;
  if c.daily_limit_cents <= 0 or c.daily_limit_cents > c.budget_cents then
    v_problems := array_append(v_problems, 'No spending limit: a daily limit above zero and within the budget is required.'::text);
  end if;
  if c.objective is null then
    v_problems := array_append(v_problems, 'No campaign objective.'::text);
  end if;
  if c.permission_note is null or btrim(c.permission_note) = '' then
    v_problems := array_append(v_problems, 'No appropriate permission is recorded.'::text);
  end if;

  if array_length(v_problems, 1) is null then
    update public.paid_campaigns set status = 'approved', approved_by = p_by, approved_at = now() where id = p_campaign;
    return query select true, v_problems;
  else
    return query select false, v_problems;
  end if;
end;
$$;

create or replace function public.paid_campaign_start(p_campaign uuid)
returns table (started boolean, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.paid_settings;
  c public.paid_campaigns;
  v_spent bigint;
begin
  select * into s from public.paid_settings where id for update;
  select * into c from public.paid_campaigns where id = p_campaign;
  if not found then
    raise exception 'paid_campaign_start: no such plan %', p_campaign;
  end if;
  if s.enabled is not true then
    return query select false, 'Paid promotion is switched off: it waits for Lawal''s word.'::text;
    return;
  end if;
  if c.status <> 'approved' then
    return query select false, 'Only an approved plan can start.'::text;
    return;
  end if;
  select coalesce(sum(p.amount_cents), 0) into v_spent from public.paid_campaign_spend p
    where p.spend_day >= date_trunc('month', now() at time zone 'Australia/Melbourne')::date;
  if v_spent + c.budget_cents > s.monthly_cap_cents then
    return query select false, 'This plan''s budget could pass this month''s cap.'::text;
    return;
  end if;
  update public.paid_campaigns set status = 'live', status_reason = null where id = p_campaign;
  return query select true, null::text;
end;
$$;

-- Performance monitoring: a charge that reaches the budget pauses the plan, with the reason, and a person looks.
create or replace function public.paid_campaign_record_spend(p_campaign uuid, p_day date, p_amount_cents bigint, p_source_note text, p_by uuid)
returns table (spent_cents bigint, paused boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.paid_campaigns;
  v_spent bigint;
begin
  perform 1 from public.paid_settings where id for update;
  select * into c from public.paid_campaigns where id = p_campaign;
  if not found or c.status not in ('live', 'paused', 'ended') then
    raise exception 'paid_campaign_record_spend: only a plan that has run has a charge';
  end if;
  insert into public.paid_campaign_spend (campaign_id, spend_day, amount_cents, source_note, entered_by)
    values (p_campaign, p_day, p_amount_cents, p_source_note, p_by);
  select coalesce(sum(p.amount_cents), 0) into v_spent from public.paid_campaign_spend p where p.campaign_id = p_campaign;
  if v_spent >= c.budget_cents and c.status = 'live' then
    update public.paid_campaigns set status = 'paused', status_reason = 'The budget was reached.' where id = p_campaign;
    return query select v_spent, true;
  else
    return query select v_spent, false;
  end if;
end;
$$;

create or replace function public.paid_state()
returns table (enabled boolean, live bigint, paused bigint, spent_this_month_cents bigint, monthly_cap_cents bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.enabled,
    (select count(*) from public.paid_campaigns c where c.status = 'live'),
    (select count(*) from public.paid_campaigns c where c.status = 'paused'),
    coalesce((select sum(p.amount_cents) from public.paid_campaign_spend p where p.spend_day >= date_trunc('month', now() at time zone 'Australia/Melbourne')::date), 0)::bigint,
    s.monthly_cap_cents
  from public.paid_settings s where s.id;
$$;

revoke all on function public.paid_campaign_approve(uuid, uuid) from public, anon, authenticated;
revoke all on function public.paid_campaign_start(uuid) from public, anon, authenticated;
revoke all on function public.paid_campaign_record_spend(uuid, date, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.paid_state() from public, anon, authenticated;
grant execute on function public.paid_campaign_approve(uuid, uuid) to service_role;
grant execute on function public.paid_campaign_start(uuid) to service_role;
grant execute on function public.paid_campaign_record_spend(uuid, date, bigint, text, uuid) to service_role;
grant execute on function public.paid_state() to service_role;
