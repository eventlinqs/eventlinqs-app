-- ============================================================
-- Performer Marketplace: Gig Board + Showcase layer (additive, reversible)
-- Flags gig_board and artist_showcase, both default OFF.
-- SPEC anchors: the Broadcast Layer artist entities are EXTENDED, never
-- duplicated. No money table is touched; booking never moves funds; the
-- payment engine is out of scope by construction.
-- Applied by: supabase db push --linked (TEST vkapkibzokmfaxqogypq).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Feature flags: two new stage switches, OFF by default.
-- ------------------------------------------------------------
insert into public.feature_flags (flag, enabled, description) values
  ('gig_board', false,
   'Performer marketplace stage A: organisers post gigs, performers apply with attributed draw data, structured booking requests close into event lineups.'),
  ('artist_showcase', false,
   'Performer marketplace stage B: bookable showcase profiles (types, embeds, availability, draw card) and the public performer directory.')
on conflict (flag) do nothing;

-- ------------------------------------------------------------
-- 2. artists: showcase columns (additive; every column has a safe default)
-- ------------------------------------------------------------
alter table public.artists
  add column if not exists performance_types text[] not null default '{}',
  add column if not exists genres text[] not null default '{}',
  add column if not exists city_slug text references public.cities(slug) on delete set null,
  add column if not exists available_for_booking boolean not null default false,
  add column if not exists pay_expectation text,
  add column if not exists showcase_embeds jsonb not null default '[]'::jsonb,
  add column if not exists draw_consent boolean not null default false,
  add column if not exists mentor_open boolean not null default false;

-- Six embeds at most; validated server-side against the Event Media Standard
-- allowlist before write, capped again here so no path can exceed it.
alter table public.artists
  drop constraint if exists artists_showcase_embeds_shape;
alter table public.artists
  add constraint artists_showcase_embeds_shape
  check (jsonb_typeof(showcase_embeds) = 'array' and jsonb_array_length(showcase_embeds) <= 6);

create index if not exists artists_directory_idx
  on public.artists (city_slug, available_for_booking)
  where available_for_booking = true;

-- ------------------------------------------------------------
-- 3. gigs: the board. Organiser-verified accounts (organisations.status
--    = 'active') post; enforcement lives in the server action gate.
-- ------------------------------------------------------------
create table if not exists public.gigs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  city_slug text not null references public.cities(slug),
  venue_name text,
  performance_type text not null check (performance_type in
    ('musician', 'dj', 'comedian', 'dancer', 'mc', 'band', 'other')),
  pay_type text not null check (pay_type in
    ('fixed_fee', 'door_split', 'ticket_share', 'negotiable')),
  pay_amount_cents integer check (pay_amount_cents is null or pay_amount_cents >= 0),
  pay_note text,
  event_date timestamptz not null,
  application_deadline timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed', 'filled', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gigs_board_idx
  on public.gigs (status, city_slug, performance_type, event_date);
create index if not exists gigs_org_idx on public.gigs (organisation_id, created_at);

alter table public.gigs enable row level security;

drop policy if exists "gigs_public_read_open" on public.gigs;
create policy "gigs_public_read_open"
  on public.gigs for select
  using (status = 'open');

drop policy if exists "gigs_org_owner_read" on public.gigs;
create policy "gigs_org_owner_read"
  on public.gigs for select
  using (
    organisation_id in (select id from public.organisations where owner_id = auth.uid())
  );
-- Writes are service-role only (server actions gate organiser verification,
-- flag state, and rate limits in app code, mirroring the lineup actions).

-- ------------------------------------------------------------
-- 4. gig_applications: one application per artist per gig. The application
--    itself is thin; the PROOF (draw data, lineup history, showcase) is
--    resolved live from the artist layer at review time, never copied.
-- ------------------------------------------------------------
create table if not exists public.gig_applications (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 2000),
  status text not null default 'submitted' check (status in
    ('submitted', 'shortlisted', 'declined', 'withdrawn', 'booked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gig_id, artist_id)
);

create index if not exists gig_applications_gig_idx on public.gig_applications (gig_id, status);
create index if not exists gig_applications_artist_idx on public.gig_applications (artist_id, created_at);

alter table public.gig_applications enable row level security;

drop policy if exists "gig_applications_own_read" on public.gig_applications;
create policy "gig_applications_own_read"
  on public.gig_applications for select
  using (applicant_user_id = auth.uid());
-- The organiser side reads through server actions (service role) gated on
-- gig ownership, so applicant identities never leak through open RLS.

-- ------------------------------------------------------------
-- 5. booking_requests: ALL structured contact. kind 'booking' is an
--    organisation booking a performer (from a gig application or straight
--    from the directory); kind 'mentoring' is a performer-to-performer
--    structured request (subject + note, accept or decline). There is
--    deliberately NO free-form messaging thread on either kind.
-- ------------------------------------------------------------
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'booking' check (kind in ('booking', 'mentoring')),
  gig_id uuid references public.gigs(id) on delete set null,
  application_id uuid references public.gig_applications(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  from_artist_id uuid references public.artists(id) on delete set null,
  sent_by uuid references auth.users(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 140),
  note text not null default '' check (char_length(note) <= 2000),
  pay_type text check (pay_type is null or pay_type in
    ('fixed_fee', 'door_split', 'ticket_share', 'negotiable')),
  pay_amount_cents integer check (pay_amount_cents is null or pay_amount_cents >= 0),
  pay_note text,
  proposed_date timestamptz,
  event_id uuid references public.events(id) on delete set null,
  status text not null default 'pending' check (status in
    ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- A booking comes from an organisation; a mentoring request from a person.
  constraint booking_requests_kind_shape check (
    (kind = 'booking' and organisation_id is not null)
    or (kind = 'mentoring' and sent_by is not null)
  )
);

create index if not exists booking_requests_artist_idx on public.booking_requests (artist_id, status);
create index if not exists booking_requests_org_idx on public.booking_requests (organisation_id, status);

-- Anti-spam: at most one PENDING request per (org, artist, kind) pair, and
-- one pending mentoring request per requesting user per artist.
create unique index if not exists booking_requests_pending_pair_uq
  on public.booking_requests (organisation_id, artist_id, kind)
  where status = 'pending' and organisation_id is not null;
create unique index if not exists booking_requests_pending_mentor_uq
  on public.booking_requests (sent_by, artist_id)
  where status = 'pending' and kind = 'mentoring';

alter table public.booking_requests enable row level security;

drop policy if exists "booking_requests_sender_read" on public.booking_requests;
create policy "booking_requests_sender_read"
  on public.booking_requests for select
  using (sent_by = auth.uid());

drop policy if exists "booking_requests_artist_owner_read" on public.booking_requests;
create policy "booking_requests_artist_owner_read"
  on public.booking_requests for select
  using (
    artist_id in (select id from public.artists where owner_user_id = auth.uid())
  );
-- Writes are service-role only (server actions).

-- ------------------------------------------------------------
-- 6. marketplace_blocks: a block between an organisation and a performer
--    stops applications and requests BOTH ways for the pair.
-- ------------------------------------------------------------
create table if not exists public.marketplace_blocks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (organisation_id, artist_id)
);

alter table public.marketplace_blocks enable row level security;
-- Reads and writes are service-role only: block state is enforced in server
-- actions and never exposed to either party beyond the refusal message.

-- ------------------------------------------------------------
-- 7. marketplace_reports: user reports on gigs and applications, reviewed
--    in the admin panel (organiser-moderation lifecycle shape).
-- ------------------------------------------------------------
create table if not exists public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('gig', 'application', 'artist_profile')),
  target_id uuid not null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('spam', 'scam', 'inappropriate', 'misleading', 'other')),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_user_id)
);

create index if not exists marketplace_reports_queue_idx on public.marketplace_reports (status, created_at);

alter table public.marketplace_reports enable row level security;
-- Service-role only; the admin surface reads through the admin data layer.

-- ------------------------------------------------------------
-- 8. notifications: marketplace types ride the existing alert engine.
--    subject_id keys dedupe for non-event notifications (one alert per
--    gig / application / request per recipient).
-- ------------------------------------------------------------
alter table public.notifications
  add column if not exists subject_id uuid;

create unique index if not exists notifications_subject_dedupe_uq
  on public.notifications (user_id, type, subject_id)
  where subject_id is not null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'just_announced', 'on_sale', 'going_fast', 'last_chance', 'tonight', 'waitlist_available',
  'gig_posted', 'gig_application', 'booking_request', 'booking_accepted', 'mentoring_request'
));

commit;
