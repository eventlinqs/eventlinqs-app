-- RECORD TWO COLUMNS THAT REACHED PRODUCTION WITHOUT A MIGRATION.
--
-- WHAT WAS FOUND, 21 August 2026, while investigating the types-drift failure on
-- PR #119. public.refunds carries two columns on PRODUCTION that no migration in
-- this repository creates:
--
--     refunds.stripe_refund_status   text, nullable, no default
--     refunds.stripe_pending_reason  text, nullable, no default
--
-- HOW THAT WAS ESTABLISHED, because "no migration creates it" is a claim that has
-- to be proven rather than asserted:
--   * Neither name appears in any .sql file in supabase/migrations.
--   * Neither name appears in ANY commit on ANY branch, ever:
--     `git log --all -S<name> -- '*.sql'` returns nothing.
--   * Neither name appears anywhere in src/ or scripts/. No application code
--     reads or writes them.
--   * TEST (vkapkibzokmfaxqogypq), which has all 96 migrations applied as of
--     21 August 2026, does NOT have them. If a migration created them, TEST
--     would.
--   * Production's ledger is otherwise clean: 88 rows, every one matching a file
--     in the tree by BOTH version and name, zero applied-with-no-file.
--
-- So they were applied by hand, outside the migration files. That is the finding,
-- and it matters more than the columns do: it means the migrations stopped
-- describing the database, and a future migration could collide with something
-- nobody knew was there.
--
-- WHY THIS MIGRATION ADDS THEM RATHER THAN DROPPING THEM. Recording reality is
-- non-destructive and reversible; dropping a production column is neither, and
-- the founder reserved that decision. This file makes the repository describe the
-- database as it actually is, today, so the two stop being invisible. If the
-- founder rules they should not exist, DELETE THIS FILE and run:
--
--     ALTER TABLE public.refunds
--       DROP COLUMN IF EXISTS stripe_refund_status,
--       DROP COLUMN IF EXISTS stripe_pending_reason;
--
-- Nothing is lost either way: measured on production on 21 August 2026, refunds
-- held 0 rows, and both columns were non-null in 0 of them. There is no
-- constraint, no index and no default attached to either.
--
-- IDEMPOTENT BY REQUIREMENT, not by habit. Production ALREADY has both columns,
-- so this migration must be a no-op there while still creating them on TEST,
-- staging and any future environment. `ADD COLUMN IF NOT EXISTS` is exactly that,
-- and it is why this file is safe to include in the same push as everything else.
--
-- The types are generated from a database that has this applied, so committing
-- this is what stops `refunds.stripe_refund_status` reading as drift forever.

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS stripe_refund_status TEXT;

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS stripe_pending_reason TEXT;

COMMENT ON COLUMN public.refunds.stripe_refund_status IS
  'Recorded 2026-08-21 as pre-existing on production with no migration of origin. '
  'Unused by application code at the time of recording. See '
  'supabase/migrations/20260821000001_record_out_of_band_refund_columns.sql.';

COMMENT ON COLUMN public.refunds.stripe_pending_reason IS
  'Recorded 2026-08-21 as pre-existing on production with no migration of origin. '
  'Unused by application code at the time of recording. See '
  'supabase/migrations/20260821000001_record_out_of_band_refund_columns.sql.';
