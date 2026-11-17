-- THE SEVEN COMMUNICATION CATEGORIES ON EVERY MESSAGE RECORD (Law 24; Lawal's master communications directive of
-- 18 November 2026, 09:17, C:\dev\START-16OCT\MASTER-COMMS-DIRECTIVE-LOCKED-18NOV.md, section 1: "Every communication
-- must have exactly one primary category ... recorded in the database"; the PM's 09:30 of 18 November 2026, item 4).
--
-- The one map lives in src/lib/comms/categories.ts; tests/unit/comms/categories.test.ts reads this file and fails if
-- the two disagree. Nothing that runs is changed: no sender, planner, publisher or report reads these columns yet, the
-- never edited templates are not edited (a template's class is read by its key), and no row is hidden or removed.
--
-- 1. comms_subtype_of_template_key: a CRM template's subtype by its key (its category is the subtype's first word).
-- 2. outreach_touches: comms_category, comms_subtype and comms_source ('template', 'manual', 'thread' or 'default'),
--    set by a trigger on insert and when the template changes, backfilled for every row, and held by a check.
-- 3. social_pieces: SOC, its subtype its kind (SOC-DAILY-POSTER).
-- 4. organiser_night_reports RET-PERFORMANCE; organiser_sales_digest_sends RET-SALES-DIGEST; platform_notifications
--    SYS-ADMIN-NOTICE (the notices to the founder of what happened on the platform).
-- 5. notifications: an attendee's event alert is LIST (LIST-JUST-ANNOUNCED); a performer marketplace notice is SYS.
-- Dry run read on production before this was named: C:\dev\EVIDENCE\EL-18NOV\law24\dry-run.

begin;

-- 1. The template map. Unknown keys answer null, so the touch check below refuses a message from an unmapped template.
create or replace function public.comms_subtype_of_template_key(p_key text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $map$
  select m.subtype from (values
    ('twenty_advice', 'ACQ-FIRST'),
    ('twenty_offer', 'ACQ-FIRST'),
    ('twenty_own_page', 'ACQ-FIRST'),
    ('first_invitation', 'ACQ-FIRST'),
    ('first_invitation_referred', 'ACQ-FIRST'),
    ('first_dm', 'ACQ-FIRST'),
    ('who_looks_after_events', 'ACQ-FIRST'),
    ('twenty_day4', 'ACQ-FOLLOWUP'),
    ('twenty_day10', 'ACQ-FOLLOWUP'),
    ('day4_follow_up', 'ACQ-FOLLOWUP'),
    ('day10_close', 'ACQ-FOLLOWUP'),
    ('day4_dm', 'ACQ-FOLLOWUP'),
    ('reply_who_are_you', 'ACQ-REPLY'),
    ('reply_not_now', 'ACQ-REPLY'),
    ('reply_cost', 'ACQ-REPLY'),
    ('dm_on_yes', 'ACQ-REPLY'),
    ('segment_a_first', 'PERM-IMAGE'),
    ('segment_a_day4', 'PERM-REMINDER'),
    ('segment_a_day10', 'PERM-REMINDER'),
    ('featured', 'LIST-FEATURED'),
    ('reply_why_listed', 'LIST-REPLY'),
    ('reply_take_down', 'LIST-REPLY'),
    ('reply_change', 'LIST-REPLY'),
    ('withdrawal_confirmed', 'LIST-WITHDRAWN'),
    ('after_your_night', 'RET-PERFORMANCE'),
    ('anything_coming_up', 'RET-NEXT-EVENT'),
    ('thank_you', 'RET-THANK-YOU'),
    ('reply_existing_ticketing', 'TKT-REPLY'),
    ('reply_stop', 'SYS-UNSUBSCRIBE')
  ) as m(key, subtype)
  where m.key = p_key
$map$;

comment on function public.comms_subtype_of_template_key(text) is
  'Law 24: a CRM template''s communication subtype by its key; the category is its first word. Mirrors TEMPLATE_CLASS in src/lib/comms/categories.ts.';

-- 2. The CRM's messages.
alter table public.outreach_touches
  add column if not exists comms_category text,
  add column if not exists comms_subtype text,
  add column if not exists comms_source text;

create or replace function public.outreach_touch_takes_its_class()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $cls$
declare
  v_key text;
  v_cat text;
  v_sub text;
begin
  -- Classed already and its template unchanged: kept as it is.
  if tg_op = 'UPDATE' and new.template_id is not distinct from old.template_id and old.comms_category is not null then
    new.comms_category := old.comms_category;
    new.comms_subtype := old.comms_subtype;
    new.comms_source := old.comms_source;
    return new;
  end if;
  if new.template_id is not null then
    select key into v_key from public.outreach_templates where id = new.template_id;
    new.comms_subtype := public.comms_subtype_of_template_key(v_key);
    new.comms_category := split_part(new.comms_subtype, '-', 1);
    new.comms_source := 'template';
    return new;
  end if;
  if tg_op = 'INSERT' and new.comms_source = 'manual' and new.comms_category is not null and new.comms_subtype is not null then
    return new;
  end if;
  -- A message with no template keeps its thread's one category: the latest classed message to the same contact.
  select o.comms_category, o.comms_subtype into v_cat, v_sub
    from public.outreach_touches o
   where o.contact_id = new.contact_id and o.id <> new.id and o.state <> 'void' and o.comms_source in ('template', 'manual')
   order by coalesce(o.sent_at, o.drafted_at) desc nulls last
   limit 1;
  if v_cat is not null then
    new.comms_category := v_cat;
    new.comms_subtype := case
      when new.purpose = 'reply' then v_cat || '-REPLY'
      when coalesce(new.step, 1) > 1 then v_cat || case when v_cat = 'PERM' then '-REMINDER' else '-FOLLOWUP' end
      else v_sub end;
    new.comms_source := 'thread';
  else
    -- None: the CRM's own place, acquisition, by its step and purpose (src/lib/comms/categories.ts classOfUntemplated).
    new.comms_category := case when new.purpose = 'relationship' then 'RET' else 'ACQ' end;
    new.comms_subtype := case
      when new.purpose = 'reply' then 'ACQ-REPLY'
      when new.purpose = 'relationship' then 'RET-RELATIONSHIP'
      when coalesce(new.step, 1) > 1 then 'ACQ-FOLLOWUP'
      else 'ACQ-FIRST' end;
    new.comms_source := 'default';
  end if;
  return new;
end;
$cls$;

revoke all on function public.outreach_touch_takes_its_class() from public, anon, authenticated;

comment on function public.outreach_touch_takes_its_class() is
  'Law 24: every CRM message takes one communication category and subtype, from its template, else its thread, else the CRM''s own place by step and purpose.';

drop trigger if exists trg_outreach_touch_takes_its_class on public.outreach_touches;
create trigger trg_outreach_touch_takes_its_class
  before insert or update of template_id, comms_source on public.outreach_touches
  for each row execute function public.outreach_touch_takes_its_class();

-- The backfill: templated messages first, then the rest oldest first, so a thread reads its earlier messages. Setting
-- comms_source fires only this trigger and the page check (which passes held and void, all 99 rows on 18 November); the
-- lawfulness trigger names its columns and is not fired.
update public.outreach_touches set comms_source = 'template' where comms_category is null and template_id is not null;
do $fill$
declare
  r record;
begin
  for r in select id from public.outreach_touches where comms_category is null order by drafted_at, id loop
    update public.outreach_touches set comms_source = 'default' where id = r.id;
  end loop;
end;
$fill$;

alter table public.outreach_touches drop constraint if exists outreach_touches_comms_class;
alter table public.outreach_touches add constraint outreach_touches_comms_class check (
  comms_category in ('ACQ', 'PERM', 'LIST', 'SOC', 'RET', 'TKT', 'SYS')
  and comms_subtype ~ ('^' || comms_category || '(-[A-Z0-9]+)+$')
  and comms_source in ('template', 'manual', 'thread', 'default')
);

create index if not exists outreach_touches_comms_subtype_idx on public.outreach_touches (comms_subtype, state);

-- 3. The social pieces.
alter table public.social_pieces
  add column if not exists comms_category text not null default 'SOC',
  add column if not exists comms_subtype text generated always as ('SOC-' || upper(replace(kind, '_', '-'))) stored;
alter table public.social_pieces drop constraint if exists social_pieces_comms_class;
alter table public.social_pieces add constraint social_pieces_comms_class check (
  comms_category = 'SOC' and comms_subtype ~ '^SOC(-[A-Z0-9]+)+$'
);

-- 4. The night reports, the sales digests and the founder's notices: one kind of message each.
alter table public.organiser_night_reports
  add column if not exists comms_category text not null default 'RET',
  add column if not exists comms_subtype text not null default 'RET-PERFORMANCE';
alter table public.organiser_night_reports drop constraint if exists organiser_night_reports_comms_class;
alter table public.organiser_night_reports add constraint organiser_night_reports_comms_class check (
  comms_category = 'RET' and comms_subtype = 'RET-PERFORMANCE'
);

alter table public.organiser_sales_digest_sends
  add column if not exists comms_category text not null default 'RET',
  add column if not exists comms_subtype text not null default 'RET-SALES-DIGEST';
alter table public.organiser_sales_digest_sends drop constraint if exists organiser_sales_digest_sends_comms_class;
alter table public.organiser_sales_digest_sends add constraint organiser_sales_digest_sends_comms_class check (
  comms_category = 'RET' and comms_subtype = 'RET-SALES-DIGEST'
);

alter table public.platform_notifications
  add column if not exists comms_category text not null default 'SYS',
  add column if not exists comms_subtype text not null default 'SYS-ADMIN-NOTICE';
alter table public.platform_notifications drop constraint if exists platform_notifications_comms_class;
alter table public.platform_notifications add constraint platform_notifications_comms_class check (
  comms_category = 'SYS' and comms_subtype = 'SYS-ADMIN-NOTICE'
);

-- 5. The attendee and performer notifications.
alter table public.notifications
  add column if not exists comms_category text generated always as (
    case when type in ('just_announced', 'on_sale', 'going_fast', 'last_chance', 'tonight', 'waitlist_available') then 'LIST' else 'SYS' end) stored,
  add column if not exists comms_subtype text generated always as (
    case when type in ('just_announced', 'on_sale', 'going_fast', 'last_chance', 'tonight', 'waitlist_available') then 'LIST' else 'SYS' end
    || '-' || upper(replace(type, '_', '-'))) stored;

commit;
