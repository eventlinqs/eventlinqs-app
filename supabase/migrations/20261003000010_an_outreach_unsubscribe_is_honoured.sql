-- ===========================================================================
-- AN OUTREACH UNSUBSCRIBE IS HONOURED, AND THE RECORD OF IT IS KEPT.
--
-- WHAT THIS FILE ADDS. One table, public.outreach_unsubscribes, written by the
-- public page /unsubscribe/outreach (src/app/unsubscribe/outreach/page.tsx)
-- when somebody presses Unsubscribe on a link in the footer of one of the
-- founder's one to one outreach emails to event organisers. One row per press:
-- who (the HubSpot contact id carried in the link, or the address they typed
-- when the link reached them without one), why (an optional reason from a
-- fixed list), an optional comment, and when.
--
-- WHY IT EXISTS. The outreach is sent one to one from Outlook, so no mailing
-- platform sits behind it to run an unsubscribe facility for us. The Spam Act
-- still requires one, and the facility has to work without the recipient
-- sending an email or giving more than their address:
--
--   ACMA: an unsubscribe must be clear, must be honoured within 5 working
--   days, must keep working for 30 days after the message was sent, and
--   cannot require extra personal information.
--   https://www.acma.gov.au/avoid-sending-spam (fetched 2026-10-03)
--
--   Yahoo sender requirements: the visible unsubscribe link "may direct to a
--   preference page"; "Honor unsubscribes within 2 days".
--   https://senders.yahooinc.com/best-practices/ (fetched 2026-10-03)
--
-- The shape of the record follows what the two reference products ask on the
-- same page:
--
--   HubSpot unsubscribe survey: "a confirmation page containing a survey
--   asking why they unsubscribed", with fixed reasons and "Other" with free
--   text.
--   https://knowledge.hubspot.com/marketing-email/redirect-contacts-to-an-unsubscribe-survey
--   (fetched 2026-10-03)
--
--   HubSpot one to one sales email: "An unsubscribe link will be included at
--   the bottom of all one-to-one emails."
--   https://knowledge.hubspot.com/one-to-one-email/manage-unsubscribe-links-for-one-to-one-emails
--   (fetched 2026-10-03)
--
--   Klaviyo opt out survey: radio reasons plus an optional text area.
--   https://www.klaviyo.com/blog/solution-recipe-16-opt-out-survey-capture-and-record-an-unsubscribe-reason-when-customers-opt-out
--   (fetched 2026-10-03)
--
-- APPEND ONLY, BY THE DATABASE. An unsubscribe is evidence that a person asked
-- to stop, so it is never edited and never removed. The existing
-- public.refuse_ledger_mutation() (20260913000040_consent_ledger.sql) is
-- attached exactly as that file attaches it to the consent ledger: statement
-- level, before UPDATE, DELETE and TRUNCATE. A second press is a second row,
-- which is fine: the earliest row is the date the request arrived.
--
-- SERVICE ROLE ONLY. Row level security is on with no policy, and anon and
-- authenticated hold no privilege on the table, so the only writer is the
-- server action through the service role client.
--
-- REVERSIBLE AND ADDITIVE. Nothing existing is altered. To reverse: drop the
-- three triggers and the table (the shared function stays, it belongs to the
-- consent ledger). A rollback discards the rows, which are the record of who
-- asked to stop, so export them first.
--
-- TRANSACTION SHAPE: plain CREATE TABLE, CREATE INDEX and CREATE TRIGGER, no
-- CONCURRENTLY, so the Supabase CLI runs this file as one transaction.
--
-- Lawal applies it with `supabase db push --linked` from PowerShell.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE TABLE.
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  hubspot_contact_id text null,
  email text null,
  reason text null,
  comment text null,
  created_at timestamptz not null default now(),

  -- The id the founder pastes into the link is a HubSpot contact record id,
  -- which is numeric. Anything else is not one, so it is never stored as one.
  constraint outreach_unsubscribes_contact_id_digits
    check (hubspot_contact_id is null or hubspot_contact_id ~ '^[0-9]{1,20}$'),

  -- One spelling per address, so a search for an address finds every row.
  constraint outreach_unsubscribes_email_normalised
    check (email is null or (email = lower(btrim(email)) and length(email) > 0)),

  -- The fixed list on the page, mirrored in src/lib/outreach/unsubscribe.ts.
  constraint outreach_unsubscribes_reason_known
    check (reason is null or reason in (
      'too_many_emails',
      'not_relevant',
      'happy_with_current_platform',
      'not_the_right_person',
      'other'
    )),

  constraint outreach_unsubscribes_comment_bounded
    check (comment is null or char_length(comment) <= 1000),

  -- A row that names nobody is not an unsubscribe.
  constraint outreach_unsubscribes_names_someone
    check (hubspot_contact_id is not null or email is not null)
);

comment on table public.outreach_unsubscribes is
  'An organiser who asked to stop receiving the founder''s one to one outreach emails, written by /unsubscribe/outreach. Append only: update, delete and truncate are refused. Service role only.';
comment on column public.outreach_unsubscribes.hubspot_contact_id is
  'The HubSpot contact record id carried in the unsubscribe link (?id=). Digits only. Null when the link reached the person without a usable id and they typed their address instead.';
comment on column public.outreach_unsubscribes.email is
  'The address the person typed, lower case and trimmed. Asked for only when the link carried no usable contact id.';
comment on column public.outreach_unsubscribes.reason is
  'The optional reason chosen on the page. Unsubscribing never depends on it.';
comment on column public.outreach_unsubscribes.comment is
  'The optional free text comment, at most 1000 characters.';

create index if not exists outreach_unsubscribes_hubspot_contact_id_idx
  on public.outreach_unsubscribes (hubspot_contact_id);

create index if not exists outreach_unsubscribes_email_idx
  on public.outreach_unsubscribes (email);

-- ---------------------------------------------------------------------------
-- 2. SERVICE ROLE ONLY.
-- ---------------------------------------------------------------------------
alter table public.outreach_unsubscribes enable row level security;
-- No policy: only the service role reads or writes this table.
revoke all on public.outreach_unsubscribes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. APPEND ONLY, ENFORCED BY THE DATABASE.
--
-- public.refuse_ledger_mutation() already exists (GA1, 20260913000040) and is
-- reused rather than re-spelled, so the platform has one refusal, not two that
-- can drift.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_outreach_unsubscribes_no_update on public.outreach_unsubscribes;
create trigger trg_outreach_unsubscribes_no_update
  before update on public.outreach_unsubscribes
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_outreach_unsubscribes_no_delete on public.outreach_unsubscribes;
create trigger trg_outreach_unsubscribes_no_delete
  before delete on public.outreach_unsubscribes
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_outreach_unsubscribes_no_truncate on public.outreach_unsubscribes;
create trigger trg_outreach_unsubscribes_no_truncate
  before truncate on public.outreach_unsubscribes
  for each statement execute function public.refuse_ledger_mutation();

commit;
