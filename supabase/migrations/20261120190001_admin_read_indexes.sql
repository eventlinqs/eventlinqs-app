-- EVERY ADMIN READ IN ONE SECOND, THE INDEXES (law 41, Lawal, 20 November 2026, 16:08; the PM's 18:42 order, item 2: name
-- the slow read from the code and its row count, fix at the cause, an index where an index is the cause).
--
-- Read on production before this was written (C:\dev\EVIDENCE\EL-20NOV\speed\): these reads scanned whole tables because
-- nothing indexed what they filter on, on a database whose compute is the default Micro (2 shared cores, 1 GB), where a
-- whole scan of a table of a thousand wide rows costs about a tenth of a second and dozens fired by one page queue.
-- Each index below was built inside a rolled back transaction on production and its read timed before and after
-- (idx-proof-tx.sql and idx-proof-2-tx.sql, 19:10 and 19:12 on 20 November 2026; EXPLAIN ANALYZE execution time):
--   /admin/engine, each automation's checks by writer and day (listing_checks, import_file LIKE a prefix): 99.8 to 0.32 ms;
--   its newest check by writer: 343.8 to 0.02 ms;
--   its sweep's redraws by day (social_piece_revisions by made_by and made_at): 354.3 to 0.19 ms;
--   the founder dashboard's venue photographs waiting (venue_images by approval_state): 103.5 to 0.06 ms;
--   the social pages' pieces with their decisions (social_piece_decisions by piece_id; 56,328 whole scans, no index
--   scan, in production's own counters): 42.9 to 1.6 ms;
--   the engine's booking links checked by day (event_booking_links by price_checked_at): 12.0 to 0.04 ms.
--
-- Indexes only: no row, column, rule or grant changes. Each is created if absent, so the migration can run again.
-- text_pattern_ops because the database collation is en_US.UTF-8 (pg_database, read 18:47): the pattern operator classes
-- compare "strictly character by character rather than according to the locale-specific collation rules. This makes these
-- operator classes suitable for use by queries involving pattern matching expressions (LIKE or POSIX regular expressions)
-- when the database does not use the standard "C" locale" (https://www.postgresql.org/docs/17/indexes-opclass.html, read
-- 20 November 2026).

create index if not exists listing_checks_writer_at on public.listing_checks (import_file text_pattern_ops, checked_at desc);
create index if not exists listing_checks_at on public.listing_checks (checked_at desc);
create index if not exists social_piece_revisions_made_by_at on public.social_piece_revisions (made_by, made_at desc);
create index if not exists venue_images_approval_state on public.venue_images (approval_state);
create index if not exists social_piece_decisions_piece on public.social_piece_decisions (piece_id);
create index if not exists event_booking_links_price_checked_at on public.event_booking_links (price_checked_at desc);
