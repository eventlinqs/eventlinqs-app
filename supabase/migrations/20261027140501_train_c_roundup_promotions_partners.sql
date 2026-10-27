-- TRAIN C (window 5, 27 October 2026): the weekly roundup's approval, paid promotion (featured placement and the
-- organiser services menu), and partnerships. The plan: "EventLinqs, the discovery-to-booking foundation", locked by
-- Lawal at 13:00 on 27 October 2026 (THE BIBLE, section 14), Sprint 2 row 9 and Sprint 3 rows 12, 13 and 14:
--   9  "The weekly roundup per city: email to subscribers, the WhatsApp edition drafted for Lawal": done when
--      "Thursday's edition is drafted from verified listings, approved, sent";
--   12 "Paid featured placement: set slots on city pages and the homepage, labelled "Featured", bought by an organiser"
--      : "Lawal sets the price in admin";
--   13 "Organiser services menu: promotion packages (a social feature, a roundup feature, a poster pack), each priced
--      in admin, paid through Stripe": done when "an organiser orders one and the order reaches the admin queue";
--   14 "Partnerships: partner pages, a partner enquiry form, a partner record in admin, labelled "Partner"".
-- The project manager's 13:14: "prices empty in admin = not on sale". So every offer is seeded with no price, and an
-- offer with no price cannot be bought (promotion_orders_priced_offer, below).
--
-- GRANTS (the 21 October 2026 rule): every table here is read and written by the server alone (admin pages, the
-- organiser's own pages through server actions, the cron), so each revokes all and grants service_role only, and
-- row level security is on with no policy, so no browser key reaches a row.
--
-- Additive. Reversal: drop the five tables; nothing else reads them.

-- 9. THE ROUNDUP'S APPROVAL: one row per city per week, written by an admin's press, read by the weekly cron.
create table if not exists public.roundup_approvals (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null,
  period_start date not null,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  whatsapp_text text not null,
  event_count integer not null check (event_count >= 0),
  constraint roundup_approvals_once unique (city_slug, period_start)
);
comment on table public.roundup_approvals is
  'Train C, row 9: an admin approved this city''s weekly roundup for this period, with the WhatsApp edition as drafted. The weekly digest sends a city only once its edition is approved.';
alter table public.roundup_approvals enable row level security;
revoke all on public.roundup_approvals from public, anon, authenticated, service_role;
grant select, insert on public.roundup_approvals to service_role;

-- 12 and 13. WHAT CAN BE BOUGHT: featured slots and service packages, each priced by Lawal in admin.
create table if not exists public.promotion_offers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  kind text not null check (kind in ('featured_slot', 'service')),
  name text not null check (length(btrim(name)) > 0),
  description text not null check (length(btrim(description)) > 0),
  -- Where a featured slot shows; null for a service.
  placement text check (placement in ('homepage', 'city')),
  -- Null means not on sale: Lawal sets it in admin.
  price_cents integer check (price_cents is null or price_cents > 0),
  currency text not null default 'AUD' check (currency = 'AUD'),
  -- How many slots a placement holds at once, for a featured slot.
  slots integer check (slots is null or slots between 1 and 12),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint promotion_offers_placement check ((kind = 'featured_slot') = (placement is not null and slots is not null))
);
comment on table public.promotion_offers is
  'Train C, rows 12 and 13: a featured slot or an organiser service, with the price Lawal sets in admin. No price, not on sale.';
alter table public.promotion_offers enable row level security;
revoke all on public.promotion_offers from public, anon, authenticated, service_role;
grant select, insert, update on public.promotion_offers to service_role;

insert into public.promotion_offers (key, kind, name, description, placement, slots, sort_order) values
  ('featured-homepage', 'featured_slot', 'Featured on the homepage', 'Your event in the Featured row of the homepage for one week, labelled Featured.', 'homepage', 4, 10),
  ('featured-city', 'featured_slot', 'Featured on your city page', 'Your event in the Featured row of its city page for one week, labelled Featured.', 'city', 4, 20)
on conflict (key) do nothing;
insert into public.promotion_offers (key, kind, name, description, sort_order) values
  ('service-social-feature', 'service', 'A social feature', 'Your event in one of EventLinqs'' own posts, with your own photo, drafted for you to see first.', 30),
  ('service-roundup-feature', 'service', 'A roundup feature', 'Your event at the top of the weekly roundup for its city, labelled Featured.', 40),
  ('service-poster-pack', 'service', 'A poster pack', 'Your Launch Kit posters printed ready: the A4 poster and the square card, with your tracked link.', 50)
on conflict (key) do nothing;

-- WHAT WAS BOUGHT: one row per order, paid through Stripe Checkout, queued for the admin.
create table if not exists public.promotion_orders (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.promotion_offers(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'cancelled', 'done')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'AUD' check (currency = 'AUD'),
  stripe_checkout_session_id text unique,
  -- A featured slot's week; null for a service.
  starts_at timestamptz,
  ends_at timestamptz,
  ordered_by uuid not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  done_at timestamptz,
  done_by uuid,
  constraint promotion_orders_paid_dated check ((status in ('paid', 'done')) = (paid_at is not null)),
  constraint promotion_orders_week check ((starts_at is null) = (ends_at is null) and (ends_at is null or ends_at > starts_at))
);
comment on table public.promotion_orders is
  'Train C, rows 12 and 13: an organiser''s order for a featured slot or a service, paid through Stripe Checkout and queued for the admin.';
create index if not exists promotion_orders_live on public.promotion_orders (offer_id, starts_at, ends_at) where status in ('paid', 'done');
alter table public.promotion_orders enable row level security;
revoke all on public.promotion_orders from public, anon, authenticated, service_role;
grant select, insert, update on public.promotion_orders to service_role;

-- An order only for an offer on sale, at its price: the database refuses anything else.
create or replace function public.promotion_order_priced()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $priced$
declare
  v_price integer;
begin
  select o.price_cents into v_price from public.promotion_offers o where o.id = new.offer_id;
  if v_price is null then
    raise exception 'promotion_orders_priced_offer: this offer has no price, so it is not on sale.' using errcode = '23514';
  end if;
  if new.amount_cents <> v_price then
    raise exception 'promotion_orders_priced_offer: an order is for the offer''s own price.' using errcode = '23514';
  end if;
  return new;
end;
$priced$;
drop trigger if exists promotion_orders_priced on public.promotion_orders;
create trigger promotion_orders_priced before insert on public.promotion_orders
  for each row execute function public.promotion_order_priced();
revoke all on function public.promotion_order_priced() from public, anon, authenticated;

-- 14. PARTNERS: a partner record, its public page, and the enquiries that reach admin.
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) > 0),
  kind text not null check (kind in ('venue', 'promoter', 'council', 'festival', 'media', 'sponsor', 'other')),
  summary text not null check (length(btrim(summary)) > 0),
  website_url text check (website_url is null or website_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft', 'live')),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now()
);
comment on table public.partners is
  'Train C, row 14: a partner of EventLinqs, its public page live once status is live, labelled Partner wherever it shows.';
alter table public.partners enable row level security;
revoke all on public.partners from public, anon, authenticated, service_role;
grant select, insert, update on public.partners to service_role;

create table if not exists public.partner_enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 320),
  organisation text not null check (length(btrim(organisation)) between 1 and 160),
  kind text not null check (kind in ('venue', 'promoter', 'council', 'festival', 'media', 'sponsor', 'other')),
  message text not null check (length(btrim(message)) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid
);
comment on table public.partner_enquiries is
  'Train C, row 14: an enquiry from the partner form, queued in admin.';
alter table public.partner_enquiries enable row level security;
revoke all on public.partner_enquiries from public, anon, authenticated, service_role;
grant select, insert, update on public.partner_enquiries to service_role;
