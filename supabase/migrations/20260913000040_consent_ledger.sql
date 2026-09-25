-- ===========================================================================
-- GA1 v3. THE CONSENT LEDGER: MULTI TENANT, APPEND ONLY, WITH ONE RESOLVER.
--
-- Consent is not data. It is EVIDENCE of what a specific person was shown and
-- agreed to at a specific moment. A consent record cannot be re keyed to a new
-- tenant, its scope cannot be widened afterwards, and ten thousand people who
-- have bought their tickets and gone home cannot be asked again. So the tenant,
-- the purpose, the channel, the verbatim wording, the wording version and the
-- suppression scope are written on the FIRST record, in week one, because by
-- the week the second tenant arrives it is already too late.
--
-- WHAT THIS FILE ADDS, and why each piece exists:
--
--   marketing_tenants     whose marketing a consent belongs to. EventLinqs is
--                         tenant one, seeded here. A future Fullproof AI client
--                         is its own tenant, which is why the column exists now.
--   consent_purposes      the purposes, what each one covers, and whether it
--                         facilitates another organisation's marketing. Read by
--                         the resolver, never a literal in a query.
--   consent_wordings      the versioned wording record. The checkout renders
--                         from it; the privacy page reads the same row. Update
--                         and delete are refused, so a change is a NEW VERSION
--                         and a past consent can always be produced as given.
--   consent_policy        the ageing threshold, seeded at twenty four months,
--                         as configuration rather than a literal.
--   consent_events        append only. Every grant, withdrawal and decline.
--   suppression_events    append only. A suppression is a fact that arrived,
--                         not a flag that gets toggled.
--   consent_permits()     the database's resolver: may this tenant send to this
--                         person on this channel for this purpose, and which
--                         ledger event decided it.
--
-- THE PROJECTION, stated plainly because it is the one thing that could be
-- mistaken for a second source of truth. public.marketing_consents keeps the
-- CURRENT state and the unsubscribe token already circulating in inboxes. It is
-- now DERIVED: a trigger on consent_events writes it, and no application code
-- writes it directly any more. The ledger is the truth; that table is a view of
-- it that happens to be materialised, exactly as audience_members is.
--
-- NOTHING SENDS. This migration creates no sender, no queue and no schedule.
--
-- Additive and reversible: drop the six new tables, the functions and the
-- triggers, and public.marketing_consents is left exactly as it is today.
-- TEST database only, applied with `supabase db push --linked` from PowerShell.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE TENANTS. EventLinqs is tenant one.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_platform boolean not null default false,
  created_at timestamptz not null default now(),
  constraint marketing_tenants_slug_present check (length(btrim(slug)) > 0),
  constraint marketing_tenants_name_present check (length(btrim(name)) > 0)
);

comment on table public.marketing_tenants is
  'GA1. Whose marketing a consent record belongs to. A consent is evidence for ONE tenant and can never be re keyed to another, which is why every ledger row carries this from the first record rather than from week ten.';

insert into public.marketing_tenants (slug, name, is_platform)
values ('eventlinqs', 'EventLinqs', true)
on conflict (slug) do nothing;

alter table public.marketing_tenants enable row level security;
-- No policy: the ledger and its tenants are service role only.

-- ---------------------------------------------------------------------------
-- 2. THE PURPOSES, AND WHAT EACH ONE COVERS.
--
-- A broad consent covers a narrower purpose inside it; a narrow one never
-- widens into the broad one. That is the whole reason the column exists: the
-- consents backfilled from the old wording promised the EventLinqs weekly
-- digest and NOT another organiser's marketing, so they must never authorise
-- the facilitated send. Scope is set at capture and is never inferred later.
-- ---------------------------------------------------------------------------
create table if not exists public.consent_purposes (
  purpose text primary key,
  name text not null,
  covers text[] not null default '{}',
  facilitates_third_parties boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.consent_purposes is
  'GA1. The marketing purposes a consent can be given for, what each covers, and whether it facilitates another organisation marketing. The resolver reads this table; no query names a purpose as a literal. Held equal to src/lib/consent/purposes.ts by a registered blocking guard.';

insert into public.consent_purposes (purpose, name, covers, facilitates_third_parties) values
  ('facilitated_event_marketing',
   'Marketing about events run by other organisers who sell tickets on EventLinqs',
   array['platform_local_digest'],
   true),
  ('platform_local_digest',
   'The weekly local digest of events in a city',
   array[]::text[],
   true)
on conflict (purpose) do update
  set name = excluded.name,
      covers = excluded.covers,
      facilitates_third_parties = excluded.facilitates_third_parties;

alter table public.consent_purposes enable row level security;

-- ---------------------------------------------------------------------------
-- 3. THE WORDING RECORD. VERSIONED, AND IMMUTABLE ONCE WRITTEN.
--
-- The checkout renders the label and the body from here, so the string a buyer
-- reads is the string recorded as evidence, and the privacy page reads the same
-- row so the two can never disagree. Update and delete are refused below: a
-- change to the wording is a new version, never an edit, because a past consent
-- has to be producible exactly as it was given.
-- ---------------------------------------------------------------------------
create table if not exists public.consent_wordings (
  id uuid primary key default gen_random_uuid(),
  purpose text not null references public.consent_purposes(purpose),
  version text not null,
  label text not null,
  body text not null,
  channel_scope text not null,
  third_party_scope text not null,
  suppression_scope text not null,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint consent_wordings_version_unique unique (purpose, version),
  constraint consent_wordings_label_present check (length(btrim(label)) > 0),
  constraint consent_wordings_body_present check (length(btrim(body)) > 0),
  constraint consent_wordings_version_present check (length(btrim(version)) > 0),
  constraint consent_wordings_channel_known check (channel_scope in ('email', 'sms', 'both'))
);

comment on table public.consent_wordings is
  'GA1. The versioned wording a consent was given under. Immutable: a change is a new version, so the exact words a person agreed to can always be produced.';

-- Version one, exactly as written in the item. ACMA expects consent terms to
-- name who will use the consent including partners, to say how long it is
-- relied on, and to avoid bundling purposes; the paragraph does all three.
insert into public.consent_wordings
  (purpose, version, label, body, channel_scope, third_party_scope, suppression_scope, effective_from)
values (
  'facilitated_event_marketing',
  'v1',
  'Yes, email and text me about other events near me.',
  'EventLinqs will send you marketing about events run by other organisers who sell tickets on EventLinqs, by email and SMS, chosen by city and by the kinds of events you have bought before. Your name, email and mobile are not given to those organisers. EventLinqs uses Fullproof AI as its service provider to send these messages on its behalf. Every message says it is from EventLinqs and has a one click unsubscribe that stops all of them, free, within five working days. You can also ask us where we got your details. We will keep a record of this wording, the date and the time. We do not sell your details and we do not buy lists.',
  'both',
  'events ticketed on EventLinqs, marketed by EventLinqs as the sender',
  'every EventLinqs facilitated message on every channel',
  '2026-09-13T00:00:00Z'
)
on conflict (purpose, version) do nothing;

alter table public.consent_wordings enable row level security;

-- ---------------------------------------------------------------------------
-- 4. THE AGEING THRESHOLD, AS CONFIGURATION.
--
-- A consent a person would no longer expect to apply is not a consent worth
-- relying on, so one older than the threshold is refused until a fresh grant is
-- recorded. Twenty four months is the seed, and it is a row rather than a
-- literal so it can move without a deploy.
-- ---------------------------------------------------------------------------
create table if not exists public.consent_policy (
  id boolean primary key default true,
  max_age_months integer not null default 24,
  updated_at timestamptz not null default now(),
  constraint consent_policy_single_row check (id),
  constraint consent_policy_age_sane check (max_age_months between 1 and 120)
);

comment on table public.consent_policy is
  'GA1. One row. The age past which the resolver refuses a consent until it is granted again. Configuration, never a literal in a query.';

insert into public.consent_policy (id, max_age_months) values (true, 24)
on conflict (id) do nothing;

alter table public.consent_policy enable row level security;

-- ---------------------------------------------------------------------------
-- 5. THE CONSENT LEDGER. APPEND ONLY.
-- ---------------------------------------------------------------------------
create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.marketing_tenants(id),
  subject_email text not null,
  subject_mobile_hash text,
  purpose text not null references public.consent_purposes(purpose),
  channel_scope text not null,
  decision text not null,
  wording text not null,
  wording_version text not null,
  capture_surface text not null,
  third_party_scope text not null,
  suppression_scope text not null,
  -- The digest selects by city, so a consent with no city is in no send list at
  -- all. The city is captured with the consent for that reason and no other.
  city_slug text references public.cities(slug),
  occurred_at timestamptz not null default now(),
  ip_or_session_ref text,
  created_at timestamptz not null default now(),

  constraint consent_events_email_present check (length(btrim(subject_email)) > 0),
  constraint consent_events_email_normalised check (subject_email = lower(subject_email)),
  constraint consent_events_channel_known check (channel_scope in ('email', 'sms', 'both')),
  constraint consent_events_decision_known check (decision in ('granted', 'withdrawn', 'declined')),
  constraint consent_events_wording_present check (length(btrim(wording)) > 0),
  constraint consent_events_wording_version_present check (length(btrim(wording_version)) > 0),
  constraint consent_events_capture_surface_present check (length(btrim(capture_surface)) > 0),
  constraint consent_events_third_party_scope_present check (length(btrim(third_party_scope)) > 0),
  constraint consent_events_suppression_scope_present check (length(btrim(suppression_scope)) > 0)
);

comment on table public.consent_events is
  'GA1. Append only. Every grant, withdrawal and decline, with the tenant, the purpose, the channel scope, the verbatim wording, the wording version, the capture surface and both scopes. Update and delete are refused by the database. The current state of any person is the LATEST event for that tenant, purpose and subject.';
comment on column public.consent_events.subject_mobile_hash is
  'SHA-256 of the normalised mobile number, used to match a person across records without storing the number. It is a matching key and NOT a secret: the number space is small enough to search, so this is deliberately not offered as a security control.';
comment on column public.consent_events.suppression_scope is
  'What a withdrawal of THIS consent stops, declared at capture and never inferred later. It is the column that keeps one unsubscribe from destroying a future client own separately collected list.';

alter table public.consent_events enable row level security;

-- ---------------------------------------------------------------------------
-- 6. THE SUPPRESSION LEDGER. APPEND ONLY, KEYED THE SAME WAY.
-- ---------------------------------------------------------------------------
create table if not exists public.suppression_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.marketing_tenants(id),
  subject_email text not null,
  subject_mobile_hash text,
  channel text not null,
  scope text not null,
  reason text not null,
  request_source text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint suppression_events_email_present check (length(btrim(subject_email)) > 0),
  constraint suppression_events_email_normalised check (subject_email = lower(subject_email)),
  constraint suppression_events_channel_known check (channel in ('email', 'sms', 'both')),
  constraint suppression_events_scope_known
    check (scope in ('all_marketing', 'facilitation_by_others', 'tenant_own')),
  constraint suppression_events_reason_present check (length(btrim(reason)) > 0),
  constraint suppression_events_request_source_present check (length(btrim(request_source)) > 0)
);

comment on table public.suppression_events is
  'GA1. Append only. A suppression is a fact that arrived, never a flag that gets toggled. scope all_marketing is an unsubscribe; facilitation_by_others is the APP 7.6 right to ask that information is not used to facilitate direct marketing by other organisations; tenant_own is a client suppressing their own list only.';

alter table public.suppression_events enable row level security;

-- ---------------------------------------------------------------------------
-- 7. APPEND ONLY IS ENFORCED BY THE DATABASE, NOT BY APPLICATION LOGIC.
--
-- Statement level, so an UPDATE or DELETE is refused even when it would have
-- matched no rows, and TRUNCATE with it. Application code cannot get around
-- this, a backfill script cannot, and neither can a hand run statement.
-- ---------------------------------------------------------------------------
create or replace function public.refuse_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'append only: % on public.% is refused. A consent record is evidence of what a person was shown and agreed to, so it is never altered and never removed; record a new event instead.',
    tg_op, tg_table_name
    using errcode = '42501';
end;
$$;

comment on function public.refuse_ledger_mutation() is
  'GA1. Refuses UPDATE, DELETE and TRUNCATE on the consent and suppression ledgers and on the wording record.';

drop trigger if exists trg_consent_events_no_update on public.consent_events;
create trigger trg_consent_events_no_update
  before update on public.consent_events
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_consent_events_no_delete on public.consent_events;
create trigger trg_consent_events_no_delete
  before delete on public.consent_events
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_consent_events_no_truncate on public.consent_events;
create trigger trg_consent_events_no_truncate
  before truncate on public.consent_events
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_suppression_events_no_update on public.suppression_events;
create trigger trg_suppression_events_no_update
  before update on public.suppression_events
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_suppression_events_no_delete on public.suppression_events;
create trigger trg_suppression_events_no_delete
  before delete on public.suppression_events
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_suppression_events_no_truncate on public.suppression_events;
create trigger trg_suppression_events_no_truncate
  before truncate on public.suppression_events
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_consent_wordings_no_update on public.consent_wordings;
create trigger trg_consent_wordings_no_update
  before update on public.consent_wordings
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_consent_wordings_no_delete on public.consent_wordings;
create trigger trg_consent_wordings_no_delete
  before delete on public.consent_wordings
  for each statement execute function public.refuse_ledger_mutation();

-- ---------------------------------------------------------------------------
-- 8. THE RESOLVER, IN SQL.
--
-- It answers one question: may this tenant send to this person, on this
-- channel, for this purpose, and WHICH ledger event decided it. The database
-- needs its own copy because a trigger cannot call TypeScript, and the audience
-- asset is maintained by a trigger so that a paid order (confirmed minutes
-- later on the Stripe webhook, which is another lane's code) is covered by the
-- same path as a free one. src/lib/consent/decide.ts carries the same rules for
-- the send path, where they are exhaustively unit tested; the drive proves the
-- two agree across a matrix rather than asserting it.
-- ---------------------------------------------------------------------------
create or replace function public.consent_permits(
  p_tenant_slug text,
  p_email text,
  p_channel text,
  p_purpose text,
  p_now timestamptz default now()
) returns table (permitted boolean, reason text, deciding_event_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_tenant uuid;
  v_covering text[];
  v_event public.consent_events%rowtype;
  v_max_age integer;
  v_suppression public.suppression_events%rowtype;
  v_facilitates boolean;
begin
  if v_email = '' then
    return query select false, 'no subject address was supplied', null::uuid;
    return;
  end if;

  select t.id into v_tenant from public.marketing_tenants t where t.slug = p_tenant_slug;
  if v_tenant is null then
    return query select false, format('unknown tenant %s', p_tenant_slug), null::uuid;
    return;
  end if;

  -- The requested purpose, plus every purpose that COVERS it. A broad consent
  -- authorises the narrower purpose inside it; a narrow one never widens.
  select coalesce(array_agg(cp.purpose), '{}')
    into v_covering
    from public.consent_purposes cp
   where cp.purpose = p_purpose
      or p_purpose = any (cp.covers);

  if coalesce(array_length(v_covering, 1), 0) = 0 then
    return query select false, format('unknown purpose %s', p_purpose), null::uuid;
    return;
  end if;

  select * into v_event
    from public.consent_events ce
   where ce.tenant_id = v_tenant
     and ce.subject_email = v_email
     and ce.purpose = any (v_covering)
   order by ce.occurred_at desc, ce.id desc
   limit 1;

  if not found then
    return query select false, 'no consent event is recorded for this tenant, purpose and subject', null::uuid;
    return;
  end if;

  if v_event.decision <> 'granted' then
    return query select false,
      format('the latest consent event is %s', v_event.decision), v_event.id;
    return;
  end if;

  if v_event.channel_scope <> 'both' and v_event.channel_scope <> p_channel then
    return query select false,
      format('the consent covers %s and the message is %s', v_event.channel_scope, p_channel), v_event.id;
    return;
  end if;

  select cp.max_age_months into v_max_age from public.consent_policy cp where cp.id;
  v_max_age := coalesce(v_max_age, 24);

  if v_event.occurred_at < (p_now - make_interval(months => v_max_age)) then
    return query select false,
      format('the consent is older than the %s month threshold and needs granting again', v_max_age),
      v_event.id;
    return;
  end if;

  select cp.facilitates_third_parties into v_facilitates
    from public.consent_purposes cp where cp.purpose = p_purpose;

  select * into v_suppression
    from public.suppression_events se
   where se.tenant_id = v_tenant
     and se.subject_email = v_email
     and (se.channel = 'both' or se.channel = p_channel)
     and se.occurred_at >= v_event.occurred_at
     and (
       se.scope = 'all_marketing'
       or (se.scope = 'facilitation_by_others' and coalesce(v_facilitates, false))
     )
   order by se.occurred_at desc, se.id desc
   limit 1;

  if found then
    return query select false,
      format('a %s suppression recorded on %s stops this message',
             v_suppression.scope, to_char(v_suppression.occurred_at, 'YYYY-MM-DD')),
      v_event.id;
    return;
  end if;

  return query select true,
    format('granted on %s under wording %s', to_char(v_event.occurred_at, 'YYYY-MM-DD'), v_event.wording_version),
    v_event.id;
end;
$$;

comment on function public.consent_permits(text, text, text, text, timestamptz) is
  'GA1. The database resolver: may this tenant send to this subject on this channel for this purpose, and which ledger event decided it.';

-- ---------------------------------------------------------------------------
-- 9. THE PROJECTION. public.marketing_consents IS NOW DERIVED FROM THE LEDGER.
--
-- That table holds the CURRENT state and the unsubscribe token already printed
-- in people inboxes, and the weekly digest and the audience asset both read it.
-- Rather than have two places record the same decision, the ledger writes it:
-- application code inserts a consent event and this trigger keeps the current
-- state in step. The token is never overwritten, so every link in circulation
-- keeps working.
-- ---------------------------------------------------------------------------
create or replace function public.consent_project_current_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_platform boolean;
begin
  select t.is_platform into v_is_platform
    from public.marketing_tenants t where t.id = new.tenant_id;

  -- Only the platform tenant projects into the platform current-state table. A
  -- future client tenant keeps its own audience and never touches this one.
  if not coalesce(v_is_platform, false) then return new; end if;

  if new.decision = 'granted' then
    insert into public.marketing_consents
      (email, user_id, city_slug, status, consent_text, consent_version, source,
       granted_at, revoked_at, revoked_source, declined_at, updated_at)
    values
      (new.subject_email, null, new.city_slug, 'granted', new.wording, new.wording_version,
       new.capture_surface, new.occurred_at, null, null, null, new.occurred_at)
    on conflict (email) do update set
      city_slug       = coalesce(excluded.city_slug, public.marketing_consents.city_slug),
      status          = 'granted',
      consent_text    = excluded.consent_text,
      consent_version = excluded.consent_version,
      source          = excluded.source,
      granted_at      = excluded.granted_at,
      revoked_at      = null,
      revoked_source  = null,
      declined_at     = null,
      updated_at      = excluded.updated_at;

  elsif new.decision = 'withdrawn' then
    insert into public.marketing_consents
      (email, city_slug, status, consent_text, consent_version, source,
       granted_at, revoked_at, revoked_source, updated_at)
    values
      (new.subject_email, new.city_slug, 'withdrawn', new.wording, new.wording_version,
       new.capture_surface, new.occurred_at, new.occurred_at, new.capture_surface, new.occurred_at)
    on conflict (email) do update set
      status         = 'withdrawn',
      revoked_at     = new.occurred_at,
      revoked_source = new.capture_surface,
      updated_at     = new.occurred_at;

  else
    -- A DECLINE CAN NEVER REVOKE A CONSENT. A returning buyer who leaves the
    -- box unticked has not withdrawn anything, so the decline is recorded only
    -- where the address is unknown to the current-state table.
    insert into public.marketing_consents
      (email, city_slug, status, consent_text, consent_version, source,
       granted_at, declined_at, updated_at)
    values
      (new.subject_email, new.city_slug, 'declined', new.wording, new.wording_version,
       new.capture_surface, null, new.occurred_at, new.occurred_at)
    on conflict (email) do nothing;
  end if;

  return new;
exception when others then
  -- The ledger entry is the evidence and must stand even if the projection
  -- cannot be written. A failure here is loud in the logs and silent to the
  -- buyer, whose consent record is already safely in the ledger.
  raise warning 'consent_project_current_state(%) failed: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_consent_events_project on public.consent_events;
create trigger trg_consent_events_project
  after insert on public.consent_events
  for each row execute function public.consent_project_current_state();

-- ---------------------------------------------------------------------------
-- 10. THE BACKFILL. EVERY EXISTING CONSENT BECOMES EVIDENCE, AT ITS OWN SCOPE.
--
-- The old wording promised the EventLinqs weekly local digest. It did NOT
-- authorise marketing another organiser event, so these rows are backfilled
-- against platform_local_digest and not against the facilitated purpose. That
-- is the whole point of the scope columns: an existing consent is carried
-- forward at the scope it was actually given, and is never widened by a
-- migration. Their own wording and version ride across verbatim.
-- ---------------------------------------------------------------------------
insert into public.consent_events (
  tenant_id, subject_email, purpose, channel_scope, decision,
  wording, wording_version, capture_surface, third_party_scope, suppression_scope,
  city_slug, occurred_at
)
select
  t.id,
  lower(btrim(mc.email)),
  'platform_local_digest',
  'email',
  mc.status,
  mc.consent_text,
  mc.consent_version,
  concat('migrated:', mc.source),
  'EventLinqs own weekly local digest only, not another organiser marketing',
  'every EventLinqs facilitated message on every channel',
  mc.city_slug,
  coalesce(mc.revoked_at, mc.declined_at, mc.granted_at, mc.updated_at)
  from public.marketing_consents mc
 cross join (select id from public.marketing_tenants where slug = 'eventlinqs') t
 where mc.status in ('granted', 'withdrawn', 'declined')
   and length(btrim(coalesce(mc.consent_text, ''))) > 0
   and not exists (
     select 1 from public.consent_events ce
      where ce.subject_email = lower(btrim(mc.email))
        and ce.capture_surface like 'migrated:%'
   );

-- A withdrawn row is also a suppression fact, and the suppression ledger is
-- what the resolver reads. Carried across so an unsubscribe from before this
-- migration keeps stopping mail afterwards.
insert into public.suppression_events (
  tenant_id, subject_email, channel, scope, reason, request_source, occurred_at
)
select
  t.id,
  lower(btrim(mc.email)),
  'both',
  'all_marketing',
  'withdrawn before the consent ledger existed',
  concat('migrated:', coalesce(mc.revoked_source, 'unknown')),
  coalesce(mc.revoked_at, mc.updated_at)
  from public.marketing_consents mc
 cross join (select id from public.marketing_tenants where slug = 'eventlinqs') t
 where mc.status = 'withdrawn'
   and not exists (
     select 1 from public.suppression_events se
      where se.subject_email = lower(btrim(mc.email))
        and se.request_source like 'migrated:%'
   );

-- ---------------------------------------------------------------------------
-- 11. THE AUDIENCE READS THE LEDGER, AND THE DATABASE REFUSES A ROW THE
--     RESOLVER REFUSES.
--
-- The refresh already composes the row from confirmed orders and consent; what
-- changes is where the consent comes from. It now asks the resolver, so the
-- audience can never contain a subject the send path would refuse, which is the
-- third clause of the GA1 guard made structural rather than checked.
-- ---------------------------------------------------------------------------
create or replace function public.audience_consent_is_live(p_email text)
returns table (permitted boolean, consent_at timestamptz, wording text, wording_version text, source text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_verdict record;
  v_event public.consent_events%rowtype;
begin
  select * into v_verdict
    from public.consent_permits('eventlinqs', v_email, 'email', 'platform_local_digest');

  if not coalesce(v_verdict.permitted, false) then
    return query select false, null::timestamptz, null::text, null::text, null::text;
    return;
  end if;

  select * into v_event from public.consent_events ce where ce.id = v_verdict.deciding_event_id;
  return query select true, v_event.occurred_at, v_event.wording, v_event.wording_version, v_event.capture_surface;
end;
$$;

comment on function public.audience_consent_is_live(text) is
  'GA1. Whether the resolver currently permits an EventLinqs marketing email to this address, with the deciding event evidence. The audience refresh and the audience insert guard both read it, so an audience row and a send decision can never disagree.';

create or replace function public.refresh_audience_member(p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_capture_enabled boolean;
  v_consent record;
  v_order_count integer;
  v_lifetime bigint;
  v_first_at timestamptz;
  v_last_at timestamptz;
  v_last_order_id uuid;
  v_last_event_id uuid;
  v_last_category text;
  v_last_city text;
  v_postcode text;
  v_unit_cents bigint;
  v_categories text[];
  v_cities text[];
  v_communities text[];
  v_display_name text;
  v_user_id uuid;
  v_utm_source text;
  v_utm_medium text;
  v_utm_campaign text;
  v_referrer text;
  v_device text;
begin
  if v_email = '' then return; end if;

  select * into v_consent from public.audience_consent_is_live(v_email);

  /*
   * A WITHDRAWAL ALWAYS TAKES EFFECT, EVEN WITH THE CAPTURE SWITCH OFF.
   *
   * The reversal switch stops the platform CREATING and enriching audience
   * rows. It is deliberately powerless to keep somebody in a marketing
   * audience after they asked to leave: that would be a feature flag
   * overriding the Spam Act, which is not a trade this platform makes. So the
   * removal below runs before the switch is consulted.
   */
  if not coalesce(v_consent.permitted, false) then
    delete from public.audience_members where email = v_email;
    return;
  end if;

  select ff.enabled into v_capture_enabled
    from public.feature_flags ff
   where ff.flag = 'audience_capture';
  if v_capture_enabled is false then return; end if;

  select
      count(*)::integer,
      coalesce(sum(o.total_cents), 0)::bigint,
      min(coalesce(o.confirmed_at, o.updated_at, o.created_at)),
      max(coalesce(o.confirmed_at, o.updated_at, o.created_at))
    into v_order_count, v_lifetime, v_first_at, v_last_at
    from public.orders o
    left join public.profiles p on p.id = o.user_id
   where o.status = 'confirmed'
     and lower(coalesce(o.guest_email, p.email, '')) = v_email;

  -- Consent without a purchase is not an audience member: this asset is
  -- PROVEN BUYERS, which is the whole reason it cannot be bought elsewhere.
  if coalesce(v_order_count, 0) = 0 then
    delete from public.audience_members where email = v_email;
    return;
  end if;

  select
      o.id, o.event_id, o.user_id,
      coalesce(o.guest_name, p.full_name, p.display_name),
      e.city_primary, e.venue_postal_code, ec.slug,
      case
        when o.subtotal_cents <= 0 then 0
        else (o.subtotal_cents / greatest(1, (
          select coalesce(sum(oi.quantity), 0)
            from public.order_items oi
           where oi.order_id = o.id
             and oi.item_type <> 'addon'
        )))::bigint
      end
    into v_last_order_id, v_last_event_id, v_user_id, v_display_name,
         v_last_city, v_postcode, v_last_category, v_unit_cents
    from public.orders o
    left join public.profiles p on p.id = o.user_id
    left join public.events e on e.id = o.event_id
    left join public.event_categories ec on ec.id = e.category_id
   where o.status = 'confirmed'
     and lower(coalesce(o.guest_email, p.email, '')) = v_email
   order by coalesce(o.confirmed_at, o.updated_at, o.created_at) desc, o.id desc
   limit 1;

  select
      coalesce(array_agg(distinct x.category_slug) filter (where x.category_slug is not null), '{}'),
      coalesce(array_agg(distinct x.city_slug)     filter (where x.city_slug is not null), '{}')
    into v_categories, v_cities
    from (
      select ec.slug as category_slug, e.city_primary as city_slug
        from public.orders o
        left join public.profiles p on p.id = o.user_id
        left join public.events e on e.id = o.event_id
        left join public.event_categories ec on ec.id = e.category_id
       where o.status = 'confirmed'
         and lower(coalesce(o.guest_email, p.email, '')) = v_email
    ) x;

  /*
   * THE COMMUNITY VALUE, READ FROM THE DATABASE.
   *
   * events.community_primary first, because that is the organiser own answer
   * when they have given one. Otherwise the event tags are intersected with
   * public.community_tag_map, which is the platform own resolver made readable
   * by SQL. Nothing here names a community.
   */
  select coalesce(array_agg(distinct c.slug), '{}')
    into v_communities
    from (
      select e.community_primary, e.tags
        from public.orders o
        left join public.profiles p on p.id = o.user_id
        join public.events e on e.id = o.event_id
       where o.status = 'confirmed'
         and lower(coalesce(o.guest_email, p.email, '')) = v_email
    ) ev
    cross join lateral (
      select ev.community_primary as slug
       where ev.community_primary is not null
      union
      select m.community_slug
        from public.community_tag_map m
       where jsonb_typeof(ev.tags) = 'array'
         and exists (
           select 1
             from jsonb_array_elements_text(ev.tags) t(value)
            where t.value = any (m.tokens)
         )
    ) c;

  /*
   * WHERE THEY ARRIVED FROM. First touch, not last: the earliest demand row
   * for this address that knew anything. A row that knew nothing is not
   * allowed to overwrite one that did.
   */
  select le.utm_source, le.utm_medium, le.utm_campaign, le.referrer, le.device
    into v_utm_source, v_utm_medium, v_utm_campaign, v_referrer, v_device
    from public.ledger_entries le
   where le.kind = 'demand'
     and lower(coalesce(le.contact_email, '')) = v_email
     and (le.utm_source is not null or le.utm_medium is not null
          or le.utm_campaign is not null or le.referrer is not null
          or le.device is not null)
   order by le.occurred_at asc, le.id asc
   limit 1;

  insert into public.audience_members as am (
    email, user_id, display_name,
    consent_state, consent_channel, consent_at, consent_text, consent_version, consent_source,
    first_order_at, last_order_at, order_count, lifetime_spend_cents,
    last_order_id, last_event_id, last_category_slug, last_city_slug, postcode, price_band,
    category_slugs, community_slugs, city_slugs,
    arrival_utm_source, arrival_utm_medium, arrival_utm_campaign,
    arrival_referrer_host, arrival_device,
    refreshed_at
  ) values (
    v_email, v_user_id, v_display_name,
    true, 'email', v_consent.consent_at,
    v_consent.wording, v_consent.wording_version, v_consent.source,
    v_first_at, v_last_at, v_order_count, v_lifetime,
    v_last_order_id, v_last_event_id, v_last_category, v_last_city, v_postcode,
    public.audience_price_band(v_unit_cents),
    coalesce(v_categories, '{}'), coalesce(v_communities, '{}'), coalesce(v_cities, '{}'),
    v_utm_source, v_utm_medium, v_utm_campaign, v_referrer, v_device,
    now()
  )
  on conflict (email) do update set
    user_id              = excluded.user_id,
    display_name         = excluded.display_name,
    consent_at           = excluded.consent_at,
    consent_text         = excluded.consent_text,
    consent_version      = excluded.consent_version,
    consent_source       = excluded.consent_source,
    first_order_at       = excluded.first_order_at,
    last_order_at        = excluded.last_order_at,
    order_count          = excluded.order_count,
    lifetime_spend_cents = excluded.lifetime_spend_cents,
    last_order_id        = excluded.last_order_id,
    last_event_id        = excluded.last_event_id,
    last_category_slug   = excluded.last_category_slug,
    last_city_slug       = excluded.last_city_slug,
    postcode             = excluded.postcode,
    price_band           = excluded.price_band,
    category_slugs       = excluded.category_slugs,
    community_slugs      = excluded.community_slugs,
    city_slugs           = excluded.city_slugs,
    -- First touch is first touch: an arrival already recorded is never
    -- overwritten by a later, emptier one.
    arrival_utm_source    = coalesce(am.arrival_utm_source, excluded.arrival_utm_source),
    arrival_utm_medium    = coalesce(am.arrival_utm_medium, excluded.arrival_utm_medium),
    arrival_utm_campaign  = coalesce(am.arrival_utm_campaign, excluded.arrival_utm_campaign),
    arrival_referrer_host = coalesce(am.arrival_referrer_host, excluded.arrival_referrer_host),
    arrival_device        = coalesce(am.arrival_device, excluded.arrival_device),
    refreshed_at         = now();

exception when others then
  -- A marketing row is never worth somebody ticket.
  raise warning 'refresh_audience_member(%) failed: %', v_email, sqlerrm;
end;
$$;

-- The audience row is refused at the table for anybody the resolver refuses.
-- Guard clause three, enforced by the database rather than remembered by a
-- caller: a backfill, a hand run INSERT and a future refresh all meet it.
create or replace function public.audience_requires_live_consent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_permitted boolean;
begin
  select permitted into v_permitted from public.audience_consent_is_live(new.email);
  if not coalesce(v_permitted, false) then
    raise exception
      'audience_members refused for %: the consent resolver does not currently permit marketing to this address',
      new.email
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audience_requires_live_consent on public.audience_members;
create trigger trg_audience_requires_live_consent
  before insert or update on public.audience_members
  for each row execute function public.audience_requires_live_consent();

-- The ledger drives the audience directly, so a consent recorded with no order
-- yet, and an order that arrives later, both end in the right place.
create or replace function public.audience_on_consent_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_audience_member(new.subject_email);
  return new;
end;
$$;

drop trigger if exists trg_audience_on_consent_event on public.consent_events;
create trigger trg_audience_on_consent_event
  after insert on public.consent_events
  for each row execute function public.audience_on_consent_event();

create or replace function public.audience_on_suppression_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_audience_member(new.subject_email);
  return new;
end;
$$;

drop trigger if exists trg_audience_on_suppression_event on public.suppression_events;
create trigger trg_audience_on_suppression_event
  after insert on public.suppression_events
  for each row execute function public.audience_on_suppression_event();

commit;

-- ---------------------------------------------------------------------------
-- 12. THE INDEXES, DELIBERATELY AFTER THE COMMIT.
--
-- The Supabase CLI queues a migration statements into one implicit transaction,
-- but CREATE INDEX is pipeline incompatible: it flushes the batch so far, runs
-- alone, and starts a new one. Everything above is one batch and lands together
-- or not at all; the indexes run afterwards and every one is idempotent, so a
-- re-run repairs a partial apply.
-- ---------------------------------------------------------------------------
create index if not exists consent_events_subject_idx
  on public.consent_events (tenant_id, subject_email, purpose, occurred_at desc);
create index if not exists consent_events_occurred_idx
  on public.consent_events (occurred_at desc);
create index if not exists suppression_events_subject_idx
  on public.suppression_events (tenant_id, subject_email, occurred_at desc);
