-- ============================================================
-- 20260520000001_schema_hygiene_ROLLBACK.sql
-- ============================================================
-- Reverse of 20260520000001_schema_hygiene.sql. Run ONLY if the
-- forward apply fails or must be backed out. Restores every
-- table, column, constraint, FK, policy, index and trigger to
-- its pre-hygiene state.
--
-- This is NOT a Supabase migration to be picked up by
-- `db push` (the _ROLLBACK suffix keeps it out of the ordered
-- migration set). Apply manually from PowerShell only if
-- needed:
--   Get-Content supabase/migrations/20260520000001_schema_hygiene_ROLLBACK.sql `
--     | supabase db execute --linked
-- (or paste into a single psql session against the linked DB).
--
-- CAVEATS (documented in docs/SCHEMA-HYGIENE-MIGRATION-PLAN.md):
--  * BIGINT -> INTEGER is a NARROWING. Safe only if no value
--    written after the forward apply exceeds 2,147,483,647.
--    Guarded by an information_schema type check; review the
--    plan doc before relying on it with live data.
--  * Restoring discount_codes.discount_value and
--    pricing_rules.value reconstructs each polymorphic column
--    from its split columns. Lossless for the data shapes this
--    schema produces (percentage scale <= 4, fixed/integer
--    whole).
--  * Re-imposing NOT NULL on squads.leader_user_id,
--    discount_codes.discount_value and pricing_rules.value
--    fails if a NULL row was written post-apply. pricing_rules
--    has 59 rows at draft time (all reconstructable); the
--    transactional tables are empty.
-- Idempotent. Australian English, no em-dashes.
-- ============================================================

BEGIN;

-- ---- reverse P1-10: drop updated_at triggers + columns ----
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'order_items', 'reservations', 'squads',
    'squad_members', 'waitlist', 'payout_holds'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', tbl);
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS updated_at', tbl);
  END LOOP;
END $$;

-- ---- reverse P3-7: restore plain idempotency index ----
DROP INDEX IF EXISTS public.idx_payments_idempotency_key_uniq;
CREATE INDEX IF NOT EXISTS idx_payments_idempotency
  ON public.payments(idempotency_key);

-- ---- reverse P3-6: recreate the duplicate order_number index
CREATE INDEX IF NOT EXISTS idx_orders_order_number
  ON public.orders(order_number);

-- ---- reverse P1-9 + P3-9 indexes ----
DROP INDEX IF EXISTS public.idx_orders_discount_code;
DROP INDEX IF EXISTS public.idx_tickets_ticket_tier;
DROP INDEX IF EXISTS public.idx_squad_members_order;
DROP INDEX IF EXISTS public.idx_orders_reservation;
DROP INDEX IF EXISTS public.idx_squads_reservation;

-- ---- reverse P3-9: drop the new reservation_id FKs ----
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_reservation_id_fkey;
ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_reservation_id_fkey;

-- ---- reverse P1-7: restore the public squads SELECT policy
DROP POLICY IF EXISTS "Squad leader and members can view the squad" ON public.squads;
DROP POLICY IF EXISTS "Squads are viewable by anyone with the share token" ON public.squads;
CREATE POLICY "Squads are viewable by anyone with the share token"
  ON public.squads FOR SELECT
  USING (true);

-- ---- reverse P1-6: leader_user_id FK back to CASCADE + NOT NULL
ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_leader_user_id_fkey;
ALTER TABLE public.squads
  ADD CONSTRAINT squads_leader_user_id_fkey
  FOREIGN KEY (leader_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.squads ALTER COLUMN leader_user_id SET NOT NULL;

-- ---- reverse P1-11: waitlist back to owner-only org view ----
DROP POLICY IF EXISTS "Org members can view waitlist for their events" ON public.waitlist;
CREATE POLICY "Org members can view waitlist for their events"
  ON public.waitlist FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      WHERE e.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
    )
  );

-- ---- reverse P1-2: restore no-role-filter member policies ----
DROP POLICY IF EXISTS "Organisation members can view their payouts" ON public.payouts;
CREATE POLICY "Organisation members can view their payouts"
  ON public.payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = payouts.organisation_id
        AND m.user_id = auth.uid()
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
    )
  );

DROP POLICY IF EXISTS "Organisation members can view their tier history" ON public.tier_progression_log;
CREATE POLICY "Organisation members can view their tier history"
  ON public.tier_progression_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = tier_progression_log.organisation_id
        AND m.user_id = auth.uid()
    )
  );

-- ---- reverse P1-8: created_by FK back to NO ACTION ----
ALTER TABLE public.pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_created_by_fkey;
ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- ---- reverse P1-1: restore world-readable pricing_rules ----
DROP POLICY IF EXISTS "Region-default pricing rules are public" ON public.pricing_rules;
DROP POLICY IF EXISTS "Org pricing overrides visible to owning org" ON public.pricing_rules;
DROP POLICY IF EXISTS "Pricing rules are readable by everyone" ON public.pricing_rules;
CREATE POLICY "Pricing rules are readable by everyone"
  ON public.pricing_rules FOR SELECT
  USING (true);

-- ---- reverse P1-4b: rebuild pricing_rules.value ----
-- Reconstruct the legacy polymorphic NUMERIC(10,4) column from
-- the three typed columns, then drop them. Lossless for the
-- data shapes this schema produces (percentage scale <= 4,
-- fixed/integer whole).
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS value NUMERIC(10, 4);

UPDATE public.pricing_rules
   SET value = value_percentage::NUMERIC(10, 4)
 WHERE value_type = 'percentage'
   AND value IS NULL
   AND value_percentage IS NOT NULL;

UPDATE public.pricing_rules
   SET value = value_cents::NUMERIC(10, 4)
 WHERE value_type = 'fixed'
   AND value IS NULL
   AND value_cents IS NOT NULL;

UPDATE public.pricing_rules
   SET value = value_integer::NUMERIC(10, 4)
 WHERE value_type = 'integer'
   AND value IS NULL
   AND value_integer IS NOT NULL;

-- Drop both the split CHECK and (defensively) the earlier
-- draft's CHECK name so rollback is idempotent from either
-- forward state.
ALTER TABLE public.pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_value_split_check;
ALTER TABLE public.pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_whole_fixed_value_check;

-- Restore the original NOT NULL only when every row was
-- reconstructed (no NULL value remains).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pricing_rules WHERE value IS NULL
  ) THEN
    ALTER TABLE public.pricing_rules ALTER COLUMN value SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.pricing_rules DROP COLUMN IF EXISTS value_percentage;
ALTER TABLE public.pricing_rules DROP COLUMN IF EXISTS value_cents;
ALTER TABLE public.pricing_rules DROP COLUMN IF EXISTS value_integer;

-- ---- reverse P1-4: rebuild discount_codes.discount_value ----
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10, 2);

UPDATE public.discount_codes
   SET discount_value = discount_amount_cents::NUMERIC(10, 2)
 WHERE discount_type = 'fixed_amount'
   AND discount_value IS NULL
   AND discount_amount_cents IS NOT NULL;

UPDATE public.discount_codes
   SET discount_value = discount_percentage::NUMERIC(10, 2)
 WHERE discount_type = 'percentage'
   AND discount_value IS NULL
   AND discount_percentage IS NOT NULL;

ALTER TABLE public.discount_codes DROP CONSTRAINT IF EXISTS discount_codes_value_split_check;
ALTER TABLE public.discount_codes DROP CONSTRAINT IF EXISTS discount_codes_value_check;
ALTER TABLE public.discount_codes
  ADD CONSTRAINT discount_codes_value_check CHECK (
    (discount_type = 'percentage' AND discount_value > 0 AND discount_value <= 100)
    OR
    (discount_type = 'fixed_amount' AND discount_value > 0)
  ) NOT VALID;
ALTER TABLE public.discount_codes VALIDATE CONSTRAINT discount_codes_value_check;

-- Restore the original NOT NULL only when every row was
-- reconstructed (no NULL discount_value remains).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.discount_codes WHERE discount_value IS NULL
  ) THEN
    ALTER TABLE public.discount_codes ALTER COLUMN discount_value SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.discount_codes DROP COLUMN IF EXISTS discount_amount_cents;
ALTER TABLE public.discount_codes DROP COLUMN IF EXISTS discount_percentage;

-- ---- reverse P4-6: drop currency guard ----
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_currency_aud_only;

-- ---- reverse P1-5: drop non-negative cents CHECKs ----
ALTER TABLE public.orders      DROP CONSTRAINT IF EXISTS orders_cents_non_negative;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_cents_non_negative;

-- ---- reverse P1-3: BIGINT -> INTEGER (narrowing, guarded) ----
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
        AND data_type = 'bigint'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE INTEGER',
        r.t, r.c
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- End of rollback. Post-rollback: run npm run db:types if the
-- forward migration had already regenerated src/types/database.ts.
-- ============================================================
