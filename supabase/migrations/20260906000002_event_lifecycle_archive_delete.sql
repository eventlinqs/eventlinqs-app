-- ============================================================================
-- THE EVENT LIFECYCLE: ARCHIVE AND DELETE, ENFORCED IN THE DATABASE.
-- Close-out C13, 6 September 2026. Part 2 of 2 (part 1 added the enum value).
-- Authority: docs/EVENT-LIFECYCLE.md.
--
-- WHAT THE FOUNDER FOUND ON PRODUCTION. The organiser events list offered
-- Edit, View, Launch Kit, Duplicate, Pause and Cancel. No delete, no archive.
-- Once cancelled an event kept only Edit, View and Duplicate, for ever.
--
-- WHAT THIS FILE DOES, in order:
--
--   1. events.archived_at, archived_from_status, archived_by, and a CHECK that
--      status = 'archived' exactly when archived_at is set. Restore is exact
--      because the status the event came from is recorded.
--   2. event_tombstones: the slug of every deleted event, so its URL answers
--      410 Gone rather than 404. anon may read slug and deleted_at only.
--   3. events.parent_event_id was the one foreign key onto events with NO
--      ACTION. It becomes SET NULL, so a series parent can be deleted without
--      a raw Postgres error and a child never points at a row that is gone.
--   4. event_money_record_counts(): the ONE count of the records that make an
--      event undeletable (orders, tickets, paid squad members, discount
--      redemptions, refund requests, refunds). The trigger and the interface
--      both read it, so the button and the refusal cannot disagree.
--   5. refuse_event_delete_with_money(): BEFORE DELETE on events. Raises when
--      any count is non-zero. Triggers fire for every role, service_role and
--      the admin console included. There is no override; the interface hiding
--      a button is not enforcement (CLOSE-OUT C13.2).
--   6. record_event_tombstone(): BEFORE DELETE on events, writes the tombstone.
--      An AFTER INSERT trigger clears a tombstone whose slug a new event takes.
--   7. The delete policy: organisation OWNERS may delete their events in any
--      status (it was draft only). Whether the delete is allowed is the
--      trigger's decision, not the policy's.
--   8. create_reservation and create_seat_reservation refuse any event whose
--      status is not 'published'. NEITHER FUNCTION READ events.status BEFORE
--      THIS FILE: a paused or cancelled event could be reserved through the
--      server action while the page merely hid the panel. Archive must stop
--      sales in the database, so the gap closes here.
--   9. Two STABLE probes for the build guard and the proof script:
--      event_lifecycle_guards() answers whether every one of the above is in
--      place on the database this build runs against, and
--      event_referencing_tables() lists every foreign key onto events with its
--      delete rule, straight from pg_constraint, so the proof enumerates rather
--      than remembers.
--
-- DOWN: drop the two triggers and their functions, the two probes, the counts
-- function, the tombstone table, the three columns and the CHECK; restore the
-- draft-only delete policy; restore create_reservation from 20260704000005 and
-- create_seat_reservation from 20260705000002.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The archive columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_from_status public.event_status,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.events.archived_at IS
  'Set when the organiser or an admin archives the event. status = archived if and only if this is set.';
COMMENT ON COLUMN public.events.archived_from_status IS
  'The status the event held when it was archived. Restore returns it to exactly this status and nothing else.';
COMMENT ON COLUMN public.events.archived_by IS
  'The user who archived it. The audit_log row carries the same actor with ip and user agent.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'events_archived_pair_consistent' AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_archived_pair_consistent
      CHECK (
        (status = 'archived') = (archived_at IS NOT NULL)
        AND (status <> 'archived' OR archived_from_status IS NOT NULL)
        AND (archived_from_status IS DISTINCT FROM 'archived')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_archived_org
  ON public.events (organisation_id, archived_at DESC)
  WHERE status = 'archived';

-- ----------------------------------------------------------------------------
-- 2. The tombstones
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_tombstones (
  slug             TEXT PRIMARY KEY,
  event_id         UUID NOT NULL,
  organisation_id  UUID,
  title            TEXT NOT NULL,
  status_at_delete public.event_status NOT NULL,
  deleted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by       UUID
);

COMMENT ON TABLE public.event_tombstones IS
  'One row per deleted event, keyed by slug, so /events/[slug] answers 410 Gone. anon reads slug and deleted_at only.';

ALTER TABLE public.event_tombstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tombstones are readable" ON public.event_tombstones;
CREATE POLICY "Tombstones are readable"
  ON public.event_tombstones FOR SELECT
  USING (true);

-- Column privilege is the actual boundary: the policy admits the row, the
-- grant decides which columns a public caller may name. A deleted draft's title
-- is not public information and never was.
REVOKE ALL ON public.event_tombstones FROM anon, authenticated;
GRANT SELECT (slug, deleted_at) ON public.event_tombstones TO anon, authenticated;
GRANT ALL ON public.event_tombstones TO service_role;

-- ----------------------------------------------------------------------------
-- 3. The one NO ACTION foreign key onto events
-- ----------------------------------------------------------------------------
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_parent_event_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_parent_event_id_fkey
  FOREIGN KEY (parent_event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3b. A retired share link is a legal row. FOUND BY THE PROOF, not by reading.
--
-- 20260808000006 decided that a share link outlives its event: event_id goes
-- NULL on delete and retired_at is stamped, so the UNIQUE code can never be
-- reissued and a person opening an old flyer gets an honest "no longer listed".
-- One week later 20260815000001 added share_links_target_exactly_one, which
-- requires EXACTLY one of event_id and destination_url, and nothing tested the
-- two together. The result: deleting any event that had ever opened its Launch
-- Kit failed with a raw constraint error, because SET NULL produced a row with
-- neither. scripts/verify/event-lifecycle-proof.mjs hit it on its first run
-- against TEST (C:\dev\EVIDENCE\C13\db-proof-run-2.txt). The constraint now
-- admits the retired state and nothing else new.
-- ----------------------------------------------------------------------------
ALTER TABLE public.share_links DROP CONSTRAINT IF EXISTS share_links_target_exactly_one;
ALTER TABLE public.share_links
  ADD CONSTRAINT share_links_target_exactly_one
  CHECK (
    (event_id IS NOT NULL AND destination_url IS NULL)
    OR (event_id IS NULL AND destination_url IS NOT NULL)
    OR (event_id IS NULL AND destination_url IS NULL AND retired_at IS NOT NULL)
  );

-- ----------------------------------------------------------------------------
-- 4. The one count of the records that make an event undeletable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_money_record_counts(p_event_id UUID)
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
  v_orders INT;
  v_tickets INT;
  v_squad_paid INT;
  v_discount_uses INT;
  v_refund_requests INT;
  v_refunds INT;
BEGIN
  -- Who may ask. The trigger runs as the table owner with no JWT and passes;
  -- the service role passes; an organiser passes for their own organisation's
  -- events only. Anyone else learns nothing, not even that the event exists.
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
      RAISE EXCEPTION 'not allowed to read this event''s records' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_orders FROM public.orders o WHERE o.event_id = p_event_id;
  SELECT COUNT(*) INTO v_tickets FROM public.tickets t WHERE t.event_id = p_event_id;
  SELECT COUNT(*) INTO v_squad_paid
    FROM public.squad_members sm
    JOIN public.squads s ON s.id = sm.squad_id
   WHERE s.event_id = p_event_id AND (sm.paid_at IS NOT NULL OR sm.status = 'paid');
  SELECT COUNT(*) INTO v_discount_uses
    FROM public.discount_code_usages u
    JOIN public.discount_codes d ON d.id = u.discount_code_id
   WHERE d.event_id = p_event_id;
  SELECT COUNT(*) INTO v_refund_requests FROM public.refund_requests r WHERE r.event_id = p_event_id;
  SELECT COUNT(*) INTO v_refunds
    FROM public.refunds f
    JOIN public.orders o ON o.id = f.order_id
   WHERE o.event_id = p_event_id;

  RETURN jsonb_build_object(
    'orders', v_orders,
    'tickets', v_tickets,
    'squad_members_paid', v_squad_paid,
    'discount_code_usages', v_discount_uses,
    'refund_requests', v_refund_requests,
    'refunds', v_refunds,
    'total', v_orders + v_tickets + v_squad_paid + v_discount_uses + v_refund_requests + v_refunds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.event_money_record_counts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_money_record_counts(UUID) TO authenticated, service_role;

-- The same count for a list of events in one round trip, so the organiser's
-- events list can decide per row whether to offer Delete without one call per
-- row. It LOOPS THE SINGLE FUNCTION rather than restating the rule, so there is
-- still exactly one definition of what a money record is, and the per-event
-- authorisation above applies to every id in the array. Capped so a caller
-- cannot hand it ten thousand ids.
CREATE OR REPLACE FUNCTION public.event_money_record_counts_many(p_event_ids UUID[])
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
    v_out := v_out || jsonb_build_object(v_id::text, public.event_money_record_counts(v_id));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.event_money_record_counts_many(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_money_record_counts_many(UUID[]) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. The refusal. BEFORE DELETE, every role, no override.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refuse_event_delete_with_money()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_counts JSONB;
BEGIN
  v_counts := public.event_money_record_counts(OLD.id);
  IF (v_counts->>'total')::INT > 0 THEN
    RAISE EXCEPTION 'event has money records and cannot be deleted: % orders, % tickets, % paid squad members, % discount redemptions, % refund requests, % refunds. Archive it instead.',
      v_counts->>'orders', v_counts->>'tickets', v_counts->>'squad_members_paid',
      v_counts->>'discount_code_usages', v_counts->>'refund_requests', v_counts->>'refunds'
      USING ERRCODE = 'P0001', HINT = 'EVENT_HAS_MONEY_RECORDS';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS events_refuse_delete_with_money ON public.events;
CREATE TRIGGER events_refuse_delete_with_money
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.refuse_event_delete_with_money();

-- ----------------------------------------------------------------------------
-- 6. The tombstone, written in the same transaction as the delete
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_event_tombstone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.slug IS NOT NULL THEN
    INSERT INTO public.event_tombstones (slug, event_id, organisation_id, title, status_at_delete, deleted_at, deleted_by)
    VALUES (OLD.slug, OLD.id, OLD.organisation_id, OLD.title, OLD.status, NOW(), auth.uid())
    ON CONFLICT (slug) DO UPDATE
      SET event_id = EXCLUDED.event_id,
          organisation_id = EXCLUDED.organisation_id,
          title = EXCLUDED.title,
          status_at_delete = EXCLUDED.status_at_delete,
          deleted_at = EXCLUDED.deleted_at,
          deleted_by = EXCLUDED.deleted_by;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS events_record_tombstone ON public.events;
CREATE TRIGGER events_record_tombstone
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.record_event_tombstone();

-- A slug that comes back to life is a live event, not a grave.
CREATE OR REPLACE FUNCTION public.clear_event_tombstone_for_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    DELETE FROM public.event_tombstones WHERE slug = NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_clear_tombstone_on_insert ON public.events;
CREATE TRIGGER events_clear_tombstone_on_insert
  AFTER INSERT OR UPDATE OF slug ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_event_tombstone_for_slug();

-- ----------------------------------------------------------------------------
-- 7. WHO may delete: the owner, any status. WHETHER: the trigger.
-- ----------------------------------------------------------------------------
-- THROUGH THE HELPER, NOT A SUBQUERY ON organisations. The draft-only policy
-- this replaces read `SELECT id FROM organisations WHERE owner_id = auth.uid()`
-- inline, and since the column lockdown of 8 August 2026 `authenticated` holds
-- no SELECT on owner_id, so Postgres answered every organiser's delete with
-- 42501 "permission denied for table organisations". Nobody had driven a draft
-- delete since; the C13 drive found it on its first delete
-- (C:\dev\EVIDENCE\C13\drive-mobile-390.txt, step 51). The UPDATE policy was
-- moved onto el_owned_organisation_ids() by 20260819000001 for exactly this
-- reason; the DELETE policy joins it here.
DROP POLICY IF EXISTS "Org owners can delete draft events" ON public.events;
DROP POLICY IF EXISTS "Org owners can delete their events" ON public.events;
CREATE POLICY "Org owners can delete their events"
  ON public.events FOR DELETE
  USING (organisation_id IN (SELECT public.el_owned_organisation_ids()));

-- ----------------------------------------------------------------------------
-- 8. Sales stop in the database. create_reservation, the effective definition
--    from 20260704000005 verbatim, plus the status gate at the top.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_reservation(
  p_event_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]',
  p_ttl_minutes INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
  v_available INT;
  v_tier_record RECORD;
  v_event_status public.event_status;
BEGIN
  -- Validate at least one item
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items in reservation');
  END IF;

  -- THE STATUS GATE (C13). Only a published event sells. Paused, postponed,
  -- cancelled, completed, archived, draft and scheduled all refuse here, before
  -- any inventory is touched, whatever the caller's page showed.
  SELECT e.status INTO v_event_status FROM public.events e WHERE e.id = p_event_id;
  IF v_event_status IS DISTINCT FROM 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event is not on sale.');
  END IF;

  -- Cancel any existing active reservations for this user/session on this event
  UPDATE public.reservations
  SET status = 'cancelled'
  WHERE event_id = p_event_id
    AND status = 'active'
    AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR (p_session_id IS NOT NULL AND session_id = p_session_id)
    );

  -- Release reserved counts from cancelled reservations
  -- (handled by the trigger below)

  -- Check availability for each ticket tier item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Only process ticket items (not addons)
    IF v_item ? 'ticket_tier_id' THEN
      v_tier_id := (v_item->>'ticket_tier_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;

      -- Lock the tier row, read availability AND the sale window
      SELECT
        tt.total_capacity - tt.sold_count - tt.reserved_count AS available,
        tt.sale_start,
        tt.sale_end
      INTO v_tier_record
      FROM public.ticket_tiers tt
      WHERE tt.id = v_tier_id
        AND tt.is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket tier not found or inactive');
      END IF;

      -- Sale-window gate: reject before any inventory mutation
      IF v_tier_record.sale_start IS NOT NULL AND NOW() < v_tier_record.sale_start THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Tickets for this event are not on sale yet.'
        );
      END IF;

      IF v_tier_record.sale_end IS NOT NULL AND NOW() > v_tier_record.sale_end THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Ticket sales for this event have closed.'
        );
      END IF;

      v_available := v_tier_record.available;

      IF v_available < v_quantity THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Only %s tickets available for this tier', v_available)
        );
      END IF;

      -- Increment reserved count
      UPDATE public.ticket_tiers
      SET reserved_count = reserved_count + v_quantity
      WHERE id = v_tier_id;
    END IF;
  END LOOP;

  -- Create the reservation
  INSERT INTO public.reservations (
    event_id, user_id, session_id, items, status, expires_at
  ) VALUES (
    p_event_id,
    p_user_id,
    p_session_id,
    p_items,
    'active',
    NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'expires_at', (NOW() + (p_ttl_minutes || ' minutes')::INTERVAL)
  );
END;
$$;

-- create_seat_reservation, the effective definition from 20260705000002
-- verbatim, plus the same status gate.
DROP FUNCTION IF EXISTS public.create_seat_reservation(UUID, UUID, UUID[], INT, TEXT);

CREATE FUNCTION public.create_seat_reservation(
  p_event_id UUID,
  p_user_id UUID,
  p_seat_ids UUID[],
  p_ttl_minutes INT DEFAULT 10,
  p_session_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_seat RECORD;
  v_event_status public.event_status;
BEGIN
  IF array_length(p_seat_ids, 1) IS NULL OR array_length(p_seat_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No seats selected');
  END IF;

  -- THE STATUS GATE (C13), the same sentence as create_reservation.
  SELECT e.status INTO v_event_status FROM public.events e WHERE e.id = p_event_id;
  IF v_event_status IS DISTINCT FROM 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event is not on sale.');
  END IF;

  -- The reservations_has_owner CHECK enforces this too; failing early gives
  -- the buyer a clean message instead of a constraint error.
  IF p_user_id IS NULL AND p_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in or enable cookies to hold seats');
  END IF;

  -- Lock all seat rows and verify they're available
  FOR v_seat IN
    SELECT s.id, s.status
    FROM public.seats s
    WHERE s.id = ANY(p_seat_ids)
      AND s.event_id = p_event_id
    FOR UPDATE
  LOOP
    IF v_seat.status != 'available' THEN
      RETURN jsonb_build_object('success', false, 'error', 'One or more seats are no longer available');
    END IF;
  END LOOP;

  -- Verify we locked all requested seats
  IF (SELECT COUNT(*) FROM public.seats WHERE id = ANY(p_seat_ids) AND event_id = p_event_id) != array_length(p_seat_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Some seats not found for this event');
  END IF;

  INSERT INTO public.reservations (
    event_id, user_id, session_id, items, status, expires_at
  ) VALUES (
    p_event_id,
    p_user_id,
    p_session_id,
    jsonb_build_object('seat_ids', to_jsonb(p_seat_ids)),
    'active',
    NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;

  UPDATE public.seats
  SET
    status = 'reserved',
    reservation_id = v_reservation_id,
    updated_at = NOW()
  WHERE id = ANY(p_seat_ids)
    AND event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'expires_at', (NOW() + (p_ttl_minutes || ' minutes')::INTERVAL),
    'seat_count', array_length(p_seat_ids, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_seat_reservation(UUID, UUID, UUID[], INT, TEXT) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. The probes the build guard and the proof script ask
-- ----------------------------------------------------------------------------

-- Every foreign key onto events with its delete rule, from the catalogue.
CREATE OR REPLACE FUNCTION public.event_referencing_tables()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'constraint', c.conname,
    'table', r.relname,
    'column', (SELECT string_agg(a.attname, ',') FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k),
    'on_delete', CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END
  ) ORDER BY r.relname, c.conname), '[]'::jsonb)
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE c.contype = 'f' AND n.nspname = 'public' AND c.confrelid = 'public.events'::regclass
$$;

REVOKE ALL ON FUNCTION public.event_referencing_tables() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_referencing_tables() TO authenticated, service_role;

-- Is every part of the lifecycle enforcement in place on THIS database?
-- One jsonb of named booleans, so a failure names what is missing.
CREATE OR REPLACE FUNCTION public.event_lifecycle_guards()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'archived_in_enum', EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'event_status' AND e.enumlabel = 'archived'
    ),
    'archived_columns', (
      SELECT COUNT(*) = 3 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'events'
         AND column_name IN ('archived_at', 'archived_from_status', 'archived_by')
    ),
    'archived_pair_check', EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'events_archived_pair_consistent' AND conrelid = 'public.events'::regclass
    ),
    'tombstones_table', EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'event_tombstones' AND c.relkind = 'r'
    ),
    'tombstones_anon_columns_only', (
      SELECT COALESCE(array_agg(column_name::text ORDER BY column_name), '{}') = ARRAY['deleted_at', 'slug']
        FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND table_name = 'event_tombstones'
         AND grantee = 'anon' AND privilege_type = 'SELECT'
    ),
    'delete_refusal_trigger', EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'events_refuse_delete_with_money' AND tgrelid = 'public.events'::regclass AND NOT tgisinternal
    ),
    'tombstone_trigger', EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'events_record_tombstone' AND tgrelid = 'public.events'::regclass AND NOT tgisinternal
    ),
    'parent_fk_set_null', EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'events_parent_event_id_fkey' AND confdeltype = 'n'
    ),
    -- A share link may survive its event with both targets null once retired;
    -- without this the SET NULL on delete violates the constraint and no event
    -- that ever opened its Launch Kit can be deleted (section 3b).
    'share_links_retire_allowed', EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'share_links_target_exactly_one' AND conrelid = 'public.share_links'::regclass
         AND pg_get_constraintdef(oid) ILIKE '%retired_at%'
    ),
    'no_action_fks', (
      SELECT COALESCE(jsonb_agg(c.conname ORDER BY c.conname), '[]'::jsonb)
        FROM pg_constraint c
       WHERE c.contype = 'f' AND c.confrelid = 'public.events'::regclass AND c.confdeltype = 'a'
    ),
    'reservation_status_gate', (
      SELECT COUNT(*) = 2 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('create_reservation', 'create_seat_reservation')
         AND pg_get_functiondef(p.oid) LIKE '%This event is not on sale.%'
    ),
    'owner_delete_policy', EXISTS (
      SELECT 1 FROM pg_policy WHERE polname = 'Org owners can delete their events' AND polrelid = 'public.events'::regclass AND polcmd = 'd'
    ),
    'draft_only_delete_policy_gone', NOT EXISTS (
      SELECT 1 FROM pg_policy WHERE polname = 'Org owners can delete draft events' AND polrelid = 'public.events'::regclass
    ),
    -- Every SELECT policy on events that the public role can use is gated on
    -- status = 'published' or on the caller's organisation. An archived row is
    -- therefore invisible to an anonymous read by every path that exists.
    -- pg_get_expr renders the literal as 'published'::event_status, and the
    -- membership policies go through el_owned_organisation_ids() rather than a
    -- bare auth.uid(), so both spellings are accepted (read off TEST on
    -- 6 September 2026, C:\dev\EVIDENCE\C13\probe-policies.sql).
    'anon_select_policies_gated', NOT EXISTS (
      SELECT 1 FROM pg_policy
       WHERE polrelid = 'public.events'::regclass AND polcmd IN ('r', '*')
         AND (polroles = '{0}'::oid[] OR 'anon'::regrole::oid = ANY (polroles))
         AND pg_get_expr(polqual, polrelid) !~ 'status = ''published''(::[a-z_.]+)?'
         AND pg_get_expr(polqual, polrelid) !~ 'organisation_id|auth\.uid\(\)'
    ),
    'door_reads_no_event_status', (
      SELECT COUNT(*) = 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('scan_ticket', 'door_validation_set', 'sync_offline_scans')
         AND pg_get_functiondef(p.oid) ~ 'e\.status|events\.status'
    )
  )
$$;

REVOKE ALL ON FUNCTION public.event_lifecycle_guards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_lifecycle_guards() TO authenticated, service_role;
