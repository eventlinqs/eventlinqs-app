-- ============================================================================
-- EVERY LISTING SOURCE ADDRESS IS HTTPS, HELD BY THE DATABASE.
--
-- The project manager's security pass of 27 October 2026 (the 21:51, (C)):
-- "every booking and source URL is https only (no javascript:, data:, http:) at
-- import and on save". The database already holds it for events.external_ticket_url
-- (20260815000001), share_links' destination (20260815000001), venues.website_url
-- (20261023000010), event_series.instagram_post_url (20261023000010) and
-- event_booking_links.url (20261027130001). listing_checks.source_url, the page
-- the import read a night from and the one a free night's button may open as
-- "See the original listing", had no such check, and the import took http:
-- (src/lib/listings/listing-rows.ts, fixed beside this file).
--
-- WHAT THIS FILE ADDS. One check constraint on listing_checks.source_url, the same
-- pattern as event_booking_links'. It is added NOT VALID, so every new row is held
-- to it from this moment while no existing row can fail the migration, then
-- validated in the same transaction when every existing row already meets it.
--
-- REVERSIBLE? Drop the constraint; nothing else reads it.
--
-- Lawal applies it with `supabase db push --linked` in PowerShell.
-- ============================================================================

begin;

alter table public.listing_checks drop constraint if exists listing_checks_source_url_https_only;
alter table public.listing_checks
  add constraint listing_checks_source_url_https_only
  check (source_url ~* '^https://[^[:space:]]+$') not valid;

do $validate$
begin
  if not exists (select 1 from public.listing_checks where source_url !~* '^https://[^[:space:]]+$') then
    alter table public.listing_checks validate constraint listing_checks_source_url_https_only;
  end if;
end
$validate$;

commit;
