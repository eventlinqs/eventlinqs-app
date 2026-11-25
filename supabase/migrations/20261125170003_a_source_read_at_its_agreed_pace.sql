-- A SOURCE IS READ AT ITS OWNER'S AGREED PACE (WINDOW 5C, 25 November 2026; the PM's 15:51 item 3: Bendigo Tourism said
-- yes at 15:44 to our letter's process, "read weekly, each event reviewed by a person before it shows, title, date, venue
-- and organiser with a link to its calendar page, no photo or description copied", and the source is turned on "under
-- exactly that process").
--
-- The collection run reads every source marked 'read' once a day (Lawal, 1 November 2026, 16:15; src/lib/listings/
-- collect.ts dueSources), and refresh_interval_hours is held between 6 and 24, so nothing could keep a promise to read a
-- source less often. read_at_most_every_days is the most often its owner agreed we read it: dueSources reads it again only
-- once that many days have passed since its last successful read. Null for every other source, which keeps its daily read.
--
-- Additive only: no row is changed, nothing is dropped, and no new table is made, so no grant is written.

alter table public.listing_sources
  add column if not exists read_at_most_every_days smallint
    constraint listing_sources_read_at_most_every_days check (read_at_most_every_days is null or read_at_most_every_days between 1 and 31);

comment on column public.listing_sources.read_at_most_every_days is
  'The most often the source''s owner agreed we read it, in days (Bendigo Tourism, 25 November 2026: weekly). The collection run reads it again only that long after its last successful read. Null: read daily.';
