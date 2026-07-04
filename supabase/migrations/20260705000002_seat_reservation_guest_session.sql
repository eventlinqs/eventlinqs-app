-- ============================================================
-- Seat reservations: guest-session ownership (2026-07-05, additive).
--
-- Found by the reserved-seating evidence battery: create_seat_reservation
-- inserted reservations with NO owner for signed-out buyers, violating the
-- reservations_has_owner CHECK (user_id OR session_id), so an anonymous
-- buyer could never hold a seat. The GA path (create_reservation) already
-- carries p_session_id; this brings the seat path level.
--
-- DOWN: restore create_seat_reservation from 20260101000001 section 17.
-- ============================================================

DROP FUNCTION IF EXISTS public.create_seat_reservation(UUID, UUID, UUID[], INT);

CREATE FUNCTION public.create_seat_reservation(
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
BEGIN
  IF array_length(p_seat_ids, 1) IS NULL OR array_length(p_seat_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No seats selected');
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

GRANT EXECUTE ON FUNCTION public.create_seat_reservation(UUID, UUID, UUID[], INT, TEXT) TO anon, authenticated, service_role;
