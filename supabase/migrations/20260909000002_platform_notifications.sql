-- ============================================================================
-- THE PLATFORM TELLS ITS OWNER WHAT HAPPENED. Close-out UX3.
--
-- WHY THIS EXISTS. On 8 September 2026 a real outside organiser created an
-- account, built an event, uploaded a video, set a price and published it on
-- production. Their own emails were delivered correctly. The owner received
-- nothing and found out by opening the website by chance the next day.
--
-- WHY A TRIGGER AND NOT A CALL IN THE ACTION. The close-out asks for a
-- guarantee, in as many words: "no state change in that list of five can
-- complete without a notification record being written". A call added to
-- publishEvent is not that guarantee. It is a promise that every future writer
-- of that state remembers to make the same call, and this repository already
-- carries the receipts for what that promise is worth: discount usage was
-- recorded in the free branch of checkout and not the paid one, so max_uses went
-- unenforced on exactly the orders that take money; payout_status was written by
-- the deauthorize handler and not by account.updated, so it became a one-way
-- door that stranded an organiser. Both were one missing call at one write site.
--
-- A trigger is the half no writer can bypass. It fires for the server action,
-- for the webhook, for the cron, for a psql session and for a future code path
-- nobody has written yet, and it writes inside the same transaction as the state
-- change, so the record and the fact can never disagree.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not send anything. A trigger
-- that reached the network would put Resend's availability inside a checkout
-- transaction, and a slow mail server would become a failed ticket sale. Every
-- row lands `pending` and delivery is a separate, retrying, escalating worker
-- (src/lib/notifications/platform.ts, /api/cron/platform-notify).
--
-- THE FIVE, exactly as the close-out names them:
--   a new organiser account is created
--   Stripe Connect onboarding is started
--   Stripe Connect onboarding completes and charges are enabled
--   an event is published
--   every paid order
--
-- FREE REGISTRATIONS ARE NOT IN THAT LIST and are not notified. The close-out
-- says "every paid order" and a $0 registration is not one. Recorded here rather
-- than left as an omission somebody later reads as a bug.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The kinds. An enum rather than free text, so a typo in a trigger is a
--    migration failure rather than a notification nobody ever routes.
-- ---------------------------------------------------------------------------
do $kinds$
begin
  if not exists (select 1 from pg_type where typname = 'platform_notification_kind') then
    create type public.platform_notification_kind as enum (
      'organiser_created',
      'connect_onboarding_started',
      'connect_charges_enabled',
      'event_published',
      'order_paid'
    );
  end if;
end
$kinds$;

-- ---------------------------------------------------------------------------
-- 2. The delivery state machine.
--
--    pending           written, never attempted
--    sent              delivered on the first channel
--    held_for_digest   over the daily individual-alert threshold, waiting to be
--                      rolled into one digest (close-out UX3.3)
--    escalated         the first channel was exhausted and the second delivered
--    failed            every channel failed. This state is loud on purpose: it
--                      is the state H2 proved an alert path can reach silently.
-- ---------------------------------------------------------------------------
do $states$
begin
  if not exists (select 1 from pg_type where typname = 'platform_notification_state') then
    create type public.platform_notification_state as enum (
      'pending',
      'sent',
      'held_for_digest',
      'escalated',
      'failed'
    );
  end if;
end
$states$;

-- ---------------------------------------------------------------------------
-- 3. The record.
--
--    The subject columns are nullable references with ON DELETE SET NULL, and
--    the label columns beside them are SNAPSHOTS taken at the moment it
--    happened. Both, on purpose: the reference is how the admin console reaches
--    the live record, and the snapshot is what the notification said. Deleting
--    an event must not turn last week's "Sunset Sessions was published" into a
--    row that says nothing.
--
--    admin_path is a PATH and never a URL. The host belongs to
--    src/lib/site-url.ts and is composed at send time, so a database row can
--    never pin the platform to a hostname it has moved off.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  kind public.platform_notification_kind not null,
  occurred_at timestamptz not null default now(),

  -- who and what, as live references
  actor_user_id uuid references auth.users(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,

  -- who and what, as the snapshot the message was written from
  actor_label text,
  organisation_name text,
  event_title text,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  admin_path text not null,

  -- delivery
  delivery_state public.platform_notification_state not null default 'pending',
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  channel text,

  -- one row per real-world happening, whoever writes it and by whatever route
  dedupe_key text not null unique,

  created_at timestamptz not null default now(),

  constraint platform_notifications_admin_path_is_a_path
    check (admin_path like '/%'),
  constraint platform_notifications_sent_has_a_channel
    check ((delivery_state in ('sent', 'escalated')) = (channel is not null))
);

comment on table public.platform_notifications is
  'Close-out UX3: every owner-facing platform happening, written by a trigger inside the same transaction as the state change so it cannot be forgotten, and delivered by a separate retrying worker.';

comment on column public.platform_notifications.admin_path is
  'Path into the admin console for this exact record. A path, never a URL: the host is composed at send time from src/lib/site-url.ts.';

comment on column public.platform_notifications.dedupe_key is
  'One row per real-world happening. Every trigger writes ON CONFLICT DO NOTHING against this, so a redelivered webhook or a re-run cron cannot double-notify.';

comment on column public.platform_notifications.delivery_state is
  'pending, sent, held_for_digest (UX3.3 volume control), escalated (second channel), failed (every channel exhausted, and loud).';

-- The worker reads by state and age; the admin feed reads newest first.
create index if not exists platform_notifications_pending_idx
  on public.platform_notifications (delivery_state, occurred_at)
  where delivery_state in ('pending', 'held_for_digest');

create index if not exists platform_notifications_feed_idx
  on public.platform_notifications (occurred_at desc);

create index if not exists platform_notifications_kind_idx
  on public.platform_notifications (kind, occurred_at desc);

-- RLS on with NO policies: this table is the platform's own operations record.
-- Only the service role reads or writes it, and every reader is an authenticated
-- admin session going through src/lib/admin. An organiser must never be able to
-- read the platform's view of another organiser.
alter table public.platform_notifications enable row level security;

revoke all on public.platform_notifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The one writer. Every trigger funnels through it, so the shape of a row,
--    the conflict behaviour and the "never throw into the caller" rule are
--    defined once.
--
--    NEVER THROWS. A notification is an operations convenience; an order is
--    somebody's money. If this insert could raise, a malformed jsonb or a
--    unique-violation race would roll back a confirmed order. It cannot: the
--    insert is ON CONFLICT DO NOTHING, and the whole body is wrapped so that any
--    other fault is swallowed after being reported to the Postgres log.
--
--    THAT IS NOT A HOLE IN THE GUARANTEE. The guarantee the close-out asks for
--    is that the state change cannot complete WITHOUT the record being written.
--    scripts/guards/platform-notifications-installed.mjs proves the triggers are
--    attached, and the drill drives the five real actions and reads the rows
--    back, so a swallowed exception shows up as a missing row and fails.
-- ---------------------------------------------------------------------------
create or replace function public.record_platform_notification(
  p_kind public.platform_notification_kind,
  p_dedupe_key text,
  p_summary text,
  p_admin_path text,
  p_actor_user_id uuid default null,
  p_organisation_id uuid default null,
  p_event_id uuid default null,
  p_order_id uuid default null,
  p_actor_label text default null,
  p_organisation_name text default null,
  p_event_title text default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $record$
begin
  insert into public.platform_notifications (
    kind, dedupe_key, summary, admin_path,
    actor_user_id, organisation_id, event_id, order_id,
    actor_label, organisation_name, event_title, detail
  ) values (
    p_kind, p_dedupe_key, p_summary, p_admin_path,
    p_actor_user_id, p_organisation_id, p_event_id, p_order_id,
    p_actor_label, p_organisation_name, p_event_title, coalesce(p_detail, '{}'::jsonb)
  )
  on conflict (dedupe_key) do nothing;
exception
  when others then
    raise warning '[platform_notifications] % not recorded: %', p_dedupe_key, sqlerrm;
end;
$record$;

comment on function public.record_platform_notification is
  'Close-out UX3: the single writer of platform_notifications. Idempotent on dedupe_key and never raises into the transaction that called it.';

-- ---------------------------------------------------------------------------
-- 5. A NEW ORGANISER ACCOUNT IS CREATED.
--
--    On organisations, not on auth.users. A person who signs up to buy a ticket
--    is not an organiser, and the owner asked to hear about organisers. The
--    organisation row is the moment somebody becomes one.
-- ---------------------------------------------------------------------------
create or replace function public.notify_organiser_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $organiser$
begin
  perform public.record_platform_notification(
    'organiser_created',
    'organiser_created:' || new.id::text,
    'New organiser: ' || coalesce(new.name, 'unnamed organisation'),
    '/admin/organisers/' || new.id::text,
    new.owner_id,
    new.id,
    null,
    null,
    coalesce(new.email, ''),
    new.name,
    null,
    jsonb_build_object('slug', new.slug, 'email', new.email, 'phone', new.phone)
  );
  return new;
end;
$organiser$;

drop trigger if exists platform_notify_organiser_created on public.organisations;
create trigger platform_notify_organiser_created
  after insert on public.organisations
  for each row
  execute function public.notify_organiser_created();

-- ---------------------------------------------------------------------------
-- 6. STRIPE CONNECT ONBOARDING IS STARTED, and CHARGES ARE ENABLED.
--
--    One trigger function for both, because both are transitions of the same
--    row and a single AFTER UPDATE keeps their ordering honest.
--
--    STARTED is stripe_account_id going from absent to present. That is the
--    moment the platform mints the Express account and hands the organiser the
--    hosted form, and it is the only durable mark that they began.
--
--    CHARGES ENABLED is stripe_charges_enabled going false to true. That column
--    has one writer of record, reconcileConnectedAccount, which writes what the
--    Stripe API says rather than what a webhook claimed, so this fires on the
--    truth and not on a delivery.
-- ---------------------------------------------------------------------------
create or replace function public.notify_connect_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $connect$
begin
  if old.stripe_account_id is null and new.stripe_account_id is not null then
    perform public.record_platform_notification(
      'connect_onboarding_started',
      'connect_onboarding_started:' || new.id::text || ':' || new.stripe_account_id,
      'Stripe onboarding started: ' || coalesce(new.name, 'unnamed organisation'),
      '/admin/organisers/' || new.id::text,
      new.owner_id,
      new.id,
      null,
      null,
      coalesce(new.email, ''),
      new.name,
      null,
      jsonb_build_object(
        'stripe_account_id', new.stripe_account_id,
        'country', new.stripe_account_country
      )
    );
  end if;

  if coalesce(old.stripe_charges_enabled, false) = false
     and coalesce(new.stripe_charges_enabled, false) = true then
    perform public.record_platform_notification(
      'connect_charges_enabled',
      'connect_charges_enabled:' || new.id::text || ':' || coalesce(new.stripe_account_id, 'none'),
      'Stripe onboarding complete, charges enabled: ' || coalesce(new.name, 'unnamed organisation'),
      '/admin/organisers/' || new.id::text,
      new.owner_id,
      new.id,
      null,
      null,
      coalesce(new.email, ''),
      new.name,
      null,
      jsonb_build_object(
        'stripe_account_id', new.stripe_account_id,
        'payouts_enabled', new.stripe_payouts_enabled,
        'payout_status', new.payout_status
      )
    );
  end if;

  return new;
end;
$connect$;

drop trigger if exists platform_notify_connect_transitions on public.organisations;
create trigger platform_notify_connect_transitions
  after update on public.organisations
  for each row
  when (
    old.stripe_account_id is distinct from new.stripe_account_id
    or old.stripe_charges_enabled is distinct from new.stripe_charges_enabled
  )
  execute function public.notify_connect_transitions();

-- ---------------------------------------------------------------------------
-- 7. AN EVENT IS PUBLISHED.
--
--    Every transition INTO published from a status that is not published, plus
--    an insert that lands published directly. A re-publish after a pause is a
--    real happening the owner wants to see, so the dedupe key carries the
--    publish moment to the second rather than only the event id.
-- ---------------------------------------------------------------------------
create or replace function public.notify_event_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $published$
declare
  v_org_name text;
  v_owner uuid;
  v_moment timestamptz := coalesce(new.published_at, now());
begin
  select o.name, o.owner_id into v_org_name, v_owner
    from public.organisations o
   where o.id = new.organisation_id;

  perform public.record_platform_notification(
    'event_published',
    'event_published:' || new.id::text || ':' || to_char(v_moment at time zone 'UTC', 'YYYYMMDD"T"HH24MISS'),
    'Event published: ' || coalesce(new.title, 'untitled event'),
    '/admin/events/' || new.id::text,
    v_owner,
    new.organisation_id,
    new.id,
    null,
    null,
    v_org_name,
    new.title,
    jsonb_build_object(
      'slug', new.slug,
      'start_date', new.start_date,
      'city', new.city,
      'event_type', new.event_type
    )
  );
  return new;
end;
$published$;

drop trigger if exists platform_notify_event_published on public.events;
create trigger platform_notify_event_published
  after update on public.events
  for each row
  when (old.status is distinct from new.status and new.status = 'published')
  execute function public.notify_event_published();

drop trigger if exists platform_notify_event_published_insert on public.events;
create trigger platform_notify_event_published_insert
  after insert on public.events
  for each row
  when (new.status = 'published')
  execute function public.notify_event_published();

-- ---------------------------------------------------------------------------
-- 8. EVERY PAID ORDER.
--
--    status becoming 'confirmed' with a total above zero. confirm_order is the
--    authoritative gate on the money path and it is an UPDATE, so this fires
--    from inside it: the notification and the ticket are issued in one
--    transaction and neither can exist without the other.
-- ---------------------------------------------------------------------------
create or replace function public.notify_order_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $paid$
declare
  v_event_title text;
  v_org_name text;
begin
  select e.title into v_event_title from public.events e where e.id = new.event_id;
  select o.name into v_org_name from public.organisations o where o.id = new.organisation_id;

  perform public.record_platform_notification(
    'order_paid',
    'order_paid:' || new.id::text,
    'Paid order ' || new.order_number || ': ' || coalesce(v_event_title, 'an event'),
    '/admin/orders/' || new.id::text,
    new.user_id,
    new.organisation_id,
    new.event_id,
    new.id,
    coalesce(new.guest_email, ''),
    v_org_name,
    v_event_title,
    jsonb_build_object(
      'order_number', new.order_number,
      'total_cents', new.total_cents,
      'currency', new.currency,
      'platform_fee_cents', new.platform_fee_cents
    )
  );
  return new;
end;
$paid$;

drop trigger if exists platform_notify_order_paid on public.orders;
create trigger platform_notify_order_paid
  after update on public.orders
  for each row
  when (
    old.status is distinct from new.status
    and new.status = 'confirmed'
    and new.total_cents > 0
  )
  execute function public.notify_order_paid();

drop trigger if exists platform_notify_order_paid_insert on public.orders;
create trigger platform_notify_order_paid_insert
  after insert on public.orders
  for each row
  when (new.status = 'confirmed' and new.total_cents > 0)
  execute function public.notify_order_paid();
