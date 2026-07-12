-- Round-2 battery root fix (2026-07-12): expire_stale_reservations crashed
-- with 'cannot extract elements from an object' whenever a stale SEAT
-- reservation existed - seat reservations store items as the OBJECT
-- { seat_ids: [...] } while the GA sweeper assumed an ARRAY of tier items.
-- One stale seat hold therefore poisoned the whole sweep and GA
-- reservations stopped expiring (oversell / lockout risk on a busy
-- on-sale). The fix guards on jsonb_typeof: array-shaped items release
-- tier counts as before; object-shaped (seat) reservations are still
-- marked expired here, and their seats return to available via
-- release_expired_seat_reservations in the same cron tick, exactly as
-- designed. Behaviour for pure-GA rows is unchanged.

begin;

CREATE OR REPLACE FUNCTION public.expire_stale_reservations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_count INT := 0;
  v_reservation RECORD;
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
BEGIN
  FOR v_reservation IN
    SELECT id, items
    FROM public.reservations
    WHERE status = 'active'
      AND expires_at < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Release reserved tier counts for ARRAY-shaped (general admission)
    -- items only. Seat reservations carry { seat_ids: [...] } and their
    -- inventory lives on seats rows, freed by
    -- release_expired_seat_reservations.
    IF jsonb_typeof(v_reservation.items) = 'array' THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_reservation.items)
      LOOP
        IF v_item ? 'ticket_tier_id' THEN
          v_tier_id := (v_item->>'ticket_tier_id')::UUID;
          v_quantity := (v_item->>'quantity')::INT;

          UPDATE public.ticket_tiers
          SET reserved_count = GREATEST(reserved_count - v_quantity, 0)
          WHERE id = v_tier_id;
        END IF;
      END LOOP;
    END IF;

    UPDATE public.reservations
    SET status = 'expired'
    WHERE id = v_reservation.id;

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

commit;
