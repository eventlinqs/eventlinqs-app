-- ============================================================================
-- A STOP ON ANY CHANNEL ENDS EVERY CHANNEL OF THAT ORGANISER (window 6, 1 November 2026; Growth Engine V3 checklist,
-- item 5: "Unsubscribe and suppression across every campaign").
--
-- FOUND READING item 5 against main and PROVED RED ON TEST (scripts/verify/proofs/stop-ends-every-channel-proof.sql,
-- C:\dev\EVIDENCE\OUTREACH-ITEM5-1NOV\stop-proof-RED-before-migration.json): a STOP sent by Instagram, Facebook or a
-- web form is a reply row, never an outreach_unsubscribes row (that list holds email addresses and HubSpot ids). It
-- stopped only the CADENCE to that one contact. After an Instagram STOP the same organiser's email contact on express
-- consent still took a cadence message (S1) and a partner message (S2), and the stopping contact still took any answer
-- (S4).
--
-- NOW: a stop or a take down from any contact of an organiser, on any channel, refuses every purpose to every contact
-- of that organiser, except the single confirmation to the contact who asked (the same exception 20261028231001 makes
-- for an unsubscribed address). Honouring a stop more widely than asked is never the wrong reading; a reply Lawal
-- re-classifies from stop to something else lifts it, since it is read from the classification.
--
-- One function, every path: outreach_contact_refusal (the cadence), the drafting of every template and the
-- outreach_touch_is_lawful trigger all ask outreach_contact_refusal_for. Everything else in it is 20261028231001's,
-- unchanged. Reversal: restore 20261028231001's function.
-- ============================================================================

begin;

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
  v_stop public.outreach_replies;
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
                        where t.contact_id = p_contact and tp.key = p_template_key and t.state in ('sending', 'sent'))) then
    return format('%s asked to stop on %s', c.address, to_char(v_when at time zone 'Australia/Melbourne', 'DD Mon YYYY'));
  end if;
  -- A stop or a take down sent on ANY channel by ANY contact of this organiser ends every channel of theirs, for
  -- every purpose (V3 item 5, suppression across every campaign). The one message that may still go is the single
  -- confirmation to the contact who asked, as for an unsubscribed address above.
  select r.* into v_stop
    from public.outreach_replies r join public.organiser_contacts o on o.id = r.contact_id
   where o.organiser_id = c.organiser_id and r.outcome in ('stop', 'take_down')
   order by r.received_at asc limit 1;
  if v_stop.id is not null and not (p_contact = v_stop.contact_id and p_purpose = 'reply' and p_template_key in ('reply_stop', 'reply_take_down')
       and not exists (select 1 from public.outreach_touches t join public.outreach_templates tp on tp.id = t.template_id
                        where t.contact_id = p_contact and tp.key = p_template_key and t.state in ('sending', 'sent'))) then
    return format('the organiser asked to stop on %s (%s)', to_char(v_stop.received_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'),
                  case when v_stop.contact_id = p_contact then 'this contact' else 'by another of their contacts' end);
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

commit;
