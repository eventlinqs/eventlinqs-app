-- THE OPERATIONAL STREAM's DELIVERY EVENTS (window 6, 29 October 2026; the master mandate section 11: "Bounce handling.
-- Delivery monitoring"). Resend's signed webhooks, verified by POST /api/webhooks/resend, are recorded here one row per
-- event and recipient: bounces (with Resend's bounce type and subtype), complaints, deliveries, delays, failures and
-- provider suppressions. A permanent bounce marks the address undeliverable, which marketing audiences read; a
-- complaint is ALSO written into the consent ledger as a marketing stop by the route (src/lib/email/delivery-events.ts),
-- never here, because a bounce is deliverability and not consent.
--
-- A new public table, granted in its own migration (the 21 October 2026 grant rule): service role only, select and
-- insert; row security on with no policy; append only.

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('resend')),
  provider_event_id text not null check (length(btrim(provider_event_id)) between 1 and 200),
  event_type text not null check (event_type in ('email.bounced', 'email.complained', 'email.delivered', 'email.delivery_delayed', 'email.failed', 'email.suppressed')),
  email_id text,
  address text not null check (address = lower(btrim(address)) and address like '%@%'),
  bounce_type text,
  bounce_subtype text,
  detail text check (detail is null or length(detail) <= 1000),
  undeliverable boolean not null default false,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint email_delivery_events_once unique (provider_event_id, address),
  constraint email_delivery_events_undeliverable_is_a_permanent_bounce check (
    not undeliverable or (event_type = 'email.bounced' and bounce_type = 'Permanent')
  )
);

create index if not exists email_delivery_events_undeliverable on public.email_delivery_events (address) where undeliverable;
create index if not exists email_delivery_events_recent on public.email_delivery_events (received_at desc);

alter table public.email_delivery_events enable row level security;
revoke all on public.email_delivery_events from anon, authenticated, service_role;
grant select, insert on public.email_delivery_events to service_role;

drop trigger if exists trg_email_delivery_events_kept on public.email_delivery_events;
create trigger trg_email_delivery_events_kept
  before update or delete or truncate on public.email_delivery_events
  for each statement execute function public.refuse_ledger_mutation();

comment on table public.email_delivery_events is
  'Resend webhook facts for the operational stream, one row per event and recipient, append only. undeliverable = a permanent bounce, read by marketing audiences. Complaints become consent ledger stops in the route, not here. Service role only.';
