-- ============================================================
-- In-platform ticket transfer with identity reissue
-- Run by founder: supabase db push --linked  (then: npm run db:types)
-- ============================================================
-- An attendee can transfer or gift a ticket to a new holder by email. On
-- transfer the holder is reassigned, the bearer secret is ROTATED (so the old
-- QR is invalidated and a fresh one is issued to the new holder), the transfer
-- is logged, and the recipient is emailed the new bearer link by the server
-- action. The ticket_code is unchanged (it is the stable human reference); the
-- (code, secret) pair is the credential, so rotating the secret invalidates the
-- old QR. After transfer the gate scan validates the NEW holder, and the
-- organiser's attendee export (which keys off tickets.holder_email/holder_name)
-- reflects the new holder. Consent is NOT inherited: nothing here writes an
-- organiser_marketing_consents row for the new holder.
-- Contents:
--   1. ticket_transfers audit table (+ RLS) - the transfer log
--   2. transfer_ticket(p_ticket_id, p_to_email, p_to_name) RPC
--      - SECURITY DEFINER, identity from auth.uid()
--      - authorises: the caller owns the order the ticket belongs to, OR their
--        account email is the current holder
--      - refuses any ticket that is not 'valid' (a scanned/refunded/void ticket
--        cannot be transferred to grant a second entry)
--      - row-locked (FOR UPDATE) so a ticket cannot be transferred twice or
--        transferred while it is being scanned
--   3. GRANT EXECUTE to authenticated
-- AU English, no em-dashes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ticket_transfers (append-only audit log of every transfer)
-- ------------------------------------------------------------
CREATE TABLE public.ticket_transfers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_email   TEXT NOT NULL,
  to_email     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_transfers_ticket ON public.ticket_transfers(ticket_id);
CREATE INDEX idx_ticket_transfers_event  ON public.ticket_transfers(event_id, created_at);

ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;

-- Org owner/members can read the transfer history for their own events.
CREATE POLICY "Org members view event ticket transfers"
  ON public.ticket_transfers FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      WHERE e.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR e.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')
      )
    )
  );

CREATE POLICY "Service role manages ticket transfers"
  ON public.ticket_transfers FOR ALL
  USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- 2. transfer_ticket(p_ticket_id, p_to_email, p_to_name)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_ticket(
  p_ticket_id UUID,
  p_to_email  TEXT,
  p_to_name   TEXT
)
RETURNS TABLE (ticket_code TEXT, new_secret UUID, event_title TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_email      TEXT;
  v_ticket     RECORD;
  v_authorised BOOLEAN;
  v_new_secret UUID := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock the ticket row so a concurrent transfer or scan serialises against it.
  SELECT t.id, t.order_id, t.event_id, t.status, t.holder_email, t.ticket_code
    INTO v_ticket
  FROM public.tickets t
  WHERE t.id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorise: the caller owns the order the ticket belongs to, OR their account
  -- email is the current holder. Identity is the session user, never a parameter.
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  v_authorised :=
       EXISTS (SELECT 1 FROM public.orders o WHERE o.id = v_ticket.order_id AND o.user_id = v_uid)
    OR (v_email IS NOT NULL AND lower(v_email) = lower(v_ticket.holder_email));

  IF NOT v_authorised THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  -- Only a live ticket can be transferred. A scanned/refunded/void/already
  -- transferred-out ticket cannot be transferred to grant a second entry.
  IF v_ticket.status <> 'valid' THEN
    RAISE EXCEPTION 'not_transferable' USING ERRCODE = '42501';
  END IF;

  -- Reassign the holder and ROTATE the secret. The old QR (old secret) is now
  -- invalid; the fresh (code, new_secret) pair is the new holder's credential.
  -- Consent is deliberately NOT copied to the new holder.
  UPDATE public.tickets
     SET holder_email         = p_to_email,
         holder_name          = p_to_name,
         secret               = v_new_secret,
         transferred_to_email = p_to_email,
         updated_at           = now()
   WHERE id = p_ticket_id;

  INSERT INTO public.ticket_transfers (ticket_id, event_id, from_user_id, from_email, to_email)
  VALUES (p_ticket_id, v_ticket.event_id, v_uid, v_ticket.holder_email, p_to_email);

  RETURN QUERY
    SELECT v_ticket.ticket_code, v_new_secret, e.title
    FROM public.events e
    WHERE e.id = v_ticket.event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_ticket(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_ticket(UUID, TEXT, TEXT) FROM anon;
