-- Parity-audit root fix (2026-07-11): reassign_ticket_seat's documented
-- "sold or unassigned" path failed for unassigned tickets with
-- 'record "v_old_seat" is not assigned yet' - the record variable is never
-- SELECTed when the ticket has no seat, so referencing its fields throws.
-- Replaced with scalar old-seat variables that are simply NULL on that path.
-- Behaviour with an old seat is unchanged (same locks, same updates, same
-- return shape). Additive replace; DOWN: restore 20260710000001's body.

begin;

CREATE OR REPLACE FUNCTION public.reassign_ticket_seat(
  p_ticket_id UUID,
  p_new_seat_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket RECORD;
  v_new_seat RECORD;
  v_event_id UUID;
  v_old_seat_id UUID;
  v_old_row_label TEXT;
  v_old_seat_number TEXT;
  v_old_reservation_id UUID;
BEGIN
  SELECT t.id, t.seat_id, t.order_id, t.order_item_id, t.event_id
    INTO v_ticket
  FROM public.tickets t
  WHERE t.id = p_ticket_id
  FOR UPDATE;

  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'Ticket % not found', p_ticket_id;
  END IF;
  v_event_id := v_ticket.event_id;

  SELECT s.* INTO v_new_seat
  FROM public.seats s
  WHERE s.id = p_new_seat_id
  FOR UPDATE;

  IF v_new_seat.id IS NULL THEN
    RAISE EXCEPTION 'Destination seat % not found', p_new_seat_id;
  END IF;
  IF v_new_seat.event_id IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'Destination seat belongs to a different event';
  END IF;
  IF v_new_seat.status <> 'available' THEN
    RAISE EXCEPTION 'Destination seat is % - only an available seat can receive a move', v_new_seat.status;
  END IF;

  -- Release the old seat, when the ticket had one. Scalars stay NULL when it
  -- did not, so the unassigned path never touches an unset record.
  IF v_ticket.seat_id IS NOT NULL THEN
    SELECT s.id, s.row_label, s.seat_number, s.reservation_id
      INTO v_old_seat_id, v_old_row_label, v_old_seat_number, v_old_reservation_id
    FROM public.seats s
    WHERE s.id = v_ticket.seat_id
    FOR UPDATE;

    UPDATE public.seats
    SET status = 'available',
        reservation_id = NULL,
        order_item_id = NULL,
        held_by_user_id = NULL,
        held_reason = NULL,
        updated_at = NOW()
    WHERE id = v_ticket.seat_id;
  END IF;

  UPDATE public.seats
  SET status = 'sold',
      reservation_id = COALESCE(v_old_reservation_id, reservation_id),
      order_item_id = v_ticket.order_item_id,
      updated_at = NOW()
  WHERE id = p_new_seat_id;

  UPDATE public.tickets
  SET seat_id = p_new_seat_id,
      updated_at = NOW()
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object(
    'ticket_id', p_ticket_id,
    'old_seat', CASE WHEN v_old_seat_id IS NULL THEN NULL ELSE
      jsonb_build_object('id', v_old_seat_id, 'row_label', v_old_row_label, 'seat_number', v_old_seat_number) END,
    'new_seat', jsonb_build_object('id', v_new_seat.id, 'row_label', v_new_seat.row_label, 'seat_number', v_new_seat.seat_number)
  );
END;
$$;

COMMENT ON FUNCTION public.reassign_ticket_seat(UUID, UUID) IS
  'Atomically move a ticket (sold or unassigned) to another available seat of the same event. Moves the seat, never the money. Old seat returns to available when present; door scan and digital ticket reflect the move immediately.';

commit;
