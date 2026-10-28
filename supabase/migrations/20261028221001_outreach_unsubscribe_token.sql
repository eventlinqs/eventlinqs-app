-- ============================================================================
-- EVERY ORGANISER CONTACT CARRIES ITS OWN UNSUBSCRIBE TOKEN (window 6, 28 October 2026; follows 20261028213001).
--
-- The automatic emails carry a one-click unsubscribe (RFC 8058, https://www.rfc-editor.org/rfc/rfc8058.html; the
-- headers composed by src/lib/consent/one-click.ts) and a footer link, both to an address that names the contact. The
-- older outreach link named a HubSpot contact id; the CRM is inside EventLinqs now (Lawal, 28 October), so the link
-- names this token instead. It is a random uuid on the row, the platform's own pattern for unsubscribe tokens
-- (src/lib/consent/token.ts), so nothing needs a secret and nobody can enumerate it.
--
-- outreach_unsubscribe_by_token records the request in outreach_unsubscribes, the one suppression list, with the
-- contact's own address (the page never asks for it), and does nothing a second time. A token that matches nothing
-- returns 'unknown'. The trigger of 201001 and 213001 voids what was held or queued for that address at once.
--
-- Additive and reversible: drop the function, the index and the column.
-- ============================================================================

begin;

alter table public.organiser_contacts add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists organiser_contacts_unsubscribe_token on public.organiser_contacts (unsubscribe_token);

comment on column public.organiser_contacts.unsubscribe_token is
  'The token in this contact''s unsubscribe link and List-Unsubscribe header. Random, never shown elsewhere.';

create or replace function public.outreach_unsubscribe_by_token(p_token uuid, p_reason text default null, p_comment text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $unsub$
declare
  c public.organiser_contacts;
begin
  select * into c from public.organiser_contacts where unsubscribe_token = p_token;
  if c.id is null then
    return 'unknown';
  end if;
  if c.channel <> 'email' and c.hubspot_contact_id is null then
    return 'unknown';
  end if;
  if exists (select 1 from public.outreach_unsubscribes u
              where (c.channel = 'email' and u.email = c.address)
                 or (c.hubspot_contact_id is not null and u.hubspot_contact_id = c.hubspot_contact_id)) then
    return 'already';
  end if;
  insert into public.outreach_unsubscribes (hubspot_contact_id, email, reason, comment)
  values (c.hubspot_contact_id, case when c.channel = 'email' then c.address end, p_reason, p_comment);
  return 'done';
end;
$unsub$;

revoke all on function public.outreach_unsubscribe_by_token(uuid, text, text) from public, anon, authenticated;
grant execute on function public.outreach_unsubscribe_by_token(uuid, text, text) to service_role;

commit;
