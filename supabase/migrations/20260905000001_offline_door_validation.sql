-- ============================================================================
-- OFFLINE DOOR VALIDATION (Scope v5 3.12 and 3.13), 5 September 2026
--
-- THE GAP THIS SERVES. The scope says the scanner "caches the full guest list
-- and validation keys locally before the event", "supports up to 50,000
-- tickets in the local cache", "scans are queued offline and synced when
-- connectivity returns", the "cache is valid for 24 hours from download", and
-- for conflicts "if two scanners validate the same ticket offline, the first
-- sync wins and the second is flagged for manual review". Until today the
-- door called scan_ticket on every decode and nothing else, so a gate with no
-- signal could admit nobody.
--
-- THREE THINGS THE DATABASE NOW DOES.
--
--   1. HANDS THE DOOR A LIST IT CAN TRUST WITHOUT HANDING IT THE SECRETS.
--      door_validation_set returns one row per ticket of the event with a
--      SHA-256 of the bearer secret (pgcrypto's digest, installed in the
--      extensions schema on this project: probed 5 September 2026, pgcrypto 1.3,
--      C:\dev\EVIDENCE\B1\pgcrypto-probe.txt; Supabase: "Most extensions are
--      installed under the extensions schema, which is accessible to public by
--      default", https://supabase.com/docs/guides/database/extensions, fetched
--      5 September 2026). The device hashes what it scans and compares. A lost
--      phone holding the list cannot forge a ticket from it, and the RETURNS
--      TABLE below carries no column named secret, which the guard
--      scripts/guards/offline-door-integrity.mjs reads for.
--
--   2. RECONCILES THE QUEUE WITH THE SAME COMPARE-AND-SET scan_ticket USES.
--      sync_offline_scans takes the device's queue and, for each scan the
--      device ADMITTED, runs the identical row-locked UPDATE
--      (status = 'valid' -> 'scanned') keyed by code, hash and event. Exactly
--      one sync can win that update for a ticket. The winner is recorded
--      'admitted'; a later sync that admitted the same ticket on another door
--      is recorded with the diagnosed result AND review_status 'needs_review',
--      because that phone let a person in on a ticket the server could not
--      admit. That is the scope's rule made concrete: first sync wins, the
--      second is flagged. Device rejects are recorded for the audit and never
--      flagged. Every item carries a client_scan_id the device minted, unique
--      here, so a batch retried after a dropped connection is answered from
--      the rows already written rather than written twice.
--
--   3. LETS THE ORGANISER CLOSE A FLAG. resolve_scan_review marks the row
--      resolved with who, when and a note. A flag nobody can see or clear is a
--      no-op control (Definition of Done), so the attendees page lists them.
--
-- WHO MAY CALL. door_staff_for_event is the one answer, and it is the same
-- three-way test scan_ticket has always made: the organisation's owner, a
-- member with role owner, admin or manager, or an active platform admin.
-- Identity is auth.uid(), never a parameter. anon has nothing here.
--
-- THE DEVICE CLOCK IS EVIDENCE, NOT AUTHORITY. first_scanned_at on a synced
-- admission is taken from the device's clock only when it is sane (not in the
-- future, not more than 48 hours old); otherwise the server's now(). The raw
-- device time is kept beside it in device_scanned_at for the organiser.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. ticket_scans learns where a scan came from and whether it needs a look
-- ----------------------------------------------------------------------------
ALTER TABLE public.ticket_scans
  ADD COLUMN IF NOT EXISTS client_scan_id    uuid,
  ADD COLUMN IF NOT EXISTS scanned_offline   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_id         text,
  ADD COLUMN IF NOT EXISTS device_scanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_status     text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_note       text,
  ADD COLUMN IF NOT EXISTS reviewed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_scans DROP CONSTRAINT IF EXISTS ticket_scans_review_status_check;
ALTER TABLE public.ticket_scans ADD CONSTRAINT ticket_scans_review_status_check
  CHECK (review_status IN ('none', 'needs_review', 'resolved'));

-- One row per device scan, so a retried batch is answered rather than repeated.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_scans_client_scan_id
  ON public.ticket_scans(client_scan_id) WHERE client_scan_id IS NOT NULL;

-- The organiser's review list is a small partial index, not a table scan.
CREATE INDEX IF NOT EXISTS idx_ticket_scans_needs_review
  ON public.ticket_scans(event_id, scanned_at) WHERE review_status = 'needs_review';

-- ----------------------------------------------------------------------------
-- 2. Who may stand at this door: the one answer
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.door_staff_for_event(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT e.organisation_id INTO v_org FROM public.events e WHERE e.id = p_event_id;
  IF v_org IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = v_org AND o.owner_id = v_uid)
      OR EXISTS (SELECT 1 FROM public.organisation_members om
                  WHERE om.organisation_id = v_org
                    AND om.user_id = v_uid
                    AND om.role IN ('owner', 'admin', 'manager'))
      OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = v_uid AND a.disabled_at IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.door_staff_for_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.door_staff_for_event(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. The door list: every ticket of the event, hashed, paged by code
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.door_validation_set(
  p_event_id   uuid,
  p_after_code text DEFAULT NULL,
  p_limit      integer DEFAULT 5000
)
RETURNS TABLE (
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
    SELECT t.ticket_code,
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
-- 4. The queue comes home: first sync wins, the second is flagged
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_offline_scans(
  p_event_id uuid,
  p_scans    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_item           jsonb;
  v_client_id      uuid;
  v_code           text;
  v_hash           text;
  v_device         text;
  v_device_at      timestamptz;
  v_offline_result text;
  v_when           timestamptz;
  v_existing       record;
  v_ticket         record;
  v_rows           integer;
  v_result         text;
  v_review         text;
  v_out            jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.door_staff_for_event(p_event_id) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;
  IF p_scans IS NULL OR jsonb_typeof(p_scans) <> 'array' THEN
    RAISE EXCEPTION 'scans_not_an_array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_scans) > 500 THEN
    RAISE EXCEPTION 'too_many_scans' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_scans) LOOP
    v_client_id      := (v_item->>'client_scan_id')::uuid;
    v_code           := upper(trim(v_item->>'ticket_code'));
    v_hash           := lower(trim(v_item->>'secret_hash'));
    v_device         := left(v_item->>'device_id', 80);
    v_device_at      := (v_item->>'scanned_at')::timestamptz;
    v_offline_result := v_item->>'offline_result';

    IF v_client_id IS NULL OR v_code IS NULL OR v_code = '' OR v_hash IS NULL OR v_hash = '' THEN
      RAISE EXCEPTION 'scan_incomplete' USING ERRCODE = '22023';
    END IF;
    IF v_offline_result IS NULL OR v_offline_result NOT IN
       ('admitted', 'already_scanned', 'invalid', 'wrong_event', 'refunded', 'void', 'transferred', 'not_found') THEN
      v_offline_result := 'invalid';
    END IF;

    -- The device clock, when it is sane; otherwise the server's.
    v_when := CASE
                WHEN v_device_at IS NOT NULL AND v_device_at <= now() AND v_device_at >= now() - interval '48 hours'
                THEN v_device_at
                ELSE now()
              END;

    -- A retried batch is answered from what was already recorded.
    SELECT ts.result, ts.review_status, t.holder_name, t.first_scanned_at
      INTO v_existing
      FROM public.ticket_scans ts
      LEFT JOIN public.tickets t ON t.id = ts.ticket_id
     WHERE ts.client_scan_id = v_client_id;
    IF FOUND THEN
      v_out := v_out || jsonb_build_object(
        'client_scan_id', v_client_id,
        'result', v_existing.result,
        'needs_review', v_existing.review_status = 'needs_review',
        'holder_name', v_existing.holder_name,
        'first_scanned_at', v_existing.first_scanned_at,
        'replayed', true);
      CONTINUE;
    END IF;

    IF v_offline_result = 'admitted' THEN
      -- The admit-exactly-once invariant, the same statement scan_ticket runs,
      -- with the hash standing in for the secret. The matched row's lock
      -- serialises two doors syncing the same ticket: exactly one sees
      -- ROW_COUNT = 1.
      UPDATE public.tickets t
         SET status           = 'scanned',
             first_scanned_at = COALESCE(t.first_scanned_at, v_when),
             last_scanned_at  = now(),
             scan_count       = t.scan_count + 1,
             scanned_by       = v_uid,
             updated_at       = now()
       WHERE t.ticket_code = v_code
         AND encode(extensions.digest(t.secret::text, 'sha256'), 'hex') = v_hash
         AND t.event_id    = p_event_id
         AND t.status      = 'valid'
      RETURNING t.id, t.holder_name, t.first_scanned_at
           INTO v_ticket;

      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows = 1 THEN
        INSERT INTO public.ticket_scans
          (ticket_id, event_id, scanned_by, result, client_scan_id, scanned_offline, device_id, device_scanned_at, review_status)
        VALUES
          (v_ticket.id, p_event_id, v_uid, 'admitted', v_client_id, true, v_device, v_device_at, 'none');

        v_out := v_out || jsonb_build_object(
          'client_scan_id', v_client_id,
          'result', 'admitted',
          'needs_review', false,
          'holder_name', v_ticket.holder_name,
          'first_scanned_at', v_ticket.first_scanned_at,
          'replayed', false);
        CONTINUE;
      END IF;
    END IF;

    -- No admit here: diagnose exactly as scan_ticket does, by code.
    SELECT t.id, t.event_id, t.status, t.holder_name, t.first_scanned_at,
           encode(extensions.digest(t.secret::text, 'sha256'), 'hex') AS hash
      INTO v_ticket
      FROM public.tickets t
     WHERE t.ticket_code = v_code;

    -- The flag: this device ADMITTED a person on a ticket the server cannot.
    v_review := CASE WHEN v_offline_result = 'admitted' THEN 'needs_review' ELSE 'none' END;

    IF NOT FOUND OR v_ticket.hash <> v_hash THEN
      INSERT INTO public.ticket_scans
        (ticket_id, event_id, scanned_by, result, client_scan_id, scanned_offline, device_id, device_scanned_at, review_status)
      VALUES
        (NULL, p_event_id, v_uid, 'not_found', v_client_id, true, v_device, v_device_at, v_review);

      v_out := v_out || jsonb_build_object(
        'client_scan_id', v_client_id,
        'result', 'not_found',
        'needs_review', v_review = 'needs_review',
        'holder_name', NULL,
        'first_scanned_at', NULL,
        'replayed', false);
      CONTINUE;
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

    INSERT INTO public.ticket_scans
      (ticket_id, event_id, scanned_by, result, client_scan_id, scanned_offline, device_id, device_scanned_at, review_status)
    VALUES
      (v_ticket.id, p_event_id, v_uid, v_result, v_client_id, true, v_device, v_device_at, v_review);

    v_out := v_out || jsonb_build_object(
      'client_scan_id', v_client_id,
      'result', v_result,
      'needs_review', v_review = 'needs_review',
      'holder_name', v_ticket.holder_name,
      'first_scanned_at', v_ticket.first_scanned_at,
      'replayed', false);
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_offline_scans(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_offline_scans(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. The organiser closes a flag
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_scan_review(
  p_scan_id uuid,
  p_note    text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_event uuid;
  v_rows  integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT ts.event_id INTO v_event FROM public.ticket_scans ts WHERE ts.id = p_scan_id;
  IF v_event IS NULL OR NOT public.door_staff_for_event(v_event) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ticket_scans ts
     SET review_status = 'resolved',
         review_note   = NULLIF(left(trim(COALESCE(p_note, '')), 500), ''),
         reviewed_at   = now(),
         reviewed_by   = v_uid
   WHERE ts.id = p_scan_id
     AND ts.review_status = 'needs_review';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_scan_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_scan_review(uuid, text) TO authenticated;
