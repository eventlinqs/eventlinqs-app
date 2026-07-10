-- ============================================================
-- Door check-in scan (single-use gate admission)
-- Run by founder: supabase db push --linked  (then: npm run db:types)
-- ============================================================
-- Brings the atomic admit-exactly-once gate scan onto the launch line. The
-- ticketing v1 migration (20260517000001) already shipped the columns
-- (tickets.status/scan_count/first_scanned_at/last_scanned_at/scanned_by and
-- the ticket_scans audit table); what was missing was the scan_ticket RPC, the
-- scan route, and the audit of a no-match scan. This migration adds:
--   0. ticket_scans.ticket_id nullable + 'transferred'/'not_found' audit reasons
--      (resolves the noted caveat: a not-found/garbage scan could not be logged
--      while ticket_id was NOT NULL).
--   1. scan_ticket(p_ticket_code, p_secret, p_event_id) RPC
--      - SECURITY DEFINER, identity from auth.uid() (never a parameter)
--      - authorises: event-org owner, org member (owner/admin/manager), or an
--        active platform admin
--      - admit-exactly-once via ONE atomic compare-and-set (valid -> scanned);
--        the matched row's lock serialises concurrent scanners, exactly one
--        admits and every other concurrent scan diagnoses 'already_scanned'
--      - every outcome, including a no-match, appends a ticket_scans audit row
--   2. GRANT EXECUTE to authenticated (REVOKE from anon)
-- AU English, no em-dashes. Online scanner only; offline is deferred.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Audit table: allow a no-match scan to be logged (ticket_id NULL) and add
--    'transferred'/'not_found' as distinct, auditable reasons.
-- ------------------------------------------------------------
ALTER TABLE public.ticket_scans ALTER COLUMN ticket_id DROP NOT NULL;

ALTER TABLE public.ticket_scans DROP CONSTRAINT IF EXISTS ticket_scans_result_check;
ALTER TABLE public.ticket_scans ADD CONSTRAINT ticket_scans_result_check
  CHECK (result IN (
    'admitted','already_scanned','invalid','wrong_event',
    'refunded','void','transferred','not_found'
  ));

-- ------------------------------------------------------------
-- 1. scan_ticket(p_ticket_code, p_secret, p_event_id)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scan_ticket(
  p_ticket_code TEXT,
  p_secret      UUID,
  p_event_id    UUID
)
RETURNS TABLE (result TEXT, holder_name TEXT, first_scanned_at TIMESTAMPTZ)
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
BEGIN
  -- Identity comes from the session, never a parameter, so a scanner cannot be
  -- spoofed. Authorisation failure is an error, not a normal door REJECT.
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

  -- The admit-exactly-once invariant. Only a 'valid' ticket matching code +
  -- secret + event flips to 'scanned'. Postgres locks the matched row, so two
  -- scanners hitting the same ticket at once serialise: exactly one UPDATE sees
  -- ROW_COUNT = 1, the other sees 0 and is diagnosed as already_scanned.
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
    INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result)
    VALUES (v_ticket_id, p_event_id, v_uid, 'admitted');

    RETURN QUERY SELECT 'admitted'::TEXT, v_holder, v_first;
    RETURN;
  END IF;

  -- No admit: diagnose the precise reject reason. Re-read by code (globally
  -- unique), no row lock needed.
  SELECT t.id, t.secret, t.event_id, t.status, t.holder_name, t.first_scanned_at
    INTO v_ticket
  FROM public.tickets t
  WHERE t.ticket_code = p_ticket_code;

  -- Not found, or a secret mismatch (a rotated/invalidated old code after a
  -- transfer). Do not behave as a secret oracle: both report not_found. Now
  -- auditable since ticket_id is nullable (ticket_id NULL on a no-match).
  IF NOT FOUND OR v_ticket.secret <> p_secret THEN
    INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result)
    VALUES (NULL, p_event_id, v_uid, 'not_found');

    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
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

  INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, result)
  VALUES (v_ticket.id, p_event_id, v_uid, v_result);

  RETURN QUERY SELECT v_result, v_ticket.holder_name, v_ticket.first_scanned_at;
END;
$$;

-- Callable by signed-in staff only; identity is checked inside via auth.uid().
GRANT EXECUTE ON FUNCTION public.scan_ticket(TEXT, UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.scan_ticket(TEXT, UUID, UUID) FROM anon;
