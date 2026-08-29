-- ============================================================================
-- A DISCOUNT USE IS CLAIMED WHEN IT IS APPLIED, NOT AFTER THE MONEY MOVES.
--
-- THE HOLE THIS CLOSES, measured on 29 August 2026 by driving it.
--
-- validateDiscountCode read `current_uses` to decide whether the buyer may have
-- the discount, and recordDiscountUse claimed the use only AFTER the order was
-- confirmed. Two buyers who both read current_uses = 0 therefore both received
-- the discount, and only one of them advanced the counter.
--
-- 20260829000001 made current_uses incapable of EXCEEDING max_uses, which is a
-- different and lesser property. It bounds the COUNTER. It does not bound how
-- many orders were granted the discount, because the grant already happened.
-- On a code capped at 1, the second buyer still paid the discounted price and
-- the organiser still lost the difference. Bounded per person by
-- max_uses_per_user for a signed-in buyer; unbounded across different buyers,
-- and unbounded entirely for guests, who have no user_id to count against.
--
-- THE SHAPE IS THE ONE THE SEAT INVENTORY ALREADY USES, deliberately, because
-- it is proven here and because a second pattern for the same problem is a
-- second thing to get wrong. ticket_tiers carries sold_count + reserved_count;
-- discount_codes now carries current_uses + reserved_uses. A hold moves into
-- reserved_uses, converts to current_uses on confirmation, and is released back
-- when the reservation lapses, exactly as a held seat is.
--
-- WHY A CLAIMS TABLE RATHER THAN A COLUMN ON reservations. The release has to be
-- EXACT: releasing a claim that was never made drives reserved_uses negative and
-- silently hands out a free use, and releasing twice does it twice. A row keyed
-- by reservation_id makes the claim idempotent to take (ON CONFLICT DO NOTHING)
-- and idempotent to release (DELETE ... RETURNING decides whether anything was
-- actually held). Neither property is available from a nullable column that
-- something might write twice.
--
-- NOTHING EXISTING IS MODIFIED. confirm_order and expire_stale_reservations are
-- both left exactly as they are. The release is a SEPARATE function called by
-- the reservation-expire cron alongside release_expired_seat_reservations, which
-- is the pattern that route already uses for seats, and the conversion is called
-- by the application on the same paths that already record a usage. Editing two
-- proven money functions to add a third concern would put the seat and ticket
-- paths at risk to fix a discount bug.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- reserved_uses: the held count, mirroring ticket_tiers.reserved_count.
-- ----------------------------------------------------------------------------
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS reserved_uses INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.discount_codes.reserved_uses IS
  'Uses currently HELD by an active reservation, not yet confirmed. The cap is current_uses + reserved_uses against max_uses. Mirrors ticket_tiers.reserved_count.';

-- ----------------------------------------------------------------------------
-- Which reservation holds which claim. One claim per reservation, ever.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discount_code_claims (
  reservation_id UUID PRIMARY KEY REFERENCES public.reservations(id) ON DELETE CASCADE,
  discount_code_id UUID NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discount_code_claims_code_idx
  ON public.discount_code_claims (discount_code_id);

COMMENT ON TABLE public.discount_code_claims IS
  'A live hold on one use of a discount code, keyed by the reservation holding it. Deleted when the hold converts or lapses. The primary key is what makes claiming and releasing idempotent.';

ALTER TABLE public.discount_code_claims ENABLE ROW LEVEL SECURITY;
-- No policies: every access is server-side through the SECURITY DEFINER
-- functions below. A buyer has no business reading who else is holding a code.

-- ----------------------------------------------------------------------------
-- claim_discount_use: take one use, under the row lock, or refuse.
--
-- The cap test and the increment happen in ONE statement holding a row lock, so
-- two buyers arriving at the same instant cannot both pass. That is the whole
-- point: the application cannot take this lock, which is why the previous
-- attempt to bound this in application code could only bound the counter.
--
-- Returns TRUE when this reservation holds a use (including when it already
-- held one, so a retry is safe), FALSE when the code is exhausted, inactive,
-- outside its window, or absent.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_discount_use(
  p_code_id UUID,
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already INT;
  v_claimed INT;
BEGIN
  IF p_code_id IS NULL OR p_reservation_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Already holding it: idempotent, and NOT a second increment. A checkout that
  -- is retried, or a buyer who re-applies the same code, must not consume two.
  SELECT COUNT(*) INTO v_already
  FROM public.discount_code_claims
  WHERE reservation_id = p_reservation_id
    AND discount_code_id = p_code_id;
  IF v_already > 0 THEN
    RETURN TRUE;
  END IF;

  -- A reservation may hold at most one code. Swapping codes releases the old
  -- hold first, so a buyer trying codes in turn cannot pin several caps.
  PERFORM public.release_discount_claim(p_reservation_id);

  -- THE GATE. The cap counts held uses as well as confirmed ones, which is the
  -- entire fix: without reserved_uses in this test, two holds both pass.
  UPDATE public.discount_codes
  SET reserved_uses = reserved_uses + 1
  WHERE id = p_code_id
    AND is_active = TRUE
    AND (valid_from IS NULL OR valid_from <= NOW())
    AND (valid_until IS NULL OR valid_until >= NOW())
    AND (max_uses IS NULL OR current_uses + reserved_uses < max_uses);

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.discount_code_claims (reservation_id, discount_code_id)
  VALUES (p_reservation_id, p_code_id);

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.claim_discount_use(UUID, UUID) IS
  'Holds one use of a discount code against a reservation, refusing atomically once current_uses + reserved_uses reaches max_uses. Idempotent for a reservation already holding that code.';

-- ----------------------------------------------------------------------------
-- release_discount_claim: give the held use back when the hold lapses.
--
-- The DELETE decides. reserved_uses is only decremented when a row was actually
-- removed, so calling this on a reservation that holds nothing is a no-op rather
-- than a free use handed to the next buyer. GREATEST floors it at zero for the
-- same reason ticket_tiers.reserved_count is floored: a counter that can go
-- negative hands out inventory that does not exist.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_discount_claim(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id UUID;
BEGIN
  DELETE FROM public.discount_code_claims
  WHERE reservation_id = p_reservation_id
  RETURNING discount_code_id INTO v_code_id;

  IF v_code_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.discount_codes
  SET reserved_uses = GREATEST(reserved_uses - 1, 0)
  WHERE id = v_code_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.release_discount_claim(UUID) IS
  'Releases the use held by one reservation. A no-op when nothing was held, so it cannot hand out a free use.';

-- ----------------------------------------------------------------------------
-- convert_discount_claim: the hold becomes a real use, on confirmation.
--
-- reserved_uses down, current_uses up, claim gone, in one statement. Called on
-- the same paths that already record a discount_code_usages row.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_discount_claim(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id UUID;
BEGIN
  DELETE FROM public.discount_code_claims
  WHERE reservation_id = p_reservation_id
  RETURNING discount_code_id INTO v_code_id;

  IF v_code_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.discount_codes
  SET reserved_uses = GREATEST(reserved_uses - 1, 0),
      current_uses  = current_uses + 1
  WHERE id = v_code_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.convert_discount_claim(UUID) IS
  'Turns a held use into a confirmed one when the order is confirmed. Returns FALSE when the reservation held nothing, so the caller can fall back to the direct increment.';

-- ----------------------------------------------------------------------------
-- release_expired_discount_claims: the sweeper.
--
-- A SEPARATE function called by the reservation-expire cron beside
-- release_expired_seat_reservations, rather than an edit to
-- expire_stale_reservations. That function is on the seat and ticket money path
-- and is proven; adding a third concern to it to fix a discount bug would put
-- the proven paths at risk for the sake of the unproven one.
--
-- It keys off the reservation's own status, so it releases whatever the sweeper
-- expired, in the same pass, without needing the two to agree on ordering.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_discount_claims()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released INT := 0;
  v_claim RECORD;
BEGIN
  FOR v_claim IN
    SELECT c.reservation_id
    FROM public.discount_code_claims c
    JOIN public.reservations r ON r.id = c.reservation_id
    WHERE r.status <> 'active'
       OR r.expires_at < NOW()
    FOR UPDATE OF c SKIP LOCKED
  LOOP
    IF public.release_discount_claim(v_claim.reservation_id) THEN
      v_released := v_released + 1;
    END IF;
  END LOOP;

  RETURN v_released;
END;
$$;

COMMENT ON FUNCTION public.release_expired_discount_claims() IS
  'Releases every discount hold whose reservation is no longer active or has passed its expiry. Called by the reservation-expire cron beside release_expired_seat_reservations.';

-- ----------------------------------------------------------------------------
-- Grants. Every one of these runs from server-side code holding the service
-- role, exactly like confirm_order and increment_discount_uses. A client that
-- could reach claim_discount_use directly could exhaust an organiser's codes.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_discount_use(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_discount_claim(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_discount_claim(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_discount_claims() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_discount_use(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_discount_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_discount_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_discount_claims() TO service_role;
