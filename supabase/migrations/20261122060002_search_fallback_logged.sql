-- THE SEARCH FALLBACK IS NEVER SILENT (the PM's order of 22 November 2026, 05:45, condition (b): "the fallback to the
-- old word filter writes a line to the search log every time it is used, so a silent fallback can never hide a broken
-- engine"). WINDOW 5C.
--
-- When the one search engine (search_events, 20261122060001) cannot answer, /events answers with the old word filter
-- (src/lib/events/fetchers.ts resolveSearch) and now writes one row to the search log with surface 'events-fallback':
-- the term and nothing else, by the same rule every search row keeps (src/lib/analytics/search-record.ts searchTerm: no
-- address, no number, no web address). The learning loop and the morning report read the same table, so a broken engine
-- shows there the hour it happens. The table's grants are unchanged (the service role writes; no visitor reads it).
alter table public.site_searches drop constraint if exists site_searches_surface_check;
alter table public.site_searches add constraint site_searches_surface_check check (surface in ('events', 'events-fallback'));
