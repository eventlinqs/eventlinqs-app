-- THE NO-MESSAGES CHECK OF A PUBLISHED CONTACT IS MADE BEFORE THE MESSAGE LEAVES, NOT BEFORE IT IS DRAFTED
-- (the CONTROLLER's 05:32 of 31 October 2026, ruling (3); window 2).
--
-- Spam Act 2003 Schedule 2 clause 4 and ACMA's June 2024 expectation, as 20261028201001 records them: a conspicuously
-- published business address is a basis only when the publication carries no statement that they do not want messages.
-- Until now organiser_contacts_basis_is_whole demanded that check before a contact could hold a basis at all, so a draft
-- could not even be held for Lawal while the page (an Instagram or Facebook profile he opens signed in) was unread.
--
-- The ruling: Lawal's 22 hand messages are held as drafts with the page they were published on, and the no-messages
-- check is his, made on the page itself when he opens it to send, and ticked on the queue before Sent. So:
--   1. the basis may be recorded before that check (the page, the date seen, the relevance and who recorded it are still
--      all required);
--   2. a message to such a contact may be HELD, but the database refuses it leaving held (queued, sending or sent) while
--      the check is not recorded. Nothing can be sent on an unchecked page; the legal test is kept, only moved to the
--      moment it matters. Express consent is untouched.
-- No table is created, so no grant changes. Reversal: put the constraint back as 20261028201001 wrote it (it holds for
-- every row whose check is recorded) and drop the trigger.

alter table public.organiser_contacts drop constraint if exists organiser_contacts_basis_is_whole;
alter table public.organiser_contacts add constraint organiser_contacts_basis_is_whole check (
  basis = 'none'
  or (basis = 'conspicuous_publication'
      and published_on_url is not null and seen_on is not null
      and length(btrim(coalesce(relevance, ''))) >= 10
      and basis_recorded_by is not null and basis_recorded_at is not null)
  or (basis = 'express_consent'
      and length(btrim(coalesce(consent_wording, ''))) >= 10 and seen_on is not null
      and basis_recorded_by is not null and basis_recorded_at is not null)
);

create or replace function public.outreach_touch_page_checked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  c public.organiser_contacts;
begin
  if new.state in ('held', 'void') then
    return new;
  end if;
  select * into c from public.organiser_contacts where id = new.contact_id;
  if c.basis = 'conspicuous_publication' and not c.no_marketing_statement_checked then
    raise exception 'refused: % has not been checked for a statement against messages; open the page, check it, then tick it before Sent.', c.published_on_url
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

revoke all on function public.outreach_touch_page_checked() from public, anon, authenticated;

drop trigger if exists trg_outreach_touch_page_checked on public.outreach_touches;
create trigger trg_outreach_touch_page_checked
  before insert or update on public.outreach_touches
  for each row execute function public.outreach_touch_page_checked();

comment on function public.outreach_touch_page_checked() is
  'A message to a conspicuously published contact leaves held only once its page has been checked for a statement against messages (the CONTROLLER''s 05:32, 31 October 2026).';
