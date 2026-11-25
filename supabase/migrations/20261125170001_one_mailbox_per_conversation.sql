-- ONE MAILBOX PER CONVERSATION (WINDOW 5C, 25 November 2026; Lawal's 14:41 and 14:43 of 25 November 2026 through the
-- PM's 14:42 and 14:43: "We'll never change the communication channel. We'll keep it the same" and "A different email
-- address addressing an email I sent to another address is just confusing ... The customer should not see that"; the
-- PM's 14:15 item C; the defect of Stage 29 Studios' answer, requirement register row I10).
--
-- A reply goes from the mailbox the person last wrote to, in that thread, and our side never changes address mid
-- conversation. The engine could not keep that rule, because nothing recorded which of our two mailboxes a message
-- arrived in or left from: the sender guessed it from the category of the letter answered (src/lib/outreach/sender.ts).
-- Two records, both written by the engine itself:
--
--   outreach_message_mailboxes  one row per message, by its Internet message id: the mailbox of ours it was received in
--                               (the inbox run, src/lib/outreach/replies.ts handleInbox) or sent from (the sender, and
--                               the Sent Items sync for a message sent by hand). Insert only: a message's mailbox is a
--                               fact of the past and is never changed, so no update or delete is granted.
--   organiser_contacts          the address the person asked us to use instead, in their own words ("email me at ...
--                               instead"), when it was said and the reply that said it (Lawal's 14:43, item 2): kept for
--                               every message after, until they state another.
--
-- Additive only: no row is changed and nothing is dropped. The new table is read and written by the server jobs alone
-- (service_role); no visitor or signed in user reaches it, so it is granted to nobody else (the grant rule of
-- 21 October 2026).

create table if not exists public.outreach_message_mailboxes (
  internet_message_id text primary key check (length(btrim(internet_message_id)) > 0),
  mailbox text not null check (mailbox = lower(btrim(mailbox)) and mailbox ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  direction text not null check (direction in ('received', 'sent')),
  recorded_at timestamptz not null default now()
);

alter table public.outreach_message_mailboxes enable row level security;
revoke all on public.outreach_message_mailboxes from public, anon, authenticated, service_role;
grant select, insert on public.outreach_message_mailboxes to service_role;

comment on table public.outreach_message_mailboxes is 'The mailbox of ours each outreach message was received in or sent from, by its Internet message id: a reply goes from the mailbox the person last wrote to, in that thread (Lawal, 25 November 2026, 14:41 and 14:43).';

alter table public.organiser_contacts
  add column if not exists stated_address text check (stated_address is null or (stated_address = lower(btrim(stated_address)) and stated_address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  add column if not exists stated_address_at timestamptz,
  add column if not exists stated_address_reply uuid;

do $whole$
begin
  if not exists (select 1 from pg_constraint where conname = 'organiser_contacts_stated_address_whole') then
    alter table public.organiser_contacts add constraint organiser_contacts_stated_address_whole
      check ((stated_address is null) = (stated_address_at is null));
  end if;
end
$whole$;

comment on column public.organiser_contacts.stated_address is 'The address the person asked us to write to instead, in their own words; every message after goes to it (Lawal, 25 November 2026, 14:43).';
comment on column public.organiser_contacts.stated_address_at is 'When they asked for it: the received time of their message.';
comment on column public.organiser_contacts.stated_address_reply is 'The outreach_replies row whose words asked for it.';
