-- THE LEARNING LOOP (window 6, 29 October 2026; the engine plan's FULL AUTOMATION: "each play tests one change at a time
-- (subject, true line, question) against the current template on equal random halves; a variant replaces the template
-- only on a measured rise in claims (not opens), recorded with the numbers"). The rule itself, with its NIST sources, is
-- src/lib/outreach/learning.ts; this is the part the database holds.
--
-- 1. A play may carry ONE variant of its step 1 template, the one thing it changes, and the size of each half. Lawal
--    approves them with the play, once; like every other term they are fixed after approval (outreach_play_terms_hold).
-- 2. A first message records the half it was drafted for (a: the current template, b: the variant); a message outside
--    the test carries no half. The database lets a step 1 message carry the variant only for that play.
-- 3. outreach_play_judgements: the one judgement of a play's test, with its figures, written once, never changed.
--
-- Additive: nullable columns, re-created functions and trigger (every existing rule kept as it was, one condition widened
-- for the variant), one new table granted here (the 21 October grant rule).

alter table public.outreach_plays
  add column if not exists variant_template_id uuid references public.outreach_templates (id) on delete restrict,
  add column if not exists variant_change text check (variant_change is null or variant_change in ('subject', 'true_line', 'question')),
  add column if not exists test_per_half integer check (test_per_half is null or test_per_half > 30);

alter table public.outreach_plays drop constraint if exists outreach_plays_variant_whole;
alter table public.outreach_plays add constraint outreach_plays_variant_whole check (
  (variant_template_id is null) = (variant_change is null) and (variant_template_id is null) = (test_per_half is null)
  and (variant_template_id is null or variant_template_id <> step1_template_id)
);

alter table public.outreach_touches
  add column if not exists half text check (half is null or half in ('a', 'b'));

alter table public.outreach_touches drop constraint if exists outreach_touches_half_is_a_first_message;
alter table public.outreach_touches add constraint outreach_touches_half_is_a_first_message check (
  half is null or (play_id is not null and step = 1)
);

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
      from (values (1, new.step1_template_id), (2, new.step2_template_id), (3, new.step3_template_id), (1, new.variant_template_id)) s (n, id)
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
       or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
       or new.variant_template_id is distinct from old.variant_template_id or new.variant_change is distinct from old.variant_change
       or new.test_per_half is distinct from old.test_per_half) then
    raise exception 'refused: an approved play keeps the terms Lawal approved; draft a new play instead.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.state = 'ended' and new.state <> 'ended' then
    raise exception 'refused: an ended play stays ended.' using errcode = '42501';
  end if;
  return new;
end;
$terms$;

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
  v_at timestamptz;
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
    if old.state = 'sending' then
      if new.state not in ('sent', 'failed') then
        raise exception 'refused: a message being sent ends sent or failed.' using errcode = '42501';
      end if;
      if new.body <> old.body or new.subject is distinct from old.subject or new.basis_at_send is distinct from old.basis_at_send
         or new.sending_at is distinct from old.sending_at then
        raise exception 'refused: a message being sent keeps the words and the basis it was checked with.' using errcode = '42501';
      end if;
      if new.state = 'sent' and (new.sent_at is null or new.internet_message_id is null) then
        raise exception 'refused: a sent message records when and its message id.' using errcode = '23514';
      end if;
      -- Every check ran when it was taken for sending; it now ends as the transport reported.
      return new;
    end if;
    if new.state = 'sending' and old.state <> 'queued' then
      raise exception 'refused: only a queued message is taken for sending.' using errcode = '42501';
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
       and (t.state in ('held', 'queued', 'sending') or (t.state = 'sent' and t.sent_at > now() - interval '30 days'))
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

  if new.state in ('queued', 'sending', 'sent') then
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

  if new.state in ('queued', 'sending') or (new.state = 'sent' and new.provider = 'graph') then
    -- Automatic sending: email only, inside an approved play or as a reply to what they wrote, through the sender.
    if c.channel <> 'email' then
      raise exception 'refused: only email is sent automatically; messages by hand are sent by Lawal.' using errcode = '23514';
    end if;
    if new.purpose = 'cadence' then
      select * into pl from public.outreach_plays where id = new.play_id;
      if pl.id is null or pl.state <> 'approved' then
        raise exception 'refused: a cadence message is sent automatically only inside an approved play.' using errcode = '23514';
      end if;
      if new.template_id is distinct from (case new.step when 1 then pl.step1_template_id when 2 then pl.step2_template_id else pl.step3_template_id end)
         and not (new.step = 1 and pl.variant_template_id is not null and new.template_id = pl.variant_template_id) then
        raise exception 'refused: the message is not from the template version the play approved.' using errcode = '23514';
      end if;
    elsif new.template_id is null then
      raise exception 'refused: an automatic message comes from a stored template.' using errcode = '23514';
    end if;
    select * into snd from public.outreach_sender where id;
    if new.state in ('sending', 'sent') then
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
         where play_id = pl.id and state in ('sent', 'sending') and id <> new.id
           and (coalesce(sent_at, sending_at) at time zone 'Australia/Melbourne')::date = (now() at time zone 'Australia/Melbourne')::date;
        if v_sent_today >= public.outreach_play_cap_today(pl.id) then
          raise exception 'refused: the play has sent its % for today.', public.outreach_play_cap_today(pl.id) using errcode = '23514';
        end if;
      end if;
    end if;
  end if;

  if new.state in ('sending', 'sent') then
    v_at := coalesce(new.sent_at, now());
    if new.state = 'sending' then
      new.sending_at := now();
    end if;
    if new.state = 'sent' and new.sent_at is null then
      raise exception 'refused: a sent message records when.' using errcode = '23514';
    end if;
    if new.provider = 'by_hand' and new.sent_by is null then
      raise exception 'refused: a message sent by hand records who sent it.' using errcode = '23514';
    end if;
    if new.sent_at > now() + interval '5 minutes' then
      raise exception 'refused: a message cannot be sent in the future.' using errcode = '23514';
    end if;
    if new.purpose = 'cadence' and c.seen_on is not null and (v_at at time zone 'Australia/Melbourne')::date < c.seen_on then
      raise exception 'refused: sent before the basis was seen on %.', c.seen_on using errcode = '23514';
    end if;
    if new.purpose = 'cadence' and new.step > 1 then
      if v_prev.state <> 'sent' then
        raise exception 'refused: step % is sent only after step % is sent.', new.step, new.step - 1 using errcode = '23514';
      end if;
      select sent_at into v_first from public.outreach_touches where contact_id = new.contact_id and step = 1 and state = 'sent';
      v_days := (v_at at time zone 'Australia/Melbourne')::date - (v_first at time zone 'Australia/Melbourne')::date;
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

-- The lawfulness trigger names its columns (20261029180001), now with half: every column but night_report_id.
drop trigger if exists trg_outreach_touch_is_lawful on public.outreach_touches;
create trigger trg_outreach_touch_is_lawful
  before insert or update of
    basis_at_send, body, contact_id, drafted_at, drafted_by, failed_reason, half, held_because, id, in_reply_to,
    internet_message_id, play_id, provider, purpose, scheduled_for, sending_at, sent_at, sent_by, state, step, subject,
    template_id, tracked_link, void_reason
  on public.outreach_touches
  for each row execute function public.outreach_touch_is_lawful();

create table if not exists public.outreach_play_judgements (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null unique references public.outreach_plays (id) on delete restrict,
  sent_a integer not null check (sent_a >= 0),
  claims_a integer not null check (claims_a >= 0 and claims_a <= sent_a),
  sent_b integer not null check (sent_b >= 0),
  claims_b integer not null check (claims_b >= 0 and claims_b <= sent_b),
  z numeric,
  outcome text not null check (outcome in ('variant_wins', 'keep', 'not_enough')),
  why text not null check (length(btrim(why)) between 1 and 500),
  alpha numeric not null,
  critical numeric not null,
  judged_at timestamptz not null default now(),
  constraint outreach_play_judgements_z_when_judged check ((outcome = 'not_enough') = (z is null))
);

alter table public.outreach_play_judgements enable row level security;
revoke all on public.outreach_play_judgements from anon, authenticated, service_role;
grant select, insert on public.outreach_play_judgements to service_role;

drop trigger if exists trg_outreach_play_judgements_kept on public.outreach_play_judgements;
create trigger trg_outreach_play_judgements_kept
  before update or delete or truncate on public.outreach_play_judgements
  for each statement execute function public.refuse_ledger_mutation();

comment on table public.outreach_play_judgements is
  'Engine part C, the learning loop: the one judgement of a play''s test (variant against current on equal halves, on claims), with its figures. Written once, never changed. Service role only.';
