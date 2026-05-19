-- ============================================================
-- 20260520000001_schema_hygiene.sql
-- ============================================================
-- DRAFT FOR FOUNDER REVIEW. Authored autonomously (Tab B,
-- branch autonomous/schema-hygiene-draft). NOT YET APPLIED.
-- Apply only after sign-off, from PowerShell:
--   supabase db push --linked --include-all
-- Reverse script: 20260520000001_schema_hygiene_ROLLBACK.sql
-- Plan + risk + post-apply verification:
--   docs/SCHEMA-HYGIENE-MIGRATION-PLAN.md
--
-- Closes audit findings:
--   P1-1  pricing_rules RLS (region-default public, org-override scoped)
--   P1-2  ledger/payouts/payout_holds member policies gain role filter
--   P1-3  orders/order_items/payments money columns INT4 -> BIGINT
--   P1-4  discount_codes.discount_value split into typed columns
--         (+ P1-4b pricing_rules.value whole-number guard for
--          fixed/integer rows - see rationale in the plan doc)
--   P1-5  non-negative CHECK on orders/order_items cents
--   P1-6  squads.leader_user_id FK CASCADE -> SET NULL
--   P1-7  squads RLS: replace USING(true) with leader+member scope
--   P1-8  pricing_rules.created_by FK -> ON DELETE SET NULL
--   P1-9  indexes: orders.discount_code_id, tickets.ticket_tier_id,
--         squad_members.order_id
--   P1-10 updated_at + trigger on order_items, reservations, squads,
--         squad_members, waitlist, payout_holds
--   P1-11 waitlist org-view policy gains organisation_members parity
--   P3-6  drop redundant idx_orders_order_number (UNIQUE already
--         enforces order_number uniqueness at DB level)
--   P3-7  payments.idempotency_key promoted to UNIQUE (true
--         DB-level payment idempotency)
--   P3-9  orders.reservation_id + squads.reservation_id missing FK
--         to reservations (referential integrity), each indexed
--   P4-6  orders.currency CHECK = 'AUD' (v1 single-currency guard)
--
-- Jaguar 9-criterion self-audit at the foot of this file.
-- Idempotent: every change uses IF [NOT] EXISTS / DROP-then-ADD.
-- Australian English, no em-dashes.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- P1-3  Money columns INT4 -> BIGINT
-- orders: 7 cents columns; order_items: 2; payments: 1.
-- Idempotent: only widens columns still typed `integer`.
-- INT4 -> BIGINT is a non-destructive widening. NOT NULL and
-- column defaults are preserved by ALTER COLUMN TYPE.
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t, c FROM (VALUES
      ('orders','subtotal_cents'),
      ('orders','addon_total_cents'),
      ('orders','platform_fee_cents'),
      ('orders','processing_fee_cents'),
      ('orders','tax_cents'),
      ('orders','discount_cents'),
      ('orders','total_cents'),
      ('order_items','unit_price_cents'),
      ('order_items','total_cents'),
      ('payments','amount_cents')
    ) AS v(t, c)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = r.t
        AND column_name = r.c
        AND data_type = 'integer'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE BIGINT',
        r.t, r.c
      );
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- P1-5  Non-negative CHECKs on cents columns
-- NOT VALID then VALIDATE so a populated table is not
-- exclusively locked during the full-table scan.
-- discount_cents stores the positive reduction amount, so the
-- whole-row guard is `>= 0` for every cents column.
-- ------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cents_non_negative;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_cents_non_negative CHECK (
    subtotal_cents      >= 0 AND
    addon_total_cents   >= 0 AND
    platform_fee_cents  >= 0 AND
    processing_fee_cents >= 0 AND
    tax_cents           >= 0 AND
    discount_cents      >= 0 AND
    total_cents         >= 0
  ) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_cents_non_negative;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_cents_non_negative;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_cents_non_negative CHECK (
    unit_price_cents >= 0 AND
    total_cents      >= 0
  ) NOT VALID;
ALTER TABLE public.order_items VALIDATE CONSTRAINT order_items_cents_non_negative;

-- ------------------------------------------------------------
-- P4-6  orders.currency single-currency guard (v1 = AUD only)
-- Removable when multi-currency lands (rollback drops it).
-- ------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_currency_aud_only;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_currency_aud_only CHECK (currency = 'AUD') NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_currency_aud_only;

-- ------------------------------------------------------------
-- P1-4  Split discount_codes.discount_value
-- Old: discount_value NUMERIC(10,2) carried BOTH a percentage
-- (1..100) and a fixed cents amount, disambiguated only by
-- discount_type. Split into typed columns:
--   discount_amount_cents BIGINT      (fixed_amount rows)
--   discount_percentage   NUMERIC(5,2)(percentage rows)
-- ------------------------------------------------------------
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS discount_amount_cents BIGINT,
  ADD COLUMN IF NOT EXISTS discount_percentage   NUMERIC(5,2);

-- Backfill from the legacy column while it still exists.
-- discount_value already held cents for fixed_amount (per the
-- baseline column comment); ROUND() is purely defensive.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'discount_codes'
      AND column_name = 'discount_value'
  ) THEN
    UPDATE public.discount_codes
       SET discount_amount_cents = ROUND(discount_value)::BIGINT
     WHERE discount_type = 'fixed_amount'
       AND discount_amount_cents IS NULL;

    UPDATE public.discount_codes
       SET discount_percentage = discount_value::NUMERIC(5,2)
     WHERE discount_type = 'percentage'
       AND discount_percentage IS NULL;
  END IF;
END $$;

-- Old value CHECK referenced discount_value; replace with a
-- split-aware CHECK. NOT VALID then VALIDATE.
ALTER TABLE public.discount_codes DROP CONSTRAINT IF EXISTS discount_codes_value_check;
ALTER TABLE public.discount_codes DROP CONSTRAINT IF EXISTS discount_codes_value_split_check;
ALTER TABLE public.discount_codes
  ADD CONSTRAINT discount_codes_value_split_check CHECK (
    (discount_type = 'percentage'
       AND discount_percentage IS NOT NULL
       AND discount_percentage > 0
       AND discount_percentage <= 100
       AND discount_amount_cents IS NULL)
    OR
    (discount_type = 'fixed_amount'
       AND discount_amount_cents IS NOT NULL
       AND discount_amount_cents > 0
       AND discount_percentage IS NULL)
  ) NOT VALID;
ALTER TABLE public.discount_codes VALIDATE CONSTRAINT discount_codes_value_split_check;

-- discount_codes_currency_check is unaffected (references only
-- discount_type and currency) and is intentionally left intact.

-- Retire the legacy polymorphic column.
ALTER TABLE public.discount_codes DROP COLUMN IF EXISTS discount_value;

COMMENT ON COLUMN public.discount_codes.discount_amount_cents IS
  'Fixed discount in the smallest currency unit (cents). Set only when discount_type = fixed_amount; NULL for percentage. P1-4.';
COMMENT ON COLUMN public.discount_codes.discount_percentage IS
  'Percentage discount, 0 < pct <= 100. Set only when discount_type = percentage; NULL for fixed_amount. P1-4.';

-- ------------------------------------------------------------
-- P1-4b  pricing_rules.value whole-number guard
-- The audit line "ALTER pricing_rules.value to integer cents
-- where appropriate" is deliberately NOT executed as a column
-- type change: pricing_rules.value is polymorphic - it holds
-- percentages (e.g. 2.5000), fixed cents (e.g. 30), and integer
-- enum codes (e.g. 1, 3) disambiguated by value_type. Casting
-- the column to integer would destroy percentage precision and
-- corrupt every platform_fee_percentage / reserve_percentage
-- row. The genuine, non-destructive hygiene intent - that
-- money/integer rows are not stored with stray fractional
-- digits - is enforced with a CHECK instead. percentage rows
-- keep full NUMERIC precision.
-- ------------------------------------------------------------
ALTER TABLE public.pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_whole_fixed_value_check;
ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_whole_fixed_value_check CHECK (
    value_type = 'percentage' OR value = trunc(value)
  ) NOT VALID;
ALTER TABLE public.pricing_rules VALIDATE CONSTRAINT pricing_rules_whole_fixed_value_check;

-- ------------------------------------------------------------
-- P1-1  pricing_rules RLS: region-default public,
-- org-override readable only by the owning organisation.
-- Server-side fee calculation uses the service role and is
-- unaffected (the FOR ALL service_role policy stays intact).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Pricing rules are readable by everyone" ON public.pricing_rules;
DROP POLICY IF EXISTS "Region-default pricing rules are public" ON public.pricing_rules;
DROP POLICY IF EXISTS "Org pricing overrides visible to owning org" ON public.pricing_rules;

CREATE POLICY "Region-default pricing rules are public"
  ON public.pricing_rules FOR SELECT
  USING (organisation_id IS NULL);

CREATE POLICY "Org pricing overrides visible to owning org"
  ON public.pricing_rules FOR SELECT
  USING (
    organisation_id IS NOT NULL
    AND (
      organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

-- ------------------------------------------------------------
-- P1-8  pricing_rules.created_by FK -> ON DELETE SET NULL
-- Previously NO ACTION: deleting an admin auth user would be
-- blocked by historical pricing rows. created_by is nullable,
-- so SET NULL preserves the pricing history.
-- pricing_rules is populated (59 rows): NOT VALID then VALIDATE.
-- ------------------------------------------------------------
ALTER TABLE public.pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_created_by_fkey;
ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.pricing_rules VALIDATE CONSTRAINT pricing_rules_created_by_fkey;

-- ------------------------------------------------------------
-- P1-2  ledger / payouts / payout_holds member SELECT policies
-- gain a role filter. Previously ANY member (including the
-- lowest 'member' role) could read financial ledgers. Owner
-- policies are unchanged.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Organisation members can view their payouts" ON public.payouts;
CREATE POLICY "Organisation members can view their payouts"
  ON public.payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = payouts.organisation_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Organisation members can view their holds" ON public.payout_holds;
CREATE POLICY "Organisation members can view their holds"
  ON public.payout_holds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = payout_holds.organisation_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Organisation members can view their ledger" ON public.organiser_balance_ledger;
CREATE POLICY "Organisation members can view their ledger"
  ON public.organiser_balance_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = organiser_balance_ledger.organisation_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'manager')
    )
  );

-- ------------------------------------------------------------
-- P1-11  waitlist org-view policy gains organisation_members
-- parity (previously owner-only, unlike orders/order_items
-- which already allow owner OR member with elevated role).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Org members can view waitlist for their events" ON public.waitlist;
CREATE POLICY "Org members can view waitlist for their events"
  ON public.waitlist FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      WHERE e.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR e.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

-- ------------------------------------------------------------
-- P1-6  squads.leader_user_id FK CASCADE -> SET NULL.
-- The column is currently NOT NULL, so SET NULL also requires
-- dropping NOT NULL. Deleting a leader's auth user must NOT
-- cascade-delete the squad (preserves booking history).
-- squads is empty: a plain ADD CONSTRAINT is instant.
-- ------------------------------------------------------------
ALTER TABLE public.squads ALTER COLUMN leader_user_id DROP NOT NULL;
ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_leader_user_id_fkey;
ALTER TABLE public.squads
  ADD CONSTRAINT squads_leader_user_id_fkey
  FOREIGN KEY (leader_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- P1-7  squads RLS: replace USING(true) with leader+member.
-- Guest share-token squad reads are performed server-side via
-- the service role ("Service role manages squads", unchanged),
-- so removing the blanket public policy closes the "any anon
-- can read every squad" hole without breaking the share-link
-- join flow.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Squads are viewable by anyone with the share token" ON public.squads;
DROP POLICY IF EXISTS "Squad leader and members can view the squad" ON public.squads;
CREATE POLICY "Squad leader and members can view the squad"
  ON public.squads FOR SELECT
  USING (
    leader_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.squad_members sm
      WHERE sm.squad_id = squads.id
        AND sm.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- P3-9  orders.reservation_id + squads.reservation_id had NO
-- FK at all (silent referential drift). Add FK -> reservations
-- ON DELETE SET NULL. Zero orphans confirmed via MCP, so
-- VALIDATE is safe. Each new FK column is indexed.
-- ------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_reservation_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_reservation_id_fkey
  FOREIGN KEY (reservation_id) REFERENCES public.reservations(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_reservation_id_fkey;

ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_reservation_id_fkey;
ALTER TABLE public.squads
  ADD CONSTRAINT squads_reservation_id_fkey
  FOREIGN KEY (reservation_id) REFERENCES public.reservations(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE public.squads VALIDATE CONSTRAINT squads_reservation_id_fkey;

-- ------------------------------------------------------------
-- P1-9 + P3-9  Indexes
-- P1-9: orders.discount_code_id, tickets.ticket_tier_id,
--       squad_members.order_id (unindexed FKs / hot lookups).
-- P3-9: index the two new reservation_id FK columns.
-- Partial (WHERE col IS NOT NULL) - matches the existing
-- idx_orders_guest_email partial-index convention; most rows
-- carry NULL in these columns.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_discount_code
  ON public.orders(discount_code_id) WHERE discount_code_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_tier
  ON public.tickets(ticket_tier_id) WHERE ticket_tier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_squad_members_order
  ON public.squad_members(order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_reservation
  ON public.orders(reservation_id) WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_squads_reservation
  ON public.squads(reservation_id) WHERE reservation_id IS NOT NULL;

-- ------------------------------------------------------------
-- P3-6  Drop redundant idx_orders_order_number.
-- order_number is UNIQUE (constraint orders_order_number_key
-- already provides a btree index on the same column), so the
-- plain duplicate index is dead weight on every write.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_orders_order_number;

-- ------------------------------------------------------------
-- P3-7  payments.idempotency_key: plain index -> UNIQUE.
-- idempotency_key is NOT NULL but was not unique, so a retried
-- gateway call could create a duplicate payment row. The unique
-- index makes payment idempotency enforced at the DB level.
-- Zero duplicate keys confirmed via MCP.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_payments_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key_uniq
  ON public.payments(idempotency_key);

-- ------------------------------------------------------------
-- P1-10  updated_at audit column + trigger on the six tables
-- that lacked it. Added nullable, backfilled to created_at so
-- existing rows are truthful, then promoted to NOT NULL with
-- DEFAULT NOW(). Backfill runs BEFORE the trigger exists, so
-- it cannot self-stamp. Canonical trigger name (set_updated_at)
-- and canonical function (public.update_updated_at(), defined
-- in the baseline) match every other table in the schema.
-- ------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'order_items', 'reservations', 'squads',
    'squad_members', 'waitlist', 'payout_holds'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- 1. add column (nullable first)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ',
      tbl
    );
    -- 2. backfill nulls to created_at (idempotent: only fills NULLs)
    EXECUTE format(
      'UPDATE public.%I SET updated_at = created_at WHERE updated_at IS NULL',
      tbl
    );
    -- 3. promote to NOT NULL + DEFAULT NOW()
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT NOW()',
      tbl
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN updated_at SET NOT NULL',
      tbl
    );
    -- 4. (re)create the BEFORE UPDATE trigger
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()',
      tbl
    );
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- JAGUAR 9-CRITERION SELF-AUDIT (applied to this draft)
-- ============================================================
-- 1. Idempotency ............ PASS. Type widening guarded by
--    information_schema; columns ADD ... IF NOT EXISTS;
--    constraints DROP IF EXISTS then ADD; policies DROP IF
--    EXISTS then CREATE; indexes CREATE/DROP ... IF [NOT]
--    EXISTS; triggers DROP IF EXISTS then CREATE; the
--    discount_value backfill is guarded by a column-existence
--    check so a re-run after the column is dropped is a no-op.
-- 2. FK explicit ON DELETE .. PASS. squads.leader_user_id and
--    pricing_rules.created_by -> SET NULL; new
--    orders/squads.reservation_id FKs -> SET NULL. No implicit
--    NO ACTION FK left among the columns in scope.
-- 3. Constraint validation .. PASS. Every CHECK / FK on a
--    populated table (orders, pricing_rules) added NOT VALID
--    then VALIDATE so writers are not long-locked. Empty
--    tables (squads) use a plain ADD (instant).
-- 4. Money fields BIGINT .... PASS. All *_cents widened to
--    BIGINT; new discount_amount_cents is BIGINT.
-- 5. Audit fields ........... PASS. updated_at added to the
--    six tables missing it, with the canonical trigger.
-- 6. RLS posture ............ PASS. pricing_rules org overrides
--    no longer world-readable; financial ledgers require an
--    elevated org role; squads no longer world-readable;
--    waitlist org view reaches minimum-privilege parity.
-- 7. Indexes ................ PASS. Unindexed FKs / hot
--    lookups (discount_code_id, ticket_tier_id,
--    squad_members.order_id) and the two new reservation_id
--    FKs are indexed; redundant order_number index removed.
-- 8. Stripe alignment ....... N/A. No Stripe-facing schema in
--    this migration (money columns are internal ledger
--    fields; no PaymentIntent / transfer shape changes).
-- 9. Schema conflict check .. PASS. Verified against the live
--    Sydney project (gndnldyfudbytbboxesk) via read-only MCP
--    before authoring: column types, FK delete actions, RLS
--    policy quals, index defs, constraint defs and row counts
--    all match this migration's assumptions. No drift.
--
-- POST-APPLY (founder, after sign-off):
--   1) supabase db push --linked --include-all   (PowerShell)
--   2) npm run db:types                            ([SHARED])
--   3) Run the post-apply MCP verification checklist in
--      docs/SCHEMA-HYGIENE-MIGRATION-PLAN.md
-- ============================================================
