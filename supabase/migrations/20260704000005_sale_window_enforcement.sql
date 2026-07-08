-- ============================================================
-- Sale-window enforcement in create_reservation (founder approved
-- 2026-07-04). ADDITIVE: replaces the function body with the live
-- 2026-07-04 definition (verified against the TEST database via
-- pg_get_functiondef before writing this file) plus one new gate:
-- a ticket tier outside its sale window is rejected server-side
-- with a clear error, before any reserved-count mutation.
--
-- Window semantics (mirrored by tierSaleWindowState in
-- src/lib/payments/sale-status.ts):
--   sale_start NULL -> on sale as soon as the tier is active
--   sale_end   NULL -> sales never auto-close
--   NOW() < sale_start -> 'Tickets for this event are not on sale yet.'
--   NOW() > sale_end   -> 'Ticket sales for this event have closed.'
--
-- The gate runs inside the same FOR UPDATE tier loop, so the check
-- and the reserved-count increment stay atomic per tier. All callers
-- (createReservation, registerFreeTickets, squads) inherit it because
-- they all route through this one function. The payment engine is
-- untouched: this guards reservation creation, upstream of payment.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_event_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]',
  p_ttl_minutes INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
  v_available INT;
  v_tier_record RECORD;
BEGIN
  -- Validate at least one item
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items in reservation');
  END IF;

  -- Cancel any existing active reservations for this user/session on this event
  UPDATE public.reservations
  SET status = 'cancelled'
  WHERE event_id = p_event_id
    AND status = 'active'
    AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR (p_session_id IS NOT NULL AND session_id = p_session_id)
    );

  -- Release reserved counts from cancelled reservations
  -- (handled by the trigger below)

  -- Check availability for each ticket tier item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Only process ticket items (not addons)
    IF v_item ? 'ticket_tier_id' THEN
      v_tier_id := (v_item->>'ticket_tier_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;

      -- Lock the tier row, read availability AND the sale window
      SELECT
        tt.total_capacity - tt.sold_count - tt.reserved_count AS available,
        tt.sale_start,
        tt.sale_end
      INTO v_tier_record
      FROM public.ticket_tiers tt
      WHERE tt.id = v_tier_id
        AND tt.is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket tier not found or inactive');
      END IF;

      -- Sale-window gate: reject before any inventory mutation
      IF v_tier_record.sale_start IS NOT NULL AND NOW() < v_tier_record.sale_start THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Tickets for this event are not on sale yet.'
        );
      END IF;

      IF v_tier_record.sale_end IS NOT NULL AND NOW() > v_tier_record.sale_end THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Ticket sales for this event have closed.'
        );
      END IF;

      v_available := v_tier_record.available;

      IF v_available < v_quantity THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Only %s tickets available for this tier', v_available)
        );
      END IF;

      -- Increment reserved count
      UPDATE public.ticket_tiers
      SET reserved_count = reserved_count + v_quantity
      WHERE id = v_tier_id;
    END IF;
  END LOOP;

  -- Create the reservation
  INSERT INTO public.reservations (
    event_id, user_id, session_id, items, status, expires_at
  ) VALUES (
    p_event_id,
    p_user_id,
    p_session_id,
    p_items,
    'active',
    NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'expires_at', (NOW() + (p_ttl_minutes || ' minutes')::INTERVAL)
  );
END;
$$;
