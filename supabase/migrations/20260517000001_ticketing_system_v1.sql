-- ============================================================
-- Ticketing System V1 + guest-reservation root-cause fix
-- Run by founder: supabase db push --linked  (then: npm run db:types)
-- Design: docs/architecture/ticketing-system-v1/DESIGN.md (founder-approved)
-- ============================================================
-- Contents:
--   0. ROOT-CAUSE FIX: grant anon EXECUTE on create_reservation so
--      guest checkout (free + paid) can create reservations at all.
--   1. tickets table + indexes + RLS
--   2. ticket_scans append-only audit table + RLS
--   3. issue_tickets_for_order(p_order_id) issuance function
--   4. orders AFTER-UPDATE trigger -> issuance (single chokepoint,
--      atomic with confirm, idempotent; avoids rewriting the audited
--      money-path confirm_order body - implementation refinement of
--      the approved "issue inside confirm_order" design).
-- All GA-style for V1 (Q4). No seat binding. AU English, no em-dashes.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. GUEST RESERVATION ROOT-CAUSE FIX
-- create_reservation is SECURITY DEFINER and explicitly designed for
-- guests (reservations.session_id, reservations_has_owner CHECK allows
-- session-only rows) but was granted EXECUTE only to authenticated +
-- service_role, so the anon SSR client (every guest) hit
-- "permission denied for function create_reservation" and no guest
-- could ever reserve - breaking guest free RSVP and guest paid checkout.
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_reservation TO anon;

-- ------------------------------------------------------------
-- 1. tickets
-- One row per admittable unit (an order_items row of quantity N
-- expands to N tickets, idx_in_item 0..N-1).
-- ------------------------------------------------------------
CREATE TABLE public.tickets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id       UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_tier_id      UUID REFERENCES public.ticket_tiers(id) ON DELETE SET NULL,
  -- Seated-event binding (Q4 reversed: required for V1). Nullable:
  -- NULL = general admission, set = a specific seat from the existing
  -- M4 seats table. The column + FK are pure foundation; seat
  -- ASSIGNMENT logic (picker, editor, seated scan, seat on ticket
  -- display) is intentionally NOT in this migration - it lands once
  -- the seated design is locked.
  seat_id             UUID REFERENCES public.seats(id) ON DELETE SET NULL,
  idx_in_item         INT  NOT NULL,                       -- 0..quantity-1
  ticket_code         TEXT NOT NULL UNIQUE,                -- EL-XXXX-XXXX
  secret              UUID NOT NULL DEFAULT uuid_generate_v4(), -- bearer credential, QR encodes code+secret
  holder_name         TEXT,
  holder_email        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'valid'
                       CHECK (status IN ('valid','scanned','refunded','void','transferred')),
  scan_count          INT  NOT NULL DEFAULT 0,
  first_scanned_at    TIMESTAMPTZ,
  last_scanned_at     TIMESTAMPTZ,
  scanned_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transferred_to_email TEXT,
  refunded_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- duplicate-proof key: webhook retry / re-call cannot create dup tickets
  CONSTRAINT tickets_unit_unique UNIQUE (order_item_id, idx_in_item)
);

CREATE INDEX idx_tickets_order        ON public.tickets(order_id);
CREATE INDEX idx_tickets_event_status ON public.tickets(event_id, status);
CREATE INDEX idx_tickets_holder_email ON public.tickets(holder_email);
CREATE INDEX idx_tickets_secret       ON public.tickets(secret);
CREATE INDEX idx_tickets_seat         ON public.tickets(seat_id) WHERE seat_id IS NOT NULL;

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Holder reads own tickets (mirrors order_items "own" policy shape)
CREATE POLICY "Holders can view their own tickets"
  ON public.tickets FOR SELECT
  USING (
    order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
  );

-- Org owner/members can view + scan tickets for their events
CREATE POLICY "Org members can view event tickets"
  ON public.tickets FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR o.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')
      )
    )
  );

CREATE POLICY "Org members can update event tickets"
  ON public.tickets FOR UPDATE
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR o.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')
      )
    )
  );

CREATE POLICY "Service role manages tickets"
  ON public.tickets FOR ALL
  USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- 2. ticket_scans  (append-only audit; no UPDATE/DELETE policies)
-- ------------------------------------------------------------
CREATE TABLE public.ticket_scans (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  scanned_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result      TEXT NOT NULL
               CHECK (result IN ('admitted','already_scanned','invalid','wrong_event','refunded','void')),
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_info JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_ticket_scans_ticket ON public.ticket_scans(ticket_id);
CREATE INDEX idx_ticket_scans_event  ON public.ticket_scans(event_id, scanned_at);

ALTER TABLE public.ticket_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view event scans"
  ON public.ticket_scans FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organisations o ON e.organisation_id = o.id
      WHERE o.owner_id = auth.uid()
    )
    OR event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organisation_members om ON e.organisation_id = om.organisation_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner','admin','manager')
    )
  );

CREATE POLICY "Service role manages scans"
  ON public.ticket_scans FOR ALL
  USING (auth.role() = 'service_role');
-- Intentionally no UPDATE / DELETE policies for non-service roles:
-- ticket_scans is append-only.

-- ------------------------------------------------------------
-- 3. issue_tickets_for_order(p_order_id)
-- Expands each ticket order_item into `quantity` ticket rows.
-- Idempotent via ON CONFLICT (order_item_id, idx_in_item) DO NOTHING.
-- ticket_code = EL-XXXX-XXXX (Crockford-ish, no I/O/0/1), collision-retried.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gen_ticket_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 chars, no I/L/O/0/1
  code TEXT;
  i INT;
BEGIN
  code := 'EL-';
  FOR i IN 1..8 LOOP
    IF i = 5 THEN code := code || '-'; END IF;
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN code; -- e.g. EL-7G4K-2PMQ
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_tickets_for_order(p_order_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order   RECORD;
  v_item    RECORD;
  v_idx     INT;
  v_code    TEXT;
  v_attempt INT;
  v_holder_name  TEXT;
  v_holder_email TEXT;
  v_issued  INT := 0;
BEGIN
  SELECT o.*, COALESCE(p.email, o.guest_email) AS buyer_email,
         COALESCE(p.full_name, o.guest_name)   AS buyer_name
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT * FROM public.order_items
    WHERE order_id = p_order_id AND item_type = 'ticket'
  LOOP
    FOR v_idx IN 0 .. (v_item.quantity - 1) LOOP
      v_holder_email := COALESCE(v_item.attendee_email, v_order.buyer_email);
      v_holder_name  := COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', v_item.attendee_first_name, v_item.attendee_last_name)), ''),
        v_order.buyer_name
      );

      -- ticket_code uniqueness: retry on collision, max 5
      v_attempt := 0;
      LOOP
        v_attempt := v_attempt + 1;
        v_code := public.gen_ticket_code();
        BEGIN
          INSERT INTO public.tickets (
            order_id, order_item_id, event_id, ticket_tier_id,
            idx_in_item, ticket_code, holder_name, holder_email
          ) VALUES (
            p_order_id, v_item.id, v_order.event_id, v_item.ticket_tier_id,
            v_idx, v_code, v_holder_name, COALESCE(v_holder_email, '')
          )
          ON CONFLICT (order_item_id, idx_in_item) DO NOTHING;
          -- If the unit already existed (idempotent re-run) nothing is
          -- inserted and we stop retrying this unit.
          IF FOUND THEN
            v_issued := v_issued + 1;
          END IF;
          EXIT; -- success or already-exists: leave the retry loop
        EXCEPTION WHEN unique_violation THEN
          -- ticket_code collision: retry with a new code
          IF v_attempt >= 5 THEN
            RAISE EXCEPTION 'ticket_code generation exhausted for order %', p_order_id;
          END IF;
        END;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_issued;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_tickets_for_order TO service_role;

-- ------------------------------------------------------------
-- 4. Issuance trigger on orders
-- Fires exactly when an order transitions INTO 'confirmed'. Because
-- confirm_order early-returns (no UPDATE) when already confirmed, a
-- duplicate Stripe webhook never re-fires this; ON CONFLICT is the
-- belt-and-braces. Atomic: runs in confirm_order's transaction, so a
-- failure rolls back the confirmation and Stripe retries (also resolves
-- the "money captured but state inconsistent" webhook gap).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_issue_tickets_on_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'confirmed'
     AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    PERFORM public.issue_tickets_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_tickets_on_confirm ON public.orders;
CREATE TRIGGER trg_issue_tickets_on_confirm
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_issue_tickets_on_confirm();

COMMIT;

-- ============================================================
-- POST-RUN (founder):
--   1) supabase db push --linked    (applies this migration)
--   2) npm run db:types             (regenerates src/types/database.ts
--                                    - [SHARED]/Session-2; required
--                                    before CC can build steps 3-7)
-- Then notify CC to continue Phase 2 (QR endpoint, /t/[code], /tickets,
-- scan flow, email, refund handling).
-- ============================================================
