-- JOB 1 + JOB 7: the Founding Organiser fee waiver becomes a DATE WINDOW, and
-- one open pricing rule per scope becomes structurally impossible.
--
-- WHY A DATE WINDOW (founder decision, locked 2026-07-27). The waiver was
-- modelled as `founding_bonus_months`, a counter. A counter has no expiry and no
-- audit trail: nothing says when the waiver started, nothing ends it, and a
-- decrement is indistinguishable from a mistake. A timestamp answers "is this
-- organisation inside the window right now" with a single comparison that the
-- charge, the display and the payout can all make identically.
--
-- OBSERVED BEFORE WRITING (read only, both databases, 2026-07-27):
--   Production gndnldyfudbytbboxesk: 16 organisations, 0 with is_founding,
--                                    0 with founding_bonus_months > 0.
--   TEST       vkapkibzokmfaxqogypq: 42 organisations, 0 with is_founding,
--                                    0 with founding_bonus_months > 0.
-- So the backfill below currently affects NOBODY on either database. It is
-- written anyway because it must be correct the moment the first founding
-- organiser is onboarded, and because a migration that assumes an empty table
-- is a migration that corrupts a full one.
--
-- IS THIS DESTRUCTIVE? No.
--   * Adds one nullable column. No column is dropped or retyped.
--   * `founding_bonus_months` and `is_founding` are LEFT IN PLACE. They are the
--     backfill source and the historical record; removing them would destroy the
--     only evidence of what was promised. They stop being read by the charge.
--   * The backfill only ever GRANTS time. It cannot shorten a window, because
--     it writes only where founding_fee_free_until IS NULL.
--   * The pricing-rules constraint closes existing duplicate-open rows first, so
--     it cannot fail against live data. Superseded rows are stamped, never
--     deleted.
--   * No order, payment, payout or transfer row is read or written.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- JOB 1: the date window
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS founding_fee_free_until TIMESTAMPTZ;

COMMENT ON COLUMN public.organisations.founding_fee_free_until IS
  'Founding Organiser waiver expiry. While this is in the future the PLATFORM fee resolves to zero for this organisation; the PROCESSING fee is never waived. Six months from onboarding, plus three months per confirmed referral, capped at the first fifty organisations. Source of truth for the waiver: docs/PRICING.md.';

-- Backfill so nobody already promised the offer loses it.
--   * Six months from the organisation's creation date (the onboarding proxy:
--     there is no separate onboarded_at column, and created_at is when the
--     organisation entered the platform).
--   * Plus three months for each bonus month TRIPLE already earned, so an
--     existing founding_bonus_months of 3 becomes one referral of three months,
--     6 becomes two, and so on. Integer division floors, so a partial credit
--     never inflates the window.
--   * Only where the window is not already set, so re-running grants nothing.
UPDATE public.organisations
SET founding_fee_free_until =
      created_at
      + INTERVAL '6 months'
      + (COALESCE(founding_bonus_months, 0) * INTERVAL '1 month')
WHERE founding_fee_free_until IS NULL
  AND (is_founding = TRUE OR COALESCE(founding_bonus_months, 0) > 0);

CREATE INDEX IF NOT EXISTS idx_organisations_founding_window
  ON public.organisations (founding_fee_free_until)
  WHERE founding_fee_free_until IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- JOB 4: the fifty cap, enforced in the database as well as in code
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The cap was copy, not code. A trigger enforces it at the last possible
-- moment, so it holds even against a direct SQL grant, an admin action, or a
-- future code path nobody has written yet. The application layer checks it too
-- and gives a readable error; this is the backstop that cannot be bypassed.

CREATE OR REPLACE FUNCTION public.enforce_founding_waiver_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  holder_count INT;
BEGIN
  -- Only guard the transition into holding a waiver. Extending an existing
  -- window (a referral) must always be allowed, and clearing one always is.
  IF NEW.founding_fee_free_until IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.founding_fee_free_until IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO holder_count
  FROM public.organisations
  WHERE founding_fee_free_until IS NOT NULL
    AND id <> NEW.id;

  IF holder_count >= 50 THEN
    RAISE EXCEPTION
      'founding waiver cap reached: % organisations already hold the Founding Organiser waiver (cap is 50)', holder_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_founding_waiver_cap ON public.organisations;
CREATE TRIGGER trg_founding_waiver_cap
  BEFORE INSERT OR UPDATE OF founding_fee_free_until ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_founding_waiver_cap();

-- ─────────────────────────────────────────────────────────────────────────────
-- JOB 7: one open pricing rule per scope becomes impossible
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The drift vector found on 2026-07-27: a new version is inserted with
-- effective_until NULL and the previous row is left open, so AU
-- platform_fee_percentage had THREE simultaneously open rows (2.5, 2.0, 3.5)
-- and three other rules had two each. The resolver returned the right number
-- only because it orders by version DESC. A duplicate or non-incrementing
-- version would silently change what the platform charges, with no error.
--
-- Close the existing duplicates FIRST, so the index can be created against live
-- data without failing.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY rule_type, country_code, currency,
                        COALESCE(organisation_id::TEXT, ''), COALESCE(event_id::TEXT, '')
           ORDER BY version DESC
         ) AS rn
  FROM public.pricing_rules
  WHERE effective_until IS NULL
)
UPDATE public.pricing_rules p
SET effective_until = NOW()
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- The structural guarantee: at most ONE open row per (rule_type, scope).
-- A partial unique index is the right tool: it constrains only open rows, so
-- the full version history stays insertable and readable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_one_open_per_scope
  ON public.pricing_rules (
    rule_type,
    country_code,
    currency,
    COALESCE(organisation_id::TEXT, ''),
    COALESCE(event_id::TEXT, '')
  )
  WHERE effective_until IS NULL;

COMMENT ON INDEX public.uq_pricing_rules_one_open_per_scope IS
  'At most one OPEN (effective_until IS NULL) pricing rule per rule_type and scope. Makes the resolver''s ORDER BY version DESC a tie-break it never has to use, rather than the only thing preventing a duplicate version silently changing the charged fee. Writers must stamp the previous row before inserting the next version.';

-- Post-condition: prove the guarantee holds before committing.
DO $$
DECLARE
  dupes INT;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT 1 FROM public.pricing_rules
    WHERE effective_until IS NULL
    GROUP BY rule_type, country_code, currency,
             COALESCE(organisation_id::TEXT, ''), COALESCE(event_id::TEXT, '')
    HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'pricing_rules still has % scope(s) with more than one open row', dupes;
  END IF;
  RAISE NOTICE 'pricing_rules: exactly one open row per scope, enforced by unique index';
END $$;

COMMIT;
