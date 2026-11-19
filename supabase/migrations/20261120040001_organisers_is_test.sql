-- A TEST ORGANISER IS NEVER A HOST TO RECRUIT OR A FIGURE (the PM's 02:39 of 20 November 2026, item 5, on WINDOW 5A's
-- 02:34: the acceptance tests T2, T3, T8 and T9 run on a test organiser with a test address on our own domain).
--
-- Read on production at 03:17 on 20 November 2026: no organiser carries a test mark, and the daily twenty
-- (src/lib/outreach/daily-twenty-read.ts) takes every organiser by its acquisition state, so a test organiser written
-- without one would enter the acquisition list and the first contact count (law 24) like a real host. With this column
-- set, src/lib/growth/platform-organiser.ts (readPlatformOrganiserIds, the one rule every acquisition and growth read of
-- the organisers already goes through, held by scripts/guards/growth-reads-skip-the-platform.mjs) leaves it out with the
-- platform's own listings organisation; the CRM's own record of it and the communications centre still show it, so a
-- test reply is read, matched and answered like a real one.
--
-- TRANSACTION SHAPE: one ADD COLUMN IF NOT EXISTS with a constant default (no table rewrite on PostgreSQL 11 and later:
-- "When a column is added with ADD COLUMN and a non-volatile DEFAULT is specified, the default is evaluated at the time
-- of the statement and the result stored in the table's metadata", https://www.postgresql.org/docs/current/sql-altertable.html),
-- re-runnable; no existing row changes meaning (every one reads false).
alter table public.organisers add column if not exists is_test boolean not null default false;

comment on column public.organisers.is_test is
  'A record made for the acceptance tests (the PM''s 02:39 of 20 November 2026, item 5): never a host to recruit or a figure; every acquisition and growth read leaves it out (src/lib/growth/platform-organiser.ts).';
