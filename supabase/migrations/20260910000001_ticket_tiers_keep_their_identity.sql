-- ============================================================================
-- A TICKET TYPE KEEPS ITS IDENTITY WHEN THE EVENT AROUND IT IS EDITED.
--
-- THE DEFECT THIS ENDS, driven on TEST on 10 September 2026.
--
-- updateEvent (src/app/(dashboard)/dashboard/events/actions.ts) saved an edit
-- like this, on every save of every event, published or not, sold or not:
--
--     await admin.from('ticket_tiers').delete().eq('event_id', input.eventId)
--     ... then re-insert the tiers from the form
--
-- The form drops the tier id before it posts, so the server had no way to tell
-- which submitted ticket type was which and replaced the lot. Two separate
-- failures came out of that one line, and BOTH were driven rather than argued.
--
-- FAILURE ONE, on an event that has sold anything at all. The delete is refused
-- by the database, correctly: order_items carries
--     CHECK ((item_type = 'ticket' AND ticket_tier_id IS NOT NULL) OR ...)
-- and the ON DELETE SET NULL on order_items.ticket_tier_id would break it. So
-- Postgres raises 23514. Nothing checked the error. The code walked on to the
-- re-insert, which collided with the rows that were never removed, and the
-- organiser was shown, in a live product, on their own event:
--
--     Failed to update ticket tiers: duplicate key value violates unique
--     constraint "ticket_tiers_event_id_name_key"
--
-- Read plainly: ONCE AN EVENT HAS SOLD ONE TICKET, ITS ORGANISER CAN NEVER
-- CHANGE A PRICE, A CAPACITY OR A TICKET NAME AGAIN, and what they are told is
-- the name of a database constraint. The first real outside organiser on this
-- platform has one confirmed sale, so this was live for them.
--
-- FAILURE TWO, on an event that has sold nothing. The delete succeeds, and it
-- takes with it everything hanging off those rows:
--     waitlist.ticket_tier_id              ON DELETE CASCADE
--     squads.ticket_tier_id                ON DELETE CASCADE
--     tier_access_codes.ticket_tier_id     ON DELETE CASCADE
--     dynamic_pricing_rules.ticket_tier_id ON DELETE CASCADE
-- so fixing a typo in a description silently emptied the waitlist, cancelled
-- every squad, voided every access code and deleted every pricing rule. The
-- price-history recorder already carries a comment acknowledging the recreate
-- ("the edit path re-creates tiers"), which is how long this has been visible.
--
-- WHAT THIS FILE DOES. It moves the save into ONE function and therefore ONE
-- transaction, so the work is a RECONCILIATION rather than a replacement:
-- what stayed is updated in place and keeps its id, what is genuinely new is
-- inserted, and what was genuinely removed is deleted only when nothing depends
-- on it. save_dynamic_pricing in 20260904000002 is the same shape and the same
-- reason: the deferred price-history triggers then judge the final state once.
--
-- WHY A FUNCTION RATHER THAN FOUR STATEMENTS FROM THE ACTION. Three reasons,
-- all of them cost-of-failure rather than tidiness.
--   1. ATOMIC. Four statements from Node are four transactions. A failure in the
--      third leaves an event with half its ticket types.
--   2. THE UNIQUE CONSTRAINT. ticket_tiers is UNIQUE (event_id, name), and a
--      person who swaps two ticket names is doing something ordinary. Inside one
--      transaction the names are parked on the row's own id first, so the swap
--      never collides and no reader outside the transaction ever sees the parked
--      value.
--   3. THE REFUSALS BELONG WITH THE DATA. Whether a ticket type has sold is a
--      fact about rows, and asking the database for it in the same transaction
--      that acts on it is the only answer that cannot be stale.
--
-- IT RETURNS A VERDICT, IT DOES NOT SHOUT. An expected refusal (removing a
-- ticket type somebody has already bought; cutting capacity below what is
-- already sold) comes back as jsonb the action turns into a sentence, so the
-- words a person reads live in TypeScript where the copy gate can see them.
-- Only a genuine fault raises.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_event_ticket_tiers(
  p_event_id uuid,
  p_tiers    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep      uuid[];
  v_blocked   text;
  v_shrunk    text;
  v_repeated  text;
  v_removed   integer := 0;
  v_updated   integer := 0;
  v_created   integer := 0;
  v_row       jsonb;
  v_id        uuid;
BEGIN
  IF p_tiers IS NULL OR jsonb_typeof(p_tiers) <> 'array' THEN
    RAISE EXCEPTION 'p_tiers must be a json array' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'event % not found', p_event_id USING ERRCODE = 'P0002';
  END IF;

  -- The ids the organiser kept, narrowed to rows that genuinely belong to THIS
  -- event. An id from anywhere else is treated as a new ticket type rather than
  -- trusted, so a tampered payload can never reach another event's row.
  SELECT COALESCE(array_agg(tt.id), '{}'::uuid[])
    INTO v_keep
    FROM public.ticket_tiers tt
   WHERE tt.event_id = p_event_id
     AND tt.id::text IN (
       SELECT t->>'id' FROM jsonb_array_elements(p_tiers) t WHERE COALESCE(t->>'id', '') <> ''
     );

  -- ---------------------------------------------------------------------
  -- REFUSAL ONE: a ticket type somebody has already bought cannot be removed.
  -- Asked four ways, because sold_count and reserved_count are stored counts
  -- and the rows themselves are the fact.
  -- ---------------------------------------------------------------------
  SELECT string_agg(tt.name, ', ' ORDER BY tt.sort_order, tt.name)
    INTO v_blocked
    FROM public.ticket_tiers tt
   WHERE tt.event_id = p_event_id
     AND NOT (tt.id = ANY (v_keep))
     AND (
       tt.sold_count > 0
       OR tt.reserved_count > 0
       OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.ticket_tier_id = tt.id)
       OR EXISTS (SELECT 1 FROM public.tickets tk WHERE tk.ticket_tier_id = tt.id)
     );

  IF v_blocked IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'refusal', 'sold', 'names', v_blocked);
  END IF;

  -- ---------------------------------------------------------------------
  -- REFUSAL TWO: capacity may not be cut below what is already spoken for.
  -- Newly reachable BECAUSE of this fix: before it, no edit of a sold event
  -- got this far at all, so nothing had ever had to refuse it.
  -- ---------------------------------------------------------------------
  SELECT string_agg(tt.name, ', ' ORDER BY tt.sort_order, tt.name)
    INTO v_shrunk
    FROM public.ticket_tiers tt
    JOIN jsonb_array_elements(p_tiers) t ON t->>'id' = tt.id::text
   WHERE tt.event_id = p_event_id
     AND (t->>'total_capacity') IS NOT NULL
     AND (t->>'total_capacity')::integer < (tt.sold_count + tt.reserved_count);

  IF v_shrunk IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'refusal', 'capacity', 'names', v_shrunk);
  END IF;

  -- ---------------------------------------------------------------------
  -- REFUSAL THREE: two ticket types on one event may not share a name.
  --
  -- Judged case-insensitively, which is STRICTER than the unique constraint
  -- (UNIQUE (event_id, name) would happily accept "VIP" beside "vip"), for two
  -- reasons. record_tier_price_history keys history on lower(tier_name), so a
  -- case-variant pair would silently SHARE one price history and each would
  -- report the other's moves as its own. And the platform already ruled on this
  -- shape once, for tags, on 9 September 2026 (migration 20260909000001): two
  -- things differing only by case are one thing spelled two ways.
  --
  -- Without this the organiser reaches the same duplicate-key message this whole
  -- migration exists to stop them ever seeing, by a different road.
  -- ---------------------------------------------------------------------
  SELECT string_agg(d.n, ', ' ORDER BY d.n)
    INTO v_repeated
    FROM (
      SELECT min(t->>'name') AS n
        FROM jsonb_array_elements(p_tiers) t
       GROUP BY lower(t->>'name')
      HAVING count(*) > 1
    ) d;

  IF v_repeated IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'refusal', 'repeated_name', 'names', v_repeated);
  END IF;

  -- ------------------------------------------------- what was genuinely removed
  WITH gone AS (
    DELETE FROM public.ticket_tiers tt
     WHERE tt.event_id = p_event_id
       AND NOT (tt.id = ANY (v_keep))
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM gone;

  -- ------------------------------------------------------ park the names first
  -- UNIQUE (event_id, name) is checked per statement, so renaming A to B while
  -- B still exists collides even inside one transaction. The row's own id is
  -- unique by construction and nobody outside this transaction can see it.
  UPDATE public.ticket_tiers
     SET name = 'pending-' || id::text
   WHERE event_id = p_event_id
     AND id = ANY (v_keep);

  -- ------------------------------------------------------------- what stayed
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_tiers) LOOP
    IF COALESCE(v_row->>'id', '') = '' THEN CONTINUE; END IF;
    v_id := NULL;
    BEGIN
      v_id := (v_row->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;
    IF NOT (v_id = ANY (v_keep)) THEN CONTINUE; END IF;

    UPDATE public.ticket_tiers tt
       SET name           = v_row->>'name',
           description    = NULLIF(v_row->>'description', ''),
           tier_type      = (v_row->>'tier_type')::public.ticket_tier_type,
           access_mode    = (v_row->>'access_mode')::public.tier_access_mode,
           price          = (v_row->>'price')::integer,
           currency       = COALESCE(v_row->>'currency', tt.currency),
           total_capacity = (v_row->>'total_capacity')::integer,
           sale_start     = NULLIF(v_row->>'sale_start', '')::timestamptz,
           sale_end       = NULLIF(v_row->>'sale_end', '')::timestamptz,
           min_per_order  = (v_row->>'min_per_order')::integer,
           max_per_order  = (v_row->>'max_per_order')::integer,
           sort_order     = (v_row->>'sort_order')::integer
     WHERE tt.id = v_id
       AND tt.event_id = p_event_id;

    v_updated := v_updated + 1;
  END LOOP;

  -- ---------------------------------------------------------- what is new
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_tiers) LOOP
    IF COALESCE(v_row->>'id', '') <> '' THEN
      BEGIN
        IF (v_row->>'id')::uuid = ANY (v_keep) THEN CONTINUE; END IF;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END IF;

    INSERT INTO public.ticket_tiers
      (event_id, name, description, tier_type, access_mode, price, currency,
       total_capacity, sale_start, sale_end, min_per_order, max_per_order, sort_order)
    VALUES
      (p_event_id,
       v_row->>'name',
       NULLIF(v_row->>'description', ''),
       (v_row->>'tier_type')::public.ticket_tier_type,
       (v_row->>'access_mode')::public.tier_access_mode,
       (v_row->>'price')::integer,
       COALESCE(v_row->>'currency', 'AUD'),
       (v_row->>'total_capacity')::integer,
       NULLIF(v_row->>'sale_start', '')::timestamptz,
       NULLIF(v_row->>'sale_end', '')::timestamptz,
       (v_row->>'min_per_order')::integer,
       (v_row->>'max_per_order')::integer,
       (v_row->>'sort_order')::integer);

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'removed', v_removed,
    'updated', v_updated,
    'created', v_created
  );
END;
$$;

COMMENT ON FUNCTION public.save_event_ticket_tiers(uuid, jsonb) IS
  'Reconciles an event''s ticket types in one transaction: what stayed keeps its id, what is new is inserted, what was removed is deleted only when nothing depends on it. Replaces the delete-everything-and-re-insert that made a sold event uneditable.';

-- The action checks the caller's authority itself (assertCallerMayActForOrganisation)
-- and then calls this through the service role, exactly as save_dynamic_pricing does.
REVOKE ALL ON FUNCTION public.save_event_ticket_tiers(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_ticket_tiers(uuid, jsonb) TO service_role;
