-- ============================================================================
-- TICKET PRICE HISTORY (Scope v5, 3.3), 4 September 2026
--
-- THE GAP THIS SERVES. Scope 3.3 says "price history visible on event page so
-- buyers can see how pricing has moved, reinforcing transparency". Dynamic
-- pricing has existed since the baseline (dynamic_pricing_rules and
-- get_current_tier_price), and nothing anywhere recorded a price. The page
-- could show only the price of the moment, so there was nothing to be
-- transparent with.
--
-- WHAT IS RECORDED. One row each time a tier's EFFECTIVE price (the value
-- get_current_tier_price returns, which is what a buyer is charged) becomes a
-- different number from the last one recorded for that tier:
--
--   reason 'listed'   the first price ever recorded for this tier name
--   reason 'changed'  the organiser moved it: the base price, the dynamic
--                     pricing switch, or the steps
--   reason 'step'     sales crossed a capacity threshold and a step took over
--
-- KEYED BY EVENT AND TIER NAME, NOT BY TIER ID. The organiser's edit path
-- (updateEvent) deletes every tier and re-inserts it, so a tier id does not
-- survive an edit. The id is kept, nullable, ON DELETE SET NULL, for the join
-- while the tier lives; the name is the identity a person recognises and the
-- one that survives.
--
-- WRITTEN BY THE DATABASE ONLY. Every inventory change is a plain UPDATE of
-- ticket_tiers inside an RPC (create_reservation, confirm_order,
-- increment_sold_count), and every price change is an UPDATE or INSERT of
-- ticket_tiers or a write to dynamic_pricing_rules. Row triggers on those two
-- tables therefore see every path, and application code never inserts here.
-- scripts/guards/price-history-integrity.mjs holds that property in source.
--
-- DEFERRED, AND WHY. saveDynamicPricing used to run three auto-committed
-- statements: toggle the flag, delete the rules, insert the rules. A trigger
-- judging each statement would have recorded a spurious flip to the base price
-- between the delete and the insert. Two things fix that together: the save
-- becomes ONE transaction (save_dynamic_pricing below), and the history
-- triggers are DEFERRABLE INITIALLY DEFERRED constraint triggers, which fire at
-- COMMIT and therefore judge the final state. Within one transaction every
-- queued row event recomputes the same final price; the first appends and the
-- rest find nothing new. confirm_order moves reserved_count to sold_count in
-- one statement and is judged once, at its own commit.
--
-- BACKFILL, honest about what it knows. Every existing tier gets one 'listed'
-- row at its BASE price dated the tier's created_at, and the recorder then runs
-- once per tier so a tier whose effective price already differs (dynamic
-- pricing with a step in force) gets a 'changed' row dated today. What happened
-- before today was never recorded and is not invented.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ticket_price_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_tier_id       uuid REFERENCES public.ticket_tiers(id) ON DELETE SET NULL,
  tier_name            text NOT NULL,
  price_cents          integer NOT NULL CHECK (price_cents >= 0),
  previous_price_cents integer CHECK (previous_price_cents IS NULL OR previous_price_cents >= 0),
  reason               text NOT NULL CHECK (reason IN ('listed', 'changed', 'step')),
  percent_sold         numeric(5, 2) CHECK (percent_sold IS NULL OR (percent_sold >= 0 AND percent_sold <= 100)),
  currency             text NOT NULL DEFAULT 'AUD',
  recorded_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ticket_price_history IS
  'One row each time a tier''s effective price (get_current_tier_price) became a '
  'different number: listed, changed by the organiser, or a dynamic step crossed. '
  'Keyed by event and tier NAME because an edit re-creates every tier. Written by '
  'the database triggers only; shown on the public event page (Scope v5 3.3).';

CREATE INDEX IF NOT EXISTS idx_ticket_price_history_event_time
  ON public.ticket_price_history (event_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_ticket_price_history_event_tier_latest
  ON public.ticket_price_history (event_id, lower(tier_name), recorded_at DESC);

ALTER TABLE public.ticket_price_history ENABLE ROW LEVEL SECURITY;

-- Readable by everyone: it renders on the public event page, which reads with
-- the anon key. Hidden and access-code tiers are filtered by the page, which
-- already decides which tiers a visitor may see.
REVOKE ALL ON public.ticket_price_history FROM PUBLIC;
GRANT SELECT ON public.ticket_price_history TO anon, authenticated;

DROP POLICY IF EXISTS "Price history is viewable by everyone" ON public.ticket_price_history;
CREATE POLICY "Price history is viewable by everyone"
  ON public.ticket_price_history FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role manages price history" ON public.ticket_price_history;
CREATE POLICY "Service role manages price history"
  ON public.ticket_price_history FOR ALL
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- THE RECORDER. Reads the tier, asks get_current_tier_price for the effective
-- price, compares with the latest row for (event, lower(name)), and appends
-- only when the number is new. p_hint is 'step' when the caller was an
-- inventory change and 'changed' otherwise; a tier with no history at all is
-- 'listed' whatever the hint.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_tier_price_history(p_tier_id uuid, p_hint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier    RECORD;
  v_price   integer;
  v_latest  RECORD;
  v_percent numeric(5, 2);
  v_reason  text;
BEGIN
  SELECT tt.id, tt.event_id, tt.name, tt.currency, tt.sold_count, tt.reserved_count, tt.total_capacity
    INTO v_tier
    FROM public.ticket_tiers tt
   WHERE tt.id = p_tier_id;

  -- The tier was deleted in the same transaction (the edit path re-creates
  -- tiers). Its history stays; there is nothing to record for a row that is gone.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_price := public.get_current_tier_price(v_tier.id);

  IF v_tier.total_capacity IS NULL OR v_tier.total_capacity <= 0 THEN
    v_percent := 0;
  ELSE
    v_percent := LEAST(100, ROUND(((v_tier.sold_count + v_tier.reserved_count)::numeric / v_tier.total_capacity::numeric) * 100, 2));
  END IF;

  SELECT h.price_cents
    INTO v_latest
    FROM public.ticket_price_history h
   WHERE h.event_id = v_tier.event_id
     AND lower(h.tier_name) = lower(v_tier.name)
   ORDER BY h.recorded_at DESC, h.id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    v_reason := 'listed';
  ELSIF v_latest.price_cents = v_price THEN
    RETURN;
  ELSIF p_hint = 'step' THEN
    v_reason := 'step';
  ELSE
    v_reason := 'changed';
  END IF;

  INSERT INTO public.ticket_price_history
    (event_id, ticket_tier_id, tier_name, price_cents, previous_price_cents, reason, percent_sold, currency)
  VALUES
    (v_tier.event_id, v_tier.id, v_tier.name, v_price,
     CASE WHEN v_reason = 'listed' THEN NULL ELSE v_latest.price_cents END,
     v_reason,
     CASE WHEN v_reason = 'step' THEN v_percent ELSE NULL END,
     COALESCE(v_tier.currency, 'AUD'));
END;
$$;

REVOKE ALL ON FUNCTION public.record_tier_price_history(uuid, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- THE TWO TRIGGERS. Constraint triggers, deferred to commit (see the header).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_tiers_record_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hint text := 'changed';
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.price IS NOT DISTINCT FROM OLD.price
     AND NEW.dynamic_pricing_enabled IS NOT DISTINCT FROM OLD.dynamic_pricing_enabled
     AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
    v_hint := 'step';
  END IF;
  PERFORM public.record_tier_price_history(NEW.id, v_hint);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ticket_tiers_record_price_history() FROM PUBLIC;

DROP TRIGGER IF EXISTS ticket_tiers_record_price_history ON public.ticket_tiers;
CREATE CONSTRAINT TRIGGER ticket_tiers_record_price_history
  AFTER INSERT OR UPDATE OF price, dynamic_pricing_enabled, name, sold_count, reserved_count
  ON public.ticket_tiers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.ticket_tiers_record_price_history();

CREATE OR REPLACE FUNCTION public.dynamic_pricing_rules_record_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.record_tier_price_history(COALESCE(NEW.ticket_tier_id, OLD.ticket_tier_id), 'changed');
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.dynamic_pricing_rules_record_price_history() FROM PUBLIC;

DROP TRIGGER IF EXISTS dynamic_pricing_rules_record_price_history ON public.dynamic_pricing_rules;
CREATE CONSTRAINT TRIGGER dynamic_pricing_rules_record_price_history
  AFTER INSERT OR UPDATE OR DELETE
  ON public.dynamic_pricing_rules
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.dynamic_pricing_rules_record_price_history();

-- ----------------------------------------------------------------------------
-- THE ATOMIC SAVE. The organiser's dynamic pricing screen used to toggle,
-- delete and insert in three statements from application code. This is the
-- same work in one transaction, so the deferred triggers above judge the
-- final state once. Validation mirrors the action's zod schema so a bad shape
-- is refused here as well, never trusted from a caller.
-- ----------------------------------------------------------------------------
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
  v_count   integer := 0;
  v_step    jsonb;
  v_order   integer := 0;
  v_percent numeric;
  v_price   integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ticket_tiers WHERE id = p_tier_id) THEN
    RAISE EXCEPTION 'Tier % not found', p_tier_id USING ERRCODE = 'P0002';
  END IF;

  IF p_enabled THEN
    IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
      RAISE EXCEPTION 'steps must be an array' USING ERRCODE = '22023';
    END IF;
    v_count := jsonb_array_length(p_steps);
    IF v_count < 1 OR v_count > 10 THEN
      RAISE EXCEPTION 'between 1 and 10 steps are allowed, got %', v_count USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.ticket_tiers
     SET dynamic_pricing_enabled = p_enabled
   WHERE id = p_tier_id;

  DELETE FROM public.dynamic_pricing_rules WHERE ticket_tier_id = p_tier_id;

  IF p_enabled THEN
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

  RETURN v_order;
END;
$$;

-- The action checks the caller's authority itself (resolveEventAccess) and then
-- calls this through the service role. Nobody else may call it directly.
REVOKE ALL ON FUNCTION public.save_dynamic_pricing(uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_dynamic_pricing(uuid, boolean, jsonb) TO service_role;

-- ----------------------------------------------------------------------------
-- BACKFILL (see the header): one 'listed' row per existing tier at its base
-- price, dated when the tier was created, then the recorder once per tier.
-- ----------------------------------------------------------------------------
INSERT INTO public.ticket_price_history
  (event_id, ticket_tier_id, tier_name, price_cents, previous_price_cents, reason, percent_sold, currency, recorded_at)
SELECT tt.event_id, tt.id, tt.name, GREATEST(tt.price, 0), NULL, 'listed', NULL, COALESCE(tt.currency, 'AUD'), tt.created_at
  FROM public.ticket_tiers tt
 WHERE NOT EXISTS (
   SELECT 1 FROM public.ticket_price_history h
    WHERE h.event_id = tt.event_id AND lower(h.tier_name) = lower(tt.name)
 );

DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.ticket_tiers LOOP
    PERFORM public.record_tier_price_history(v_id, 'changed');
  END LOOP;
END;
$$;
