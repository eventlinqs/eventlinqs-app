-- ============================================================================
-- OUTREACH, AUTOMATED INSIDE AN APPROVED PLAY (window 6, 28 October 2026; the engine plan's FULL AUTOMATION section,
-- Lawal 20:16: "everything is a fully automated process... it can run without me"; the final texts are
-- C:\dev\START-16OCT\EVENTLINQS-ORGANISER-MESSAGES-28OCT.md). Follows 20261028201001_organiser_crm.sql.
--
-- Lawal approves a PLAY once (who it goes to, which template versions, the daily cap) and never each email. Inside an
-- approved play the system drafts, queues and sends through Microsoft Graph from hello@eventlinqs.com. The database
-- still decides whether any one message may go:
--
--   outreach_templates         the texts as rows, versioned, never edited: a change is a new version.
--   outreach_plays             the approval: cohort rule, template versions, cap from 20, approved by a person, paused
--                              with its reason. Once approved its terms cannot change; a new play is drafted instead.
--   outreach_sender            one row: HOLD (nothing leaves; the default), TEST (only addresses at our own domain) or
--                              LIVE (needs a passing SPF, DKIM and DMARC check from the last 7 days).
--   outreach_delivery_events   bounces and complaints. THE RAMP AND THE PAUSE LIVE HERE: a play's cap starts at 20 and
--                              steps up by its step each day it sent, only while hard bounces stay under 2 percent and
--                              complaints under 0.1 percent of its sends (the plan's figures); above either the play is
--                              paused at once with the figures as its reason, and a hard bounce stops that address.
--
-- WHAT CHANGES IN 201001, and why:
--   1. A DRAFT IS KEPT AND HELD WITH THE RULE NAMED (the project manager's 20:10: "a draft failing any rule is held,
--      with the rule named"). held_because carries the failed rules; the database refuses to QUEUE or SEND a message
--      that carries any, and checks again itself the rules it can read: the greeting, EventLinqs named, the unsubscribe
--      link or the reply stop line, no em or en dash, no exclamation mark.
--   2. A REPLY STOPS THE COLD CADENCE ONLY. A yes leads to message 5 and the partner messages (7, 8, 9, 10); a
--      question gets its stored answer. So a message now has a PURPOSE: cadence (messages 1, 1b, 2, 3, 4), relationship
--      (5, 7, 8, 9, 10: only after their yes or with their express consent) or reply (an answer to what they wrote;
--      the confirmation of a stop or a take down is the one message that may go to a stopped address, once).
--   3. A sent message may be sent by the play through Graph (no person presses send) as well as by Lawal by hand; the
--      Graph message ids are kept, so a follow-up goes in the same thread and a reply is matched to what it answers.
--   4. A reply is classified (stop, yes, take down, a stored question, unclear) with its confidence and who classified
--      it. Its words, time and contact stay as received; only the classification may be corrected, and a correction
--      to stop is honoured like the first.
--   5. One live cadence per organiser now means one contact WRITTEN TO AND NOT YET REPLYING: message 1b to a general
--      inbox ends when the inbox replies naming the right person, and message 1 may then go to them.
--
-- NOTHING SENDS FROM THIS FILE. outreach_sender starts in HOLD; LIVE is Lawal's step after his Graph consent.
-- Service role only, revoked first (the 21 October 2026 grant rule). Reversal: drop the new tables, functions and
-- triggers, restore 201001's function and trigger bodies and its constraints; export outreach_touches,
-- outreach_replies and outreach_delivery_events first.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE TEMPLATES.
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z0-9_]{3,40}$'),
  version integer not null check (version >= 1),
  channel text not null check (channel in ('email', 'dm')),
  purpose text not null check (purpose in ('cadence', 'relationship', 'reply')),
  -- The cadence step a template serves (1, 2 or 3), null outside the cadence.
  step smallint check (step between 1 and 3),
  subject text check (subject is null or length(btrim(subject)) between 3 and 200),
  body text not null check (length(btrim(body)) between 10 and 5000),
  source text not null check (length(btrim(source)) between 5 and 300),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint outreach_templates_one_version unique (key, version),
  constraint outreach_templates_step_is_cadence check ((purpose = 'cadence') = (step is not null))
);

comment on table public.outreach_templates is
  'Engine part C: the organiser messages as rows, versioned and never edited (a change is a new version). Every message names the template and version it came from. Service role only.';

drop trigger if exists trg_outreach_templates_never_edited on public.outreach_templates;
create trigger trg_outreach_templates_never_edited
  before update or delete or truncate on public.outreach_templates
  for each statement execute function public.refuse_ledger_mutation();

-- ---------------------------------------------------------------------------
-- 2. THE SENDER: hold, test or live.
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_sender (
  id boolean primary key default true check (id),
  mode text not null default 'hold' check (mode in ('hold', 'test', 'live')),
  from_address text not null default 'hello@eventlinqs.com' check (from_address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  test_domain text not null default 'eventlinqs.com' check (test_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  dns_ok boolean not null default false,
  dns_checked_at timestamptz,
  dns_result jsonb,
  changed_by uuid references auth.users (id) on delete restrict,
  changed_at timestamptz not null default now()
);

insert into public.outreach_sender (id) values (true) on conflict (id) do nothing;

comment on table public.outreach_sender is
  'Engine part C: the one sender switch. hold sends nothing (the default), test reaches only addresses at test_domain, live needs a passing SPF, DKIM and DMARC check from the last 7 days. Service role only.';

create or replace function public.outreach_sender_goes_live_checked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $live$
begin
  if new.mode = 'live' and not (new.dns_ok and new.dns_checked_at > now() - interval '7 days') then
    raise exception 'refused: live sending needs a passing SPF, DKIM and DMARC check from the last 7 days.' using errcode = '23514';
  end if;
  if new.mode <> old.mode and new.changed_by is null then
    raise exception 'refused: the sender mode is changed by a named person.' using errcode = '23514';
  end if;
  new.changed_at := now();
  return new;
end;
$live$;

drop trigger if exists trg_outreach_sender_goes_live_checked on public.outreach_sender;
create trigger trg_outreach_sender_goes_live_checked
  before update on public.outreach_sender
  for each row execute function public.outreach_sender_goes_live_checked();

-- ---------------------------------------------------------------------------
-- 3. THE PLAY.
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_plays (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 3 and 120),
  -- Who it goes to, as a rule the planner reads (cities, kinds, recurring only, contact channel), kept as approved.
  cohort_rule jsonb not null,
  step1_template_id uuid not null references public.outreach_templates (id) on delete restrict,
  step2_template_id uuid references public.outreach_templates (id) on delete restrict,
  step3_template_id uuid references public.outreach_templates (id) on delete restrict,
  cap_start integer not null default 20 check (cap_start between 1 and 200),
  cap_step integer not null default 10 check (cap_step between 0 and 100),
  cap_max integer not null default 200 check (cap_max between 1 and 2000),
  state text not null default 'draft' check (state in ('draft', 'approved', 'paused', 'ended')),
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  paused_at timestamptz,
  paused_reason text check (paused_reason is null or length(btrim(paused_reason)) between 3 and 1000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint outreach_plays_approved_by_a_person check ((state = 'draft') = (approved_by is null and approved_at is null)),
  constraint outreach_plays_paused_says_why check ((state = 'paused') = (paused_reason is not null and paused_at is not null)),
  constraint outreach_plays_cap_grows check (cap_max >= cap_start)
);

comment on table public.outreach_plays is
  'Engine part C: a play Lawal approves once (cohort, template versions, daily cap from 20). Everything inside an approved play runs on its own; its terms never change after approval. Paused with the reason, automatically on bounces or complaints. Service role only.';

create or replace function public.outreach_play_terms_hold()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $terms$
declare
  t record;
begin
  -- Each step's template is the step's own: an email cadence template for that step.
  for t in
    select s.n, tp.purpose, tp.step, tp.channel
      from (values (1, new.step1_template_id), (2, new.step2_template_id), (3, new.step3_template_id)) s (n, id)
      join public.outreach_templates tp on tp.id = s.id
  loop
    if t.purpose <> 'cadence' or t.step <> t.n or t.channel <> 'email' then
      raise exception 'refused: step % of a play takes an email cadence template for step %.', t.n, t.n using errcode = '23514';
    end if;
  end loop;
  if new.step3_template_id is not null and new.step2_template_id is null then
    raise exception 'refused: a play has a step 2 before a step 3.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.state <> 'draft' and (
       new.cohort_rule is distinct from old.cohort_rule or new.step1_template_id is distinct from old.step1_template_id
       or new.step2_template_id is distinct from old.step2_template_id or new.step3_template_id is distinct from old.step3_template_id
       or new.cap_start <> old.cap_start or new.cap_step <> old.cap_step or new.cap_max <> old.cap_max
       or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) then
    raise exception 'refused: an approved play keeps the terms Lawal approved; draft a new play instead.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.state = 'ended' and new.state <> 'ended' then
    raise exception 'refused: an ended play stays ended.' using errcode = '42501';
  end if;
  return new;
end;
$terms$;

drop trigger if exists trg_outreach_play_terms_hold on public.outreach_plays;
create trigger trg_outreach_play_terms_hold
  before insert or update on public.outreach_plays
  for each row execute function public.outreach_play_terms_hold();

-- ---------------------------------------------------------------------------
-- 4. THE MESSAGE GAINS ITS PURPOSE, TEMPLATE, PLAY, QUEUE AND THREAD.
-- ---------------------------------------------------------------------------
alter table public.outreach_touches add column if not exists purpose text not null default 'cadence';
alter table public.outreach_touches add column if not exists template_id uuid references public.outreach_templates (id) on delete restrict;
alter table public.outreach_touches add column if not exists play_id uuid references public.outreach_plays (id) on delete restrict;
alter table public.outreach_touches add column if not exists held_because text[] not null default '{}';
alter table public.outreach_touches add column if not exists scheduled_for timestamptz;
alter table public.outreach_touches add column if not exists provider text;
alter table public.outreach_touches add column if not exists internet_message_id text;
alter table public.outreach_touches add column if not exists in_reply_to text;
alter table public.outreach_touches add column if not exists failed_reason text;
alter table public.outreach_touches alter column step drop not null;

alter table public.outreach_touches drop constraint if exists outreach_touches_state_check;
alter table public.outreach_touches drop constraint if exists outreach_touches_sent_is_whole;
alter table public.outreach_touches add constraint outreach_touches_state_check
  check (state in ('held', 'queued', 'sent', 'failed', 'void'));
alter table public.outreach_touches add constraint outreach_touches_purpose_check
  check (purpose in ('cadence', 'relationship', 'reply'));
alter table public.outreach_touches add constraint outreach_touches_step_is_cadence
  check ((purpose = 'cadence') = (step is not null));
alter table public.outreach_touches add constraint outreach_touches_provider_check
  check (provider is null or provider in ('graph', 'by_hand'));
alter table public.outreach_touches add constraint outreach_touches_queued_is_scheduled
  check (state <> 'queued' or (scheduled_for is not null and provider = 'graph'));
alter table public.outreach_touches add constraint outreach_touches_failed_says_why
  check ((state = 'failed') = (failed_reason is not null));
alter table public.outreach_touches add constraint outreach_touches_sent_is_whole check (
  (state = 'sent') = (
    sent_at is not null and basis_at_send is not null and provider is not null
    and (sent_by is not null or (provider = 'graph' and internet_message_id is not null))
  )
);

create unique index if not exists outreach_touches_one_message_id on public.outreach_touches (internet_message_id) where internet_message_id is not null;
create index if not exists outreach_touches_queue on public.outreach_touches (scheduled_for) where state = 'queued';
create index if not exists outreach_touches_by_play on public.outreach_touches (play_id, sent_at) where play_id is not null;

-- ---------------------------------------------------------------------------
-- 5. DELIVERY EVENTS, THE CAP AND THE PAUSE.
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_delivery_events (
  id uuid primary key default gen_random_uuid(),
  touch_id uuid not null references public.outreach_touches (id) on delete restrict,
  kind text not null check (kind in ('bounce_hard', 'bounce_soft', 'complaint')),
  occurred_at timestamptz not null,
  detail text check (detail is null or length(detail) <= 2000),
  source text not null check (source in ('graph_inbox', 'postmaster', 'lawal')),
  source_message_id text unique,
  logged_at timestamptz not null default now()
);

create index if not exists outreach_delivery_events_by_touch on public.outreach_delivery_events (touch_id);

comment on table public.outreach_delivery_events is
  'Engine part C: a bounce or complaint against one sent message. A hard bounce stops that address; a play above 2 percent hard bounces or 0.1 percent complaints of its sends pauses at once. Append only. Service role only.';

drop trigger if exists trg_outreach_delivery_events_append_only on public.outreach_delivery_events;
create trigger trg_outreach_delivery_events_append_only
  before update or delete or truncate on public.outreach_delivery_events
  for each statement execute function public.refuse_ledger_mutation();

-- The play's sends, hard bounces and complaints so far.
create or replace function public.outreach_play_health(p_play uuid)
returns table (sends bigint, hard_bounces bigint, complaints bigint, healthy boolean, over text)
language sql
stable
security definer
set search_path = public, pg_temp
as $health$
  with s as (
    select count(*) as sends from public.outreach_touches where play_id = p_play and state = 'sent'
  ), e as (
    select count(*) filter (where d.kind = 'bounce_hard') as hard_bounces, count(*) filter (where d.kind = 'complaint') as complaints
      from public.outreach_delivery_events d join public.outreach_touches t on t.id = d.touch_id
     where t.play_id = p_play
  )
  select s.sends, e.hard_bounces, e.complaints,
         s.sends = 0 or (e.hard_bounces * 100 < s.sends * 2 and e.complaints * 1000 < s.sends * 1),
         case
           when s.sends > 0 and e.hard_bounces * 100 > s.sends * 2
             then format('hard bounces %s of %s sends, over 2 percent', e.hard_bounces, s.sends)
           when s.sends > 0 and e.complaints * 1000 > s.sends * 1
             then format('complaints %s of %s sends, over 0.1 percent', e.complaints, s.sends)
         end
    from s, e
$health$;

-- Today's cap (Melbourne day): the start, plus a step for every earlier day the play sent, but no step today unless
-- the play is healthy.
create or replace function public.outreach_play_cap_today(p_play uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $cap$
declare
  p public.outreach_plays;
  v_days integer;
  v_healthy boolean;
begin
  select * into p from public.outreach_plays where id = p_play;
  if p.id is null then
    return 0;
  end if;
  select count(distinct (sent_at at time zone 'Australia/Melbourne')::date) into v_days
    from public.outreach_touches
   where play_id = p_play and state = 'sent'
     and (sent_at at time zone 'Australia/Melbourne')::date < (now() at time zone 'Australia/Melbourne')::date;
  select healthy into v_healthy from public.outreach_play_health(p_play);
  if not v_healthy then
    v_days := greatest(v_days - 1, 0);
  end if;
  return least(p.cap_max, p.cap_start + p.cap_step * v_days);
end;
$cap$;

create or replace function public.outreach_delivery_event_pauses()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $pause$
declare
  v_play uuid;
  v_over text;
begin
  select play_id into v_play from public.outreach_touches where id = new.touch_id;
  if v_play is null then
    return new;
  end if;
  select over into v_over from public.outreach_play_health(v_play);
  if v_over is not null then
    update public.outreach_plays
       set state = 'paused', paused_at = now(), paused_reason = format('Paused automatically: %s.', v_over)
     where id = v_play and state = 'approved';
    update public.outreach_touches
       set state = 'void', void_reason = format('the play paused: %s', v_over)
     where play_id = v_play and state = 'queued';
  end if;
  return new;
end;
$pause$;

drop trigger if exists trg_outreach_delivery_event_pauses on public.outreach_delivery_events;
create trigger trg_outreach_delivery_event_pauses
  after insert on public.outreach_delivery_events
  for each row execute function public.outreach_delivery_event_pauses();

-- ---------------------------------------------------------------------------
-- 6. THE REPLY IS CLASSIFIED; ITS WORDS STAY AS RECEIVED.
-- ---------------------------------------------------------------------------
alter table public.outreach_replies add column if not exists classified_by text not null default 'lawal';
alter table public.outreach_replies add column if not exists confidence numeric(3, 2);
alter table public.outreach_replies add column if not exists needs_lawal boolean not null default false;
alter table public.outreach_replies add column if not exists action_taken text;
alter table public.outreach_replies add column if not exists source_message_id text;
alter table public.outreach_replies drop constraint if exists outreach_replies_outcome_check;
alter table public.outreach_replies add constraint outreach_replies_outcome_check
  check (outcome in ('yes', 'interested', 'question', 'later', 'no', 'stop', 'take_down', 'referred', 'bounce', 'unclear'));
alter table public.outreach_replies add constraint outreach_replies_classified_by_check
  check (classified_by in ('rules', 'lawal'));
alter table public.outreach_replies add constraint outreach_replies_confidence_check
  check (confidence is null or confidence between 0 and 1);
alter table public.outreach_replies add constraint outreach_replies_rules_say_how_sure
  check (classified_by <> 'rules' or confidence is not null);
create unique index if not exists outreach_replies_one_per_message on public.outreach_replies (source_message_id) where source_message_id is not null;

drop trigger if exists trg_outreach_replies_no_update on public.outreach_replies;
drop trigger if exists trg_outreach_replies_no_delete on public.outreach_replies;
create trigger trg_outreach_replies_no_delete
  before delete or truncate on public.outreach_replies
  for each statement execute function public.refuse_ledger_mutation();

create or replace function public.outreach_reply_words_stay()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $words$
begin
  if new.contact_id <> old.contact_id or new.touch_id is distinct from old.touch_id or new.received_at <> old.received_at
     or new.wording <> old.wording or new.source_message_id is distinct from old.source_message_id
     or new.logged_by <> old.logged_by or new.logged_at <> old.logged_at then
    raise exception 'refused: a reply is kept as received; only its classification may be corrected.' using errcode = '42501';
  end if;
  return new;
end;
$words$;

drop trigger if exists trg_outreach_reply_words_stay on public.outreach_replies;
create trigger trg_outreach_reply_words_stay
  before update on public.outreach_replies
  for each row execute function public.outreach_reply_words_stay();

-- ---------------------------------------------------------------------------
-- 7. WHO MAY BE WRITTEN TO, FOR WHICH PURPOSE.
-- ---------------------------------------------------------------------------
create or replace function public.outreach_contact_refusal_for(p_contact uuid, p_purpose text, p_template_key text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $why$
declare
  c public.organiser_contacts;
  v_when timestamptz;
  v_reply public.outreach_replies;
  v_said_no public.outreach_replies;
begin
  select * into c from public.organiser_contacts where id = p_contact;
  if c.id is null then
    return 'no such contact';
  end if;
  select min(u.created_at) into v_when
    from public.outreach_unsubscribes u
   where (c.channel = 'email' and u.email = c.address)
      or (c.hubspot_contact_id is not null and u.hubspot_contact_id = c.hubspot_contact_id);
  -- The one message that may reach a stopped address: the single confirmation that the stop or the take down is done.
  if v_when is not null and not (p_purpose = 'reply' and p_template_key in ('reply_stop', 'reply_take_down')
       and not exists (select 1 from public.outreach_touches t join public.outreach_templates tp on tp.id = t.template_id
                        where t.contact_id = p_contact and tp.key = p_template_key and t.state in ('queued', 'sent'))) then
    return format('%s asked to stop on %s', c.address, to_char(v_when at time zone 'Australia/Melbourne', 'DD Mon YYYY'));
  end if;
  select min(d.occurred_at) into v_when
    from public.outreach_delivery_events d join public.outreach_touches t on t.id = d.touch_id
   where t.contact_id = p_contact and d.kind = 'bounce_hard';
  if v_when is not null then
    return format('%s bounced on %s', c.address, to_char(v_when at time zone 'Australia/Melbourne', 'DD Mon YYYY'));
  end if;
  select r.* into v_reply from public.outreach_replies r where r.contact_id = p_contact order by r.received_at desc limit 1;
  select r.* into v_said_no
    from public.outreach_replies r join public.organiser_contacts o on o.id = r.contact_id
   where o.organiser_id = c.organiser_id and r.outcome = 'no'
   order by r.received_at desc limit 1;

  if p_purpose = 'cadence' then
    if c.basis = 'none' then
      return format('no lawful basis is recorded for %s', c.address);
    end if;
    if v_said_no.id is not null then
      return format('the organiser said no on %s', to_char(v_said_no.received_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'));
    end if;
    if v_reply.id is not null then
      return format('%s replied on %s (%s); the cadence has stopped', c.address,
                    to_char(v_reply.received_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'), v_reply.outcome);
    end if;
  elsif p_purpose = 'relationship' then
    if v_said_no.id is not null then
      return format('the organiser said no on %s', to_char(v_said_no.received_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'));
    end if;
    if c.basis <> 'express_consent'
       and not exists (select 1 from public.outreach_replies r where r.contact_id = p_contact and r.outcome in ('yes', 'interested')) then
      return format('%s has not said yes; partner messages go only after their yes', c.address);
    end if;
  elsif p_purpose = 'reply' then
    if v_reply.id is null then
      return format('%s has not written to us; an answer needs something to answer', c.address);
    end if;
  else
    return format('no purpose %s', p_purpose);
  end if;
  return null;
end;
$why$;

-- 201001's one-argument form keeps its meaning: may the cold cadence write to this contact.
create or replace function public.outreach_contact_refusal(p_contact uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $cad$
  select public.outreach_contact_refusal_for(p_contact, 'cadence', null)
$cad$;

-- ---------------------------------------------------------------------------
-- 8. THE MESSAGE IS LAWFUL, OR IT DOES NOT QUEUE AND DOES NOT SEND.
-- ---------------------------------------------------------------------------
create or replace function public.outreach_touch_is_lawful()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $lawful$
declare
  c public.organiser_contacts;
  tp public.outreach_templates;
  pl public.outreach_plays;
  snd public.outreach_sender;
  v_why text;
  v_first timestamptz;
  v_prev public.outreach_touches;
  v_other text;
  v_days int;
  v_due int;
  v_sent_today int;
begin
  if new.step > 3 then
    raise exception 'refused: the cadence stops after step 3 (day 10); there is no fourth message.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.state in ('sent', 'void') then
      raise exception 'refused: a % message is the record and is never changed.', old.state using errcode = '42501';
    end if;
    if old.state = 'failed' and new.state not in ('failed', 'queued', 'void') then
      raise exception 'refused: a failed message is queued again or voided.' using errcode = '42501';
    end if;
    if new.contact_id <> old.contact_id or new.step is distinct from old.step or new.purpose <> old.purpose
       or new.template_id is distinct from old.template_id or new.play_id is distinct from old.play_id then
      raise exception 'refused: a message keeps its contact, step, purpose, template and play.' using errcode = '42501';
    end if;
  elsif new.state not in ('held', 'queued', 'sent') then
    raise exception 'refused: a message is drafted held, queued by a play, or logged sent.' using errcode = '23514';
  end if;

  if new.state in ('void', 'failed') then
    return new;
  end if;

  select * into c from public.organiser_contacts where id = new.contact_id for share;
  if new.template_id is not null then
    select * into tp from public.outreach_templates where id = new.template_id;
    if tp.purpose <> new.purpose or tp.step is distinct from new.step
       or (tp.channel = 'email') <> (c.channel = 'email') then
      raise exception 'refused: template %, version %, is not a % message for this step and channel.', tp.key, tp.version, new.purpose
        using errcode = '23514';
    end if;
  end if;

  v_why := public.outreach_contact_refusal_for(new.contact_id, new.purpose, tp.key);
  if v_why is not null then
    raise exception 'refused: %.', v_why using errcode = '23514';
  end if;

  if new.purpose = 'cadence' then
    -- One live cadence per organiser: another contact written to in the last 30 days who has not replied.
    select o.address into v_other
      from public.outreach_touches t
      join public.organiser_contacts o on o.id = t.contact_id
     where o.organiser_id = c.organiser_id and o.id <> c.id and t.purpose = 'cadence'
       and (t.state in ('held', 'queued') or (t.state = 'sent' and t.sent_at > now() - interval '30 days'))
       and not exists (select 1 from public.outreach_replies r where r.contact_id = o.id)
     limit 1;
    if v_other is not null then
      raise exception 'refused: this organiser is already being contacted through %.', v_other using errcode = '23514';
    end if;
    if new.step > 1 then
      select * into v_prev from public.outreach_touches
       where contact_id = new.contact_id and step = new.step - 1 and state <> 'void' and id <> new.id;
      if v_prev.id is null then
        raise exception 'refused: step % comes after step %.', new.step, new.step - 1 using errcode = '23514';
      end if;
    end if;
  end if;

  if new.state in ('queued', 'sent') then
    -- The rules of the messages file: a draft that failed any is held, never sent.
    if cardinality(new.held_because) > 0 then
      raise exception 'refused: held because %.', array_to_string(new.held_because, '; ') using errcode = '23514';
    end if;
    if new.body !~ '^Hi [^,[:cntrl:]]{1,80},' then
      raise exception 'refused: every message opens Hi and a first name, or Hi and the venue team, then a comma.' using errcode = '23514';
    end if;
    if new.body ~ '[\u2013\u2014]' or (new.subject is not null and new.subject ~ '[\u2013\u2014]') then
      raise exception 'refused: no em or en dashes.' using errcode = '23514';
    end if;
    if position('!' in new.body) > 0 or (new.subject is not null and position('!' in new.subject) > 0) then
      raise exception 'refused: no exclamation marks.' using errcode = '23514';
    end if;
    if position('EventLinqs' in new.body) = 0 then
      raise exception 'refused: the message must name EventLinqs as its sender.' using errcode = '23514';
    end if;
    if c.channel = 'email' then
      if new.subject is null then
        raise exception 'refused: an email needs a subject.' using errcode = '23514';
      end if;
      if position('https://www.eventlinqs.com.au/unsubscribe/outreach' in new.body) = 0 then
        raise exception 'refused: an email must carry the unsubscribe link https://www.eventlinqs.com.au/unsubscribe/outreach.' using errcode = '23514';
      end if;
    elsif position('https://www.eventlinqs.com.au/unsubscribe/outreach' in new.body) = 0 and new.body !~* 'reply[[:space:]]+stop' then
      raise exception 'refused: a message by hand must carry the unsubscribe link or a reply STOP line.' using errcode = '23514';
    end if;
  end if;

  if new.state = 'queued' or (new.state = 'sent' and new.provider = 'graph') then
    -- Automatic sending: email only, inside an approved play or as a reply to what they wrote, through the sender.
    if c.channel <> 'email' then
      raise exception 'refused: only email is sent automatically; messages by hand are sent by Lawal.' using errcode = '23514';
    end if;
    if new.purpose = 'cadence' then
      select * into pl from public.outreach_plays where id = new.play_id;
      if pl.id is null or pl.state <> 'approved' then
        raise exception 'refused: a cadence message is sent automatically only inside an approved play.' using errcode = '23514';
      end if;
      if new.template_id is distinct from (case new.step when 1 then pl.step1_template_id when 2 then pl.step2_template_id else pl.step3_template_id end) then
        raise exception 'refused: the message is not from the template version the play approved.' using errcode = '23514';
      end if;
    elsif new.template_id is null then
      raise exception 'refused: an automatic message comes from a stored template.' using errcode = '23514';
    end if;
    select * into snd from public.outreach_sender where id;
    if new.state = 'sent' then
      if snd.mode = 'hold' then
        raise exception 'refused: the sender is on hold; nothing leaves.' using errcode = '23514';
      end if;
      if snd.mode = 'test' and c.address !~ ('@' || replace(snd.test_domain, '.', '\.') || '$') then
        raise exception 'refused: the sender is in test mode and % is not at %.', c.address, snd.test_domain using errcode = '23514';
      end if;
      if snd.mode = 'live' and not (snd.dns_ok and snd.dns_checked_at > now() - interval '7 days') then
        raise exception 'refused: the SPF, DKIM and DMARC check is not passing or is older than 7 days.' using errcode = '23514';
      end if;
      if pl.id is not null then
        perform 1 from public.outreach_plays where id = pl.id for update;
        select count(*) into v_sent_today from public.outreach_touches
         where play_id = pl.id and state = 'sent' and id <> new.id
           and (sent_at at time zone 'Australia/Melbourne')::date = (now() at time zone 'Australia/Melbourne')::date;
        if v_sent_today >= public.outreach_play_cap_today(pl.id) then
          raise exception 'refused: the play has sent its % for today.', public.outreach_play_cap_today(pl.id) using errcode = '23514';
        end if;
      end if;
    end if;
  end if;

  if new.state = 'sent' then
    if new.sent_at is null then
      raise exception 'refused: a sent message records when.' using errcode = '23514';
    end if;
    if new.provider = 'by_hand' and new.sent_by is null then
      raise exception 'refused: a message sent by hand records who sent it.' using errcode = '23514';
    end if;
    if new.sent_at > now() + interval '5 minutes' then
      raise exception 'refused: a message cannot be sent in the future.' using errcode = '23514';
    end if;
    if new.purpose = 'cadence' and c.seen_on is not null and (new.sent_at at time zone 'Australia/Melbourne')::date < c.seen_on then
      raise exception 'refused: sent before the basis was seen on %.', c.seen_on using errcode = '23514';
    end if;
    if new.purpose = 'cadence' and new.step > 1 then
      if v_prev.state <> 'sent' then
        raise exception 'refused: step % is sent only after step % is sent.', new.step, new.step - 1 using errcode = '23514';
      end if;
      select sent_at into v_first from public.outreach_touches where contact_id = new.contact_id and step = 1 and state = 'sent';
      v_days := (new.sent_at at time zone 'Australia/Melbourne')::date - (v_first at time zone 'Australia/Melbourne')::date;
      v_due := case new.step when 2 then 4 else 10 end;
      if v_days < v_due then
        raise exception 'refused: step % is due from day %, this is day %.', new.step, v_due, v_days using errcode = '23514';
      end if;
    end if;
    -- Section 16(5): what we relied on, kept with the message.
    new.basis_at_send := jsonb_build_object(
      'purpose', new.purpose, 'basis', c.basis, 'address', c.address, 'role', c.role, 'published_on_url', c.published_on_url,
      'seen_on', c.seen_on, 'no_marketing_statement_checked', c.no_marketing_statement_checked, 'relevance', c.relevance,
      'consent_wording', c.consent_wording, 'evidence_file', c.evidence_file, 'basis_recorded_at', c.basis_recorded_at,
      'yes_reply', (select r.id from public.outreach_replies r where r.contact_id = c.id and r.outcome in ('yes', 'interested')
                     order by r.received_at desc limit 1),
      'template', tp.key, 'template_version', tp.version, 'play', new.play_id);
  end if;
  return new;
end;
$lawful$;

-- A reply stops the cold cadence (queued or held); a stop joins the suppression list; a no stops the organiser.
create or replace function public.outreach_reply_stops()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $reply$
declare
  c public.organiser_contacts;
begin
  if tg_op = 'UPDATE' and new.outcome = old.outcome then
    return new;
  end if;
  select * into c from public.organiser_contacts where id = new.contact_id;
  update public.outreach_touches
     set state = 'void', void_reason = format('they replied on %s (%s)', to_char(new.received_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'), new.outcome)
   where state in ('held', 'queued')
     and (purpose = 'cadence' or new.outcome in ('no', 'stop', 'take_down'))
     and contact_id in (select id from public.organiser_contacts
                         where id = new.contact_id or (new.outcome = 'no' and organiser_id = c.organiser_id));
  if new.outcome in ('stop', 'take_down') and (c.channel = 'email' or c.hubspot_contact_id is not null)
     and not exists (select 1 from public.outreach_unsubscribes u
                      where u.comment = format('Replied asking to stop (outreach_replies %s).', new.id)) then
    insert into public.outreach_unsubscribes (hubspot_contact_id, email, reason, comment)
    values (c.hubspot_contact_id, case when c.channel = 'email' then c.address end, null,
            format('Replied asking to stop (outreach_replies %s).', new.id));
  end if;
  return new;
end;
$reply$;

drop trigger if exists trg_outreach_reply_stops on public.outreach_replies;
create trigger trg_outreach_reply_stops
  after insert or update of outcome on public.outreach_replies
  for each row execute function public.outreach_reply_stops();

-- An unsubscribe voids everything held or queued for that address, the stop and take down confirmations aside.
create or replace function public.outreach_unsubscribe_voids_drafts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $unsub$
begin
  update public.outreach_touches t
     set state = 'void', void_reason = format('unsubscribed on %s', to_char(new.created_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'))
    from public.organiser_contacts c
   where c.id = t.contact_id and t.state in ('held', 'queued')
     and not exists (select 1 from public.outreach_templates tp where tp.id = t.template_id and tp.key in ('reply_stop', 'reply_take_down'))
     and ((c.channel = 'email' and c.address = new.email)
          or (c.hubspot_contact_id is not null and c.hubspot_contact_id = new.hubspot_contact_id));
  return new;
end;
$unsub$;

-- ---------------------------------------------------------------------------
-- 9. PRIVATE.
-- ---------------------------------------------------------------------------
alter table public.outreach_templates enable row level security;
alter table public.outreach_sender enable row level security;
alter table public.outreach_plays enable row level security;
alter table public.outreach_delivery_events enable row level security;

revoke all on public.outreach_templates from anon, authenticated, service_role;
revoke all on public.outreach_sender from anon, authenticated, service_role;
revoke all on public.outreach_plays from anon, authenticated, service_role;
revoke all on public.outreach_delivery_events from anon, authenticated, service_role;

grant select, insert on public.outreach_templates to service_role;
grant select, update on public.outreach_sender to service_role;
grant select, insert, update on public.outreach_plays to service_role;
grant select, insert on public.outreach_delivery_events to service_role;

revoke all on function public.outreach_sender_goes_live_checked() from public, anon, authenticated;
revoke all on function public.outreach_play_terms_hold() from public, anon, authenticated;
revoke all on function public.outreach_play_health(uuid) from public, anon, authenticated;
revoke all on function public.outreach_play_cap_today(uuid) from public, anon, authenticated;
revoke all on function public.outreach_delivery_event_pauses() from public, anon, authenticated;
revoke all on function public.outreach_reply_words_stay() from public, anon, authenticated;
revoke all on function public.outreach_contact_refusal_for(uuid, text, text) from public, anon, authenticated;
grant execute on function public.outreach_play_health(uuid) to service_role;
grant execute on function public.outreach_play_cap_today(uuid) to service_role;
grant execute on function public.outreach_contact_refusal_for(uuid, text, text) to service_role;

commit;
