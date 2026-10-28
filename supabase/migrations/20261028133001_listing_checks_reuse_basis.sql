-- ============================================================================
-- EVERY LISTING CHECK RECORDS ITS REUSE BASIS, HELD BY THE DATABASE.
--
-- Release checklist of 28 October 2026, A4 ("every imported event has a recorded
-- source and a valid reuse basis", proved by a query showing zero published
-- events without both) and D8 ("each manual event records its source page and
-- basis"). listing_checks already holds the source: source_url and source_date
-- are not null (20261023000010) and https only (20261027220001). The basis was
-- nowhere: it lived in the import's design (the row file has no image column and
-- its words are EventLinqs' own), which a query cannot read.
--
-- WHAT THIS FILE ADDS. One column, reuse_basis, from a closed list:
--   manual_research_facts_only  the night's facts (name, date, time, place, price,
--                               booking links) read from the host's own public
--                               page, written in EventLinqs' own words; no image,
--                               poster or description of theirs is copied
--   licensed_source             from a listing_sources row whose terms licence
--                               the reuse (the collection run)
--   organiser_submission        sent in by the organiser, with their permission
--   venue_permission            from a venue that gave permission for its programme
-- Every check written before this file came from a manual research row file
-- (production on 28 October: 51 from "import 2026-10-26 checked by the project
-- manager.csv" and 25 from "import-2026-10-27-wi3-free-25.csv", nothing else), so
-- the column is added with that value as its default, which fills those rows
-- without an UPDATE (the table is append-only).
--
-- THE DEFAULT STAYS, ON PURPOSE. Production runs main's code between this file
-- and the deploy that carries the writer below, and main's import does not name
-- the column; dropping the default would make that import fail in the gap, and
-- any TEST drive on an older tree with it. The only writer today is that manual
-- import, so the default is true of every row it writes. That every writer
-- STATES its basis is held in code instead: the import writes it by name
-- (src/lib/listings/import-write.ts, MANUAL_RESEARCH_BASIS), and
-- tests/unit/listings/checks-state-their-basis.test.ts fails when any insert
-- into listing_checks in src or scripts does not name reuse_basis, so a
-- collection run or a submission cannot fall through to the manual default.
--
-- No new table, so no grant: listing_checks keeps select and insert for
-- service_role only.
--
-- REVERSIBLE? Drop the column; only the import and the A4 query read it.
--
-- Lawal applies it with `supabase db push --linked` in PowerShell.
-- ============================================================================

begin;

alter table public.listing_checks
  add column if not exists reuse_basis text not null default 'manual_research_facts_only';

alter table public.listing_checks drop constraint if exists listing_checks_reuse_basis_known;
alter table public.listing_checks
  add constraint listing_checks_reuse_basis_known
  check (reuse_basis in ('manual_research_facts_only', 'licensed_source', 'organiser_submission', 'venue_permission'));

-- Idempotent on a database that already has the column (TEST had it applied
-- once without the default): the default is set here explicitly as well.
alter table public.listing_checks alter column reuse_basis set default 'manual_research_facts_only';

comment on column public.listing_checks.reuse_basis is
  'Why EventLinqs may show this night: manual_research_facts_only (facts from the host''s own page, our words, nothing of theirs copied), licensed_source, organiser_submission or venue_permission. Release checklist A4 and D8, 28 October 2026.';

commit;
