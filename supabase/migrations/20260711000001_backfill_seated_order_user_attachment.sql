-- ============================================================
-- Backfill: attach defect-era seated orders to their registered buyers
-- Founder-approved 2026-07-11 (seated-attachment mission).
-- ============================================================
-- The seated checkout hardcoded orders.user_id = NULL until fix fd9d744
-- (2026-07-10), so a signed-in buyer's seated purchase was recorded as a
-- guest order: invisible in My Tickets (RLS keys off orders.user_id) and
-- not owner-transferable. This backfill additively fills user_id where the
-- order's guest_email matches a registered account, for SEATED orders only
-- (tickets carrying a seat_id), created before the fix was live.
--
-- Safety properties:
--   * Additive only: fills a NULL, changes nothing else. guest_email and
--     guest_name stay in place as the historical contact record (the email
--     resolvers already prefer them, so no behaviour changes beyond the
--     buyer's own account visibility).
--   * Scoped to the defect: seated orders only, created before
--     2026-07-10 22:00 UTC (the last defect-era order is 14:01 UTC; the
--     fixed build was serving staging by ~22:45 UTC). A future genuine
--     guest order whose email happens to match a registered account can
--     never be retro-attributed by this migration.
--   * Idempotent: re-running matches zero rows once filled.
-- ============================================================

UPDATE public.orders o
   SET user_id = p.id
  FROM public.profiles p
 WHERE o.user_id IS NULL
   AND o.guest_email IS NOT NULL
   AND lower(p.email) = lower(o.guest_email)
   AND o.created_at < '2026-07-10T22:00:00Z'
   AND EXISTS (
     SELECT 1
       FROM public.tickets t
      WHERE t.order_id = o.id
        AND t.seat_id IS NOT NULL
   );
