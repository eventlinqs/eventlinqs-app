-- ============================================================================
-- THE ORGANISER CRM: WHO THE ORGANISER IS, WHO WE MAY WRITE TO, AND WHAT WE SENT (window 6, 28 October 2026; parts B
-- and C of C:\dev\START-16OCT\EVENTLINQS-ENGINE-PLAN-28OCT.md, approved by Lawal at 19:52: "CRM inside EventLinqs").
--
-- WHY A NEW ORGANISER ROW AND NOT public.organisations. organisations is the ACCOUNT: an owner, Stripe, payouts. Every
-- curated venue sits under the one WI2 "EventLinqs listings" organisation, and a curated night's host is only its
-- venue's name (on TEST on 28 October, events.venue_name equals venues.name on all 359 curated nights), so an
-- organisation id cannot tell two unclaimed hosts apart. public.organisers is the PARTY we have a relationship with,
-- from the day we find them; once they claim, organisers.organisation_id names their account (section 7).
--
--   organisers           one row per real host; a second row for the same name, Instagram or website is refused.
--   organiser_venues     which organiser runs a venue: one organiser per venue, many venues per organiser. A link table
--                        because anon and authenticated hold table UPDATE on venues (organisers edit their own rows),
--                        so a column there would be theirs to change.
--   venue_merges         venue_merge(keep, drop, by, reason) moves one venue's listing rows onto another and records it.
--   organiser_contacts   a person or inbox at an organiser, the channel and address, and the BASIS we rely on with its
--                        evidence.
--   outreach_touches     the three messages of a cadence (day 0, 4 and 10, then stop), held for Lawal or sent by him,
--                        kept verbatim.
--   outreach_replies     what came back, verbatim, and its outcome. A stop is written to outreach_unsubscribes.
--   outreach_pipeline    one line per organiser: its stage and when its next message is due.
--
-- THE LAW THE DATABASE HOLDS (Spam Act 2003, ss 16, 17, 18 and Schedule 2 clause 4; the primary sources are quoted with
-- their URLs in C:\dev\START-16OCT\R-RESEARCH-26OCT.md):
--   ACMA, https://www.acma.gov.au/avoid-sending-spam: identify the sender; an unsubscribe that works for 30 days and is
--   honoured within 5 working days; keep who, when and how consent was given.
--   Conspicuous publication (Schedule 2 clause 4): the message relates to the role, the address belongs to that office
--   or business, and the publication carries no statement that they do not want messages.
--   ACMA Statement of Expectations (June 2024): "Do not send messages based solely on the fact that the email address or
--   phone number has been published". So a published address is NEVER a basis by itself here: all three tests are
--   recorded (the page, the date seen, the no-messages statement checked, why the message fits their role) or the
--   database refuses the message.
--   Section 16(5): the sender bears the burden of proving consent, so the basis relied on is copied onto each sent
--   message (basis_at_send) and a sent message, a reply and a merge are never altered or removed.
--
-- THE REFUSALS ARE THE DATABASE'S, NOT THE APP'S (the plan's acceptance: "a send without a basis is refused with the app
-- checks removed"). outreach_touch_is_lawful refuses, for a held or sent message: no complete basis; an address in
-- outreach_unsubscribes; a contact who replied (the cadence stops at any reply; a no stops the organiser); an email
-- without the unsubscribe link or without EventLinqs named; a message by hand without an unsubscribe link or a reply
-- STOP line; a step out of order, early, or a fourth; a second contact of the same organiser while one cadence runs;
-- and any change to a sent or void message.
--
-- NOTHING SENDS FROM THIS FILE. A held message is a draft for Lawal; a sent one is the record of what he sent from
-- Outlook or by hand. No transport, queue or schedule is created.
--
-- PRIVATE. Every table holds personal information (a name, a role, an address), so row security is on with no policy
-- and each is granted to service_role alone, revoked from anon, authenticated and service_role first (the 21 October
-- 2026 grant rule). Organisers' business contact details join the privacy notice before production (Lawal's step).
--
-- REVERSIBLE AND ADDITIVE. Seven new tables, one view, five functions, and two triggers on existing tables
-- (listing_claims: the claimant's organiser takes their account; outreach_unsubscribes: held drafts to that address are
-- voided). Nothing existing is altered. Reversal: drop the two triggers, the view, the functions and the tables, newest
-- first; export outreach_touches and outreach_replies first, they are the record of what was sent and said.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE ORGANISER.
-- ---------------------------------------------------------------------------
create table if not exists public.organisers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 200),
  name_key text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  organisation_id uuid unique references public.organisations (id) on delete set null,
  website_url text check (website_url is null or website_url ~* '^https://[^\s/]+\.[^\s/]+'),
  website_key text generated always as (
    lower(substring(website_url from '^[Hh][Tt][Tt][Pp][Ss]://(?:[Ww][Ww][Ww]\.)?([^/:?#\s]+)'))
  ) stored,
  instagram_handle text check (instagram_handle is null or instagram_handle ~ '^[a-z0-9._]{1,30}$'),
  found_on text check (found_on is null or found_on ~* '^https://'),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists organisers_one_per_name on public.organisers (name_key);
create unique index if not exists organisers_one_per_website on public.organisers (website_key) where website_key is not null;
create unique index if not exists organisers_one_per_instagram on public.organisers (instagram_handle) where instagram_handle is not null;

comment on table public.organisers is
  'Engine part B: one row per real host EventLinqs has a relationship with, from the day they are found. organisation_id names their account once they claim. Service role only.';

create table if not exists public.organiser_venues (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  organiser_id uuid not null references public.organisers (id) on delete restrict,
  linked_by uuid not null references auth.users (id) on delete restrict,
  linked_at timestamptz not null default now()
);

create index if not exists organiser_venues_by_organiser on public.organiser_venues (organiser_id);

comment on table public.organiser_venues is
  'Engine part B: the organiser who runs a venue. One organiser per venue, many venues per organiser. Service role only.';

-- ---------------------------------------------------------------------------
-- 2. THE VENUE MERGE. Two rows for one place (TEST holds hop temple twice) become one. The dropped venue is removed by
-- status, never deleted, and every listing row moves. A venue that carries money, seat maps or belongs to another
-- account is refused: those are not a duplicate to tidy but a decision for Lawal.
-- ---------------------------------------------------------------------------
create table if not exists public.venue_merges (
  id uuid primary key default gen_random_uuid(),
  kept_venue_id uuid not null references public.venues (id) on delete restrict,
  dropped_venue_id uuid not null unique references public.venues (id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 5 and 500),
  moved jsonb not null,
  merged_by uuid not null references auth.users (id) on delete restrict,
  merged_at timestamptz not null default now(),
  constraint venue_merges_two_venues check (kept_venue_id <> dropped_venue_id)
);

comment on table public.venue_merges is
  'Engine part B: one venue merged into another by venue_merge, with what moved. Append only. Service role only.';

create or replace function public.venue_merge(p_keep uuid, p_drop uuid, p_by uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $merge$
declare
  v_keep public.venues;
  v_drop public.venues;
  v_keep_org uuid;
  v_drop_org uuid;
  v_clash text;
  v_events int; v_series int; v_collab int; v_claims int; v_removals int;
  v_id uuid;
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'refused: a merge needs two different venues.' using errcode = '23514';
  end if;
  -- Both rows locked in one order, so two merges of the same pair cannot interleave.
  perform 1 from public.venues where id in (p_keep, p_drop) order by id for update;
  select * into v_keep from public.venues where id = p_keep;
  select * into v_drop from public.venues where id = p_drop;
  if v_keep.id is null or v_drop.id is null then
    raise exception 'refused: no venue %.', case when v_keep.id is null then p_keep else p_drop end using errcode = '23514';
  end if;
  if v_keep.removed_at is not null or v_drop.removed_at is not null then
    raise exception 'refused: % is already removed.', case when v_keep.removed_at is not null then v_keep.name else v_drop.name end
      using errcode = '23514';
  end if;
  if v_keep.organisation_id <> v_drop.organisation_id then
    raise exception 'refused: % and % belong to different accounts; a claimed venue is merged by its owner, not by us.', v_keep.name, v_drop.name
      using errcode = '23514';
  end if;
  if v_drop.stripe_account_id is not null
     or exists (select 1 from public.venue_payouts where venue_id = p_drop)
     or exists (select 1 from public.venue_share_ledger where venue_id = p_drop)
     or exists (select 1 from public.venue_enrolments where venue_id = p_drop) then
    raise exception 'refused: % carries money records; those are never moved by a merge.', v_drop.name using errcode = '23514';
  end if;
  if exists (select 1 from public.seat_maps where venue_id = p_drop) then
    raise exception 'refused: % has seat maps; native ticketing layouts are never moved by a merge.', v_drop.name using errcode = '23514';
  end if;
  select string_agg(d.name, ', ') into v_clash
    from public.event_series d
    join public.event_series k on k.venue_id = p_keep and k.name = d.name and k.rule = d.rule and k.anchor_date = d.anchor_date
   where d.venue_id = p_drop;
  if v_clash is not null then
    raise exception 'refused: both venues carry the series %; settle the duplicate series first.', v_clash using errcode = '23514';
  end if;
  select organiser_id into v_keep_org from public.organiser_venues where venue_id = p_keep;
  select organiser_id into v_drop_org from public.organiser_venues where venue_id = p_drop;
  if v_keep_org is not null and v_drop_org is not null and v_keep_org <> v_drop_org then
    raise exception 'refused: % and % are run by different organisers.', v_keep.name, v_drop.name using errcode = '23514';
  end if;

  update public.events
     set venue_id = p_keep,
         venue_name = case when lower(btrim(venue_name)) = lower(btrim(v_drop.name)) then v_keep.name else venue_name end
   where venue_id = p_drop;
  get diagnostics v_events = row_count;
  update public.event_series set venue_id = p_keep where venue_id = p_drop;
  get diagnostics v_series = row_count;
  update public.event_collaborators set venue_id = p_keep where venue_id = p_drop;
  get diagnostics v_collab = row_count;
  update public.listing_claims set venue_id = p_keep where venue_id = p_drop;
  get diagnostics v_claims = row_count;
  update public.removal_requests set venue_id = p_keep where venue_id = p_drop;
  get diagnostics v_removals = row_count;

  if v_keep_org is null and v_drop_org is not null then
    insert into public.organiser_venues (venue_id, organiser_id, linked_by) values (p_keep, v_drop_org, p_by);
  end if;

  -- What the kept row lacks it takes from the dropped one; what it has, it keeps.
  update public.venues
     set published_email = coalesce(published_email, v_drop.published_email),
         website_url = coalesce(website_url, v_drop.website_url),
         instagram_handle = coalesce(instagram_handle, v_drop.instagram_handle),
         updated_at = now()
   where id = p_keep;
  update public.venues set removed_at = now(), is_active = false, updated_at = now() where id = p_drop;

  insert into public.venue_merges (kept_venue_id, dropped_venue_id, reason, moved, merged_by)
  values (p_keep, p_drop, btrim(p_reason),
          jsonb_build_object('events', v_events, 'series', v_series, 'collaborators', v_collab, 'claims', v_claims,
                             'removal_requests', v_removals, 'organiser_linked', v_keep_org is null and v_drop_org is not null),
          p_by)
  returning id into v_id;
  return v_id;
end;
$merge$;

-- ---------------------------------------------------------------------------
-- 3. THE CONTACT AND THE BASIS WE RELY ON.
-- ---------------------------------------------------------------------------
create table if not exists public.organiser_contacts (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.organisers (id) on delete restrict,
  person_name text check (person_name is null or length(btrim(person_name)) between 1 and 120),
  -- Their role or the inbox's function, which is what the message must be relevant to.
  role text not null check (length(btrim(role)) between 2 and 80),
  channel text not null check (channel in ('email', 'instagram', 'facebook', 'website_form')),
  address text not null,
  -- The HubSpot contact id the older unsubscribe links carry, so a press on one of those still finds this contact.
  hubspot_contact_id text unique check (hubspot_contact_id is null or hubspot_contact_id ~ '^[0-9]{1,20}$'),
  basis text not null default 'none' check (basis in ('none', 'conspicuous_publication', 'express_consent')),
  published_on_url text check (published_on_url is null or published_on_url ~* '^https://'),
  seen_on date,
  no_marketing_statement_checked boolean not null default false,
  relevance text check (relevance is null or length(btrim(relevance)) <= 500),
  consent_wording text check (consent_wording is null or length(btrim(consent_wording)) <= 2000),
  evidence_file text check (evidence_file is null or length(btrim(evidence_file)) > 0),
  basis_recorded_by uuid references auth.users (id) on delete restrict,
  basis_recorded_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint organiser_contacts_address_shape check (
    (channel = 'email' and address = lower(btrim(address)) and address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$')
    or (channel = 'instagram' and address ~ '^[a-z0-9._]{1,30}$')
    or (channel in ('facebook', 'website_form') and address ~* '^https://[^[:space:]]+$')
  ),
  -- A basis is recorded whole or not at all: all three conspicuous publication tests, or their own words of consent.
  constraint organiser_contacts_basis_is_whole check (
    basis = 'none'
    or (basis = 'conspicuous_publication'
        and published_on_url is not null and seen_on is not null and no_marketing_statement_checked
        and length(btrim(coalesce(relevance, ''))) >= 10
        and basis_recorded_by is not null and basis_recorded_at is not null)
    or (basis = 'express_consent'
        and length(btrim(coalesce(consent_wording, ''))) >= 10 and seen_on is not null
        and basis_recorded_by is not null and basis_recorded_at is not null)
  ),
  constraint organiser_contacts_one_per_address unique (channel, address)
);

create index if not exists organiser_contacts_by_organiser on public.organiser_contacts (organiser_id);

comment on table public.organiser_contacts is
  'Engine part C: a person or inbox at an organiser, the channel and address, and the Spam Act basis relied on with its evidence (Schedule 2 clause 4: the page, the date seen, no no-messages statement, relevance to the role). Service role only.';

-- ---------------------------------------------------------------------------
-- 4. THE MESSAGES AND THE REPLIES.
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_touches (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.organiser_contacts (id) on delete restrict,
  -- Step 1 on day 0, step 2 from day 4, step 3 from day 10, then stop.
  step smallint not null check (step between 1 and 3),
  state text not null default 'held' check (state in ('held', 'sent', 'void')),
  subject text check (subject is null or length(btrim(subject)) between 3 and 200),
  body text not null check (length(btrim(body)) between 20 and 5000),
  tracked_link text check (tracked_link is null or tracked_link ~* '^https://'),
  drafted_by uuid not null references auth.users (id) on delete restrict,
  drafted_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete restrict,
  basis_at_send jsonb,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 3 and 500),
  constraint outreach_touches_sent_is_whole check (
    (state = 'sent') = (sent_at is not null and sent_by is not null and basis_at_send is not null)
  ),
  constraint outreach_touches_void_says_why check ((state = 'void') = (void_reason is not null))
);

create unique index if not exists outreach_touches_one_per_step on public.outreach_touches (contact_id, step) where state <> 'void';
create index if not exists outreach_touches_sent on public.outreach_touches (sent_at) where state = 'sent';

comment on table public.outreach_touches is
  'Engine part C: the day 0, 4 and 10 messages to one contact, held for Lawal or sent by him, verbatim. outreach_touch_is_lawful refuses an unlawful one. Service role only.';

create table if not exists public.outreach_replies (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.organiser_contacts (id) on delete restrict,
  touch_id uuid references public.outreach_touches (id) on delete restrict,
  received_at timestamptz not null,
  wording text not null check (length(btrim(wording)) between 1 and 5000),
  outcome text not null check (outcome in ('yes', 'interested', 'question', 'later', 'no', 'stop', 'bounce')),
  logged_by uuid not null references auth.users (id) on delete restrict,
  logged_at timestamptz not null default now()
);

create index if not exists outreach_replies_by_contact on public.outreach_replies (contact_id, received_at desc);

comment on table public.outreach_replies is
  'Engine part C: what an organiser sent back, verbatim, and its outcome. Any reply stops the cadence; a stop is also written to outreach_unsubscribes; a no stops every contact of the organiser. Append only. Service role only.';

-- ---------------------------------------------------------------------------
-- 5. WHY A CONTACT MAY NOT BE WRITTEN TO, OR NULL. One answer, read by the trigger and by the app's screens alike.
-- ---------------------------------------------------------------------------
create or replace function public.outreach_contact_refusal(p_contact uuid)
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
begin
  select * into c from public.organiser_contacts where id = p_contact;
  if c.id is null then
    return 'no such contact';
  end if;
  if c.basis = 'none' then
    return format('no lawful basis is recorded for %s', c.address);
  end if;
  select min(u.created_at) into v_when
    from public.outreach_unsubscribes u
   where (c.channel = 'email' and u.email = c.address)
      or (c.hubspot_contact_id is not null and u.hubspot_contact_id = c.hubspot_contact_id);
  if v_when is not null then
    return format('%s asked to stop on %s', c.address, to_char(v_when at time zone 'Australia/Melbourne', 'DD Mon YYYY'));
  end if;
  select r.* into v_reply
    from public.outreach_replies r
    join public.organiser_contacts o on o.id = r.contact_id
   where o.organiser_id = c.organiser_id and r.outcome = 'no'
   order by r.received_at desc limit 1;
  if v_reply.id is not null then
    return format('the organiser said no on %s', to_char(v_reply.received_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'));
  end if;
  select r.* into v_reply from public.outreach_replies r where r.contact_id = p_contact order by r.received_at desc limit 1;
  if v_reply.id is not null then
    return format('%s replied on %s (%s); the cadence has stopped, answer them personally', c.address,
                  to_char(v_reply.received_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'), v_reply.outcome);
  end if;
  return null;
end;
$why$;

create or replace function public.outreach_touch_is_lawful()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $lawful$
declare
  c public.organiser_contacts;
  v_why text;
  v_first timestamptz;
  v_prev public.outreach_touches;
  v_other text;
  v_days int;
  v_due int;
begin
  if new.step > 3 then
    raise exception 'refused: the cadence stops after step 3 (day 10); there is no fourth message.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.state = 'sent' then
      raise exception 'refused: a sent message is the record of what was sent and is never changed.' using errcode = '42501';
    end if;
    if old.state = 'void' then
      raise exception 'refused: a void message stays void; draft a new one.' using errcode = '42501';
    end if;
    if new.contact_id <> old.contact_id or new.step <> old.step then
      raise exception 'refused: a message keeps its contact and its step.' using errcode = '42501';
    end if;
  elsif new.state = 'void' then
    raise exception 'refused: a message is drafted held or logged sent, never written void.' using errcode = '23514';
  end if;

  if new.state = 'void' then
    return new;
  end if;

  select * into c from public.organiser_contacts where id = new.contact_id for share;
  v_why := public.outreach_contact_refusal(new.contact_id);
  if v_why is not null then
    raise exception 'refused: %.', v_why using errcode = '23514';
  end if;

  -- Sections 17 and 18: the sender is named and an unsubscribe works.
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
  if position('EventLinqs' in new.body) = 0 then
    raise exception 'refused: the message must name EventLinqs as its sender.' using errcode = '23514';
  end if;

  -- Duplicate outreach: one cadence per organiser at a time.
  select o.address into v_other
    from public.outreach_touches t
    join public.organiser_contacts o on o.id = t.contact_id
   where o.organiser_id = c.organiser_id and o.id <> c.id
     and (t.state = 'held' or (t.state = 'sent' and t.sent_at > now() - interval '30 days'))
   limit 1;
  if v_other is not null then
    raise exception 'refused: this organiser is already being contacted through %.', v_other using errcode = '23514';
  end if;

  -- The cadence: day 0, day 4, day 10, then stop. A draft needs the step before it drafted; a send needs it sent.
  if new.step > 1 then
    select * into v_prev from public.outreach_touches
     where contact_id = new.contact_id and step = new.step - 1 and state <> 'void' and id <> new.id;
    if v_prev.id is null then
      raise exception 'refused: step % comes after step %.', new.step, new.step - 1 using errcode = '23514';
    end if;
  end if;

  if new.state = 'sent' then
    if new.sent_at is null or new.sent_by is null then
      raise exception 'refused: a sent message records when and by whom.' using errcode = '23514';
    end if;
    if new.sent_at > now() + interval '5 minutes' then
      raise exception 'refused: a message cannot be sent in the future.' using errcode = '23514';
    end if;
    if c.seen_on is not null and (new.sent_at at time zone 'Australia/Melbourne')::date < c.seen_on then
      raise exception 'refused: sent before the basis was seen on %.', c.seen_on using errcode = '23514';
    end if;
    if new.step > 1 then
      if v_prev.state <> 'sent' then
        raise exception 'refused: step % is sent only after step % is sent.', new.step, new.step - 1 using errcode = '23514';
      end if;
      select sent_at into v_first from public.outreach_touches where contact_id = new.contact_id and step = 1 and state = 'sent';
      v_days := (new.sent_at at time zone 'Australia/Melbourne')::date - (v_first at time zone 'Australia/Melbourne')::date;
      v_due := case new.step when 2 then 4 else 10 end;
      if v_days < v_due then
        raise exception 'refused: step % is due from day %, this is day %.', new.step, v_due, v_days
          using errcode = '23514';
      end if;
    end if;
    -- Section 16(5): what we relied on, kept with the message.
    new.basis_at_send := jsonb_build_object(
      'basis', c.basis, 'address', c.address, 'role', c.role, 'published_on_url', c.published_on_url, 'seen_on', c.seen_on,
      'no_marketing_statement_checked', c.no_marketing_statement_checked, 'relevance', c.relevance,
      'consent_wording', c.consent_wording, 'evidence_file', c.evidence_file, 'basis_recorded_at', c.basis_recorded_at);
  end if;
  return new;
end;
$lawful$;

drop trigger if exists trg_outreach_touch_is_lawful on public.outreach_touches;
create trigger trg_outreach_touch_is_lawful
  before insert or update on public.outreach_touches
  for each row execute function public.outreach_touch_is_lawful();

drop trigger if exists trg_outreach_touches_no_delete on public.outreach_touches;
create trigger trg_outreach_touches_no_delete
  before delete or truncate on public.outreach_touches
  for each statement execute function public.refuse_ledger_mutation();

-- A reply stops the cadence; a stop joins the one suppression list; a no stops the organiser.
create or replace function public.outreach_reply_stops()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $reply$
declare
  c public.organiser_contacts;
begin
  select * into c from public.organiser_contacts where id = new.contact_id;
  update public.outreach_touches
     set state = 'void', void_reason = format('they replied on %s (%s)', to_char(new.received_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'), new.outcome)
   where state = 'held'
     and contact_id in (select id from public.organiser_contacts
                         where id = new.contact_id or (new.outcome = 'no' and organiser_id = c.organiser_id));
  if new.outcome = 'stop' and (c.channel = 'email' or c.hubspot_contact_id is not null) then
    insert into public.outreach_unsubscribes (hubspot_contact_id, email, reason, comment)
    values (c.hubspot_contact_id, case when c.channel = 'email' then c.address end, null,
            format('Replied asking to stop (outreach_replies %s).', new.id));
  end if;
  return new;
end;
$reply$;

drop trigger if exists trg_outreach_reply_stops on public.outreach_replies;
create trigger trg_outreach_reply_stops
  after insert on public.outreach_replies
  for each row execute function public.outreach_reply_stops();

-- An unsubscribe pressed on the page voids the drafts held for that address at once.
create or replace function public.outreach_unsubscribe_voids_drafts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $unsub$
begin
  update public.outreach_touches t
     set state = 'void', void_reason = format('unsubscribed on %s', to_char(new.created_at at time zone 'Australia/Melbourne', 'DD Mon YYYY'))
    from public.organiser_contacts c
   where c.id = t.contact_id and t.state = 'held'
     and ((c.channel = 'email' and c.address = new.email)
          or (c.hubspot_contact_id is not null and c.hubspot_contact_id = new.hubspot_contact_id));
  return new;
end;
$unsub$;

drop trigger if exists trg_outreach_unsubscribe_voids_drafts on public.outreach_unsubscribes;
create trigger trg_outreach_unsubscribe_voids_drafts
  after insert on public.outreach_unsubscribes
  for each row execute function public.outreach_unsubscribe_voids_drafts();

-- Append only: what came back and what was merged.
drop trigger if exists trg_outreach_replies_no_update on public.outreach_replies;
create trigger trg_outreach_replies_no_update
  before update or delete or truncate on public.outreach_replies
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_venue_merges_no_update on public.venue_merges;
create trigger trg_venue_merges_no_update
  before update or delete or truncate on public.venue_merges
  for each statement execute function public.refuse_ledger_mutation();

-- ---------------------------------------------------------------------------
-- 6. THE PIPELINE: one line per organiser, its stage and when the next message is due.
-- ---------------------------------------------------------------------------
create or replace view public.outreach_pipeline
with (security_invoker = true) as
with sent as (
  select c.organiser_id, count(*) as steps_sent, min(t.sent_at) as first_sent_at, max(t.sent_at) as last_sent_at
    from public.outreach_touches t join public.organiser_contacts c on c.id = t.contact_id
   where t.state = 'sent'
   group by c.organiser_id
), replied as (
  select distinct on (c.organiser_id) c.organiser_id, r.received_at as last_reply_at, r.outcome as last_outcome
    from public.outreach_replies r join public.organiser_contacts c on c.id = r.contact_id
   order by c.organiser_id, r.received_at desc
), contacts as (
  select organiser_id, count(*) as contacts,
         count(*) filter (where basis <> 'none') as qualified_contacts,
         count(*) filter (where basis <> 'none' and public.outreach_contact_refusal(id) is null) as writable_contacts
    from public.organiser_contacts group by organiser_id
)
select o.id as organiser_id,
       o.name,
       o.organisation_id,
       (select count(*) from public.organiser_venues ov join public.venues v on v.id = ov.venue_id
         where ov.organiser_id = o.id and v.removed_at is null) as venues,
       coalesce(k.contacts, 0) as contacts,
       coalesce(k.qualified_contacts, 0) as qualified_contacts,
       coalesce(s.steps_sent, 0) as steps_sent,
       s.first_sent_at,
       s.last_sent_at,
       r.last_reply_at,
       r.last_outcome,
       case
         when o.organisation_id is not null then 'claimed'
         when r.last_outcome in ('no', 'stop') then 'stopped'
         when r.last_reply_at is not null then 'replied'
         when coalesce(s.steps_sent, 0) > 0 and coalesce(k.writable_contacts, 0) = 0 then 'stopped'
         when coalesce(s.steps_sent, 0) >= 3 then 'no_reply'
         when coalesce(s.steps_sent, 0) > 0 then 'invited'
         when coalesce(k.qualified_contacts, 0) > 0 then 'qualified'
         else 'found'
       end as stage,
       case
         when o.organisation_id is null and r.last_reply_at is null and coalesce(k.writable_contacts, 0) > 0
              and coalesce(s.steps_sent, 0) between 1 and 2
         then ((s.first_sent_at at time zone 'Australia/Melbourne')::date + case s.steps_sent when 1 then 4 else 10 end)
       end as next_due_on
  from public.organisers o
  left join contacts k on k.organiser_id = o.id
  left join sent s on s.organiser_id = o.id
  left join replied r on r.organiser_id = o.id;

comment on view public.outreach_pipeline is
  'Engine part C: one line per organiser: found, qualified (a basis recorded), invited (a message sent), no_reply (all three sent, nothing back; the cadence has stopped), replied, claimed (they hold an account), stopped (a no, a stop, or nobody left to write to); next_due_on is the day the next step of the cadence is due. Service role only.';

-- ---------------------------------------------------------------------------
-- 7. A VERIFIED CLAIM GIVES THE ORGANISER THEIR ACCOUNT. Never blocks a claim: an organiser already linked elsewhere,
-- or an account already linked to another organiser, is left as it is for Lawal to settle.
-- ---------------------------------------------------------------------------
create or replace function public.organiser_takes_the_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $claim$
declare
  v_venue uuid;
begin
  if new.status not in ('verified', 'manual_approved') or old.status in ('verified', 'manual_approved')
     or new.target_organisation_id is null then
    return new;
  end if;
  v_venue := coalesce(new.venue_id, (select venue_id from public.events where id = new.event_id));
  update public.organisers o
     set organisation_id = new.target_organisation_id
    from public.organiser_venues ov
   where ov.venue_id = v_venue and o.id = ov.organiser_id and o.organisation_id is null
     and not exists (select 1 from public.organisers x where x.organisation_id = new.target_organisation_id);
  return new;
end;
$claim$;

drop trigger if exists trg_organiser_takes_the_claim on public.listing_claims;
create trigger trg_organiser_takes_the_claim
  after update of status on public.listing_claims
  for each row execute function public.organiser_takes_the_claim();

-- ---------------------------------------------------------------------------
-- 8. PRIVATE: service role only, exactly what the server needs. No delete anywhere except re-pointing a venue's
-- organiser link.
-- ---------------------------------------------------------------------------
alter table public.organisers enable row level security;
alter table public.organiser_venues enable row level security;
alter table public.venue_merges enable row level security;
alter table public.organiser_contacts enable row level security;
alter table public.outreach_touches enable row level security;
alter table public.outreach_replies enable row level security;

revoke all on public.organisers from anon, authenticated, service_role;
revoke all on public.organiser_venues from anon, authenticated, service_role;
revoke all on public.venue_merges from anon, authenticated, service_role;
revoke all on public.organiser_contacts from anon, authenticated, service_role;
revoke all on public.outreach_touches from anon, authenticated, service_role;
revoke all on public.outreach_replies from anon, authenticated, service_role;
revoke all on public.outreach_pipeline from anon, authenticated, service_role;

grant select, insert, update on public.organisers to service_role;
grant select, insert, update, delete on public.organiser_venues to service_role;
grant select on public.venue_merges to service_role;
grant select, insert, update on public.organiser_contacts to service_role;
grant select, insert, update on public.outreach_touches to service_role;
grant select, insert on public.outreach_replies to service_role;
grant select on public.outreach_pipeline to service_role;

revoke all on function public.venue_merge(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.outreach_contact_refusal(uuid) from public, anon, authenticated;
revoke all on function public.outreach_touch_is_lawful() from public, anon, authenticated;
revoke all on function public.outreach_reply_stops() from public, anon, authenticated;
revoke all on function public.outreach_unsubscribe_voids_drafts() from public, anon, authenticated;
revoke all on function public.organiser_takes_the_claim() from public, anon, authenticated;
grant execute on function public.venue_merge(uuid, uuid, uuid, text) to service_role;
grant execute on function public.outreach_contact_refusal(uuid) to service_role;

commit;
