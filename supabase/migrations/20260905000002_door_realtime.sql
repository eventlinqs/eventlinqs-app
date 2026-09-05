-- ============================================================================
-- MULTI-SCANNER REALTIME SYNC (Scope v5 3.13), 5 September 2026
--
-- THE GAP THIS SERVES. "Multi-scanner support: multiple staff scanning
-- simultaneously, synchronised in real-time via Supabase Realtime." Until
-- today two doors on one event learned of each other's admissions only when
-- one of them re-downloaded the door list or synced a queue. B1 made every
-- admission on every path exactly one INSERT on ticket_scans (scan_ticket
-- online, sync_offline_scans on reconnect), so the event a second door needs
-- already exists; this migration publishes it.
--
-- FOUR THINGS.
--
--   1. ticket_scans JOINS THE supabase_realtime PUBLICATION. Supabase:
--      "alter publication supabase_realtime add table your_table_name", and
--      "Postgres Changes authorizes every event against each subscriber"
--      through their JWT (https://supabase.com/docs/guides/realtime/postgres-changes,
--      fetched 5 September 2026). The existing SELECT policy ("Org members can
--      view event scans": owners and owner/admin/manager members) is therefore
--      the exact set of doors that receive an event's rows; a stranger's
--      subscription receives nothing. Guarded by a DO block so a re-run is a
--      no-op. The publication carried no tables on this project before today
--      (probed 5 September, C:\dev\EVIDENCE\B2-realtime-probe.sql).
--
--   2. door_validation_set NOW LEADS WITH ticket_id. A live row carries
--      ticket_id, the door list was keyed by code; the phone needs both to
--      move the right local record. Same body, same grants, one more column.
--
--   3. scan_ticket LEARNS WHICH DOOR SCANNED. A fourth argument,
--      p_device_id text DEFAULT NULL, recorded on both audit inserts, so the
--      live feed on another phone can say "Door 3F2A admitted Ayesha Rahman"
--      rather than "someone did". The body is the proven one from
--      20260705000001 verbatim; the three-argument call still resolves
--      through the default, so nothing that calls it today changes.
--
--   4. door_realtime_enabled() IS THE ONE FACT THE BUILD ASKS FOR. The guard
--      scripts/guards/door-live-published.mjs calls it against the build's own
--      database and refuses a build whose live feed would be silent, because
--      nothing else in the gate set can see a publication.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The publication
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ticket_scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_scans;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. The door list carries the ticket id
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.door_validation_set(uuid, text, integer);

CREATE FUNCTION public.door_validation_set(
  p_event_id   uuid,
  p_after_code text DEFAULT NULL,
  p_limit      integer DEFAULT 5000
)
RETURNS TABLE (
  ticket_id        uuid,
  ticket_code      text,
  secret_hash      text,
  status           text,
  holder_name      text,
  tier_name        text,
  seat_label       text,
  first_scanned_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.door_staff_for_event(p_event_id) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT t.id,
           t.ticket_code,
           encode(extensions.digest(t.secret::text, 'sha256'), 'hex'),
           t.status,
           t.holder_name,
           tt.name,
           CASE WHEN s.id IS NULL THEN NULL
                ELSE CONCAT_WS(' ',
                       NULLIF(sec.name, ''),
                       CASE WHEN s.row_label <> '' THEN 'Row ' || s.row_label END,
                       'Seat ' || s.seat_number)
           END,
           t.first_scanned_at
      FROM public.tickets t
      LEFT JOIN public.ticket_tiers tt ON tt.id = t.ticket_tier_id
      LEFT JOIN public.seats s ON s.id = t.seat_id
      LEFT JOIN public.seat_map_sections sec ON sec.id = s.seat_map_section_id
     WHERE t.event_id = p_event_id
       AND (p_after_code IS NULL OR t.ticket_code > p_after_code)
     ORDER BY t.ticket_code
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 5000);
END;
$$;

REVOKE ALL ON FUNCTION public.door_validation_set(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.door_validation_set(uuid, text, integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. scan_ticket records which door scanned
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.scan_ticket(TEXT, UUID, UUID);

CREATE FUNCTION public.scan_ticket(
  p_ticket_code TEXT,
  p_secret      UUID,
  p_event_id    UUID,
  p_device_id   TEXT DEFAULT NULL
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
  v_device     TEXT := left(p_device_id, 80);
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

    INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result, device_id)
    VALUES (v_ticket_id, p_event_id, v_uid, 'admitted', v_device);

    RETURN QUERY SELECT 'admitted'::TEXT, v_holder, v_first, v_seat;
    RETURN;
  END IF;

  SELECT t.id, t.secret, t.event_id, t.status, t.holder_name, t.first_scanned_at, t.seat_id
    INTO v_ticket
  FROM public.tickets t
  WHERE t.ticket_code = p_ticket_code;

  IF NOT FOUND OR v_ticket.secret <> p_secret THEN
    INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result, device_id)
    VALUES (NULL, p_event_id, v_uid, 'not_found', v_device);

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

  INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result, device_id)
  VALUES (v_ticket.id, p_event_id, v_uid, v_result, v_device);

  RETURN QUERY SELECT v_result, v_ticket.holder_name, v_ticket.first_scanned_at, v_seat;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_ticket(TEXT, UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.scan_ticket(TEXT, UUID, UUID, TEXT) FROM anon;

-- ----------------------------------------------------------------------------
-- 4. The one fact the build asks for
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.door_realtime_enabled()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ticket_scans'
  )
$$;

REVOKE ALL ON FUNCTION public.door_realtime_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.door_realtime_enabled() TO authenticated, service_role;
