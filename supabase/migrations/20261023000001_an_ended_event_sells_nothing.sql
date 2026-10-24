-- ============================================================================
-- AN ENDED EVENT SELLS NOTHING (23 October 2026, the project manager's 01:15
-- order; WINDOW4-STATUS.txt, 23 October 00:57 and 01:12).
--
-- What it fixes. Nothing judged an event's END before a sale. create_reservation
-- (and create_seat_reservation) refused an event that was not published (C13,
-- 20260906000002), then each tier's own sale window; a tier with no sale_end
-- therefore sold for ever, after its event was long over. On production the one
-- live event, which ended on 10 October, was refused only because its organiser
-- had happened to close the tier at the start.
--
-- What it does. Both functions, exactly as 20260906000002 defined them, with one
-- gate added after the status gate: an event whose end_date has passed answers
-- "This event has ended." before any inventory is touched. The status gate's
-- sentence is kept word for word, because 20260906000002's own installation
-- check reads it. CREATE OR REPLACE with the same signatures keeps each
-- function's owner and grants as they are.
--
-- Every caller reaches one of these two: the reservation action (paid), the
-- free registration action and the squad action all call create_reservation;
-- seated events call create_seat_reservation.
--
-- Reversal: re-run the two definitions from 20260906000002. No data changes.
-- ============================================================================

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
  v_event_status public.event_status;
  v_event_end TIMESTAMPTZ;
BEGIN
  -- Validate at least one item
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items in reservation');
  END IF;

  -- THE STATUS GATE (C13). Only a published event sells. Paused, postponed,
  -- cancelled, completed, archived, draft and scheduled all refuse here, before
  -- any inventory is touched, whatever the caller's page showed.
  SELECT e.status, e.end_date INTO v_event_status, v_event_end FROM public.events e WHERE e.id = p_event_id;
  IF v_event_status IS DISTINCT FROM 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event is not on sale.');
  END IF;

  -- THE END GATE (23 October 2026). An event whose end has passed sells
  -- nothing, whatever its tiers' own sale windows say: a tier with no sale_end
  -- used to sell for ever. Same moment the discovery surfaces use.
  IF v_event_end IS NOT NULL AND v_event_end <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event has ended.');
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

CREATE OR REPLACE FUNCTION public.create_seat_reservation(
  p_event_id UUID,
  p_user_id UUID,
  p_seat_ids UUID[],
  p_ttl_minutes INT DEFAULT 10,
  p_session_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_seat RECORD;
  v_event_status public.event_status;
  v_event_end TIMESTAMPTZ;
BEGIN
  IF array_length(p_seat_ids, 1) IS NULL OR array_length(p_seat_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No seats selected');
  END IF;

  -- THE STATUS GATE (C13), the same sentence as create_reservation.
  SELECT e.status, e.end_date INTO v_event_status, v_event_end FROM public.events e WHERE e.id = p_event_id;
  IF v_event_status IS DISTINCT FROM 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event is not on sale.');
  END IF;

  -- THE END GATE (23 October 2026). An event whose end has passed sells
  -- nothing, whatever its tiers' own sale windows say: a tier with no sale_end
  -- used to sell for ever. Same moment the discovery surfaces use.
  IF v_event_end IS NOT NULL AND v_event_end <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event has ended.');
  END IF;

  -- The reservations_has_owner CHECK enforces this too; failing early gives
  -- the buyer a clean message instead of a constraint error.
  IF p_user_id IS NULL AND p_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in or enable cookies to hold seats');
  END IF;

  -- Lock all seat rows and verify they're available
  FOR v_seat IN
    SELECT s.id, s.status
    FROM public.seats s
    WHERE s.id = ANY(p_seat_ids)
      AND s.event_id = p_event_id
    FOR UPDATE
  LOOP
    IF v_seat.status != 'available' THEN
      RETURN jsonb_build_object('success', false, 'error', 'One or more seats are no longer available');
    END IF;
  END LOOP;

  -- Verify we locked all requested seats
  IF (SELECT COUNT(*) FROM public.seats WHERE id = ANY(p_seat_ids) AND event_id = p_event_id) != array_length(p_seat_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Some seats not found for this event');
  END IF;

  INSERT INTO public.reservations (
    event_id, user_id, session_id, items, status, expires_at
  ) VALUES (
    p_event_id,
    p_user_id,
    p_session_id,
    jsonb_build_object('seat_ids', to_jsonb(p_seat_ids)),
    'active',
    NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;

  UPDATE public.seats
  SET
    status = 'reserved',
    reservation_id = v_reservation_id,
    updated_at = NOW()
  WHERE id = ANY(p_seat_ids)
    AND event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'expires_at', (NOW() + (p_ttl_minutes || ' minutes')::INTERVAL),
    'seat_count', array_length(p_seat_ids, 1)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- POST-CONDITION: both functions carry both gates.
-- ----------------------------------------------------------------------------
DO $post$
DECLARE
  v_missing TEXT := '';
  v_name TEXT;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['create_reservation', 'create_seat_reservation'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
         AND pg_get_functiondef(p.oid) LIKE '%This event is not on sale.%'
         AND pg_get_functiondef(p.oid) LIKE '%This event has ended.%'
    ) THEN
      v_missing := v_missing || ' ' || v_name;
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'an ended event sells nothing: these functions lack a gate:%', v_missing;
  END IF;
END
$post$;
