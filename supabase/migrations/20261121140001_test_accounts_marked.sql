-- A TEST ACCOUNT IS MARKED TEST, AND ITS BUSINESS IS NEVER A FIGURE OR A NOTICE TO LAWAL (the PM's 13:22 of
-- 21 November 2026, on Lawal's 13:20: "I can see one organizer today ... It's unclickable ... I cannot see the
-- organizer"). Read on production at 13:44 (OUR DATA): the one organisation made that day was 'EventLinqs QA Organiser',
-- owned by hello+qa-organiser@eventlinqs.com, made by WINDOW 5C's production journey at 11:28; its organisers row read
-- is_test false, so the admin counted it as a new organiser and the owner's notice went out for it. Production then held
-- three test addresses (hello+qa-organiser@, hello+qa-buyer@, one hello+qa<stamp>@), one test organisation, one of its
-- events and no test order.
--
-- THE ONE RULE FOR A TEST ADDRESS, written once here and applied by the triggers below: an address on our own domain
-- whose local part is hello+qa..., hello+test... or hello+acceptance... (the journeys' and the acceptance tests'
-- addresses). Proofs on TEST use @eventlinqs.test and never match.
--
-- 1. organisations, events and orders carry is_test (organisers has carried it since 20261120040001).
-- 2. An organisation is TEST when its owner's address or its own address is a test address, set on insert and when
--    either changes; a mark once set stays until a person clears it.
-- 3. Its organisers rows and its events take its mark on insert and when they move organisation, and follow it when
--    the organisation is marked or cleared; an order takes its night's mark, or its buyer's address, on insert.
-- 4. record_platform_notification, the one function every owner notice goes through, records nothing about a TEST
--    organisation, event or order. Changed in place from the function in force, read on production at 13:47 on
--    21 November 2026 (law 14): only the early return is added.
-- 5. The rows already there are marked.
--
-- Every admin count, report, guide, sitemap and notice reads the mark (scripts/guards/test-accounts-left-out.mjs).
--
-- TRANSACTION SHAPE: three ADD COLUMN IF NOT EXISTS with a constant default (no table rewrite: "When a column is added
-- with ADD COLUMN and a non-volatile DEFAULT is specified, the default is evaluated at the time of the statement and the
-- result stored in the table's metadata", https://www.postgresql.org/docs/current/sql-altertable.html), functions,
-- triggers and three narrow updates; no index, so one transaction; re-runnable. No row is hidden by this file: nothing
-- reads the columns until the code that filters on them is live, and every existing row reads false but the test ones.

alter table public.organisations add column if not exists is_test boolean not null default false;
alter table public.events add column if not exists is_test boolean not null default false;
alter table public.orders add column if not exists is_test boolean not null default false;

comment on column public.organisations.is_test is
  'A test account (the PM''s 13:22 of 21 November 2026): its owner''s or its own address is hello+qa, hello+test or hello+acceptance on eventlinqs.com. Never an admin figure, a report row, a public listing or a notice to the owner.';
comment on column public.events.is_test is
  'Follows its organisation''s is_test (the PM''s 13:22 of 21 November 2026). Never an admin figure, a guide or sitemap entry, or a notice to the owner.';
comment on column public.orders.is_test is
  'Its night is TEST or its buyer''s address is a test address (the PM''s 13:22 of 21 November 2026). Never GMV, a report row or a notice to the owner.';

-- 2. The organisation's mark, from its owner's address and its own.
create or replace function public.organisation_is_test_from_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $mark$
begin
  if new.is_test is distinct from true then
    new.is_test := coalesce(lower(btrim(new.email)) ~ '^hello\+(qa|test|acceptance)[^@]*@eventlinqs\.com$', false)
      or coalesce((select lower(btrim(u.email)) ~ '^hello\+(qa|test|acceptance)[^@]*@eventlinqs\.com$' from auth.users u where u.id = new.owner_id), false);
  end if;
  return new;
end;
$mark$;

drop trigger if exists organisation_is_test_from_address on public.organisations;
create trigger organisation_is_test_from_address
  before insert or update of owner_id, email on public.organisations
  for each row
  execute function public.organisation_is_test_from_address();

-- 3. Its organisers rows and events take it, and an order takes its night's or its buyer's.
create or replace function public.row_is_test_from_organisation()
returns trigger
language plpgsql
security definer
set search_path = public
as $follow$
begin
  if new.organisation_id is not null and new.is_test is distinct from true then
    new.is_test := coalesce((select o.is_test from public.organisations o where o.id = new.organisation_id), false);
  end if;
  return new;
end;
$follow$;

drop trigger if exists organiser_is_test_from_organisation on public.organisers;
create trigger organiser_is_test_from_organisation
  before insert or update of organisation_id on public.organisers
  for each row
  execute function public.row_is_test_from_organisation();

drop trigger if exists event_is_test_from_organisation on public.events;
create trigger event_is_test_from_organisation
  before insert or update of organisation_id on public.events
  for each row
  execute function public.row_is_test_from_organisation();

create or replace function public.order_is_test_from_night_or_buyer()
returns trigger
language plpgsql
security definer
set search_path = public
as $order$
begin
  if new.is_test is distinct from true then
    new.is_test := coalesce((select e.is_test from public.events e where e.id = new.event_id), false)
      or coalesce(lower(btrim(new.guest_email)) ~ '^hello\+(qa|test|acceptance)[^@]*@eventlinqs\.com$', false)
      or coalesce((select lower(btrim(u.email)) ~ '^hello\+(qa|test|acceptance)[^@]*@eventlinqs\.com$' from auth.users u where u.id = new.user_id), false);
  end if;
  return new;
end;
$order$;

drop trigger if exists order_is_test_from_night_or_buyer on public.orders;
create trigger order_is_test_from_night_or_buyer
  before insert on public.orders
  for each row
  execute function public.order_is_test_from_night_or_buyer();

-- When a person marks or clears an organisation, its organisers rows and events follow (orders keep the mark they were
-- written with: a paid order is a money record and is not rewritten here).
create or replace function public.organisation_test_mark_follows()
returns trigger
language plpgsql
security definer
set search_path = public
as $follows$
begin
  update public.organisers set is_test = new.is_test where organisation_id = new.id and is_test is distinct from new.is_test;
  update public.events set is_test = new.is_test where organisation_id = new.id and is_test is distinct from new.is_test;
  return new;
end;
$follows$;

drop trigger if exists organisation_test_mark_follows on public.organisations;
create trigger organisation_test_mark_follows
  after update of is_test on public.organisations
  for each row
  when (new.is_test is distinct from old.is_test)
  execute function public.organisation_test_mark_follows();

revoke all on function public.organisation_is_test_from_address() from public, anon, authenticated;
revoke all on function public.row_is_test_from_organisation() from public, anon, authenticated;
revoke all on function public.order_is_test_from_night_or_buyer() from public, anon, authenticated;
revoke all on function public.organisation_test_mark_follows() from public, anon, authenticated;

-- 4. The owner is never told about a TEST account's business. In place from the function in force; only the early
--    return is new.
create or replace function public.record_platform_notification(p_kind platform_notification_kind, p_dedupe_key text, p_summary text, p_admin_path text, p_actor_user_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_event_id uuid DEFAULT NULL::uuid, p_order_id uuid DEFAULT NULL::uuid, p_actor_label text DEFAULT NULL::text, p_organisation_name text DEFAULT NULL::text, p_event_title text DEFAULT NULL::text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- A test account's business is never a notice to the owner (the PM's 13:22 of 21 November 2026).
  if (p_organisation_id is not null and exists (select 1 from public.organisations o where o.id = p_organisation_id and o.is_test))
     or (p_event_id is not null and exists (select 1 from public.events e where e.id = p_event_id and e.is_test))
     or (p_order_id is not null and exists (select 1 from public.orders r where r.id = p_order_id and r.is_test)) then
    return;
  end if;
  insert into public.platform_notifications (
    kind, dedupe_key, summary, admin_path,
    actor_user_id, organisation_id, event_id, order_id,
    actor_label, organisation_name, event_title, detail
  ) values (
    p_kind, p_dedupe_key, p_summary, p_admin_path,
    p_actor_user_id, p_organisation_id, p_event_id, p_order_id,
    p_actor_label, p_organisation_name, p_event_title, coalesce(p_detail, '{}'::jsonb)
  )
  on conflict (dedupe_key) do nothing;
exception
  when others then
    raise warning '[platform_notifications] % not recorded: %', p_dedupe_key, sqlerrm;
end;
$function$;

-- 5. The rows already there (read at 13:44 and 13:47: one organisation, its organisers row, one event, no order). The
--    organisations are marked; organisation_test_mark_follows carries the mark to their organisers rows and events.
--    No order is rewritten: production held no test order, and a paid order is a money record.
update public.organisations o
   set is_test = true
  from auth.users u
 where u.id = o.owner_id
   and o.is_test = false
   and lower(btrim(u.email)) ~ '^hello\+(qa|test|acceptance)[^@]*@eventlinqs\.com$';
update public.organisations
   set is_test = true
 where is_test = false
   and lower(btrim(email)) ~ '^hello\+(qa|test|acceptance)[^@]*@eventlinqs\.com$';
