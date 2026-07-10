-- Demand engine, engine 3: the alert engine (web push primary, email backbone).
--
-- The growth plan's wedge depends on putting each organiser's event in front of
-- the right attendees at the right time. This migration adds the three tables
-- that back lifecycle alerts off the follow graph:
--
--   push_subscriptions  - a user's Web Push endpoints (one row per device).
--   notification_prefs   - per-user channel + quiet-hours + timezone preferences.
--   notifications        - the sent/opened/converted log and the dedupe key.
--
-- SECURITY NOTE: push subscription keys (p256dh, auth) are secrets. They must
-- NEVER live on public.profiles, whose RLS allows public SELECT. They live here
-- under strict own-row RLS, with the service role (which bypasses RLS) doing the
-- fan-out send. Apply with `supabase db push --linked` from PowerShell only.

begin;

-- ---------------------------------------------------------------------------
-- push_subscriptions: one row per browser/device Web Push endpoint.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (endpoint)
);

comment on table public.push_subscriptions is
  'Web Push endpoints per user/device. Keys are secrets: own-row RLS only.';

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own_select" on public.push_subscriptions;
create policy "push_subscriptions_own_select" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_own_insert" on public.push_subscriptions;
create policy "push_subscriptions_own_insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_own_delete" on public.push_subscriptions;
create policy "push_subscriptions_own_delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- notification_prefs: per-user channel + quiet-hours + timezone.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  -- Quiet hours in the user's local time, 0-23. Null means no quiet window.
  quiet_hours_start smallint,
  quiet_hours_end smallint,
  timezone text not null default 'Australia/Sydney',
  updated_at timestamptz not null default now(),
  constraint notification_prefs_quiet_start_range
    check (quiet_hours_start is null or (quiet_hours_start >= 0 and quiet_hours_start <= 23)),
  constraint notification_prefs_quiet_end_range
    check (quiet_hours_end is null or (quiet_hours_end >= 0 and quiet_hours_end <= 23))
);

comment on table public.notification_prefs is
  'Per-user alert channel preferences, quiet hours and timezone for send-time.';

alter table public.notification_prefs enable row level security;

drop policy if exists "notification_prefs_own_select" on public.notification_prefs;
create policy "notification_prefs_own_select" on public.notification_prefs
  for select using (auth.uid() = user_id);

drop policy if exists "notification_prefs_own_upsert" on public.notification_prefs;
create policy "notification_prefs_own_upsert" on public.notification_prefs
  for insert with check (auth.uid() = user_id);

drop policy if exists "notification_prefs_own_update" on public.notification_prefs;
create policy "notification_prefs_own_update" on public.notification_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- notifications: the sent/opened/converted log + the dedupe key. The unique
-- (user_id, event_id, type) guarantees a lifecycle alert fires at most once per
-- user per event, so a re-running cron never double-sends.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  type text not null check (type in (
    'just_announced', 'on_sale', 'going_fast', 'last_chance', 'tonight', 'waitlist_available'
  )),
  channel text not null check (channel in ('push', 'email')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  converted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, event_id, type)
);

comment on table public.notifications is
  'Lifecycle alert log: dedupe (one per user/event/type) plus sent/opened/converted instrumentation.';

create index if not exists notifications_user_idx on public.notifications (user_id);
create index if not exists notifications_event_idx on public.notifications (event_id);

alter table public.notifications enable row level security;

-- Users may read and update (open/convert tracking via their own session) their
-- own notification rows. Inserts and fan-out sends are done by the service role.
drop policy if exists "notifications_own_select" on public.notifications;
create policy "notifications_own_select" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
