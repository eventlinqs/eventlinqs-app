-- ===========================================================================
-- TWO STORED COUNTS GET A MAINTAINER, AND ONE OF THEM NEVER HAD ONE AT ALL
-- ===========================================================================
--
-- FOUNDER RULING, 25 August 2026:
--
--   "Any column that stores a count or a total of rows in another table must
--    either be maintained by a database trigger or not exist. Enumerate every
--    such column, state for each whether it is trigger-maintained,
--    application-maintained or unmaintained, and fix what can be fixed now."
--
-- The enumeration is scripts/lib/stored-aggregates.mjs, with a verdict per
-- column, and it is the source the build guard and the reconciliation both read.
-- This migration is the "fix what can be fixed now" half.
--
-- ---------------------------------------------------------------------------
-- 1. organisations.total_event_count
-- ---------------------------------------------------------------------------
--
-- Incremented by connect-ledger.ts on the first confirmed order for an event.
-- Decremented by NOTHING, anywhere, ever. Driven against TEST on 25 August 2026:
-- deleting the event left the counter at 1 against a truth of 0, which is
-- exactly what the production purge did to it 46 times.
--
-- It becomes a RECOMPUTE from the events table. The application increment is
-- removed in the same change, because a trigger and an increment both running
-- would double count.
--
-- THE MEANING CHANGES, AND THAT IS DELIBERATE AND SAFE. The old figure counted
-- "events that ever took a confirmed order"; the new one counts events. The
-- column is called total_event_count, the new meaning is what the name says, and
-- NOTHING READS IT: every occurrence in src/ and in the migrations is a write or
-- a CHECK constraint, and since 25 August 2026 the admin organiser surface
-- counts the rows rather than rendering the column.
--
-- ---------------------------------------------------------------------------
-- 2. tier_access_codes.current_uses
-- ---------------------------------------------------------------------------
--
-- FOUND BY THE ENUMERATION, NOT BY ANYONE HITTING IT, which is the point of
-- enumerating. NOTHING wrote this column. Not a trigger, not a function, not a
-- line of TypeScript. It is created 0 and it stays 0.
--
-- That is not cosmetic, because validateAccessCode enforces against it:
--
--     if (c.max_uses !== null && c.current_uses >= c.max_uses) return false
--
-- An organiser who capped an access code at 50 uses had a code that could be
-- redeemed without limit, and the check that looks like the cap has never once
-- refused anybody.
--
-- It cannot be a recompute: there is no usages table for access codes, so there
-- are no rows to count. It counts redemption EVENTS. So it gets the next best
-- thing, which is the same shape every capacity decision in this schema already
-- uses: one function, one row lock, check and increment in the same statement,
-- so two people redeeming the last use of a code cannot both win.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. organisations.total_event_count recomputes from events
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_org_event_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
BEGIN
  -- An event moving between organisations changes TWO counts, so both are
  -- recomputed rather than only the new one.
  FOR v_org IN
    SELECT DISTINCT x FROM unnest(ARRAY[NEW.organisation_id, OLD.organisation_id]) AS x
    WHERE x IS NOT NULL
  LOOP
    UPDATE public.organisations o
    SET total_event_count = (
      SELECT count(*) FROM public.events e WHERE e.organisation_id = v_org
    )
    WHERE o.id = v_org;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.recompute_org_event_count() IS
  'Recomputes organisations.total_event_count from public.events. Replaces an application increment that had no decrement anywhere; see scripts/lib/stored-aggregates.mjs.';

DROP TRIGGER IF EXISTS trg_recompute_org_event_count ON public.events;
CREATE TRIGGER trg_recompute_org_event_count
  AFTER INSERT OR DELETE OR UPDATE OF organisation_id ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_org_event_count();

-- BACKFILL. Every organisation currently carries whatever the increment left
-- behind. Measured on TEST on 25 August 2026: 9 of 9 organisations with a
-- non-zero counter disagreed with their own rows, one reading 5 against 76.
UPDATE public.organisations o
SET total_event_count = sub.n
FROM (
  SELECT org.id, count(e.id) AS n
  FROM public.organisations org
  LEFT JOIN public.events e ON e.organisation_id = org.id
  GROUP BY org.id
) sub
WHERE sub.id = o.id AND o.total_event_count IS DISTINCT FROM sub.n;

-- ---------------------------------------------------------------------------
-- 2. tier_access_codes.current_uses gets a maintainer, under a row lock
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_tier_access_codes(
  p_code TEXT,
  p_tier_ids UUID[]
)
RETURNS TABLE (ticket_tier_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  /*
   * ONE STATEMENT DOES THE CHECK AND THE INCREMENT, under the row lock UPDATE
   * takes. The application used to SELECT, compare current_uses to max_uses in
   * JavaScript, and never write anything back. Two people redeeming the last use
   * of a code both passed that check; now the second one's UPDATE matches no row
   * because the predicate is evaluated against the locked, already-incremented
   * value.
   *
   * The comparison is `current_uses < max_uses`, so a code with max_uses 1 and
   * current_uses 0 admits exactly one redemption. A NULL max_uses is unlimited,
   * which is what the column's own comment has always meant.
   */
  RETURN QUERY
  UPDATE public.tier_access_codes c
  SET current_uses = c.current_uses + 1,
      updated_at = v_now
  WHERE c.code = p_code
    AND c.is_active = TRUE
    AND c.ticket_tier_id = ANY(p_tier_ids)
    AND (c.valid_from IS NULL OR c.valid_from <= v_now)
    AND (c.valid_until IS NULL OR c.valid_until >= v_now)
    AND (c.max_uses IS NULL OR c.current_uses < c.max_uses)
  RETURNING c.ticket_tier_id;
END;
$$;

COMMENT ON FUNCTION public.redeem_tier_access_codes(TEXT, UUID[]) IS
  'Atomically redeems a tier access code: checks the validity window and max_uses and increments current_uses in one locked statement, returning the tiers unlocked. Before 25 August 2026 nothing incremented current_uses at all, so max_uses refused nobody.';

REVOKE EXECUTE ON FUNCTION public.redeem_tier_access_codes(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_tier_access_codes(TEXT, UUID[]) TO anon, authenticated;
