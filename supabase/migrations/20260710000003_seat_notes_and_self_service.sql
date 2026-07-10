-- Seat Builder supremacy: close the last three BEHIND rows.
--   1. per-seat notes that flow to the ticket, confirmation, email and door scan
--   2. buyer self-service seat change (opt-in per event)
--   3. block-level tier mapping + capacity warning is app-side (no schema)
--
-- Additive only, columns only: the proven scan_ticket / reassign_ticket_seat
-- functions are NOT touched. Payment engine untouched (a self-move reassigns
-- the seat, never the money, through the existing reassign_ticket_seat RPC).
-- Apply with `supabase db push --linked` from PowerShell, TEST project only.

begin;

-- 1. Per-seat note: an organiser instruction that rides with the seat
--    ("Enter via Door G", "Wheelchair space beside"). Materialised from the
--    chart layout and read back on every seat surface via a join.
alter table public.seats
  add column if not exists note text;

comment on column public.seats.note is
  'Optional per-seat organiser note (e.g. entry door), shown on the ticket, confirmation, email and door scan.';

-- 2. Opt-in buyer self-service seat change. Default OFF: an organiser turns it
--    on for events where letting attendees swap their own seat is welcome. The
--    move itself runs through the existing reassign_ticket_seat RPC, so the
--    ticket, email and door scan reflect the new seat with no new money path.
alter table public.events
  add column if not exists allow_seat_self_service boolean not null default false;

comment on column public.events.allow_seat_self_service is
  'When true, a ticket holder may move themselves to another available seat for this event (uses the same reassign path as the organiser move).';

-- Carry the per-seat note through materialisation. Identical to the
-- 20260705000001 body; the only change is the note column read from the
-- layout and written to seats.note.
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
  SELECT layout INTO v_layout FROM public.seat_maps WHERE id = p_seat_map_id;
  IF v_layout IS NULL THEN
    RAISE EXCEPTION 'Seat map % not found', p_seat_map_id;
  END IF;

  SELECT COUNT(*) INTO v_live
  FROM public.seats
  WHERE event_id = p_event_id AND status IN ('reserved', 'sold');
  IF v_live > 0 THEN
    RAISE EXCEPTION 'Event % has % reserved or sold seats; re-materialisation refused', p_event_id, v_live;
  END IF;

  DELETE FROM public.seats WHERE event_id = p_event_id;

  FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_layout->'sections', '[]'::jsonb))
  LOOP
    INSERT INTO public.seat_map_sections (seat_map_id, name, color, sort_order)
    VALUES (p_seat_map_id, v_section->>'name', COALESCE(v_section->>'color', '#D4A017'), COALESCE((v_section->>'sort_order')::INT, 0))
    ON CONFLICT (seat_map_id, name) DO UPDATE SET color = EXCLUDED.color, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_section_id;

    v_tier_id := NULL;
    IF COALESCE(v_section->>'tier_name', '') <> '' THEN
      SELECT t.id INTO v_tier_id FROM public.ticket_tiers t
      WHERE t.event_id = p_event_id AND LOWER(t.name) = LOWER(v_section->>'tier_name')
      ORDER BY t.sort_order LIMIT 1;
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'rows', '[]'::jsonb))
    LOOP
      v_row_label := v_row->>'label';
      FOR v_seat IN SELECT * FROM jsonb_array_elements(COALESCE(v_row->'seats', '[]'::jsonb))
      LOOP
        INSERT INTO public.seats (
          event_id, seat_map_section_id, ticket_tier_id, row_label, seat_number,
          seat_type, status, x, y, note
        ) VALUES (
          p_event_id, v_section_id, v_tier_id, v_row_label, v_seat->>'number',
          COALESCE(NULLIF(v_seat->>'type', '')::public.seat_type, 'standard'),
          CASE WHEN COALESCE((v_seat->>'blocked')::BOOLEAN, FALSE)
               THEN 'blocked'::public.seat_status ELSE 'available'::public.seat_status END,
          COALESCE((v_seat->>'x')::NUMERIC, 0),
          COALESCE((v_seat->>'y')::NUMERIC, 0),
          NULLIF(v_seat->>'note', '')
        );
        v_seat_count := v_seat_count + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  UPDATE public.seat_maps SET total_seats = v_seat_count WHERE id = p_seat_map_id;
  RETURN v_seat_count;
END;
$$;

commit;
