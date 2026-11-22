-- THE ENGINE'S OWN PAGE CHECK, RECORDED WHEN IT CANNOT CLEAR AN ADDRESS (the PM's 15:48 of 22 November 2026, F5 (b);
-- Lawal's platform reliability directive of 15:13, sections 2 and 4). A contact recorded on a conspicuous publication basis
-- whose page the engine could not clear stays in the CRM as a contact, simply not yet eligible for email marketing, and is
-- read again in the next pool turn. Its exact reason and the day the engine last read it are kept here, never a state
-- that waits for a person. Nullable columns on an existing table: no row is hidden and no grant changes.
alter table public.organiser_contacts
  add column if not exists engine_check_note text,
  add column if not exists engine_checked_on date;

alter table public.organiser_contacts drop constraint if exists organiser_contacts_engine_check_note_length;
alter table public.organiser_contacts
  add constraint organiser_contacts_engine_check_note_length check (engine_check_note is null or length(engine_check_note) between 3 and 500);

comment on column public.organiser_contacts.engine_check_note is
  'The engine''s last reading of this address''s own page: why it could not clear it, or that it did (src/lib/outreach/engine-recheck.ts).';
comment on column public.organiser_contacts.engine_checked_on is
  'The Melbourne day the engine last read this address''s own page.';
