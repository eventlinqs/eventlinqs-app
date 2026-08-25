-- ===========================================================================
-- TWO STORED COUNTS THAT DID NOT FOLLOW THE ROWS THEY SUMMARISE
-- ===========================================================================
--
-- Both were driven against TEST on 25 August 2026 by
-- scripts/verify/aggregate-drift-drive.mjs, which moves each figure through its
-- real maintainer first (a positive control) before changing the underlying
-- rows some other way.
--
-- 1. ticket_tiers.reserved_count, when a reservation is DELETED.
--
--    reservation_cancelled_trigger is `AFTER UPDATE ... WHEN (new.status =
--    'cancelled' AND old.status = 'active')`. It is correct and it fires. A
--    DELETE of an active reservation is not an UPDATE, so nothing fires and the
--    seats stay held forever. Driven:
--
--      create_reservation(4)                reserved_count 0 -> 4   FOLLOWS
--      status set to cancelled              reserved_count 4 -> 0   FOLLOWS
--      the active reservation row DELETED   reserved_count 4 -> 4   DRIFTS
--                                           (live holds: 0)
--
--    The consequence is silent lost capacity: four seats nobody holds and
--    nobody can buy, on a tier that reads as fuller than it is.
--
-- 2. event_addons.sold_count, always.
--
--    Nothing in the repository has ever written this column. Not a migration,
--    not a trigger, not a line of TypeScript. It is created 0 and stays 0.
--
--    That is not a cosmetic problem, because the checkout selector caps an addon
--    at `total_capacity - sold_count`
--    (src/components/checkout/ticket-selector.tsx). The cap therefore never
--    shrinks. Driven: an addon with total_capacity 2 was sold twice on a
--    confirmed order and sold_count stayed 0, so the cap still read 2 and the
--    next buyer saw it as fully available. A capped addon could be sold without
--    limit.
--
-- ===========================================================================
-- WHY BOTH FIXES RECOMPUTE RATHER THAN ADJUST
-- ===========================================================================
--
-- The platform already has a stored value that does NOT drift, and it is the
-- model followed here: `events.is_free`. Its trigger fires AFTER INSERT OR
-- DELETE OR UPDATE on ticket_tiers and RECOMPUTES from the whole tier set:
--
--     UPDATE events SET is_free = (SELECT COALESCE(MAX(price),0) = 0
--                                    FROM ticket_tiers WHERE event_id = ...)
--
-- Driven in the same run: price set to 0 -> is_free true; price restored ->
-- is_free false. It FOLLOWS, both directions, because a recompute has no
-- accumulated error to carry and no event it can miss.
--
-- An increment can miss a path. A recompute cannot. So the addon count is
-- recomputed from its order items, and the reservation trigger is widened to
-- the DELETE it was missing.
--
-- ===========================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH
-- ===========================================================================
--
-- ticket_tiers.sold_count is NOT converted to a recompute here, and the reason
-- is written down so the omission is not read as an oversight. It is the
-- oversell figure, it is maintained under a row lock inside confirm_order and
-- reconcile_refund, and for a reserved-seating event the truth lives in the
-- seats table rather than in tickets (see the comment in
-- src/app/(dashboard)/dashboard/events/page.tsx). Rewriting how the oversell
-- figure is maintained is a change to the money path and does not belong inside
-- an audit pass. It is measured by the drift drive and reported, not silently
-- rebuilt.
--
-- Likewise organisations.total_event_count / total_volume_cents /
-- hold_amount_cents: all three drift, all three are admin-display figures, and
-- the fix applied in the same pass is to stop rendering the stored copy at all
-- (src/lib/admin/organisers.ts now counts the rows). No column is dropped,
-- because connect-ledger still writes them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. reserved_count survives a DELETE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.on_reservation_released()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
BEGIN
  -- One function for both shapes. On UPDATE it must only act on the
  -- active -> cancelled transition, which the trigger's WHEN clause already
  -- restricts; on DELETE the row is going away, so any still-active reservation
  -- is releasing its hold.
  IF TG_OP = 'UPDATE' AND NOT (NEW.status = 'cancelled' AND OLD.status = 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status <> 'active' THEN
    -- Already released by the cancel or expire path. Subtracting again would
    -- take the count BELOW the truth, which is the opposite failure and is
    -- worse: it oversells.
    RETURN OLD;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(OLD.items)
  LOOP
    IF v_item ? 'ticket_tier_id' THEN
      v_tier_id := (v_item->>'ticket_tier_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;

      UPDATE public.ticket_tiers
      SET reserved_count = GREATEST(reserved_count - v_quantity, 0)
      WHERE id = v_tier_id;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.on_reservation_released() IS
  'Returns held seats to ticket_tiers.reserved_count when an active reservation is cancelled OR deleted. Replaces on_reservation_cancelled, which handled only the UPDATE.';

DROP TRIGGER IF EXISTS reservation_cancelled_trigger ON public.reservations;
DROP TRIGGER IF EXISTS reservation_released_trigger ON public.reservations;

CREATE TRIGGER reservation_released_trigger
  AFTER UPDATE OR DELETE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.on_reservation_released();

-- ---------------------------------------------------------------------------
-- 2. event_addons.sold_count is recomputed from the order items
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_addon_sold_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addon UUID;
BEGIN
  v_addon := COALESCE(NEW.addon_id, OLD.addon_id);
  IF v_addon IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.event_addons a
  SET sold_count = COALESCE((
        SELECT SUM(oi.quantity)
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.addon_id = v_addon
          AND o.status = 'confirmed'
      ), 0)
  WHERE a.id = v_addon;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.recompute_addon_sold_count() IS
  'Recomputes event_addons.sold_count from confirmed order_items. Modelled on update_event_is_free: a recompute cannot accumulate error and cannot miss a path.';

DROP TRIGGER IF EXISTS trg_recompute_addon_sold_count ON public.order_items;
CREATE TRIGGER trg_recompute_addon_sold_count
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_addon_sold_count();

-- An order changing status changes every addon count under it, and that path
-- goes through `orders`, not `order_items`. Without this half, an order
-- confirming would not move the count that the checkout cap reads.
CREATE OR REPLACE FUNCTION public.recompute_addon_sold_counts_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  UPDATE public.event_addons a
  SET sold_count = COALESCE((
        SELECT SUM(oi2.quantity)
        FROM public.order_items oi2
        JOIN public.orders o2 ON o2.id = oi2.order_id
        WHERE oi2.addon_id = a.id
          AND o2.status = 'confirmed'
      ), 0)
  WHERE a.id IN (
    SELECT oi.addon_id
    FROM public.order_items oi
    WHERE oi.order_id = COALESCE(NEW.id, OLD.id)
      AND oi.addon_id IS NOT NULL
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_addon_sold_counts_for_order ON public.orders;
CREATE TRIGGER trg_recompute_addon_sold_counts_for_order
  AFTER UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_addon_sold_counts_for_order();

-- ---------------------------------------------------------------------------
-- 3. BACKFILL. Every addon in the database currently reads 0 whatever it sold.
-- ---------------------------------------------------------------------------

UPDATE public.event_addons a
SET sold_count = COALESCE((
      SELECT SUM(oi.quantity)
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.addon_id = a.id
        AND o.status = 'confirmed'
    ), 0)
WHERE a.sold_count IS DISTINCT FROM COALESCE((
      SELECT SUM(oi.quantity)
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.addon_id = a.id
        AND o.status = 'confirmed'
    ), 0);
