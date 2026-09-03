-- ============================================================================
-- TWO FUNCTIONS THE CODE HAS BEEN CALLING THAT DO NOT EXIST
--
-- Found 29 August 2026 by typing the Supabase clients with the generated
-- Database types. Both were confirmed absent by calling them against the TEST
-- project, which answered PGRST202 "Could not find the function", and neither
-- appears in any migration in this repository.
--
--   increment_sold_count(p_tier_id, p_quantity)
--     Called by the SQUAD (group buy) completion handler in
--     src/app/api/webhooks/stripe/route.ts after a squad's shared reservation
--     converts. The call is not awaited for its result and its error was never
--     read, so it failed silently on every squad completion. Consequence:
--     a completed squad purchase consumed NO inventory. The tier's sold_count
--     never moved and its reserved_count was never released, so those seats
--     could be sold again, without limit. Ordinary single-buyer orders are NOT
--     affected: they go through confirm_order, which does this correctly.
--
--   increment_discount_uses(p_code_id)
--     Called by the free-order branch of src/app/actions/checkout.ts.
--     discount_codes.current_uses was therefore never incremented by anything,
--     on any path. max_uses is read at validation time
--     (`current_uses >= max_uses`) and current_uses is permanently 0, so a code
--     capped at N uses could be redeemed an unlimited number of times.
--
-- WHY SQL AND NOT APPLICATION CODE. Both are read-modify-write on a contended
-- row. Done in the application they race: two buyers reading the same
-- current_uses both pass a cap of 1. Inside a single UPDATE, PostgreSQL holds
-- the row lock for the duration, so the check and the write cannot be
-- separated. Both functions therefore decide AND write in one statement and
-- report what they did, following the pattern already proven in confirm_order
-- (20260819000004).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- increment_sold_count: convert held inventory into sold inventory.
--
-- Mirrors the branch confirm_order already uses for an ACTIVE hold: move the
-- quantity from reserved_count to sold_count. reserved_count is floored at zero
-- with GREATEST for the same reason it is there, so a double call cannot drive
-- it negative.
--
-- Returns TRUE when a row was updated. The caller must read this: a FALSE is a
-- tier that no longer exists, and silence is what caused this defect.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_sold_count(
  p_tier_id UUID,
  p_quantity INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'increment_sold_count: quantity must be positive, got %', p_quantity
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.ticket_tiers
  SET
    sold_count     = sold_count + p_quantity,
    reserved_count = GREATEST(reserved_count - p_quantity, 0)
  WHERE id = p_tier_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.increment_sold_count(UUID, INT) IS
  'Converts a held quantity on a ticket tier from reserved_count to sold_count, atomically. Used by the squad completion path after its shared reservation converts. Returns FALSE when no such tier exists.';

-- ----------------------------------------------------------------------------
-- increment_discount_uses: claim ONE use of a discount code, honouring the cap.
--
-- The cap test lives in the WHERE clause so it is evaluated under the row lock
-- taken by this UPDATE. A code with max_uses = 1 redeemed by two buyers at the
-- same instant therefore returns TRUE to exactly one of them.
--
-- Returns TRUE when a use was claimed, FALSE when the code is exhausted,
-- inactive or absent. The caller must read this.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_discount_uses(
  p_code_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.discount_codes
  SET current_uses = current_uses + 1
  WHERE id = p_code_id
    AND is_active = TRUE
    AND (max_uses IS NULL OR current_uses < max_uses);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.increment_discount_uses(UUID) IS
  'Claims one use of a discount code, refusing atomically once max_uses is reached. Returns FALSE when the code is exhausted, inactive or absent.';

-- Both are called from server-side code holding the service role. They are
-- SECURITY DEFINER so they run with the definer''s rights regardless of the
-- caller''s row policies, matching confirm_order.
REVOKE ALL ON FUNCTION public.increment_sold_count(UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_discount_uses(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_sold_count(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_discount_uses(UUID) TO service_role;
