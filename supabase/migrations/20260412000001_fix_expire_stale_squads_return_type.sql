-- Migration: 20260412000001_fix_expire_stale_squads_return_type
-- ============================================================
-- Changes expire_stale_squads() from RETURNS INT to RETURNS TABLE
-- so the cron route can iterate over expired squad rows directly
-- and process Stripe refunds without a follow-up SELECT query.
--
-- The function body now uses a single CTE statement that atomically:
--   1. Marks qualifying squads as 'expired'
--   2. Marks uninvited members as 'timed_out'
--   3. Cancels the squad's reservation
--   4. RETURNs the expired squad rows for Stripe refund processing
--
-- Safe to run on live DB:
--   - DROP IF EXISTS removes the old integer-returning signature
--     (required — PostgreSQL won't let CREATE OR REPLACE change return type)
--   - The pg_cron job that calls SELECT public.expire_stale_squads() still
--     works with a TABLE-returning function; pg_cron discards the result set
-- ============================================================

-- Step 1: Drop the old integer-returning function
DROP FUNCTION IF EXISTS public.expire_stale_squads();

-- Step 2: Create new function returning TABLE of expired squad details
CREATE OR REPLACE FUNCTION public.expire_stale_squads()
RETURNS TABLE (
  squad_id        UUID,
  event_id        UUID,
  ticket_tier_id  UUID,
  total_spots     INTEGER,
  reservation_id  UUID,
  share_token     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Single atomic CTE statement:
  --   • expired CTE: UPDATE squads → 'expired', RETURNING the row details
  --   • _mark_members CTE: UPDATE squad_members → 'timed_out' for invited
  --     members of just-expired squads (uses RETURNING ids from expired)
  --   • _cancel_reservations CTE: UPDATE reservations → 'cancelled' for
  --     the reservation held by each expired squad
  --   • Final SELECT: return the expired squad rows to the caller
  --
  -- All three UPDATEs execute within the same transaction using the same
  -- database snapshot. Data-modifying CTEs in PostgreSQL see the RETURNING
  -- values from earlier CTEs in the same statement, so _mark_members and
  -- _cancel_reservations can join against the expired CTE's output.
  RETURN QUERY
  WITH expired AS (
    UPDATE public.squads
    SET status = 'expired'
    WHERE status = 'forming'
      AND expires_at < NOW()
    RETURNING
      id,
      public.squads.event_id,
      public.squads.ticket_tier_id,
      public.squads.total_spots,
      public.squads.reservation_id,
      public.squads.share_token
  ),
  _mark_members AS (
    UPDATE public.squad_members sm
    SET status = 'timed_out'
    FROM expired e
    WHERE sm.squad_id = e.id
      AND sm.status = 'invited'
  ),
  _cancel_reservations AS (
    UPDATE public.reservations r
    SET status = 'cancelled'
    FROM expired e
    WHERE r.id = e.reservation_id
      AND r.status = 'active'
  )
  SELECT
    e.id            AS squad_id,
    e.event_id      AS event_id,
    e.ticket_tier_id AS ticket_tier_id,
    e.total_spots   AS total_spots,
    e.reservation_id AS reservation_id,
    e.share_token   AS share_token
  FROM expired e;
END;
$$;

-- Step 3: Re-grant execute permission to service_role
GRANT EXECUTE ON FUNCTION public.expire_stale_squads() TO service_role;
