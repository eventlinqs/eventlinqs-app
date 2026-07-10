-- ============================================================
-- Reserved Seating v2 (2026-07-05) - TEST-first, additive, reversible.
--
-- Closes the gaps between the existing seat plumbing (seat_maps, sections,
-- per-event seats, row-locked create_seat_reservation, seat checkout, webhook
-- seats-sold) and a production seated flow:
--   1. feature_flags table + 'seated_events' flag (default ON for testing)
--   2. Tickets carry their seat: assign_order_seats() pairs an order's minted
--      tickets with its reservation's seats; issue_tickets_for_order() calls it
--   3. release_expired_seat_reservations(): expired/cancelled seat holds
--      return their seats to 'available' (called by the reservation-expire cron)
--   4. materialize_seats v2: refuses to touch an event with reserved/sold
--      seats, upserts sections uniquely, honours per-seat type/blocked state
--      from the layout, and binds sections to ticket tiers BY NAME at attach
--      time (kills the remap-every-event friction)
--   5. scan_ticket returns the seat label so the door sees the seat
--
-- DOWN PATH (manual, documented): drop feature_flags, assign_order_seats and
-- release_expired_seat_reservations; restore issue_tickets_for_order from
-- 20260517000001_ticketing_system_v1.sql, materialize_seats from
-- 20260101000001_baseline_schema.sql section 16, scan_ticket from
-- 20260625000001_door_checkin_scan.sql; drop the two new indexes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. seated_events feature flag
-- ------------------------------------------------------------
-- The feature_flags primitive is owned by 20260704000004 (broadcast layer):
-- one row per flag, column `flag`, public read, service-role write. This
-- migration only seeds the seated_events flag (default ON for testing per
-- the founder directive).
INSERT INTO public.feature_flags (flag, enabled, description)
VALUES ('seated_events', TRUE, 'Reserved seating: seat maps, seat selection, seated checkout. Default ON for testing.')
ON CONFLICT (flag) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Sections upsert-able by (map, name); seats lookup by reservation
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_map_sections_map_name
  ON public.seat_map_sections(seat_map_id, name);

CREATE INDEX IF NOT EXISTS idx_tickets_seat ON public.tickets(seat_id)
  WHERE seat_id IS NOT NULL;

-- Seat identity is unique PER SECTION, not per event: a multi-section
-- theatre legitimately has Row A Seat 1 in both Stalls and Balcony. The
-- baseline event-wide constraint made that impossible. (DOWN: recreate
-- seats_unique_per_event and drop this index; both empty on TEST today.)
ALTER TABLE public.seats DROP CONSTRAINT IF EXISTS seats_unique_per_event;
CREATE UNIQUE INDEX IF NOT EXISTS uq_seats_event_section_row_seat
  ON public.seats(event_id, COALESCE(seat_map_section_id::text, ''), row_label, seat_number);

-- ------------------------------------------------------------
-- 3. assign_order_seats: minted tickets get their seats
-- ------------------------------------------------------------
-- Pairs the order's tickets (ordered by order_item, idx_in_item) with the
-- order's reservation seats (ordered by row_label, seat_number) one to one.
-- Idempotent: only tickets with seat_id IS NULL are filled, and a seat is
-- never assigned twice. Safe no-op for non-seated orders.
CREATE OR REPLACE FUNCTION public.assign_order_seats(p_order_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation_id UUID;
  v_assigned INT := 0;
BEGIN
  SELECT o.reservation_id INTO v_reservation_id
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF v_reservation_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH order_tickets AS (
    SELECT t.id AS ticket_id,
           ROW_NUMBER() OVER (ORDER BY t.order_item_id, t.idx_in_item) AS rn
    FROM public.tickets t
    WHERE t.order_id = p_order_id
      AND t.seat_id IS NULL
  ),
  reservation_seats AS (
    SELECT s.id AS seat_id, s.order_item_id,
           ROW_NUMBER() OVER (ORDER BY s.row_label, s.seat_number) AS rn
    FROM public.seats s
    WHERE s.reservation_id = v_reservation_id
      AND NOT EXISTS (SELECT 1 FROM public.tickets tt WHERE tt.seat_id = s.id)
  ),
  paired AS (
    SELECT ot.ticket_id, rs.seat_id
    FROM order_tickets ot
    JOIN reservation_seats rs ON rs.rn = ot.rn
  )
  UPDATE public.tickets t
  SET seat_id = paired.seat_id, updated_at = NOW()
  FROM paired
  WHERE t.id = paired.ticket_id;

  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  -- Back-reference for organiser reporting: the seat knows its order item.
  UPDATE public.seats s
  SET order_item_id = t.order_item_id, updated_at = NOW()
  FROM public.tickets t
  WHERE t.seat_id = s.id
    AND t.order_id = p_order_id
    AND s.order_item_id IS DISTINCT FROM t.order_item_id;

  RETURN v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_order_seats(UUID) TO service_role;

-- ------------------------------------------------------------
-- 4. issue_tickets_for_order: unchanged mint logic + seat assignment
-- ------------------------------------------------------------
-- Identical body to 20260517000001 with ONE addition at the end: seat
-- assignment for seated orders. The mint loop, idempotency (ON CONFLICT
-- (order_item_id, idx_in_item)) and code-collision retry are untouched.
CREATE OR REPLACE FUNCTION public.issue_tickets_for_order(p_order_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order   RECORD;
  v_item    RECORD;
  v_idx     INT;
  v_code    TEXT;
  v_attempt INT;
  v_holder_name  TEXT;
  v_holder_email TEXT;
  v_issued  INT := 0;
BEGIN
  SELECT o.*, COALESCE(p.email, o.guest_email) AS buyer_email,
         COALESCE(p.full_name, o.guest_name)   AS buyer_name
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT * FROM public.order_items
    WHERE order_id = p_order_id AND item_type = 'ticket'
  LOOP
    FOR v_idx IN 0 .. (v_item.quantity - 1) LOOP
      v_holder_email := COALESCE(v_item.attendee_email, v_order.buyer_email);
      v_holder_name  := COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', v_item.attendee_first_name, v_item.attendee_last_name)), ''),
        v_order.buyer_name
      );

      -- ticket_code uniqueness: retry on collision, max 5
      v_attempt := 0;
      LOOP
        v_attempt := v_attempt + 1;
        v_code := public.gen_ticket_code();
        BEGIN
          INSERT INTO public.tickets (
            order_id, order_item_id, event_id, ticket_tier_id,
            idx_in_item, ticket_code, holder_name, holder_email
          ) VALUES (
            p_order_id, v_item.id, v_order.event_id, v_item.ticket_tier_id,
            v_idx, v_code, v_holder_name, COALESCE(v_holder_email, '')
          )
          ON CONFLICT (order_item_id, idx_in_item) DO NOTHING;
          IF FOUND THEN
            v_issued := v_issued + 1;
          END IF;
          EXIT;
        EXCEPTION WHEN unique_violation THEN
          IF v_attempt >= 5 THEN
            RAISE EXCEPTION 'ticket_code generation exhausted for order %', p_order_id;
          END IF;
        END;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Reserved seating v2: seated orders link each minted ticket to its seat.
  -- No-op for non-seated orders (no reservation seats).
  PERFORM public.assign_order_seats(p_order_id);

  RETURN v_issued;
END;
$$;

-- ------------------------------------------------------------
-- 5. release_expired_seat_reservations: abandoned holds free their seats
-- ------------------------------------------------------------
-- Returns to 'available' every seat still 'reserved' whose reservation has
-- expired (or was cancelled), and marks those active-but-past reservations
-- 'expired'. Sold seats are untouched (their status is 'sold'). Called by
-- the reservation-expire cron; safe to call any time.
CREATE OR REPLACE FUNCTION public.release_expired_seat_reservations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_released INT := 0;
BEGIN
  WITH dead_reservations AS (
    SELECT r.id
    FROM public.reservations r
    WHERE (r.status = 'active' AND r.expires_at < NOW())
       OR r.status IN ('expired', 'cancelled')
  ),
  released AS (
    UPDATE public.seats s
    SET status = 'available', reservation_id = NULL, updated_at = NOW()
    WHERE s.status = 'reserved'
      AND s.reservation_id IN (SELECT id FROM dead_reservations)
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_released FROM released;

  UPDATE public.reservations r
  SET status = 'expired'
  WHERE r.status = 'active'
    AND r.expires_at < NOW()
    AND r.items ? 'seat_ids';

  RETURN v_released;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_expired_seat_reservations() TO service_role;

-- ------------------------------------------------------------
-- 6. materialize_seats v2: guarded, tier-binding, layout-faithful
-- ------------------------------------------------------------
-- Changes from the baseline version:
--   - REFUSES to re-materialise when the event has reserved or sold seats
--     (editing a venue template can never corrupt a live event)
--   - Sections upserted by (seat_map_id, name) via the new unique index
--   - Per-seat 'type' (standard/premium/accessible/companion/...) and
--     'blocked' honoured from the layout
--   - Section 'tier_name' binds seats to the EVENT's ticket tier of the same
--     name (case-insensitive), so reusing a chart re-links pricing when tier
--     names match
CREATE OR REPLACE FUNCTION public.materialize_seats(
  p_event_id UUID,
  p_seat_map_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_layout JSONB;
  v_section JSONB;
  v_row JSONB;
  v_seat JSONB;
  v_section_id UUID;
  v_tier_id UUID;
  v_row_label TEXT;
  v_seat_count INT := 0;
  v_live INT;
BEGIN
  SELECT layout INTO v_layout
  FROM public.seat_maps
  WHERE id = p_seat_map_id;

  IF v_layout IS NULL THEN
    RAISE EXCEPTION 'Seat map % not found', p_seat_map_id;
  END IF;

  -- Guard: never destroy live inventory. An event with reserved or sold
  -- seats keeps its materialised chart; template edits affect future
  -- attachments only.
  SELECT COUNT(*) INTO v_live
  FROM public.seats
  WHERE event_id = p_event_id
    AND status IN ('reserved', 'sold');
  IF v_live > 0 THEN
    RAISE EXCEPTION 'Event % has % reserved or sold seats; re-materialisation refused', p_event_id, v_live;
  END IF;

  DELETE FROM public.seats WHERE event_id = p_event_id;

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

    -- Bind the section to this EVENT's tier of the same name, if declared.
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
        INSERT INTO public.seats (
          event_id,
          seat_map_section_id,
          ticket_tier_id,
          row_label,
          seat_number,
          seat_type,
          status,
          x,
          y
        ) VALUES (
          p_event_id,
          v_section_id,
          v_tier_id,
          v_row_label,
          v_seat->>'number',
          COALESCE(NULLIF(v_seat->>'type', '')::public.seat_type, 'standard'),
          CASE WHEN COALESCE((v_seat->>'blocked')::BOOLEAN, FALSE)
               THEN 'blocked'::public.seat_status
               ELSE 'available'::public.seat_status END,
          COALESCE((v_seat->>'x')::NUMERIC, 0),
          COALESCE((v_seat->>'y')::NUMERIC, 0)
        );

        v_seat_count := v_seat_count + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  UPDATE public.seat_maps
  SET total_seats = v_seat_count
  WHERE id = p_seat_map_id;

  RETURN v_seat_count;
END;
$$;

-- ------------------------------------------------------------
-- 7. scan_ticket returns the seat (door staff see the seat)
-- ------------------------------------------------------------
-- Same body and invariants as 20260625000001 (admit-exactly-once via the
-- row-locked conditional UPDATE); the ONLY change is an appended seat_label
-- return column resolved from tickets.seat_id.
DROP FUNCTION IF EXISTS public.scan_ticket(TEXT, UUID, UUID);

CREATE FUNCTION public.scan_ticket(
  p_ticket_code TEXT,
  p_secret      UUID,
  p_event_id    UUID
)
RETURNS TABLE (result TEXT, holder_name TEXT, first_scanned_at TIMESTAMPTZ, seat_label TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_org        UUID;
  v_authorised BOOLEAN;
  v_rows       INT;
  v_ticket_id  UUID;
  v_holder     TEXT;
  v_first      TIMESTAMPTZ;
  v_ticket     RECORD;
  v_result     TEXT;
  v_seat       TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT e.organisation_id INTO v_org
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  v_authorised :=
       EXISTS (SELECT 1 FROM public.organisations o
                WHERE o.id = v_org AND o.owner_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.organisation_members om
                WHERE om.organisation_id = v_org
                  AND om.user_id = v_uid
                  AND om.role IN ('owner','admin','manager'))
    OR EXISTS (SELECT 1 FROM public.admin_users a
                WHERE a.id = v_uid AND a.disabled_at IS NULL);

  IF NOT v_authorised THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tickets t
     SET status           = 'scanned',
         first_scanned_at = COALESCE(t.first_scanned_at, now()),
         last_scanned_at  = now(),
         scan_count       = t.scan_count + 1,
         scanned_by       = v_uid,
         updated_at       = now()
   WHERE t.ticket_code = p_ticket_code
     AND t.secret      = p_secret
     AND t.event_id    = p_event_id
     AND t.status      = 'valid'
  RETURNING t.id, t.holder_name, t.first_scanned_at
       INTO v_ticket_id, v_holder, v_first;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    SELECT CONCAT_WS(' ',
             NULLIF(sec.name, ''),
             CASE WHEN s.row_label <> '' THEN 'Row ' || s.row_label END,
             'Seat ' || s.seat_number)
      INTO v_seat
    FROM public.tickets t
    JOIN public.seats s ON s.id = t.seat_id
    LEFT JOIN public.seat_map_sections sec ON sec.id = s.seat_map_section_id
    WHERE t.id = v_ticket_id;

    INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result)
    VALUES (v_ticket_id, p_event_id, v_uid, 'admitted');

    RETURN QUERY SELECT 'admitted'::TEXT, v_holder, v_first, v_seat;
    RETURN;
  END IF;

  SELECT t.id, t.secret, t.event_id, t.status, t.holder_name, t.first_scanned_at, t.seat_id
    INTO v_ticket
  FROM public.tickets t
  WHERE t.ticket_code = p_ticket_code;

  IF NOT FOUND OR v_ticket.secret <> p_secret THEN
    INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result)
    VALUES (NULL, p_event_id, v_uid, 'not_found');

    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT;
    RETURN;
  END IF;

  IF v_ticket.event_id <> p_event_id THEN
    v_result := 'wrong_event';
  ELSIF v_ticket.status = 'scanned' THEN
    v_result := 'already_scanned';
  ELSIF v_ticket.status = 'refunded' THEN
    v_result := 'refunded';
  ELSIF v_ticket.status = 'void' THEN
    v_result := 'void';
  ELSIF v_ticket.status = 'transferred' THEN
    v_result := 'transferred';
  ELSE
    v_result := 'invalid';
  END IF;

  SELECT CONCAT_WS(' ',
           NULLIF(sec.name, ''),
           CASE WHEN s.row_label <> '' THEN 'Row ' || s.row_label END,
           'Seat ' || s.seat_number)
    INTO v_seat
  FROM public.seats s
  LEFT JOIN public.seat_map_sections sec ON sec.id = s.seat_map_section_id
  WHERE s.id = v_ticket.seat_id;

  INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result)
  VALUES (v_ticket.id, p_event_id, v_uid, v_result);

  RETURN QUERY SELECT v_result, v_ticket.holder_name, v_ticket.first_scanned_at, v_seat;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_ticket(TEXT, UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.scan_ticket(TEXT, UUID, UUID) FROM anon;
