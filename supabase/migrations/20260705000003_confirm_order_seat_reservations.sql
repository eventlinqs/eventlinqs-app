-- ============================================================
-- confirm_order: handle seat-mode reservations (2026-07-05, additive).
--
-- Found by the reserved-seating end-to-end proof: seat reservations store
-- items as an OBJECT ({"seat_ids": [...]}) while GA reservations store an
-- ARRAY of tier items. confirm_order unconditionally ran
-- jsonb_array_elements(items) and threw 22023 ("cannot extract elements
-- from an object"), so NO seated order (free or paid) could ever confirm
-- or mint tickets. The tier counter loop now runs only for the GA array
-- shape; a seat reservation simply converts (seat rows are the seat
-- inventory; tier reserved_count was never incremented by seat holds, so
-- there is nothing to decrement).
--
-- Body otherwise identical to 20260101000001 section (order confirm,
-- reservation conversion, discount usage). DOWN: restore that definition.
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_order(
  p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_reservation RECORD;
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
BEGIN
  -- Lock and get the order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Skip if already confirmed
  IF v_order.status = 'confirmed' THEN
    RETURN TRUE;
  END IF;

  -- Confirm the order
  UPDATE public.orders
  SET
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Convert the reservation if one exists
  IF v_order.reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation
    FROM public.reservations
    WHERE id = v_order.reservation_id
    FOR UPDATE;

    IF FOUND AND v_reservation.status = 'active' THEN
      -- GA reservations: items is an ARRAY of tier line items; move each
      -- from reserved to sold. Seat reservations: items is an OBJECT
      -- ({"seat_ids": [...]}); seat rows carry the inventory, nothing to do
      -- on tier counters.
      IF jsonb_typeof(v_reservation.items) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_reservation.items)
        LOOP
          IF v_item ? 'ticket_tier_id' THEN
            v_tier_id := (v_item->>'ticket_tier_id')::UUID;
            v_quantity := (v_item->>'quantity')::INT;

            UPDATE public.ticket_tiers
            SET
              sold_count = sold_count + v_quantity,
              reserved_count = GREATEST(reserved_count - v_quantity, 0)
            WHERE id = v_tier_id;
          END IF;
        END LOOP;
      END IF;

      -- Mark reservation as converted
      UPDATE public.reservations
      SET
        status = 'converted',
        converted_at = NOW()
      WHERE id = v_order.reservation_id;
    END IF;
  END IF;

  -- Update discount code usage count
  IF v_order.discount_code_id IS NOT NULL THEN
    UPDATE public.discount_codes
    SET current_uses = current_uses + 1
    WHERE id = v_order.discount_code_id;
  END IF;

  RETURN TRUE;
END;
$$;
