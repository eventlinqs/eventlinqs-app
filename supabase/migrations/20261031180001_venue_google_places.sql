-- GOOGLE PLACES VENUE PHOTOS, THE DATA HALF (the CONTROLLER's 17:55 (4) of 31 October 2026; Lawal's ruling of
-- 30 October 23:56: event detail pages only, never list cards, a hard daily quota, A$0).
--
-- WHAT GOOGLE ALLOWS US TO KEEP, from its own policy page
-- (https://developers.google.com/maps/documentation/places/web-service/policies, read 31 October 2026): the place id
-- 'is exempt from the caching restrictions'; Places content beyond the exceptions may not be stored; and from
-- https://developers.google.com/maps/documentation/places/web-service/place-photos: 'You cannot cache a photo name.
-- Also, the name can expire.' So this table keeps ONLY the place id and our own evidence that it is our venue, plus a
-- person's decision. No photo name, no photo, no Google text beyond the id is stored anywhere.
--
-- THE PRICES, from https://developers.google.com/maps/billing-and-pricing/pricing (read 31 October 2026, US$ per 1,000,
-- first band): Text Search Essentials (IDs Only) and Place Details Essentials (IDs Only): free cap 'Unlimited', no
-- price; Place Details Pro: US$17.00 (free cap 5,000 a month). The photo itself is the existing 'places_photo' row
-- (US$7.00; Google's free cap 1,000 a month). Rows are added only where missing; existing ones are never changed here.

-- The guard's price check said 'unit_price_micros > 0' (20261030165501), so a call Google lists as FREE could have no
-- row, and a call with no row is refused ('No price is recorded for this Google call'). A free call is still counted
-- against the day's quota and logged; it just costs nothing. So the check becomes '>= 0'. (TEST refused the first
-- version of this file on that check, 31 October 19:02; nothing was kept.)
alter table public.google_spend_prices drop constraint if exists google_spend_prices_unit_price_micros_check;
alter table public.google_spend_prices add constraint google_spend_prices_unit_price_micros_check check (unit_price_micros >= 0);

insert into public.google_spend_prices (api, unit_price_micros, sku, source_url, read_on) values
  ('places_text_search_ids', 0, 'Text Search Essentials (IDs Only), free cap Unlimited', 'https://developers.google.com/maps/billing-and-pricing/pricing', '2026-10-31'),
  ('places_details_ids', 0, 'Place Details Essentials (IDs Only): the photos field, free cap Unlimited', 'https://developers.google.com/maps/billing-and-pricing/pricing', '2026-10-31'),
  ('places_details_pro', 17000, 'Place Details Pro (displayName, with formattedAddress and location), US$17.00 per 1,000', 'https://developers.google.com/maps/billing-and-pricing/pricing', '2026-10-31')
on conflict (api) do nothing;

create table if not exists public.venue_google_places (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  place_id text not null check (place_id ~ '^[A-Za-z0-9_-]{10,255}$'),
  -- Our own record of WHY this place is our venue: the name, address and distance src/lib/places/venue-match.ts read.
  match_evidence jsonb not null,
  matched_at timestamptz not null default now(),
  -- A person looked at the venue's current Google photos and said they show this venue (no logos, menus, screenshots).
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  refused_reason text check (refused_reason is null or length(btrim(refused_reason)) between 3 and 300),
  constraint venue_google_places_decided_once check (not (approved_at is not null and refused_reason is not null)),
  constraint venue_google_places_approval_whole check ((approved_at is null) = (approved_by is null))
);

comment on table public.venue_google_places is
  'The Google place id of a venue, the evidence it is that venue, and a person''s decision on its Google photos. Google allows the place id to be kept; photo names and photos are fetched fresh and never stored.';

alter table public.venue_google_places enable row level security;
-- The 21 October 2026 grant rule: revoke, then grant exactly what the policies serve. Server jobs and the photo route
-- only; no visitor reads this table.
revoke all on public.venue_google_places from anon, authenticated, service_role;
grant select, insert, update, delete on public.venue_google_places to service_role;
