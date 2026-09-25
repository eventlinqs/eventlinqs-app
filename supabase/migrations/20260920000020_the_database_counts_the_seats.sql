-- ============================================================================
-- THE DATABASE COUNTS THE SEATS, BECAUSE A TALLY OF ROWS IS ONLY EVER AS LONG
-- AS THE ROWS THAT ARRIVED.
--
-- WHY THIS FUNCTION EXISTS, measured rather than argued.
--
-- The organiser's My Events list prints "{sold} / {capacity}" for every
-- reserved-seating event, and the comment above that code says the number must
-- come from the seats table because ticket_tiers.sold_count is not trusted for
-- reserved seating. It was produced like this:
--
--     .from('seats').select('event_id')
--       .in('event_id', reservedEventIds)
--       .eq('status', 'sold')
--     for (const row of soldSeats ?? []) map[row.event_id] += 1
--
-- One row came back per sold seat and the rows were counted in JavaScript.
-- Supabase caps a single response at 1,000 rows and says nothing about it:
-- HTTP 200, error null, a full-looking array
-- (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
--
-- The cap applies to THE RESPONSE, not to each event, so the ceiling was
-- shared across every reserved-seating event the organiser had. Two sold-out
-- 800-seat shows reported 1,000 sold between them instead of 1,600. There was
-- no ORDER BY, so which 1,000 arrived was arbitrary and the shortfall moved
-- between page loads with nothing on screen to explain it. And the error was
-- discarded, so a read that FAILED rendered as nought sold for every event.
--
-- A COUNT THE DATABASE PERFORMS CANNOT BE TRUNCATED. That is the whole of the
-- argument for doing it here instead of there. GROUP BY is not reachable
-- through PostgREST, so it is reachable through a function or not at all.
--
-- WHY THE WHOLE STATUS BREAKDOWN AND NOT JUST 'sold'. Three organiser surfaces
-- ask a version of this question: the events list wants sold, the chart list
-- wants the protected inventory (reserved, sold and held together), and the
-- launch kit wants how many seats are still open. Returning the breakdown once
-- means there is one definition of each of those words, which is the same
-- reason event_money_record_counts_many loops the single function rather than
-- restating the rule. Every seat_status label is returned, including any added
-- later, so a new status cannot quietly fall out of the total.
--
-- THE AUTHORISATION IS COPIED, DELIBERATELY, from
-- public.event_money_record_counts (migration 20260906000002): the service role
-- passes, an organiser passes for their own organisation's events, an
-- organisation member holding owner, admin or manager passes, an admin user
-- passes, and anybody else learns nothing, not even that the event exists.
-- Copying it rather than inventing one keeps a single answer to "who may read
-- this event's numbers" across both functions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.event_seat_status_counts(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := auth.role();
  v_uid  UUID := auth.uid();
  v_org  UUID;
  v_out  JSONB := '{}'::jsonb;
  v_label TEXT;
  v_total BIGINT := 0;
  v_n     BIGINT;
BEGIN
  -- Who may ask. Identical to event_money_record_counts, on purpose.
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    SELECT e.organisation_id INTO v_org FROM public.events e WHERE e.id = p_event_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_uid IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.organisations o WHERE o.id = v_org AND o.owner_id = v_uid
      UNION ALL
      SELECT 1 FROM public.organisation_members m
       WHERE m.organisation_id = v_org AND m.user_id = v_uid AND m.role IN ('owner', 'admin', 'manager')
      UNION ALL
      SELECT 1 FROM public.admin_users a WHERE a.id = v_uid AND a.disabled_at IS NULL
    ) THEN
      RAISE EXCEPTION 'not allowed to read this event''s seats' USING ERRCODE = '42501';
    END IF;
  END IF;

  /*
   * EVERY LABEL THE ENUM CARRIES, INCLUDING THE ONES WITH NO ROWS. A caller
   * reading counts.blocked must get 0 rather than undefined, and a status added
   * to seat_status later must appear here without anybody remembering to edit
   * this function, or the total stops equalling the sum of its parts.
   */
  FOR v_label IN
    SELECT e.enumlabel::text
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'seat_status'
     ORDER BY e.enumsortorder
  LOOP
    SELECT COUNT(*) INTO v_n
      FROM public.seats s
     WHERE s.event_id = p_event_id
       AND s.status::text = v_label;
    v_out := v_out || jsonb_build_object(v_label, v_n);
    v_total := v_total + v_n;
  END LOOP;

  RETURN v_out || jsonb_build_object('total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.event_seat_status_counts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_seat_status_counts(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.event_seat_status_counts(UUID) IS
  'Seats for one event counted per seat_status by the database, so no response row ceiling can shorten the answer. Authorisation matches event_money_record_counts.';

-- ----------------------------------------------------------------------------
-- The same counts for a list of events in ONE round trip, so the organiser's
-- events list does not make one call per row. It LOOPS THE SINGLE FUNCTION
-- rather than restating the rule, so there is still exactly one definition of
-- what each status count means, and the per-event authorisation above applies
-- to every id in the array.
--
-- Capped at 500 ids for the same reason the money-records version is: a caller
-- must not be able to hand it ten thousand. The cap RAISES rather than
-- truncating, because this whole function exists because something truncated.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_seat_status_counts_many(p_event_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_out JSONB := '{}'::jsonb;
  v_id UUID;
BEGIN
  IF p_event_ids IS NULL THEN
    RETURN v_out;
  END IF;
  IF array_length(p_event_ids, 1) > 500 THEN
    RAISE EXCEPTION 'too many events in one call (max 500)' USING ERRCODE = '22023';
  END IF;
  FOREACH v_id IN ARRAY p_event_ids LOOP
    v_out := v_out || jsonb_build_object(v_id::text, public.event_seat_status_counts(v_id));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.event_seat_status_counts_many(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_seat_status_counts_many(UUID[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.event_seat_status_counts_many(UUID[]) IS
  'event_seat_status_counts for up to 500 events in one round trip, keyed by event id.';
