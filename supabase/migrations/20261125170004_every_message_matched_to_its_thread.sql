-- EVERY MESSAGE MATCHED TO ITS THREAD (WINDOW 5C, 25 November 2026; the PM's 16:28, directive 3.4: identify the contact
-- and the conversation). Bendigo Tourism's yes of 15:44 came from an address we hold no contact for, answering a message
-- Lawal sent by hand that the Sent Items sync never recorded, so the inbox run matched it to nobody and said nothing.
--
-- outreach_message_mailboxes (20261125170001) keeps, for every message read from our two mailboxes, received or sent:
--   counterpart_address  who it came from (received) or went to first (sent), lower case;
--   subject              its subject as it stood;
--   message_at           when it was received or sent;
--   conversation_id      Outlook's conversation id for it (Microsoft Graph message.conversationId), the second road to
--                        its thread after In-Reply-To and References;
--   contact_id           the contact of ours its thread belongs to, null when it matched none. A received message with
--                        none is what the leads watch lists as 'unmatched': never silently dropped.
-- No foreign key on contact_id: a second road from this table to organiser_contacts would make a bare embed ambiguous, and
-- the row is a record of the past either way. Still insert only, read and written by the server jobs alone.
--
-- Additive only: no row is changed, nothing is dropped, and no new table is made, so no grant is written.

alter table public.outreach_message_mailboxes
  add column if not exists counterpart_address text
    constraint outreach_message_mailboxes_counterpart check (counterpart_address is null or (counterpart_address = lower(btrim(counterpart_address)) and counterpart_address ~ '^[^@[:space:]]+@[^@[:space:]]+$')),
  add column if not exists subject text
    constraint outreach_message_mailboxes_subject check (subject is null or length(subject) <= 998),
  add column if not exists message_at timestamptz,
  add column if not exists conversation_id text
    constraint outreach_message_mailboxes_conversation check (conversation_id is null or length(conversation_id) between 1 and 1024),
  add column if not exists contact_id uuid;

create index if not exists outreach_message_mailboxes_by_conversation on public.outreach_message_mailboxes (conversation_id) where conversation_id is not null;
create index if not exists outreach_message_mailboxes_unmatched on public.outreach_message_mailboxes (message_at) where contact_id is null and direction = 'received';

comment on column public.outreach_message_mailboxes.counterpart_address is 'Who it came from (received) or first went to (sent), lower case.';
comment on column public.outreach_message_mailboxes.conversation_id is 'Outlook''s conversation id for the message (Microsoft Graph message.conversationId): the second road to its thread after In-Reply-To and References.';
comment on column public.outreach_message_mailboxes.contact_id is 'The contact its thread belongs to; null when it matched none (a received one is listed as unmatched by the leads watch).';
