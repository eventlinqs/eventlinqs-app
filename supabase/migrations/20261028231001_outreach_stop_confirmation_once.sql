-- ============================================================================
-- THE ONE CONFIRMATION OF A STOP OR A TAKE DOWN IS SENT (window 6, 28 October 2026; follows 20261028224001).
--
-- FOUND BY THE END TO END DRIVE ON TEST (C:\dev\EVIDENCE\CRM-28OCT\outreach-drive-TEST.txt), not by the SQL proof:
-- 213001 lets exactly one confirmation reach a stopped address, and counted a confirmation already QUEUED or sent as
-- the one. When the sender claims the queued confirmation (queued to sending, 224001), the row being claimed is itself
-- the queued one, so it counted itself and the claim was refused: "w6-drive@eventlinqs.com asked to stop on 28 Oct
-- 2026." The proof never saw it because it wrote the confirmation straight as sent.
--
-- Now the one is a confirmation already SENDING or SENT. Two queued confirmations can exist; the first claimed goes and
-- the second's claim is refused. Everything else in outreach_contact_refusal_for is 213001's, unchanged.
-- Reversal: restore 213001's function.
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
