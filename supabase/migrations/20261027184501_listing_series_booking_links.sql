-- WI3, the import's half: a listing night EventLinqs found sold elsewhere keeps
-- the places it sells until the listings run makes each dated night
-- (window 4, 27 October 2026; docs/walk-in/WI3-DECISION.md, "Window 4: the
-- import's multi URL rows call bookingLinksSql and sameEvent").
--
-- The import writes hosts, event_series and listing_checks; the dated events
-- are made later by the listings run (src/lib/listings/occurrence-store.ts).
-- So the links live on the series, and the run writes them into
-- event_booking_links (set_by curated) for each night it makes, where the
-- database chooses the button and keeps events.external_ticket_url its mirror
-- (20261027130001).
--
-- Each element: { "url": https address, "kind": tickets | free_register,
-- "price_from_cents": integer or null, "price_checked_on": "YYYY-MM-DD" or
-- null }. An empty array is a free walk-in night, as every series is today.
--
-- GRANTS: no new table. event_series keeps the grants of 20261023000010
-- (anon and authenticated select active series; service_role select, insert,
-- update), and a new column is covered by them.

alter table public.event_series
  add column if not exists booking_links jsonb not null default '[]'::jsonb;

alter table public.event_series drop constraint if exists event_series_booking_links_is_array;
alter table public.event_series
  add constraint event_series_booking_links_is_array check (jsonb_typeof(booking_links) = 'array');

comment on column public.event_series.booking_links is
  'The places a listing night EventLinqs found sells, written by the import; the listings run copies them into event_booking_links for each dated night. Empty for a free walk-in night. WI3.';
