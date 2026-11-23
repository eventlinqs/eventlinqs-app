-- THE CREATIVE BUDGET (the PM's 13:20 of 23 November 2026: "every generation and review call records its tokens and cost
-- from the API's usage fields; a monthly cap for creative work ... at the cap, creative generation stops for the month, is
-- logged, and the PM is told; posts already approved are unaffected ... Nothing in the engine turns on auto reload or buys
-- credits ... Design generation calls stay OFF until the PM confirms"; and 13:21: the cap is the included credit, US$200 a
-- month, its next credit on the 7th). src/lib/creative/budget.ts reads both tables.
--
-- creative_budget: the cap and the one switch, as rows. The newest row rules; with none, the cap is zero and generation is
-- off. The service role may only READ it: a row is written only through a logged production write (a reviewed file applied
-- by scripts/ops/apply-reviewed-sql-production.mjs, which runs as the database owner and logs to PRODUCTION-WRITES.txt), so
-- no engine code can raise its own cap or turn itself on.
-- creative_calls: one row per generation or review call, its model and tokens from the API's own usage and its cost.

create table if not exists public.creative_budget (
  id uuid primary key default gen_random_uuid(),
  set_at timestamptz not null default now(),
  cap_usd numeric(10, 2) not null check (cap_usd >= 0),
  generation_on boolean not null default false,
  -- The day of the month the included credit renews (the PM's 13:21: 'next credit Dec 7'), so a cap never spans two credits.
  month_starts_day smallint not null default 1 check (month_starts_day between 1 and 28),
  set_by text not null check (length(btrim(set_by)) between 2 and 200),
  reason text not null check (length(btrim(reason)) between 10 and 1000)
);
create index if not exists creative_budget_newest on public.creative_budget (set_at desc);
comment on table public.creative_budget is
  'The creative cap and the generation switch, newest row rules; none means a zero cap with generation off. Written only by a logged production write; the service role reads.';

alter table public.creative_budget enable row level security;
revoke all on public.creative_budget from public, anon, authenticated, service_role;
grant select on public.creative_budget to service_role;

create table if not exists public.creative_calls (
  id uuid primary key default gen_random_uuid(),
  called_at timestamptz not null default now(),
  purpose text not null check (purpose in ('generation', 'review')),
  model text not null check (length(btrim(model)) between 3 and 100),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cost_micro_usd bigint not null check (cost_micro_usd >= 0),
  brief_id uuid,
  -- The organisation Anthropic names on the response (anthropic-organization-id), never the key.
  organisation text check (organisation is null or length(btrim(organisation)) between 3 and 200),
  request_id text check (request_id is null or length(btrim(request_id)) between 3 and 200)
);
create index if not exists creative_calls_by_time on public.creative_calls (called_at desc);
comment on table public.creative_calls is
  'One row per creative generation or review call: its model, its tokens from the API''s usage fields and its cost in micro US dollars. Append only.';

alter table public.creative_calls enable row level security;
revoke all on public.creative_calls from public, anon, authenticated, service_role;
grant select, insert on public.creative_calls to service_role;

-- What creative work has spent since a moment, in micro US dollars, summed in the database (never a capped row read).
create or replace function public.creative_spent_since(p_from timestamptz)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $spent$
  select coalesce(sum(cost_micro_usd), 0)::bigint from public.creative_calls where called_at >= p_from
$spent$;
revoke all on function public.creative_spent_since(timestamptz) from public, anon, authenticated;
grant execute on function public.creative_spent_since(timestamptz) to service_role;

-- POST-CONDITIONS
do $post$
begin
  if has_table_privilege('service_role', 'public.creative_budget', 'INSERT') or has_table_privilege('service_role', 'public.creative_budget', 'UPDATE') then
    raise exception 'creative_budget is writable by the service role; only a logged production write may set it';
  end if;
  if has_table_privilege('anon', 'public.creative_calls', 'SELECT') or has_table_privilege('service_role', 'public.creative_calls', 'UPDATE') then
    raise exception 'creative_calls is granted wider than its rule';
  end if;
end $post$;
