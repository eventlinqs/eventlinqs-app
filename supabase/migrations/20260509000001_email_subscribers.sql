-- email_subscribers: source of truth for the homepage email signup
-- panel (Batch 9.2 UI / 9.2.1 persistence). Anonymous and authenticated
-- visitors can insert. Reads are restricted to the service role; the
-- M7 admin panel will issue privileged queries via the service-role
-- key only. No public read path exposes subscriber identity.

create table if not exists public.email_subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  subscribed_at   timestamptz not null default now(),
  source          text not null default 'homepage',
  consent         boolean not null default true,
  confirmed       boolean not null default false,
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz
);

create index if not exists idx_email_subscribers_email
  on public.email_subscribers (email);

create index if not exists idx_email_subscribers_subscribed_at
  on public.email_subscribers (subscribed_at desc);

alter table public.email_subscribers enable row level security;

-- Anyone can subscribe. The form passes the consent flag explicitly;
-- the server action validates the consent value before insert. The
-- WITH CHECK (true) policy intentionally trusts the server boundary;
-- the table is append-only from anonymous traffic, never read by
-- anonymous traffic.
drop policy if exists "anon_can_insert" on public.email_subscribers;
create policy "anon_can_insert"
  on public.email_subscribers
  for insert
  with check (true);

-- Reads gated to the service role. The M7 admin panel queries via the
-- privileged Supabase client. RLS denies reads from anon and
-- authenticated users; this prevents subscriber-list enumeration via
-- /api/* leaks or curious browsers.
drop policy if exists "service_role_can_read" on public.email_subscribers;
create policy "service_role_can_read"
  on public.email_subscribers
  for select
  using (auth.role() = 'service_role');
