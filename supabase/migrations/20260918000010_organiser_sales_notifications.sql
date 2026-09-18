-- ===========================================================================
-- MONEY FIX, PART B, B4. THE ORGANISER IS TOLD ABOUT THEIR OWN SALES.
--
-- WHY THIS EXISTS, with the evidence rather than a principle. MKLStudios sold
-- two tickets on the Afro-Fusion Music Showcase on 10 September 2026 and the
-- only human told was the platform owner. Nothing failed: `order_paid` is a
-- PLATFORM notification and there was no organiser counterpart anywhere in the
-- codebase. The governing sentence of the close-out item is "the organiser's
-- money belongs to the organiser and so does the news about it".
--
-- TWO OBJECTS, AND WHY EACH IS A COLUMN OR A TABLE RATHER THAN A JSONB KEY.
--
-- 1. organisations.sales_notification_mode. A PREFERENCE THE ORGANISER OWNS.
--    It is read on the hot path: every confirmed order asks it before deciding
--    whether to send now, hold for the digest, or say nothing. A JSONB key on
--    `organisations.metadata` would answer the same question, and would also
--    make the sweep that builds the daily digest scan every organisation to
--    find the ones on 'daily'. A column with a CHECK also refuses a typo, and
--    a preference that silently becomes an unrecognised string is a preference
--    that silently stops being honoured.
--
--    DEFAULT 'daily', which is the item's own wording: "sales thereafter
--    immediately or as a daily digest by their own preference defaulting to
--    daily". Existing rows take the default, so no organiser has to opt in to
--    hearing about their own money.
--
--    'off' IS OFFERED AND IT IS DELIBERATELY NARROW. The item's reversal
--    condition says an organiser "may reduce their own sales notifications to a
--    daily digest or switch them off", and immediately adds that "payout,
--    refund, dispute and payment setup messages cannot be switched off by
--    anyone". So this column governs SALE messages only. Nothing else in the
--    platform reads it, and the guard
--    scripts/guards/every-message-has-a-declared-recipient.mjs fails the build
--    if a payout, refund, dispute or setup message ever starts consulting it.
--
-- 2. organiser_sales_digest_sends. IDEMPOTENCY FOR THE DAILY ROLL-UP.
--    The digest cron runs on a schedule and a schedule retries. Without a
--    record of what was already sent, a retry sends an organiser a second copy
--    of their day, and the one thing worse than not being told about your money
--    is being told twice and not knowing which is true. The primary key is
--    (organisation_id, digest_date), so a second attempt for the same day
--    conflicts and does nothing.
--
--    It also carries what was reported, so the digest can be audited after the
--    fact against the orders it claims to summarise. That is the same reason
--    A4 records the destination on the order: a money message you cannot
--    reconcile later is a message you have to trust.
--
-- Additive and reversible. Nothing here changes an existing value: the column
-- takes a default and the table is new. No money path reads or writes it.
--
-- Applied to TEST vkapkibzokmfaxqogypq from the lane A worktree.
-- Production is the founder's `npm run migrate:production`.
-- ===========================================================================

begin;

-- ── 1. The preference ──────────────────────────────────────────────────────

alter table public.organisations
  add column if not exists sales_notification_mode text not null default 'daily';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organisations_sales_notification_mode_check'
  ) then
    alter table public.organisations
      add constraint organisations_sales_notification_mode_check
      check (sales_notification_mode in ('immediate', 'daily', 'off'));
  end if;
end $$;

comment on column public.organisations.sales_notification_mode is
  'How this organiser wants to hear about ticket sales on their events: immediate, daily digest (the default), or off. Governs SALE messages only; payout, refund, dispute and payment-setup messages are not switchable (close-out MONEY FIX B4).';

-- The digest sweep selects organisations on ''daily''. Without this it reads
-- every organisation on the platform once a day for ever.
create index if not exists organisations_sales_notification_mode_idx
  on public.organisations (sales_notification_mode)
  where sales_notification_mode = 'daily';

-- ── 2. The digest idempotency record ───────────────────────────────────────

create table if not exists public.organiser_sales_digest_sends (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- The platform day the digest covers, not the day it was sent. A retry after
  -- midnight must still collide with the day it is reporting on.
  digest_date date not null,
  sent_at timestamptz not null default now(),
  -- What the message claimed, so it can be reconciled against the orders later.
  sale_count integer not null default 0,
  gross_cents bigint not null default 0,
  currency text not null default 'AUD',
  primary key (organisation_id, digest_date)
);

comment on table public.organiser_sales_digest_sends is
  'One row per organisation per platform day the daily sales digest was sent. The primary key is the idempotency: a retried cron conflicts and sends nothing (close-out MONEY FIX B4).';

alter table public.organiser_sales_digest_sends enable row level security;

-- No policy is created, deliberately. This table is written and read only by
-- the digest cron through the service role, which bypasses RLS. RLS is enabled
-- with no policy so that an anon or authenticated client reaching it gets
-- nothing rather than everything, which is the fail-closed default the rest of
-- the schema uses for operational tables.

commit;
