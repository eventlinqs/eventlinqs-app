-- Broadcast Layer Stage 1: trackable share links and their attribution events.
-- SPEC: docs/EventLinqs-Broadcast-Layer-SPEC.md sections 2.3, 2.5 and 5.
--
-- share_links        - one row per generated share link: event, channel, an
--                      optional artist (Stage 3), and a short opaque code.
-- share_link_events  - the attribution log: view, click, conversion. A
--                      conversion references the order id READ ONLY; this
--                      table never alters order, payment, or payout rows.
--
-- Additive only. Reversible by dropping the two tables. TEST database only,
-- applied with `supabase db push --linked` from PowerShell, never the
-- Dashboard SQL editor and never the Supabase MCP.
--
-- RLS design: rows are written exclusively by the service role (the server
-- actions and the short-link redirect route), so no anon or authenticated
-- write policy exists. Reads are granted to the organiser who owns the
-- event (their reach panel) and, for artist-tagged links, to the artist
-- profile owner (their attribution view, Stage 3).

begin;

-- ---------------------------------------------------------------------------
-- share_links: one row per share link. code is the short token in /s/[code].
-- ---------------------------------------------------------------------------
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  artist_id uuid references public.artists(id) on delete set null,
  channel text not null check (channel in (
    'instagram', 'facebook', 'linkedin', 'x', 'whatsapp', 'messenger',
    'email', 'sms', 'copy', 'native', 'qr', 'other'
  )),
  code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.share_links is
  'Broadcast Layer trackable share links: per-channel short codes for events, optionally tagged to an artist. Written by the service role only.';

create index if not exists share_links_event_idx on public.share_links (event_id);
create index if not exists share_links_artist_idx on public.share_links (artist_id)
  where artist_id is not null;

alter table public.share_links enable row level security;

-- The organiser who owns the event may read its share links (reach panel).
drop policy if exists "share_links_event_owner_select" on public.share_links;
create policy "share_links_event_owner_select" on public.share_links
  for select using (
    event_id in (
      select e.id from public.events e
      where e.organisation_id in (
        select id from public.organisations where owner_id = auth.uid()
      )
    )
  );

-- The artist profile owner may read links tagged to their artist (Stage 3).
drop policy if exists "share_links_artist_owner_select" on public.share_links;
create policy "share_links_artist_owner_select" on public.share_links
  for select using (
    artist_id is not null and artist_id in (
      select id from public.artists where owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- share_link_events: the attribution log. kind is view, click or conversion.
-- A conversion carries the order id as a read-only reference; the partial
-- unique index guarantees one conversion row per link per order, so a re-run
-- or a replayed request can never double-count a sale.
-- visitor_hash is a salted hash of ip and user agent used only to de-dupe
-- repeat views and clicks; it is never reversible to an identity.
-- ---------------------------------------------------------------------------
create table if not exists public.share_link_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.share_links(id) on delete cascade,
  kind text not null check (kind in ('view', 'click', 'conversion')),
  order_id uuid references public.orders(id) on delete set null,
  visitor_hash text,
  occurred_at timestamptz not null default now()
);

comment on table public.share_link_events is
  'Broadcast Layer attribution log per share link: views, clicks, conversions. order_id is a read-only reference; money tables are never written.';

create index if not exists share_link_events_link_idx
  on public.share_link_events (link_id, kind);
create index if not exists share_link_events_occurred_idx
  on public.share_link_events (occurred_at);

-- One conversion per link per order: forged or replayed requests cannot
-- inflate a link's sales.
create unique index if not exists share_link_events_one_conversion_per_order
  on public.share_link_events (link_id, order_id)
  where kind = 'conversion' and order_id is not null;

alter table public.share_link_events enable row level security;

-- The organiser who owns the event may read the attribution rows behind
-- their reach panel. Writes are service role only.
drop policy if exists "share_link_events_event_owner_select" on public.share_link_events;
create policy "share_link_events_event_owner_select" on public.share_link_events
  for select using (
    link_id in (
      select sl.id from public.share_links sl
      where sl.event_id in (
        select e.id from public.events e
        where e.organisation_id in (
          select id from public.organisations where owner_id = auth.uid()
        )
      )
    )
  );

-- The artist profile owner may read attribution for their tagged links.
drop policy if exists "share_link_events_artist_owner_select" on public.share_link_events;
create policy "share_link_events_artist_owner_select" on public.share_link_events
  for select using (
    link_id in (
      select sl.id from public.share_links sl
      where sl.artist_id is not null and sl.artist_id in (
        select id from public.artists where owner_user_id = auth.uid()
      )
    )
  );

commit;
