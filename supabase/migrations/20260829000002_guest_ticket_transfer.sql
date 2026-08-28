-- ============================================================================
-- THE GUEST'S HALF OF THE TRANSFER
--
-- Journey 5, 28 August 2026. A buyer who checked out as a guest could see their
-- ticket and could not move it. transfer_ticket() takes its identity from
-- auth.uid() and raises not_authenticated when there is none, and guest
-- checkout creates no account, so the control was offered to somebody it could
-- never work for. The refund half was answered on 29 August by the signed
-- order-access link (src/lib/orders/order-access.ts); this is the same answer
-- for transfer.
--
-- WHY A SECOND FUNCTION AND NOT A PARAMETER ON THE FIRST.
--
-- transfer_ticket() is GRANTed to `authenticated` and takes identity from the
-- session, never from an argument. That is the property that makes it safe, and
-- adding "or trust this order id I was handed" to it would destroy that property
-- for every existing caller at once: any signed-in user could pass another
-- person's order id. The two authorisation models therefore stay in two
-- functions with two grants.
--
-- HOW THIS ONE IS AUTHORISED.
--
--   * It is granted to service_role ONLY, and REVOKEd from anon and
--     authenticated. It is unreachable from a browser.
--   * It requires the ticket to belong to the order named in p_order_id, so a
--     token for order A cannot move a ticket sitting on order B.
--   * The right to name that order is proved BEFORE this is called, in Node, by
--     verifyOrderAccessToken(orderId, token): a constant-time HMAC check of the
--     signed link from the buyer's own confirmation email. This function trusts
--     that check and nothing else, which is why it must never be callable by a
--     client that could skip it.
--
-- Everything else is deliberately identical to transfer_ticket: the row is
-- locked FOR UPDATE so a transfer serialises against a concurrent transfer or a
-- door scan, only a 'valid' ticket moves, the bearer secret is ROTATED so the
-- old QR dies, and the transfer is logged. from_user_id is NULL because there
-- is genuinely no user; from_email records who held it, which is the fact worth
-- keeping.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transfer_ticket_for_order(
  p_ticket_id UUID,
  p_order_id  UUID,
  p_to_email  TEXT,
  p_to_name   TEXT
)
RETURNS TABLE (ticket_code TEXT, new_secret UUID, event_title TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket     RECORD;
  v_new_secret UUID := gen_random_uuid();
BEGIN
  -- Lock the ticket row so a concurrent transfer or scan serialises against it.
  SELECT t.id, t.order_id, t.event_id, t.status, t.holder_email, t.ticket_code
    INTO v_ticket
  FROM public.tickets t
  WHERE t.id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- The ONLY authorisation this function performs: the ticket must sit on the
  -- order whose signed link was verified by the caller.
  IF v_ticket.order_id IS DISTINCT FROM p_order_id THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  IF v_ticket.status <> 'valid' THEN
    RAISE EXCEPTION 'not_transferable' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tickets
     SET holder_email         = p_to_email,
         holder_name          = p_to_name,
         secret               = v_new_secret,
         transferred_to_email = p_to_email,
         updated_at           = now()
   WHERE id = p_ticket_id;

  INSERT INTO public.ticket_transfers (ticket_id, event_id, from_user_id, from_email, to_email)
  VALUES (p_ticket_id, v_ticket.event_id, NULL, v_ticket.holder_email, p_to_email);

  RETURN QUERY
    SELECT v_ticket.ticket_code, v_new_secret, e.title
    FROM public.events e
    WHERE e.id = v_ticket.event_id;
END;
$$;

COMMENT ON FUNCTION public.transfer_ticket_for_order(UUID, UUID, TEXT, TEXT) IS
  'Transfers a ticket on behalf of a guest who proved ownership of the order with a signed order-access link. Service role only: the HMAC check happens in Node before this is called, so a client that could call this directly would bypass the only authorisation there is.';

-- The grant IS the security boundary here. Stated explicitly rather than left
-- to the default, because the default for a new function is EXECUTE to PUBLIC.
REVOKE ALL ON FUNCTION public.transfer_ticket_for_order(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_ticket_for_order(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_ticket_for_order(UUID, UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ticket_for_order(UUID, UUID, TEXT, TEXT) TO service_role;
