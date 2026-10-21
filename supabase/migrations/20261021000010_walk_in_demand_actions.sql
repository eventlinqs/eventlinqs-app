-- ============================================================================
-- WI1, FREE WALK-IN EVENTS. Part 1 of 2: three new demand actions.
--
-- WHAT THIS FILE ADDS. Three values on public.ledger_demand_action, so the
-- slot ledger can record the conversions a free event has once a walk-in page
-- exists: somebody added it to a calendar, somebody shared it, somebody
-- followed its organiser from it. WI1-ITEM.md, point 5: "Numbers for the
-- organiser: views, Remind me sign-ups, calendar adds, shares and follows."
-- Views are already page_view rows, and Remind me sign-ups are rows of their
-- own (part 2), so these three are the ones the ledger cannot yet name.
--
-- WHY ALONE IN ITS FILE. PostgreSQL 18, ALTER TYPE:
--   "If ALTER TYPE ... ADD VALUE (the form that adds a new value to an enum
--    type) is executed inside a transaction block, the new value cannot be
--    used until after the transaction has been committed."
--   https://www.postgresql.org/docs/current/sql-altertype.html (read 2026-10-21)
-- The Supabase CLI runs each file as its own implicit transaction, so the
-- CHECK that names these values lives in the next file,
-- 20261021000020_free_walk_in_entry.sql. 20260906000001 made the same split
-- for event_status 'archived'.
--
-- REVERSIBLE? An enum value cannot be dropped in place. Nothing writes these
-- values until the code that names them ships, so leaving them unused is
-- harmless. Removing them means a new type without them and a retyped column.
--
-- TRANSACTION SHAPE: three ADD VALUE IF NOT EXISTS statements, re-runnable.
--
-- Lawal applies it with `npm run migrate:production` from PowerShell.
-- ============================================================================

ALTER TYPE public.ledger_demand_action ADD VALUE IF NOT EXISTS 'calendar_add';
ALTER TYPE public.ledger_demand_action ADD VALUE IF NOT EXISTS 'share';
ALTER TYPE public.ledger_demand_action ADD VALUE IF NOT EXISTS 'follow';
