-- ============================================================================
-- A MESSAGE IS TAKEN FOR SENDING BEFORE IT LEAVES (window 6, 28 October 2026; follows 20261028221001).
--
-- THE GAP IN 213001, found while writing the sender: the database judged a message when it was marked SENT, and a sent
-- row never changes. The sender would therefore either send through Graph first and risk the database then refusing
-- (the day's cap reached by a parallel run, a stop arriving in between), or mark it sent first and be unable to record
-- that Graph refused it. Neither is acceptable for mail that cannot be called back.
--
-- So a queued message becomes SENDING first. That transition runs every check 213001 ran at sent (the sender's mode,
-- the play's cap, which now counts what is being sent as well as what was sent, the cadence day, the basis, every
-- message rule) and records the basis relied on and the moment it was taken. Only then does the sender call Graph, and
-- the row ends SENT (with the time and the message id) or FAILED (with what went wrong). A sending row keeps its words
-- and its basis. A row left sending (a crash between the claim and the call) is closed by outreach_close_stuck_sends
-- as failed with the outcome unknown, and is never sent again automatically: Lawal checks Sent Items first.
--
-- One constraint of 213001 is restated: failed needs a reason, but a failed message queued again keeps its last reason
-- (213001 demanded it be cleared, which would erase why the first attempt failed; the proof's retry found it).
--
-- Everything else in outreach_touch_is_lawful is 213001's, unchanged. Reversal: restore 213001's function and state
-- check, drop sending_at and outreach_close_stuck_sends.
-- ============================================================================

begin;

alter table public.outreach_touches add column if not exists sending_at timestamptz;
alter table public.outreach_touches drop constraint if exists outreach_touches_state_check;
alter table public.outreach_touches add constraint outreach_touches_state_check
  check (state in ('held', 'queued', 'sending', 'sent', 'failed', 'void'));
alter table public.outreach_touches add constraint outreach_touches_sending_is_stamped
  check (state <> 'sending' or (sending_at is not null and basis_at_send is not null));
-- A failed message says why; once queued again it keeps the last reason, so a retry does not erase why it failed.
alter table public.outreach_touches drop constraint if exists outreach_touches_failed_says_why;
alter table public.outreach_touches add constraint outreach_touches_failed_says_why
  check (state <> 'failed' or failed_reason is not null);

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
      if new.template_id is distinct from (case new.step when 1 then pl.step1_template_id when 2 then pl.step2_template_id else pl.step3_template_id end) then
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

-- A message left sending for longer than p_minutes is closed as failed with the outcome unknown. It is never queued
-- again by this: whether it left is a question for Sent Items, and a second copy is worse than a late one.
create or replace function public.outreach_close_stuck_sends(p_minutes integer default 15)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $stuck$
declare
  v_n integer;
begin
  update public.outreach_touches
     set state = 'failed',
         failed_reason = format('the send outcome is unknown: taken for sending at %s and never confirmed; check Sent Items before queueing it again',
                                to_char(sending_at at time zone 'Australia/Melbourne', 'DD Mon YYYY HH24:MI'))
   where state = 'sending' and sending_at < now() - make_interval(mins => greatest(p_minutes, 5));
  get diagnostics v_n = row_count;
  return v_n;
end;
$stuck$;

revoke all on function public.outreach_close_stuck_sends(integer) from public, anon, authenticated;
grant execute on function public.outreach_close_stuck_sends(integer) to service_role;

commit;
