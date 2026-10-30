-- THE GOOGLE COST GUARD (the PROJECT MANAGER's 16:52 of 30 October 2026, Lawal's 16:51 order on the venue photo
-- harvest: free licensed sources first, "Google only for the rest, and Google stays OFF until Lawal says (he wants the
-- cost first)"; window 5 builds "a daily quota and a monthly spend cap, the counter on /admin/today").
--
-- THE DATABASE DECIDES. Every billed Google web service call asks public.google_spend_reserve first
-- (src/lib/google/spend-guard.ts withGoogleSpend) and is made only on its yes. The function takes the one settings row
-- FOR UPDATE, so reservations are serialised and two callers can never both take the last unit of a quota or a cap.
-- Every answer, yes or no, is a ledger row, so a refusal is counted on /admin/today and the spend is the ledger's sum,
-- never a guess.
--
-- IT STARTS SHUT: enabled false, a daily quota of 0 and a monthly cap of 0. Nothing is called until Lawal sets all
-- three. Money is in micro US dollars, as Google bills in US dollars.
--
-- PRICES (Law 7), from Google's own price list, https://developers.google.com/maps/billing-and-pricing/pricing
-- (read 30 October 2026): Places Photo, Enterprise tier, US$7.00 per 1,000 in the first band; Text Search, Enterprise
-- tier, US$35.00 per 1,000 in the first band (the dearest Text Search tier, so a search is never under-counted). The
-- monthly free usage Google allows per SKU is NOT subtracted: the guard counts every call as billed, so it can only
-- over-count. A call with no price row is refused.
--
-- Additive: three new tables, each granted in this migration (the 21 October 2026 grant rule), two functions.

create table if not exists public.google_spend_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  daily_call_quota integer not null default 0 check (daily_call_quota >= 0),
  monthly_cap_micros bigint not null default 0 check (monthly_cap_micros >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);
comment on table public.google_spend_settings is
  'One row: whether billed Google calls may be made at all, the daily call quota (units, Australia/Melbourne day) and the monthly spend cap (micro US dollars, Australia/Melbourne month). Starts shut.';
insert into public.google_spend_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.google_spend_prices (
  api text primary key,
  unit_price_micros bigint not null check (unit_price_micros > 0),
  sku text not null,
  source_url text not null,
  read_on date not null
);
comment on table public.google_spend_prices is
  'The price of one unit of each billed Google call, with the price list it was read from and when. A call with no row here is refused.';
insert into public.google_spend_prices (api, unit_price_micros, sku, source_url, read_on) values
  ('places_photo', 7000, 'Places Photo (Enterprise), US$7.00 per 1,000 in the first band', 'https://developers.google.com/maps/billing-and-pricing/pricing', '2026-10-30'),
  ('places_text_search', 35000, 'Text Search (Enterprise), US$35.00 per 1,000 in the first band', 'https://developers.google.com/maps/billing-and-pricing/pricing', '2026-10-30')
on conflict (api) do nothing;

create table if not exists public.google_spend_ledger (
  id bigint generated always as identity primary key,
  api text not null,
  units integer not null,
  cost_micros bigint not null default 0,
  allowed boolean not null,
  reason text,
  purpose text not null,
  occurred_at timestamptz not null default now()
);
comment on table public.google_spend_ledger is
  'Every reservation google_spend_reserve answered, yes or no, with what it was for. Written only by that function.';
create index if not exists google_spend_ledger_occurred_at_idx on public.google_spend_ledger (occurred_at);

alter table public.google_spend_settings enable row level security;
alter table public.google_spend_prices enable row level security;
alter table public.google_spend_ledger enable row level security;

revoke all on table public.google_spend_settings from anon, authenticated, service_role;
revoke all on table public.google_spend_prices from anon, authenticated, service_role;
revoke all on table public.google_spend_ledger from anon, authenticated, service_role;
grant select, update on table public.google_spend_settings to service_role;
grant select on table public.google_spend_prices to service_role;
grant select on table public.google_spend_ledger to service_role;

create or replace function public.google_spend_reserve(p_api text, p_units integer, p_purpose text)
returns table (allowed boolean, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.google_spend_settings;
  v_price bigint;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Australia/Melbourne') at time zone 'Australia/Melbourne';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Australia/Melbourne') at time zone 'Australia/Melbourne';
  v_calls bigint;
  v_spent bigint;
  v_reason text;
  v_cost bigint := 0;
begin
  -- Serialise every reservation on the one settings row.
  select * into s from public.google_spend_settings where id for update;
  select unit_price_micros into v_price from public.google_spend_prices where api = p_api;

  if p_units is null or p_units < 1 then
    v_reason := 'A Google call must reserve at least one unit.';
  elsif s.enabled is not true then
    v_reason := 'Google is switched off: it waits for Lawal''s word.';
  elsif v_price is null then
    v_reason := 'No price is recorded for this Google call, so it is not made.';
  else
    select coalesce(sum(l.units), 0), 0 into v_calls, v_spent
      from public.google_spend_ledger l where l.allowed and l.occurred_at >= v_day_start;
    select coalesce(sum(l.cost_micros), 0) into v_spent
      from public.google_spend_ledger l where l.allowed and l.occurred_at >= v_month_start;
    if v_calls + p_units > s.daily_call_quota then
      v_reason := 'Today''s Google call quota is reached.';
    elsif v_spent + p_units * v_price > s.monthly_cap_micros then
      v_reason := 'This month''s Google spend cap would be passed.';
    else
      v_cost := p_units * v_price;
    end if;
  end if;

  insert into public.google_spend_ledger (api, units, cost_micros, allowed, reason, purpose)
  values (coalesce(p_api, 'not given'), coalesce(p_units, 0), v_cost, v_reason is null, v_reason, coalesce(nullif(btrim(p_purpose), ''), 'not given'));

  return query select v_reason is null, v_reason;
end;
$$;

create or replace function public.google_spend_state()
returns table (enabled boolean, daily_call_quota integer, monthly_cap_micros bigint, calls_today bigint, spent_this_month_micros bigint, refused_today bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.enabled, s.daily_call_quota, s.monthly_cap_micros,
    coalesce((select sum(l.units) from public.google_spend_ledger l where l.allowed and l.occurred_at >= date_trunc('day', now() at time zone 'Australia/Melbourne') at time zone 'Australia/Melbourne'), 0)::bigint,
    coalesce((select sum(l.cost_micros) from public.google_spend_ledger l where l.allowed and l.occurred_at >= date_trunc('month', now() at time zone 'Australia/Melbourne') at time zone 'Australia/Melbourne'), 0)::bigint,
    (select count(*) from public.google_spend_ledger l where not l.allowed and l.occurred_at >= date_trunc('day', now() at time zone 'Australia/Melbourne') at time zone 'Australia/Melbourne')::bigint
  from public.google_spend_settings s where s.id;
$$;

revoke all on function public.google_spend_reserve(text, integer, text) from public, anon, authenticated;
grant execute on function public.google_spend_reserve(text, integer, text) to service_role;
revoke all on function public.google_spend_state() from public, anon, authenticated;
grant execute on function public.google_spend_state() to service_role;
