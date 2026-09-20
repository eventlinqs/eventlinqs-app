-- MONEY FIX A4 AND A3 LAYER TWO: THE ORDER NAMES WHERE ITS MONEY IS OWED, AND
-- THE ROW THAT LETS AN EVENT GO ON SALE CARRIES THE DATE IT WAS CHECKED.
--
-- WHY. On 10 September 2026 two ticket charges for the Afro-Fusion Music
-- Showcase settled into the platform account and paid out to the platform
-- owner's personal bank. The organiser's connected account was live, enabled and
-- created by this platform. Nothing anywhere recorded that those two orders were
-- owed onward to anybody, so the only way to work out who was owed what was to
-- read Stripe by hand and match it against the catalogue. These columns are the
-- answer to that: at charge time, on the order, in cents, with the account id.
--
-- A4 asks for four facts: the destination account, the platform fee retained,
-- the Stripe processing estimate, and the amount due to the organiser. Three of
-- them are arithmetic over one another and the fourth is an identifier, so a row
-- carrying some of them is worse than a row carrying none: it reads as a
-- complete record and is not one. orders_destination_is_whole makes the partial
-- state impossible in the database rather than only in the code that writes it.
--
-- stripe_processing_estimate_cents is DELIBERATELY OUTSIDE that constraint. It
-- is null whenever the settlement currency has no published rate recorded in
-- src/lib/payments/stripe-processing-estimate.ts, which today is every currency
-- except AUD. A confident wrong number in a column meant to be trusted later is
-- worse than an empty one.
--
-- organisations.stripe_status_verified_at is A3 layer two. The four columns the
-- sale gate reads are a CACHE of what Stripe said, and nothing recorded when
-- they were last read from Stripe, so a row that said "enabled" six weeks ago
-- and has heard nothing since was indistinguishable from one confirmed a minute
-- ago. The publish gate now refuses to grant a paid event on a cached yes it
-- cannot date, and goes and asks Stripe instead.
--
-- Additive and reversible. No money path reads any of these columns to decide
-- what to charge; they record what was decided.

alter table public.orders
  add column if not exists destination_account_id text,
  add column if not exists platform_fee_retained_cents integer,
  add column if not exists stripe_processing_estimate_cents integer,
  add column if not exists organiser_amount_due_cents integer,
  add column if not exists destination_recorded_at timestamptz;

comment on column public.orders.destination_account_id is
  'The Stripe connected account this order''s money is owed onward to, resolved at charge time. MONEY FIX A4.';
comment on column public.orders.platform_fee_retained_cents is
  'What the platform keeps out of total_cents on this order: total_cents - organiser_amount_due_cents. MONEY FIX A4.';
comment on column public.orders.stripe_processing_estimate_cents is
  'Estimate of what Stripe takes to put the card through, in the settlement currency. NULL when no published rate is recorded for that currency. Never charged to anybody. MONEY FIX A4.';
comment on column public.orders.organiser_amount_due_cents is
  'What the organiser is owed for this order, as computed at charge time. MONEY FIX A4.';
comment on column public.orders.destination_recorded_at is
  'When the four A4 facts above were written. MONEY FIX A4.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_destination_is_whole'
  ) then
    alter table public.orders
      add constraint orders_destination_is_whole check (
        (
          destination_account_id is null
          and platform_fee_retained_cents is null
          and organiser_amount_due_cents is null
          and destination_recorded_at is null
        )
        or (
          destination_account_id is not null
          and platform_fee_retained_cents is not null
          and organiser_amount_due_cents is not null
          and destination_recorded_at is not null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_destination_amounts_are_not_negative'
  ) then
    alter table public.orders
      add constraint orders_destination_amounts_are_not_negative check (
        (platform_fee_retained_cents is null or platform_fee_retained_cents >= 0)
        and (organiser_amount_due_cents is null or organiser_amount_due_cents >= 0)
        and (stripe_processing_estimate_cents is null or stripe_processing_estimate_cents >= 0)
      );
  end if;
end $$;

alter table public.organisations
  add column if not exists stripe_status_verified_at timestamptz;

comment on column public.organisations.stripe_status_verified_at is
  'When the stripe_* columns were last written from a live read of the connected account. NULL means never verified. MONEY FIX A3 layer two.';

-- The settlement reconciliation and any future "what is owed" report both ask
-- the same question: which confirmed orders name a destination. One partial
-- index over exactly those rows, so the answer never costs a sequential scan of
-- every order ever taken.
create index if not exists orders_destination_account_idx
  on public.orders (destination_account_id)
  where destination_account_id is not null;
