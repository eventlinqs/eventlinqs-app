-- Seat Builder supremacy pass: post-sale seat reassignment + safe live-chart
-- sync. Two SECURITY DEFINER functions, additive only. The payment engine is
-- untouched: reassignment moves the SEAT, never the money (the ticket keeps
-- its purchased tier and price), and live sync can only add or reposition,
-- never disturb a reserved or sold seat.
--
-- Apply with `supabase db push --linked` from PowerShell, TEST project only.
-- NEVER the Dashboard or MCP.

begin;

-- ------------------------------------------------------------
-- 1. reassign_ticket_seat: move a ticket (sold or unassigned) to any
--    available seat of the same event, atomically.
--    - Locks both seats FOR UPDATE so two concurrent moves can never race.
--    - The old seat returns to available (cleared of order references).
--    - The new seat becomes sold and carries the ticket's order references,
--      so reporting and the door scan stay consistent.
--    - Authorisation happens in the calling server action (owner/manager
--      gate); this function enforces only data integrity.
-- ------------------------------------------------------------
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
  v_old_seat RECORD;
  v_new_seat RECORD;
  v_event_id UUID;
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

  -- Lock and validate the destination first (deterministic lock order would
  -- need seat ids; contention here is organiser-scale, not buyer-scale).
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

  -- Release the old seat, when the ticket had one.
  IF v_ticket.seat_id IS NOT NULL THEN
    SELECT s.* INTO v_old_seat
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

  -- Occupy the new seat with the ticket's order references.
  UPDATE public.seats
  SET status = 'sold',
      reservation_id = COALESCE(v_old_seat.reservation_id, reservation_id),
      order_item_id = v_ticket.order_item_id,
      updated_at = NOW()
  WHERE id = p_new_seat_id;

  -- Repoint the ticket. The digital ticket, emails, and the door scan all
  -- resolve the seat live through tickets.seat_id, so everything downstream
  -- reflects the move immediately.
  UPDATE public.tickets
  SET seat_id = p_new_seat_id,
      updated_at = NOW()
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object(
    'ticket_id', p_ticket_id,
    'old_seat', CASE WHEN v_old_seat.id IS NULL THEN NULL ELSE
      jsonb_build_object('id', v_old_seat.id, 'row_label', v_old_seat.row_label, 'seat_number', v_old_seat.seat_number) END,
    'new_seat', jsonb_build_object('id', v_new_seat.id, 'row_label', v_new_seat.row_label, 'seat_number', v_new_seat.seat_number)
  );
END;
$$;

COMMENT ON FUNCTION public.reassign_ticket_seat(UUID, UUID) IS
  'Atomically move a ticket to another available seat of the same event. Moves the seat, never the money: the ticket keeps its purchased tier and price. Old seat returns to available; door scan and digital ticket reflect the move immediately.';

-- ------------------------------------------------------------
-- 2. rematerialize_seats_additive: sync a live event with its edited chart
--    WITHOUT ever touching reserved, sold, or held seats.
--    - New seats in the layout are added.
--    - Existing available/blocked seats are repositioned and restyled.
--    - Available seats that vanished from the layout are removed.
--    - Reserved/sold/held seats are provably immutable: at most their
--      coordinates are refreshed so the map stays coherent, never their
--      status or references.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rematerialize_seats_additive(
  p_event_id UUID,
  p_seat_map_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_layout JSONB;
  v_section JSONB;
  v_row JSONB;
  v_seat JSONB;
  v_section_id UUID;
  v_tier_id UUID;
  v_row_label TEXT;
  v_added INT := 0;
  v_updated INT := 0;
  v_removed INT := 0;
  v_existing RECORD;
BEGIN
  SELECT layout INTO v_layout
  FROM public.seat_maps
  WHERE id = p_seat_map_id;

  IF v_layout IS NULL THEN
    RAISE EXCEPTION 'Seat map % not found', p_seat_map_id;
  END IF;

  -- Track every identity present in the layout so removals can be computed.
  CREATE TEMP TABLE IF NOT EXISTS _layout_seats (
    section_id UUID,
    row_label TEXT,
    seat_number TEXT
  ) ON COMMIT DROP;
  DELETE FROM _layout_seats;

  FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_layout->'sections', '[]'::jsonb))
  LOOP
    INSERT INTO public.seat_map_sections (seat_map_id, name, color, sort_order)
    VALUES (
      p_seat_map_id,
      v_section->>'name',
      COALESCE(v_section->>'color', '#D4A017'),
      COALESCE((v_section->>'sort_order')::INT, 0)
    )
    ON CONFLICT (seat_map_id, name) DO UPDATE
      SET color = EXCLUDED.color, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_section_id;

    v_tier_id := NULL;
    IF COALESCE(v_section->>'tier_name', '') <> '' THEN
      SELECT t.id INTO v_tier_id
      FROM public.ticket_tiers t
      WHERE t.event_id = p_event_id
        AND LOWER(t.name) = LOWER(v_section->>'tier_name')
      ORDER BY t.sort_order
      LIMIT 1;
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'rows', '[]'::jsonb))
    LOOP
      v_row_label := v_row->>'label';

      FOR v_seat IN SELECT * FROM jsonb_array_elements(COALESCE(v_row->'seats', '[]'::jsonb))
      LOOP
        INSERT INTO _layout_seats VALUES (v_section_id, v_row_label, v_seat->>'number');

        SELECT s.id, s.status INTO v_existing
        FROM public.seats s
        WHERE s.event_id = p_event_id
          AND s.seat_map_section_id = v_section_id
          AND s.row_label = v_row_label
          AND s.seat_number = (v_seat->>'number')
        LIMIT 1;

        IF v_existing.id IS NULL THEN
          INSERT INTO public.seats (
            event_id, seat_map_section_id, ticket_tier_id,
            row_label, seat_number, seat_type, status, x, y
          ) VALUES (
            p_event_id, v_section_id, v_tier_id,
            v_row_label, v_seat->>'number',
            COALESCE(NULLIF(v_seat->>'type', '')::public.seat_type, 'standard'),
            CASE WHEN COALESCE((v_seat->>'blocked')::BOOLEAN, FALSE)
                 THEN 'blocked'::public.seat_status
                 ELSE 'available'::public.seat_status END,
            COALESCE((v_seat->>'x')::NUMERIC, 0),
            COALESCE((v_seat->>'y')::NUMERIC, 0)
          );
          v_added := v_added + 1;
        ELSIF v_existing.status IN ('available', 'blocked') THEN
          -- Free inventory follows the chart completely.
          UPDATE public.seats
          SET x = COALESCE((v_seat->>'x')::NUMERIC, 0),
              y = COALESCE((v_seat->>'y')::NUMERIC, 0),
              seat_type = COALESCE(NULLIF(v_seat->>'type', '')::public.seat_type, 'standard'),
              ticket_tier_id = v_tier_id,
              status = CASE WHEN COALESCE((v_seat->>'blocked')::BOOLEAN, FALSE)
                            THEN 'blocked'::public.seat_status
                            ELSE 'available'::public.seat_status END,
              updated_at = NOW()
          WHERE id = v_existing.id;
          v_updated := v_updated + 1;
        ELSE
          -- Reserved / sold / held: coordinates only, so the room stays
          -- coherent; status and order references are immutable here.
          UPDATE public.seats
          SET x = COALESCE((v_seat->>'x')::NUMERIC, 0),
              y = COALESCE((v_seat->>'y')::NUMERIC, 0),
              updated_at = NOW()
          WHERE id = v_existing.id;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Remove only never-sold inventory that the chart no longer contains.
  DELETE FROM public.seats s
  WHERE s.event_id = p_event_id
    AND s.status IN ('available', 'blocked')
    AND NOT EXISTS (
      SELECT 1 FROM _layout_seats l
      WHERE l.section_id = s.seat_map_section_id
        AND l.row_label = s.row_label
        AND l.seat_number = s.seat_number
    );
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RETURN jsonb_build_object('added', v_added, 'updated', v_updated, 'removed', v_removed);
END;
$$;

COMMENT ON FUNCTION public.rematerialize_seats_additive(UUID, UUID) IS
  'Sync a live event with its edited seating chart without ever disturbing reserved, sold, or held seats: adds new seats, repositions free ones, removes only never-sold seats missing from the chart.';

commit;
