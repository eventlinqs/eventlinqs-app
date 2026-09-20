-- ---------------------------------------------------------------------------
-- A PAUSED PRICE LADDER IS NOT A DELETED ONE, AND AN ENABLED TIER ALWAYS HAS
-- ONE.
--
-- LB-PRICEWHOLE, 20 September 2026.
--
-- ---------------------------------------------------------------------------
-- DEFECT ONE: THE PAUSE THAT DELETES.
--
-- The organiser dynamic pricing screen carries one switch per ticket type and
-- one Save button. save_dynamic_pricing, as written on 4 September 2026, ran
--
--     DELETE FROM public.dynamic_pricing_rules WHERE ticket_tier_id = p_tier_id;
--     IF p_enabled THEN ... insert the submitted steps ... END IF;
--
-- so turning the switch OFF and pressing Save destroyed every step. The action
-- above it made that certain: it sent p_steps as an empty array whenever the
-- switch was off, so the delete ran and nothing replaced it.
--
-- Nothing on the screen said so. The steps are hidden the moment the switch
-- moves, so the organiser cannot even see what they are about to lose, and
-- turning the switch back on shows a single step at the base price, which reads
-- as "this tier never had a ladder" rather than as "your ladder is gone".
--
-- A five step ladder is a pricing decision an organiser made once and expects
-- to keep. Pausing it for a weekend is an ordinary thing to want. Deleting it
-- is not what the switch says it does.
--
-- THE RULE THIS INSTALLS: an absent or empty step list is an ABSENCE OF
-- INSTRUCTION, never an instruction to delete. The ladder is replaced only when
-- a caller supplies steps to replace it with. The switch alone moves the flag.
--
-- ---------------------------------------------------------------------------
-- DEFECT TWO: THE STATE THAT MAKES THE SCREEN LIE.
--
-- dynamic_pricing_enabled true with no rows in dynamic_pricing_rules is a state
-- the screen cannot render honestly. pricing-client.tsx seeds its editor from
-- the ladder it was handed and falls back to one synthetic step at the base
-- price when that list is empty, so an enabled tier holding no steps draws a
-- ladder that is not in the database, and the next Save writes that invention
-- back. Every reader downstream has the same problem: get_effective_tier_price
-- returns the base price while the organiser is told dynamic pricing is on.
--
-- Nothing creates that state today, which is exactly when a constraint is cheap
-- to add. Measured before writing this, both ways:
--
--     TEST        383 ticket tiers, 7 with dynamic pricing enabled, 0 with an
--                 empty ladder
--     production    5 ticket tiers, 0 with dynamic pricing enabled, 0 with an
--                 empty ladder
--
-- The repair below therefore changes no row on either database. It is here
-- because a constraint cannot be added to a database that already breaks it,
-- and a migration that assumes its own precondition is a migration that fails
-- on the one database nobody measured.
--
-- ---------------------------------------------------------------------------
-- WHY A DEFERRED CONSTRAINT TRIGGER AND NOT A CHECK. The rule spans two tables,
-- so CHECK cannot express it. It must also survive the legitimate moment inside
-- save_dynamic_pricing when the old steps are gone and the new ones are not yet
-- inserted, so it is judged at COMMIT rather than per statement. That is the
-- same shape, and the same reasoning, as the price history triggers installed
-- beside it in 20260904000002.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------ the precondition, made true
UPDATE public.ticket_tiers t
   SET dynamic_pricing_enabled = false
 WHERE t.dynamic_pricing_enabled
   AND NOT EXISTS (
     SELECT 1 FROM public.dynamic_pricing_rules r WHERE r.ticket_tier_id = t.id
   );

-- -------------------------------------------------------------- the save, fixed
CREATE OR REPLACE FUNCTION public.save_dynamic_pricing(
  p_tier_id uuid,
  p_enabled boolean,
  p_steps   jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count    integer := 0;
  v_step     jsonb;
  v_order    integer := 0;
  v_percent  numeric;
  v_price    integer;
  v_replace  boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ticket_tiers WHERE id = p_tier_id) THEN
    RAISE EXCEPTION 'Tier % not found', p_tier_id USING ERRCODE = 'P0002';
  END IF;

  IF p_steps IS NOT NULL AND jsonb_typeof(p_steps) <> 'array' THEN
    RAISE EXCEPTION 'steps must be an array' USING ERRCODE = '22023';
  END IF;

  v_count := CASE WHEN p_steps IS NULL THEN 0 ELSE jsonb_array_length(p_steps) END;

  -- An empty list is silence, not an instruction. Only a supplied ladder
  -- replaces the stored one; see DEFECT ONE above.
  v_replace := v_count > 0;

  IF v_count > 10 THEN
    RAISE EXCEPTION 'between 1 and 10 steps are allowed, got %', v_count USING ERRCODE = '22023';
  END IF;

  -- Switching dynamic pricing ON still needs a ladder to switch on to: either
  -- one supplied in this call, or one already stored for the tier.
  IF p_enabled AND v_count = 0
     AND NOT EXISTS (SELECT 1 FROM public.dynamic_pricing_rules WHERE ticket_tier_id = p_tier_id) THEN
    RAISE EXCEPTION 'between 1 and 10 steps are allowed, got 0' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ticket_tiers
     SET dynamic_pricing_enabled = p_enabled
   WHERE id = p_tier_id;

  IF v_replace THEN
    DELETE FROM public.dynamic_pricing_rules WHERE ticket_tier_id = p_tier_id;

    FOR v_step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
      v_order := v_order + 1;
      v_percent := (v_step->>'capacity_threshold_percent')::numeric;
      v_price := (v_step->>'price_cents')::integer;
      IF v_percent IS NULL OR v_percent < 1 OR v_percent > 100 THEN
        RAISE EXCEPTION 'step % threshold must be between 1 and 100', v_order USING ERRCODE = '22023';
      END IF;
      IF v_price IS NULL OR v_price < 0 THEN
        RAISE EXCEPTION 'step % price must be zero or more', v_order USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.dynamic_pricing_rules (ticket_tier_id, step_order, capacity_threshold_percent, price_cents)
      VALUES (p_tier_id, v_order, v_percent, v_price);
    END LOOP;
  END IF;

  -- What the tier now holds, which is the answer a caller can act on. It used
  -- to return only the number of rows this call inserted, which is zero on a
  -- pause and reads as "the ladder is empty".
  SELECT count(*) INTO v_order FROM public.dynamic_pricing_rules WHERE ticket_tier_id = p_tier_id;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.save_dynamic_pricing(uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_dynamic_pricing(uuid, boolean, jsonb) TO service_role;

-- ------------------------------------------------------------- the constraint
CREATE OR REPLACE FUNCTION public.dynamic_pricing_enabled_needs_a_ladder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier_id uuid;
  v_enabled boolean;
BEGIN
  IF TG_TABLE_NAME = 'ticket_tiers' THEN
    v_tier_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_tier_id := OLD.ticket_tier_id;
  ELSE
    v_tier_id := NEW.ticket_tier_id;
  END IF;

  SELECT t.dynamic_pricing_enabled INTO v_enabled
    FROM public.ticket_tiers t
   WHERE t.id = v_tier_id;

  -- The tier itself was deleted in this transaction and its rules went with it
  -- by cascade. There is nothing left to be inconsistent.
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT v_enabled THEN RETURN NULL; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dynamic_pricing_rules WHERE ticket_tier_id = v_tier_id) THEN
    RAISE EXCEPTION
      'ticket tier % has dynamic pricing switched on and no price steps, so every reader would show the base price while the organiser is told the ladder is running',
      v_tier_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.dynamic_pricing_enabled_needs_a_ladder() FROM PUBLIC;

DROP TRIGGER IF EXISTS ticket_tiers_enabled_needs_a_ladder ON public.ticket_tiers;
CREATE CONSTRAINT TRIGGER ticket_tiers_enabled_needs_a_ladder
  AFTER INSERT OR UPDATE OF dynamic_pricing_enabled
  ON public.ticket_tiers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.dynamic_pricing_enabled_needs_a_ladder();

DROP TRIGGER IF EXISTS dynamic_pricing_rules_enabled_needs_a_ladder ON public.dynamic_pricing_rules;
CREATE CONSTRAINT TRIGGER dynamic_pricing_rules_enabled_needs_a_ladder
  AFTER UPDATE OR DELETE
  ON public.dynamic_pricing_rules
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.dynamic_pricing_enabled_needs_a_ladder();
