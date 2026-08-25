-- ===========================================================================
-- ONE PLACE THAT KNOWS HOW TO RECOUNT EVERY STORED FIGURE
-- ===========================================================================
--
-- FOUNDER RULING, 25 August 2026:
--
--   "A recurring reconciliation that compares every stored figure against a live
--    recount and reports disagreement. Nine of nine organisations disagree with
--    their own rows today; I want that number visible, not discovered."
--
-- ---------------------------------------------------------------------------
-- WHY A VIEW RATHER THAN THE QUERIES LIVING IN THE SCRIPT
-- ---------------------------------------------------------------------------
--
-- The reconciliation has two callers with two different transports: a script
-- that opens Postgres directly, and an hourly cron route inside the application
-- that speaks PostgREST with the service role. Writing the recount twice, once
-- per transport, is the exact shape this whole pass has been removing: a second
-- copy of something, free to drift from the first.
--
-- So the recount lives HERE, once, and both callers read it. The prose beside
-- each figure, what maintains it and what was ruled about it, stays in
-- scripts/lib/stored-aggregates.mjs, which is where a human reads it and where
-- the build guard reads it.
--
-- ---------------------------------------------------------------------------
-- IT REPORTS, IT NEVER REPAIRS
-- ---------------------------------------------------------------------------
--
-- A view cannot repair anything, and that is deliberate rather than incidental.
-- A reconciliation that silently corrected a figure would destroy the evidence
-- of how it came to be wrong, and the whole value of this pass has been that the
-- evidence survived long enough to name the cause.
--
-- ---------------------------------------------------------------------------
-- WHAT IS NOT IN IT, AND WHY
-- ---------------------------------------------------------------------------
--
--   tickets.scan_count            counts successful admits; ticket_scans logs
--                                 every attempt including failures. Different
--                                 questions, not two copies of one.
--   tier_access_codes.current_uses  there is no usages table, so there are no
--                                 rows to recount against.
--   digest_sends.*                a historical record of one send.
--   *.max_uses                    a limit the organiser sets.
--
-- Each of those carries its verdict in the registry rather than being silently
-- absent, because an enumeration with quiet omissions is not an enumeration.
-- ===========================================================================

DROP VIEW IF EXISTS public.stored_aggregate_drift;

CREATE VIEW public.stored_aggregate_drift AS

-- events.is_free: the model. A trigger recomputes it from the whole tier set on
-- INSERT, UPDATE and DELETE of ticket_tiers.
SELECT
  'events.is_free'::text                                   AS column_name,
  e.id::text                                               AS key,
  (e.is_free)::text                                        AS stored,
  (coalesce(max(t.price), 0) = 0)::text                    AS truth
FROM public.events e
LEFT JOIN public.ticket_tiers t ON t.event_id = e.id
GROUP BY e.id, e.is_free

UNION ALL

-- event_addons.sold_count: recomputed from confirmed order items since
-- migration 20260825000001. Nothing wrote it before that.
SELECT
  'event_addons.sold_count'::text,
  a.id::text,
  a.sold_count::text,
  coalesce(sum(oi.quantity) FILTER (WHERE o.status = 'confirmed'), 0)::text
FROM public.event_addons a
LEFT JOIN public.order_items oi ON oi.addon_id = a.id
LEFT JOIN public.orders o ON o.id = oi.order_id
GROUP BY a.id, a.sold_count

UNION ALL

-- organisations.total_event_count: recomputed from events since migration
-- 20260825000003. Incremented with no decrement anywhere before that.
SELECT
  'organisations.total_event_count'::text,
  o.id::text,
  o.total_event_count::text,
  count(e.id)::text
FROM public.organisations o
LEFT JOIN public.events e ON e.organisation_id = o.id
GROUP BY o.id, o.total_event_count

UNION ALL

-- ticket_tiers.reserved_count: acquired under a row lock by create_reservation,
-- returned by on_reservation_released and by the expire sweeper.
SELECT
  'ticket_tiers.reserved_count'::text,
  t.id::text,
  t.reserved_count::text,
  coalesce((
    SELECT sum((i->>'quantity')::int)
    FROM public.reservations r, jsonb_array_elements(r.items) i
    WHERE r.status = 'active'
      AND r.expires_at > now()
      AND (i->>'ticket_tier_id')::uuid = t.id
  ), 0)::text
FROM public.ticket_tiers t

UNION ALL

-- ticket_tiers.sold_count: FOUNDER RULING 25 August 2026, stays as it is.
-- Reconciled anyway so a drift is visible while it is unfixed.
SELECT
  'ticket_tiers.sold_count'::text,
  t.id::text,
  t.sold_count::text,
  coalesce((
    SELECT count(*)
    FROM public.tickets k
    WHERE k.ticket_tier_id = t.id AND k.status IN ('valid', 'scanned')
  ), 0)::text
FROM public.ticket_tiers t

UNION ALL

-- discount_codes.current_uses: FOUNDER RULING 25 August 2026, stays as it is.
SELECT
  'discount_codes.current_uses'::text,
  d.id::text,
  d.current_uses::text,
  count(u.id) FILTER (WHERE o.status = 'confirmed')::text
FROM public.discount_codes d
LEFT JOIN public.discount_code_usages u ON u.discount_code_id = d.id
LEFT JOIN public.orders o ON o.id = u.order_id
GROUP BY d.id, d.current_uses

UNION ALL

-- organisations.total_volume_cents: DEFERRED 25 August 2026. The recount is the
-- gross of confirmed orders, so a partial refund makes the stored value read
-- LOWER by design; a stored value HIGHER than the recount is real drift.
SELECT
  'organisations.total_volume_cents'::text,
  o.id::text,
  o.total_volume_cents::text,
  coalesce(sum(ord.total_cents) FILTER (WHERE ord.status = 'confirmed'), 0)::text
FROM public.organisations o
LEFT JOIN public.orders ord ON ord.organisation_id = o.id
GROUP BY o.id, o.total_volume_cents

UNION ALL

-- organisations.hold_amount_cents: DEFERRED 25 August 2026. Four money-path
-- writers, three of them SQL functions on the payout path.
SELECT
  'organisations.hold_amount_cents'::text,
  o.id::text,
  o.hold_amount_cents::text,
  coalesce(sum(h.amount_cents) FILTER (
    WHERE h.hold_type = 'reserve' AND h.released_at IS NULL
  ), 0)::text
FROM public.organisations o
LEFT JOIN public.payout_holds h ON h.organisation_id = o.id
GROUP BY o.id, o.hold_amount_cents;

COMMENT ON VIEW public.stored_aggregate_drift IS
  'Every stored count or total, beside a live recount of the rows it summarises. One row per (column, entity). Reported by scripts/verify/aggregate-reconcile.mjs and by the daily /api/cron/aggregate-reconcile. The prose verdict for each column is scripts/lib/stored-aggregates.mjs. It reports; it never repairs.';

-- ---------------------------------------------------------------------------
-- PRIVILEGES: nobody untrusted reads this.
-- ---------------------------------------------------------------------------
--
-- It exposes per-organisation lifetime volume and per-tier sold counts, which is
-- exactly the commercial data the column lockdown of migration 20260808000010
-- revoked from anon and authenticated. A view inherits nothing useful here, so
-- it is stated: the service role reads it, and nobody else.
REVOKE ALL ON public.stored_aggregate_drift FROM PUBLIC;
REVOKE ALL ON public.stored_aggregate_drift FROM anon, authenticated;
GRANT SELECT ON public.stored_aggregate_drift TO service_role;
