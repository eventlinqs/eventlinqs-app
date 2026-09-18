-- ===========================================================================
-- GA4. THE CAMPAIGNER.
--
-- WHY THE RULES ARE IN THE DATABASE AND NOT IN A PROMPT. The Spam Act is
-- enforced hard in this country and the two failure modes are each capable of
-- ending this business on their own: 2,598 messages without an unsubscribe cost
-- TAB over 4 million dollars in June 2025 and 2.7 million again in July 2026,
-- and 34.8 million messages to people who had not consented or had withdrawn
-- cost the Commonwealth Bank 7.5 million in October 2024. An autonomous sender
-- produces exactly those two failures. A prompt can be argued with; a check
-- constraint cannot. So the recipient allowlist and the per campaign volume cap
-- live here, and the tests prove them by REMOVING every application level check
-- and watching the database refuse anyway.
--
-- THE SMS CONSENT IS A SCOPE, NOT A SECOND COLUMN. GA1 already models it:
-- consent_events.channel_scope is email, sms or both, and consent_permits()
-- refuses a channel the consent does not cover. A second sms_consent boolean
-- would be a second answer to one question and the two would disagree inside a
-- week. The allowlist COPIES the scope at admission and refuses a row whose
-- scope does not cover its own channel.
--
-- NOTHING SENDS FROM THIS FILE. It creates no transport, no queue and no
-- schedule. What it creates is the set of rows a send cannot exist without.
--
-- Additive and reversible. Applied to TEST vkapkibzokmfaxqogypq from the lane B
-- worktree. Production is the founder's `npm run migrate:production`.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE MODE, AND THE REVERSAL CONDITION MADE OPERABLE.
--
--   test   every send row is written and every message rendered in full, then
--          handed to a recorded sink that REFUSES any address outside the test
--          domain. A real person cannot be reached.
--   live   the dispatcher hands the rendered message to the real transport.
--   hold   every send is queued and none is dispatched. Every campaign,
--          allowlist, send and approval row stays intact and every message
--          stays renderable and previewable. This is GA4's reversal condition
--          and it is one row update.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_campaigner_config (
  id boolean primary key default true,
  mode text not null,
  test_domain text not null,
  default_volume_cap integer not null,
  unsubscribe_path text not null,
  updated_at timestamptz not null default now(),
  constraint marketing_campaigner_config_single_row check (id),
  constraint marketing_campaigner_config_mode_known check (mode in ('test', 'live', 'hold')),
  constraint marketing_campaigner_config_test_domain_present check (length(btrim(test_domain)) > 0),
  constraint marketing_campaigner_config_cap_sane check (default_volume_cap between 1 and 1000000),
  constraint marketing_campaigner_config_unsubscribe_is_a_path check (unsubscribe_path ~ '^/')
);

comment on table public.marketing_campaigner_config is
  'GA4. The mode the campaigner runs in, the domain a test send may reach, the default per campaign volume cap and the path an unsubscribe link is built on. One row, read at runtime, so the reversal condition is an update rather than a deploy.';

insert into public.marketing_campaigner_config
  (id, mode, test_domain, default_volume_cap, unsubscribe_path)
values
  (true, 'test', 'eventlinqs.test', 500, '/marketing/preferences')
on conflict (id) do nothing;

alter table public.marketing_campaigner_config enable row level security;

create or replace function public.marketing_campaigner_default_cap()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select default_volume_cap from public.marketing_campaigner_config where id
$$;

comment on function public.marketing_campaigner_default_cap() is
  'GA4. The configured default volume cap, used as the default on a new campaign so the number is read rather than typed.';

-- ---------------------------------------------------------------------------
-- 2. THE TEMPLATES, AS ROWS.
--
-- GA4 acceptance 9 forbids a template key as a literal in code, which means the
-- BODY cannot be selected by a key written in a switch statement either. So a
-- template is a row: a key, a channel, a subject and a body, with one generic
-- renderer over them. Changing a message becomes a row change rather than a
-- deploy, which is the rule GA2 applied to its weights for the same reason.
--
-- The placeholders are deliberately few and every one of them is filled from a
-- fact the platform already holds. A template that could reference anything
-- would be a template nobody can check.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_template (
  key text primary key,
  channel_code text not null references public.marketing_channel(code),
  subject_template text not null,
  body_template text not null,
  created_at timestamptz not null default now(),
  constraint marketing_template_key_shape check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint marketing_template_body_present check (length(btrim(body_template)) > 0),
  -- An SMS has no subject. An email without one is a message nobody opens.
  constraint marketing_template_subject_matches_channel
    check ((channel_code = 'sms') = (length(btrim(subject_template)) = 0))
);

comment on table public.marketing_template is
  'GA4. One row per message shape. Rendered by one generic renderer, so no template key and no message body is ever a literal in application code.';

insert into public.marketing_template (key, channel_code, subject_template, body_template) values
  (
    'event_first_word',
    'email',
    '{{organiser_name}}: {{event_title}}',
    '{{opening_line}}' || chr(10) || chr(10) ||
      '{{event_title}} is on {{event_date}} at {{venue_name}}, {{venue_city}}.' || chr(10) || chr(10) ||
      'Tickets: {{tracked_link}}' || chr(10) || chr(10) ||
      '{{signature}}'
  ),
  (
    'event_last_call',
    'email',
    '{{event_title}} is {{days_remaining}} days away',
    '{{opening_line}}' || chr(10) || chr(10) ||
      '{{event_title}} is on {{event_date}} at {{venue_name}}, and there are still tickets.' || chr(10) || chr(10) ||
      'Tickets: {{tracked_link}}' || chr(10) || chr(10) ||
      '{{signature}}'
  ),
  (
    'event_last_call_sms',
    'sms',
    '',
    '{{organiser_name}}: {{event_title}}, {{event_date}}. Tickets {{tracked_link}}'
  )
on conflict (key) do nothing;

alter table public.marketing_template enable row level security;

-- ---------------------------------------------------------------------------
-- 3. THE SEQUENCE, AS CONFIGURATION.
--
-- Pacing is by DAYS REMAINING TO THE EVENT rather than by a calendar, because a
-- message about an event eleven days out and a message about an event two days
-- out are different messages, and a fixed calendar sends the wrong one to every
-- event that is not on the schedule the calendar was written for.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_sequence (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  is_active boolean not null default true,
  reference text not null,
  created_at timestamptz not null default now(),
  constraint marketing_sequence_name_present check (length(btrim(name)) > 0),
  constraint marketing_sequence_reference_unique unique (reference),
  constraint marketing_sequence_version_present check (length(btrim(version)) > 0)
);

comment on table public.marketing_sequence is
  'GA4. A named, versioned pacing sequence. The version travels onto nothing yet; it exists so a sequence can be changed without rewriting what a past campaign did.';

create table if not exists public.marketing_sequence_step (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.marketing_sequence(id) on delete cascade,
  step_order integer not null,
  channel_code text not null references public.marketing_channel(code),
  days_remaining_min integer not null,
  days_remaining_max integer not null,
  template_key text not null references public.marketing_template(key),
  min_hours_since_previous_send integer not null,
  constraint marketing_sequence_step_order_unique unique (sequence_id, step_order),
  constraint marketing_sequence_step_order_sane check (step_order >= 1),
  constraint marketing_sequence_step_bounds_ordered check (days_remaining_min <= days_remaining_max),
  constraint marketing_sequence_step_bounds_sane check (days_remaining_min >= 0 and days_remaining_max <= 3650),
  constraint marketing_sequence_step_gap_sane check (min_hours_since_previous_send between 0 and 8760)
);

comment on table public.marketing_sequence_step is
  'GA4. One step: which channel, which template, the days-remaining window that opens it, and the minimum hours since that recipient last heard from this campaign.';

create index if not exists marketing_sequence_step_sequence_idx
  on public.marketing_sequence_step (sequence_id, step_order);

alter table public.marketing_sequence enable row level security;
alter table public.marketing_sequence_step enable row level security;

do $$
declare
  v_sequence uuid;
begin
  select id into v_sequence from public.marketing_sequence where reference = 'eventlinqs-default-v1';
  if v_sequence is null then
    insert into public.marketing_sequence (name, version, reference)
    values ('EventLinqs default', 'v1', 'eventlinqs-default-v1')
    returning id into v_sequence;

    insert into public.marketing_sequence_step
      (sequence_id, step_order, channel_code, days_remaining_min, days_remaining_max, template_key, min_hours_since_previous_send)
    values
      -- Far out: the first word, while a person still has a free evening.
      (v_sequence, 1, 'email', 8, 45, 'event_first_word', 0),
      -- Close: the last call, and at least four days after the first word so a
      -- campaign cannot send twice in an afternoon to the same person.
      (v_sequence, 2, 'email', 2, 7, 'event_last_call', 96),
      -- The SMS step, which only ever reaches somebody whose consent covers SMS.
      (v_sequence, 3, 'sms', 1, 3, 'event_last_call_sms', 48);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. THE CAMPAIGN GAINS ITS CAP, ITS SEQUENCE AND ITS VOICE.
--
-- The opening line and the signature are the ORGANISER'S OWN WORDS. A message
-- that reads as platform marketing converts badly and damages the organiser's
-- relationship with their own buyers, so the template composes AROUND their
-- words rather than generating filler in their name.
-- ---------------------------------------------------------------------------
alter table public.marketing_campaign
  add column if not exists volume_cap integer not null default public.marketing_campaigner_default_cap(),
  add column if not exists sequence_id uuid references public.marketing_sequence(id),
  add column if not exists opening_line text,
  add column if not exists signature text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_campaign_volume_cap_sane'
  ) then
    alter table public.marketing_campaign
      add constraint marketing_campaign_volume_cap_sane check (volume_cap between 1 and 1000000);
  end if;
end
$$;

comment on column public.marketing_campaign.volume_cap is
  'GA4. The most sends this campaign may make on one channel. Enforced by trigger on marketing_send, not by the application.';
comment on column public.marketing_campaign.opening_line is
  'GA4. The organiser own opening line, supplied or approved by them. The template composes around it and never invents one.';

-- ---------------------------------------------------------------------------
-- 5. THE SENDER IDENTITY.
--
-- The Spam Act requires a message to identify its sender and to say how to
-- reach them. An unverified or missing identity refuses the send, at render
-- time and again at insert, because a message that cannot say who sent it is
-- the exact shape that has cost other Australian businesses millions.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_sender_identity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  from_name text not null,
  reply_to text not null,
  identity_line text not null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint marketing_sender_identity_from_present check (length(btrim(from_name)) > 0),
  constraint marketing_sender_identity_reply_to_is_an_address check (reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint marketing_sender_identity_line_present check (length(btrim(identity_line)) > 0)
);

comment on table public.marketing_sender_identity is
  'GA4. Who a campaign message is from, how to reply to them, and the business identity line the law requires. A send whose identity is missing or unverified is refused.';

create index if not exists marketing_sender_identity_org_idx
  on public.marketing_sender_identity (organisation_id) where is_verified;

alter table public.marketing_sender_identity enable row level security;

-- ---------------------------------------------------------------------------
-- 6. THE ALLOWLIST. Admission happens ONCE, from a match run.
--
-- The consent state and the scope are COPIED at admission, so the allowlist is
-- a record of what was true when somebody was admitted rather than a query that
-- re-answers itself later. The check constraint refusing consent_state false is
-- the point: there is no application path, and no future application path, that
-- can put somebody on this list without a consent.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_recipient_allowlist (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  audience_member_id uuid not null references public.audience_members(id) on delete cascade,
  channel_code text not null references public.marketing_channel(code),
  consent_state boolean not null,
  consent_channel_scope text not null,
  consent_at timestamptz not null,
  consent_wording_version text not null,
  match_run_id uuid references public.marketing_match_run(id) on delete set null,
  admitted_at timestamptz not null default now(),
  constraint marketing_recipient_allowlist_once
    unique (campaign_id, audience_member_id, channel_code),
  -- The mechanism a send row hangs off: it makes the campaign and the channel
  -- of an allowlist row part of the reference, so a send cannot borrow a row
  -- from another campaign or another channel.
  constraint marketing_recipient_allowlist_identity unique (id, campaign_id, channel_code),
  constraint marketing_recipient_allowlist_consent_must_be_true check (consent_state),
  constraint marketing_recipient_allowlist_scope_known
    check (consent_channel_scope in ('email', 'sms', 'both')),
  -- THE SMS RULE, IN SQL. A consent scoped to email does not admit anybody to
  -- an SMS list, and no application code is trusted with it.
  constraint marketing_recipient_allowlist_scope_covers_channel
    check (consent_channel_scope = 'both' or consent_channel_scope = channel_code),
  constraint marketing_recipient_allowlist_wording_present
    check (length(btrim(consent_wording_version)) > 0)
);

comment on table public.marketing_recipient_allowlist is
  'GA4. Who a campaign may send to, on which channel, with the consent state, scope, timestamp and wording version copied at admission and the match run it came from. A row whose consent is not true cannot exist, and neither can one whose consent scope does not cover its own channel.';

create index if not exists marketing_recipient_allowlist_campaign_idx
  on public.marketing_recipient_allowlist (campaign_id, channel_code);

alter table public.marketing_recipient_allowlist enable row level security;

-- ---------------------------------------------------------------------------
-- 7. THE APPROVAL GATE.
--
-- A person has to have SEEN this segment and this message before anything
-- leaves draft. The fingerprint is a hash of the match run, the channel and the
-- allowlist size, so a repeat send to the same segment does not re-ask and ANY
-- change to the segment does.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_send_approval (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  segment_fingerprint text not null,
  approver_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  approved_sample text not null,
  constraint marketing_send_approval_once unique (campaign_id, segment_fingerprint),
  constraint marketing_send_approval_fingerprint_shape check (segment_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marketing_send_approval_sample_present check (length(btrim(approved_sample)) > 0),
  constraint marketing_send_approval_names_its_approver check (approver_user_id is not null)
);

comment on table public.marketing_send_approval is
  'GA4. One row per campaign per segment fingerprint: who approved, when, and the exact rendered sample they were shown. Nothing leaves draft for a fingerprint that has no row here.';

alter table public.marketing_send_approval enable row level security;

-- ---------------------------------------------------------------------------
-- 8. THE SEND.
--
-- `allowlist_id` is NOT NULL and the foreign key is COMPOSITE, so a send row
-- for somebody who is not on the allowlist for that campaign and that channel
-- cannot be inserted: the reference does not exist. That is the mechanism, and
-- it is why the test for it asserts a database error rather than an application
-- exception.
--
-- The rendered subject and body are stored VERBATIM AS SENT. A message
-- regenerated from a template six months later is not the message anybody
-- received, and the one thing a complaint needs is what actually arrived.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_send (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  allowlist_id uuid not null,
  channel_code text not null references public.marketing_channel(code),
  sequence_step_id uuid references public.marketing_sequence_step(id) on delete set null,
  template_key text not null references public.marketing_template(key),
  link_code text references public.marketing_link(code) on delete set null,
  sender_identity_id uuid not null references public.marketing_sender_identity(id),
  segment_fingerprint text not null,
  rendered_subject text not null,
  rendered_body text not null,
  -- THE HTML IS STORED TOO, and it is not redundant with the body. What a
  -- person receives in an email client is the html; the body is the plain text
  -- alternative. Storing only one would mean a draft approved today and
  -- dispatched tomorrow went out with an empty html part, or was re-rendered at
  -- dispatch and differed from the message on the approval row. An SMS has none
  -- and stores an empty string.
  rendered_html text not null default '',
  unsubscribe_token uuid not null,
  destination text not null,
  state text not null default 'draft',
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  constraint marketing_send_state_known
    check (state in ('draft', 'queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped')),
  constraint marketing_send_body_present check (length(btrim(rendered_body)) > 0),
  constraint marketing_send_destination_present check (length(btrim(destination)) > 0),
  constraint marketing_send_fingerprint_shape check (segment_fingerprint ~ '^[0-9a-f]{64}$'),
  -- An SMS has no subject; an email that left without one did not render.
  constraint marketing_send_subject_matches_channel
    check ((channel_code = 'sms') = (length(btrim(rendered_subject)) = 0)),
  constraint marketing_send_html_matches_channel
    check ((channel_code = 'sms') = (length(btrim(rendered_html)) = 0)),
  -- THE ALLOWLIST MECHANISM. Composite, so the row must belong to THIS campaign
  -- and THIS channel.
  constraint marketing_send_recipient_is_allowlisted
    foreign key (allowlist_id, campaign_id, channel_code)
    references public.marketing_recipient_allowlist (id, campaign_id, channel_code),
  -- ONE SEND PER PERSON PER STEP. It makes a re-run idempotent rather than
  -- additive, and it is the database half of the pacing rule that a recipient
  -- does not get the same step twice. Without it a runner invoked twice in an
  -- afternoon writes a second draft for everybody and eats the cap doing it.
  constraint marketing_send_once_per_recipient_per_step unique (allowlist_id, sequence_step_id)
);

comment on table public.marketing_send is
  'GA4. One row per message. It cannot exist without an allowlist row for the same campaign and channel, without a sender identity, or beyond the campaign volume cap, and it stores what was actually sent rather than what a template would render today.';

create index if not exists marketing_send_campaign_channel_idx
  on public.marketing_send (campaign_id, channel_code);
create index if not exists marketing_send_allowlist_idx
  on public.marketing_send (allowlist_id);
create index if not exists marketing_send_state_idx
  on public.marketing_send (state);

alter table public.marketing_send enable row level security;

-- ---------------------------------------------------------------------------
-- 9. THE VOLUME CAP, ENFORCED BY THE DATABASE.
--
-- Counting inside a BEFORE INSERT trigger and taking a row lock on the campaign
-- first, so two dispatchers running at once cannot both read 499 and both
-- insert. Without the lock this is a check that passes under test and fails
-- under load, which is the worst kind.
-- ---------------------------------------------------------------------------
create or replace function public.marketing_send_respects_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cap integer;
  v_used integer;
  v_reference text;
begin
  select volume_cap, reference into v_cap, v_reference
    from public.marketing_campaign
   where id = new.campaign_id
   for update;

  if v_cap is null then
    raise exception 'marketing_send refers to campaign % which does not exist', new.campaign_id;
  end if;

  select count(*) into v_used
    from public.marketing_send s
   where s.campaign_id = new.campaign_id
     and s.channel_code = new.channel_code;

  if v_used >= v_cap then
    raise exception
      'campaign % has reached its volume cap of % on the % channel; % send row(s) already exist',
      v_reference, v_cap, new.channel_code, v_used
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.marketing_send_respects_cap() is
  'GA4. The per campaign per channel volume cap, counted and enforced in the database, with the campaign reference and the cap in the error so a refusal names what it refused.';

drop trigger if exists trg_marketing_send_respects_cap on public.marketing_send;
create trigger trg_marketing_send_respects_cap
  before insert on public.marketing_send
  for each row execute function public.marketing_send_respects_cap();

-- ---------------------------------------------------------------------------
-- 10. NOTHING LEAVES DRAFT WITHOUT AN APPROVAL FOR ITS OWN FINGERPRINT.
-- ---------------------------------------------------------------------------
create or replace function public.marketing_send_requires_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reference text;
begin
  if new.state = 'draft' then
    return new;
  end if;
  if exists (
    select 1 from public.marketing_send_approval a
     where a.campaign_id = new.campaign_id
       and a.segment_fingerprint = new.segment_fingerprint
  ) then
    return new;
  end if;
  select reference into v_reference from public.marketing_campaign where id = new.campaign_id;
  raise exception
    'campaign % has no approval for segment fingerprint %, so no send may leave draft',
    coalesce(v_reference, new.campaign_id::text), new.segment_fingerprint
    using errcode = 'check_violation';
end;
$$;

comment on function public.marketing_send_requires_approval() is
  'GA4. A send may sit in draft unapproved, and may not move out of it. The approval is per campaign per segment fingerprint, so a repeat send to the same segment does not re-ask and any change to the segment does.';

drop trigger if exists trg_marketing_send_requires_approval on public.marketing_send;
create trigger trg_marketing_send_requires_approval
  before insert or update on public.marketing_send
  for each row execute function public.marketing_send_requires_approval();

-- ---------------------------------------------------------------------------
-- 11. A SENDER IDENTITY THAT IS NOT VERIFIED SENDS NOTHING.
-- ---------------------------------------------------------------------------
create or replace function public.marketing_send_identity_is_verified()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verified boolean;
begin
  select is_verified into v_verified
    from public.marketing_sender_identity
   where id = new.sender_identity_id;
  if v_verified is not true then
    raise exception
      'sender identity % is not verified, so no message may be sent from it',
      new.sender_identity_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marketing_send_identity_is_verified on public.marketing_send;
create trigger trg_marketing_send_identity_is_verified
  before insert on public.marketing_send
  for each row execute function public.marketing_send_identity_is_verified();

-- ---------------------------------------------------------------------------
-- 11b. THE SKIPS, RECORDED RATHER THAN INFERRED.
--
-- "This person was not sent anything" is not an answer. "This person was not
-- sent anything because they withdrew on the eleventh" is, and it is the answer
-- a complaint needs. A skip is NOT a send row in a skipped state: a send row
-- counts against the cap and asserts a rendered message exists, and neither is
-- true of somebody the door refused.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_send_skip (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  allowlist_id uuid not null references public.marketing_recipient_allowlist(id) on delete cascade,
  sequence_step_id uuid references public.marketing_sequence_step(id) on delete set null,
  channel_code text not null references public.marketing_channel(code),
  reason text not null,
  detail text,
  occurred_at timestamptz not null default now(),
  constraint marketing_send_skip_reason_present check (length(btrim(reason)) > 0)
);

comment on table public.marketing_send_skip is
  'GA4. One row per person a run decided not to message, with the reason. The consent door refusing somebody is recorded here, so the next run can say why they heard nothing rather than leaving a silence.';

create index if not exists marketing_send_skip_campaign_idx
  on public.marketing_send_skip (campaign_id, occurred_at desc);

alter table public.marketing_send_skip enable row level security;

-- ---------------------------------------------------------------------------
-- 12. THE INVARIANT, DEFINED IN SQL SO THE GUARD AND A PERSON READ ONE THING.
-- ---------------------------------------------------------------------------
create or replace view public.marketing_send_invariant_breaches as
  select
    'send to somebody not on the allowlist' as breach,
    s.id as send_id,
    c.reference as campaign_reference,
    'send ' || s.id::text || ' on campaign ' || c.reference ||
      ' has no allowlist row for its own campaign and channel.' as detail
  from public.marketing_send s
  join public.marketing_campaign c on c.id = s.campaign_id
  where not exists (
    select 1 from public.marketing_recipient_allowlist a
     where a.id = s.allowlist_id
       and a.campaign_id = s.campaign_id
       and a.channel_code = s.channel_code
  )

  union all

  select
    'send to somebody whose consent is not true' as breach,
    s.id,
    c.reference,
    'send ' || s.id::text || ' on campaign ' || c.reference ||
      ' rests on an allowlist row whose consent state is not true.'
  from public.marketing_send s
  join public.marketing_campaign c on c.id = s.campaign_id
  join public.marketing_recipient_allowlist a on a.id = s.allowlist_id
  where a.consent_state is not true

  union all

  select
    'sms send without sms consent' as breach,
    s.id,
    c.reference,
    'send ' || s.id::text || ' on campaign ' || c.reference ||
      ' is an SMS resting on a consent scoped to ' || a.consent_channel_scope || '.'
  from public.marketing_send s
  join public.marketing_campaign c on c.id = s.campaign_id
  join public.marketing_recipient_allowlist a on a.id = s.allowlist_id
  where s.channel_code = 'sms'
    and a.consent_channel_scope not in ('sms', 'both')

  union all

  select
    'campaign over its volume cap' as breach,
    null::uuid,
    c.reference,
    'campaign ' || c.reference || ' holds ' || counted.used::text ||
      ' send row(s) on the ' || counted.channel_code || ' channel against a cap of ' || c.volume_cap::text || '.'
  from public.marketing_campaign c
  join (
    select campaign_id, channel_code, count(*) as used
      from public.marketing_send
     group by campaign_id, channel_code
  ) counted on counted.campaign_id = c.id
  where counted.used > c.volume_cap

  union all

  select
    'send out of draft with no approval' as breach,
    s.id,
    c.reference,
    'send ' || s.id::text || ' on campaign ' || c.reference ||
      ' is in state ' || s.state || ' with no approval for its segment fingerprint.'
  from public.marketing_send s
  join public.marketing_campaign c on c.id = s.campaign_id
  where s.state <> 'draft'
    and not exists (
      select 1 from public.marketing_send_approval ap
       where ap.campaign_id = s.campaign_id
         and ap.segment_fingerprint = s.segment_fingerprint
    );

comment on view public.marketing_send_invariant_breaches is
  'GA4. Empty when the campaigner is sound. One row per breach, naming the campaign reference a person can look up.';

commit;
