# Refund Operator Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorised operator (platform admin, or organiser for their own events) refund a buyer full or partial by-ticket, with money, ledger, tickets, inventory, and reserve holds reconciled atomically and idempotently, webhook-driven.

**Architecture:** Two phases. Phase A (operator action) atomically creates a `processing` refund intent (`create_refund_request` RPC, order locked `FOR UPDATE`) and fires the existing Stripe `refundOrder()` (reverse_transfer + app-fee refund) under idempotency key `refund:{refundId}`. Phase B (Stripe webhook, the sole money source of truth) runs `reconcile_refund` RPC per `charge.refunds.data[]` entry: void tickets, return inventory, reverse the ledger (mirroring the sale inverse), release/reduce the reserve hold, flip statuses, all in one transaction, idempotent on `stripe_refund_id`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (SQL migrations + SECURITY DEFINER RPCs), Stripe, Resend, Tailwind v4, vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-31-refund-operator-path-design.md`

---

## File Structure

- Create `supabase/migrations/20260531000001_refund_reconcile.sql` — refund_tickets, partial unique index, unique stripe_refund_id, RLS, trigger, `create_refund_request`, `reconcile_refund`.
- Create `src/lib/payments/refund-scope.ts` — `resolveRefundScope`.
- Create `src/lib/payments/refund-amount.ts` — proportional by-ticket amount allocation (pure).
- Create `src/lib/payments/refund-service.ts` — Phase A orchestration.
- Modify `src/lib/payments/refund.ts` — accept explicit idempotency key + refund_id metadata.
- Modify `src/app/api/webhooks/stripe/route.ts` — per-refund-id reconcile + per-refund email.
- Modify `src/lib/admin/rbac.ts` — add `admin.refunds.process` capability.
- Modify `src/types/database.ts` (+ regen `database.generated.ts`) — `Refund`, `RefundTicket`. [SHARED]
- Create `src/components/refunds/refund-dialog.tsx` — shared UI.
- Create `src/app/admin/(authed)/orders/page.tsx` + `src/app/admin/(authed)/orders/[orderId]/page.tsx` + server action `src/app/admin/(authed)/orders/[orderId]/actions.ts`.
- Modify `src/app/(dashboard)/dashboard/events/[id]/orders/[orderId]/page.tsx` + add organiser server action.
- Modify `src/lib/email/templates/refund-confirmation.ts` only if signature change needed (additive).
- Tests under `tests/unit/payments/` and a verification script under `scripts/verify/`.

---

## Task 1: Migration — schema delta, RLS, trigger

**Files:**
- Create: `supabase/migrations/20260531000001_refund_reconcile.sql`

- [ ] **Step 1: Write the migration (schema objects only; RPCs added in Tasks 2-3 as further sections of the same file)**

```sql
-- ============================================================
-- M6 Refund Operator Path - reconcile layer
-- Builds on 20260503000001_refunds_extension.sql (refunds table).
-- Adds: refund_tickets join + DB-enforced single active claim,
-- unique stripe_refund_id, admin/org RLS, and the two RPCs that
-- back the webhook-driven reconcile. Idempotent (IF NOT EXISTS).
-- ============================================================

-- 1. refund_tickets join table -------------------------------
CREATE TABLE IF NOT EXISTS public.refund_tickets (
  refund_id  UUID NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
  ticket_id  UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (refund_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_refund_tickets_ticket ON public.refund_tickets(ticket_id);

-- DB-enforced single active claim: a ticket is in at most one active refund.
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_tickets_active_ticket
  ON public.refund_tickets(ticket_id) WHERE is_active;

-- 2. Hard idempotency anchor: unique stripe_refund_id --------
DROP INDEX IF EXISTS public.idx_refunds_stripe_refund;
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_stripe_refund
  ON public.refunds(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;

-- 3. Free tickets when a refund fails/cancels ----------------
CREATE OR REPLACE FUNCTION public.refund_tickets_deactivate_on_terminal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('failed','cancelled')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.refund_tickets
      SET is_active = FALSE
      WHERE refund_id = NEW.id AND is_active;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refund_tickets_deactivate ON public.refunds;
CREATE TRIGGER trg_refund_tickets_deactivate
  AFTER UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.refund_tickets_deactivate_on_terminal();

-- 4. RLS -----------------------------------------------------
ALTER TABLE public.refund_tickets ENABLE ROW LEVEL SECURITY;

-- Admin read of all refunds.
DROP POLICY IF EXISTS "Admins read all refunds" ON public.refunds;
CREATE POLICY "Admins read all refunds"
  ON public.refunds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.id = auth.uid() AND a.disabled_at IS NULL
        AND a.role IN ('super_admin','admin','support')
    )
  );

-- Org members (not just owner) read their refunds.
DROP POLICY IF EXISTS "Org members read their refunds" ON public.refunds;
CREATE POLICY "Org members read their refunds"
  ON public.refunds FOR SELECT
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')
    )
  );

-- refund_tickets read mirrors refunds visibility via the parent row.
DROP POLICY IF EXISTS "Read refund_tickets via parent refund" ON public.refund_tickets;
CREATE POLICY "Read refund_tickets via parent refund"
  ON public.refund_tickets FOR SELECT
  USING (
    refund_id IN (SELECT id FROM public.refunds)
  );

COMMENT ON TABLE public.refund_tickets IS
  'Links a refund to the exact tickets it covers (by-ticket model). is_active enforces single active claim per ticket via uq_refund_tickets_active_ticket.';
```

- [ ] **Step 2: Lint the SQL by eye against conventions** — uses `gen_random_uuid()` style (n/a here), `IF NOT EXISTS`, `public.` schema-qualified, no `uuid_generate_v4()`. Confirm `tickets`, `refunds`, `admin_users`, `organisation_members` table/column names match the baseline + extension migrations.

- [ ] **Step 3: Commit (RPCs appended in Tasks 2-3 before any apply)**

```bash
git add supabase/migrations/20260531000001_refund_reconcile.sql
git commit -m "feat(refund): migration schema delta - refund_tickets, active-claim index, RLS, trigger"
```

---

## Task 2: `create_refund_request` RPC (Phase A)

**Files:**
- Modify: `supabase/migrations/20260531000001_refund_reconcile.sql` (append section 5)

- [ ] **Step 1: Append the RPC**

```sql
-- 5. create_refund_request RPC (Phase A, atomic intent) ------
CREATE OR REPLACE FUNCTION public.create_refund_request(
  p_order_id     UUID,
  p_ticket_ids   UUID[],
  p_reason       public.refund_reason,
  p_initiator    public.refund_initiator,
  p_actor_id     UUID,
  p_buyer_message TEXT DEFAULT NULL
)
RETURNS TABLE (refund_id UUID, amount_cents BIGINT, currency TEXT, payment_intent_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        public.orders%ROWTYPE;
  v_is_admin     BOOLEAN;
  v_owns_org     BOOLEAN;
  v_sel_face     BIGINT;
  v_all_face     BIGINT;
  v_amount       BIGINT;
  v_pi           TEXT;
  v_refund_id    UUID;
  v_sel_count    INT;
BEGIN
  IF p_ticket_ids IS NULL OR array_length(p_ticket_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no tickets selected' USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the order: serialises all refunds for this order.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = 'no_data_found'; END IF;

  -- Authorisation (defence in depth; service also checks).
  v_is_admin := EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.id = p_actor_id AND a.disabled_at IS NULL
      AND a.role IN ('super_admin','admin','support')
  );
  v_owns_org := EXISTS (
    SELECT 1 FROM public.organisations o WHERE o.id = v_order.organisation_id AND o.owner_id = p_actor_id
  ) OR EXISTS (
    SELECT 1 FROM public.organisation_members m
    WHERE m.organisation_id = v_order.organisation_id AND m.user_id = p_actor_id
      AND m.role IN ('owner','admin','manager')
  );
  IF NOT (v_is_admin OR v_owns_org) THEN
    RAISE EXCEPTION 'not authorised to refund this order' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Refundability.
  IF v_order.status NOT IN ('confirmed','partially_refunded') THEN
    RAISE EXCEPTION 'order not refundable in status %', v_order.status USING ERRCODE = 'check_violation';
  END IF;
  IF v_order.total_cents <= 0 THEN
    RAISE EXCEPTION 'free orders are not refundable' USING ERRCODE = 'check_violation';
  END IF;

  -- Validate selected tickets: belong to order, refundable status, not already claimed.
  SELECT count(*) INTO v_sel_count
  FROM public.tickets t
  WHERE t.id = ANY(p_ticket_ids)
    AND t.order_id = p_order_id
    AND t.status IN ('valid','scanned')
    AND NOT EXISTS (
      SELECT 1 FROM public.refund_tickets rt
      WHERE rt.ticket_id = t.id AND rt.is_active
    );
  IF v_sel_count <> array_length(p_ticket_ids, 1) THEN
    RAISE EXCEPTION 'one or more tickets are not refundable or already claimed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Proportional amount by selected tickets' face value.
  -- Face value per ticket = its order_item unit price (tier price at purchase).
  SELECT COALESCE(SUM(oi.unit_price_cents), 0) INTO v_all_face
  FROM public.tickets t JOIN public.order_items oi ON oi.id = t.order_item_id
  WHERE t.order_id = p_order_id;

  SELECT COALESCE(SUM(oi.unit_price_cents), 0) INTO v_sel_face
  FROM public.tickets t JOIN public.order_items oi ON oi.id = t.order_item_id
  WHERE t.id = ANY(p_ticket_ids);

  IF v_all_face <= 0 THEN
    RAISE EXCEPTION 'cannot allocate refund amount (zero face value)' USING ERRCODE = 'check_violation';
  END IF;

  -- Allocate gross total proportionally; clamp to remaining refundable.
  v_amount := round(v_order.total_cents::numeric * v_sel_face / v_all_face)::BIGINT;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'computed refund amount must be positive' USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.gateway_payment_id INTO v_pi
  FROM public.payments p WHERE p.order_id = p_order_id
  ORDER BY p.created_at DESC LIMIT 1;
  IF v_pi IS NULL THEN
    RAISE EXCEPTION 'no payment intent for order' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.refunds (
    order_id, organisation_id, amount_cents, currency, reason, status,
    initiator, requested_by, buyer_message
  ) VALUES (
    p_order_id, v_order.organisation_id, v_amount, v_order.currency, p_reason, 'processing',
    p_initiator, p_actor_id, p_buyer_message
  ) RETURNING id INTO v_refund_id;

  INSERT INTO public.refund_tickets (refund_id, ticket_id, is_active)
  SELECT v_refund_id, unnest(p_ticket_ids), TRUE;

  RETURN QUERY SELECT v_refund_id, v_amount, v_order.currency, v_pi;
END;
$$;

REVOKE ALL ON FUNCTION public.create_refund_request(UUID, UUID[], public.refund_reason, public.refund_initiator, UUID, TEXT) FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 2: Verify column names** — confirm `order_items.unit_price_cents`, `payments.gateway_payment_id`, `tickets.order_item_id`, `orders.organisation_id/currency/total_cents/status` exist (from baseline + ticketing migrations). If `unit_price_cents` differs (e.g. `price_cents`), correct in the SQL. (CHECKPOINT: grep the baseline migration before trusting these.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260531000001_refund_reconcile.sql
git commit -m "feat(refund): create_refund_request RPC - locked, authorised, proportional by-ticket"
```

---

## Task 3: `reconcile_refund` RPC (Phase B, atomic heart)

**Files:**
- Modify: `supabase/migrations/20260531000001_refund_reconcile.sql` (append section 6)

- [ ] **Step 1: Append the RPC**

```sql
-- 6. reconcile_refund RPC (Phase B, atomic money reconcile) --
CREATE OR REPLACE FUNCTION public.reconcile_refund(
  p_stripe_refund_id    TEXT,
  p_charge_id           TEXT,
  p_refund_amount_cents BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund   public.refunds%ROWTYPE;
  v_order    public.orders%ROWTYPE;
  v_share        BIGINT;  -- organiser share clawed back for this refund
  v_reserve_part BIGINT;
  v_balance_part BIGINT;
  v_hold     public.payout_holds%ROWTYPE;
  v_voided   INT;
  v_remaining INT;
  v_app_fee  BIGINT;
  v_proc     BIGINT;
BEGIN
  SELECT * INTO v_refund FROM public.refunds
    WHERE stripe_refund_id = p_stripe_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_refund_row';  -- orphan path handled by caller (ticket void only)
  END IF;
  IF v_refund.status = 'completed' THEN
    RETURN 'already_done';   -- idempotent no-op on webhook replay
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_refund.order_id FOR UPDATE;

  -- Void this refund's tickets (status-filtered = idempotent).
  WITH voided AS (
    UPDATE public.tickets t
      SET status = 'refunded', refunded_at = NOW(), updated_at = NOW()
      FROM public.refund_tickets rt
      WHERE rt.refund_id = v_refund.id AND rt.ticket_id = t.id
        AND t.status NOT IN ('void','refunded')
      RETURNING t.ticket_tier_id
  )
  SELECT count(*) INTO v_voided FROM voided;

  -- Return inventory per tier (never below zero).
  UPDATE public.ticket_tiers tt SET sold_count = GREATEST(0, sold_count - sub.cnt)
  FROM (
    SELECT t.ticket_tier_id AS tier, count(*)::int AS cnt
    FROM public.refund_tickets rt JOIN public.tickets t ON t.id = rt.ticket_id
    WHERE rt.refund_id = v_refund.id AND t.ticket_tier_id IS NOT NULL
    GROUP BY t.ticket_tier_id
  ) sub
  WHERE tt.id = sub.tier;

  -- Ledger reversal split, mirroring the sale inverse.
  -- organiser share for THIS refund = refund_amount - proportional fees.
  v_app_fee := round(
    (v_order.platform_fee_cents + v_order.processing_fee_cents)::numeric
    * p_refund_amount_cents / NULLIF(v_order.total_cents,0)
  )::BIGINT;
  v_share := p_refund_amount_cents - v_app_fee;

  -- Live reserve hold for this order (most recent unreleased).
  SELECT * INTO v_hold FROM public.payout_holds
    WHERE organisation_id = v_order.organisation_id
      AND hold_type = 'reserve'
      AND released_at IS NULL
      AND (metadata->>'order_id') = v_order.id::text
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND AND v_hold.amount_cents > 0 THEN
    v_reserve_part := LEAST(v_hold.amount_cents, v_share);
  ELSE
    v_reserve_part := 0;
  END IF;
  v_balance_part := v_share - v_reserve_part;

  -- reserve_release (+R) undoes the original reserve_hold debit; then claw back.
  IF v_reserve_part > 0 THEN
    INSERT INTO public.organiser_balance_ledger
      (organisation_id, delta_cents, currency, reason, reference_type, reference_id, metadata)
    VALUES
      (v_order.organisation_id, v_reserve_part, v_order.currency, 'reserve_release',
       'order', v_order.id, jsonb_build_object('refund_id', v_refund.id, 'stripe_refund_id', p_stripe_refund_id)),
      (v_order.organisation_id, -v_reserve_part, v_order.currency, 'refund_from_reserve',
       'order', v_order.id, jsonb_build_object('refund_id', v_refund.id, 'stripe_refund_id', p_stripe_refund_id));

    UPDATE public.payout_holds
      SET amount_cents = amount_cents - v_reserve_part,
          released_at = CASE WHEN amount_cents - v_reserve_part <= 0 THEN NOW() ELSE released_at END
      WHERE id = v_hold.id;

    UPDATE public.organisations
      SET hold_amount_cents = GREATEST(0, hold_amount_cents - v_reserve_part), updated_at = NOW()
      WHERE id = v_order.organisation_id;
  END IF;

  IF v_balance_part <> 0 THEN
    INSERT INTO public.organiser_balance_ledger
      (organisation_id, delta_cents, currency, reason, reference_type, reference_id, metadata)
    VALUES
      (v_order.organisation_id, -v_balance_part, v_order.currency, 'refund_from_balance',
       'order', v_order.id, jsonb_build_object('refund_id', v_refund.id, 'stripe_refund_id', p_stripe_refund_id));
  END IF;

  -- Decrement lifetime volume by refunded gross-minus-processing (mirror sale increment).
  v_proc := round(v_order.processing_fee_cents::numeric * p_refund_amount_cents / NULLIF(v_order.total_cents,0))::BIGINT;
  UPDATE public.organisations
    SET total_volume_cents = GREATEST(0, total_volume_cents - (p_refund_amount_cents - v_proc)), updated_at = NOW()
    WHERE id = v_order.organisation_id;

  -- Order status: refunded if no remaining valid/scanned tickets, else partially_refunded.
  SELECT count(*) INTO v_remaining FROM public.tickets
    WHERE order_id = v_order.id AND status IN ('valid','scanned');
  UPDATE public.orders
    SET status = CASE WHEN v_remaining = 0 THEN 'refunded' ELSE 'partially_refunded' END,
        updated_at = NOW()
    WHERE id = v_order.id;

  -- Complete the refund row (idempotency latch).
  UPDATE public.refunds
    SET status = 'completed', processed_at = NOW(), stripe_application_fee_refund_id = COALESCE(stripe_application_fee_refund_id, NULL)
    WHERE id = v_refund.id;

  RETURN 'reconciled';
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_refund(TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 2: Verify column names** — `payout_holds.metadata->>'order_id'` is how the sale stores the link (confirmed in `connect-ledger.ts`); `organisations.hold_amount_cents/total_volume_cents`, `organiser_balance_ledger` reason enum includes `reserve_release/refund_from_reserve/refund_from_balance` (confirmed in `20260428000001`). `orders.status` enum includes `partially_refunded/refunded` (confirmed baseline).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260531000001_refund_reconcile.sql
git commit -m "feat(refund): reconcile_refund RPC - atomic ledger inverse, hold release, inventory return, idempotent"
```

---

## Task 4: `resolveRefundScope` + RBAC capability (TDD)

**Files:**
- Create: `src/lib/payments/refund-scope.ts`
- Modify: `src/lib/admin/rbac.ts`
- Test: `tests/unit/payments/refund-scope.test.ts`

- [ ] **Step 1: Read `src/lib/admin/rbac.ts` and `src/lib/admin/auth.ts`** to learn the exact `AdminRole`/`AdminCapability` types, capability map shape, and how an admin session is shaped. Add `admin.refunds.process` to the capability union and grant it to `super_admin`, `admin`, `support` in the map.

- [ ] **Step 2: Write the failing test** (`tests/unit/payments/refund-scope.test.ts`)

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveRefundScope } from '@/lib/payments/refund-scope'

function clientFor({ admin, ownerOrg, memberOrg, order }: any) {
  // minimal supabase-like stub: .from(table).select().eq()...maybeSingle()
  return {
    from(table: string) {
      const api: any = {
        _table: table, _filters: {},
        select() { return api }, eq(k: string, v: any) { api._filters[k] = v; return api },
        in() { return api }, limit() { return api },
        maybeSingle() {
          if (table === 'orders') return Promise.resolve({ data: order, error: null })
          if (table === 'admin_users') return Promise.resolve({ data: admin, error: null })
          if (table === 'organisations') return Promise.resolve({ data: ownerOrg, error: null })
          if (table === 'organisation_members') return Promise.resolve({ data: memberOrg, error: null })
          return Promise.resolve({ data: null, error: null })
        },
      }
      return api
    },
  }
}

describe('resolveRefundScope', () => {
  const order = { id: 'o1', organisation_id: 'org1' }
  it('allows a platform admin to refund any order', async () => {
    const c = clientFor({ admin: { id: 'u1', role: 'admin', disabled_at: null }, order })
    await expect(resolveRefundScope(c as any, 'o1', 'u1')).resolves.toMatchObject({ allowed: true, via: 'admin' })
  })
  it('allows an organiser who owns the org', async () => {
    const c = clientFor({ admin: null, ownerOrg: { id: 'org1', owner_id: 'u2' }, order })
    await expect(resolveRefundScope(c as any, 'o1', 'u2')).resolves.toMatchObject({ allowed: true, via: 'organiser' })
  })
  it('rejects a stranger', async () => {
    const c = clientFor({ admin: null, ownerOrg: { id: 'org1', owner_id: 'someone' }, memberOrg: null, order })
    await expect(resolveRefundScope(c as any, 'o1', 'u3')).resolves.toMatchObject({ allowed: false })
  })
})
```

- [ ] **Step 3: Run, expect fail**

Run: `npm run test -- refund-scope`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/lib/payments/refund-scope.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type RefundScope =
  | { allowed: true; via: 'admin' | 'organiser'; organisationId: string }
  | { allowed: false; reason: string }

export async function resolveRefundScope(
  client: SupabaseClient,
  orderId: string,
  actorId: string,
): Promise<RefundScope> {
  const { data: order } = await client
    .from('orders').select('id, organisation_id').eq('id', orderId).maybeSingle()
  if (!order) return { allowed: false, reason: 'order_not_found' }

  const { data: admin } = await client
    .from('admin_users').select('id, role, disabled_at').eq('id', actorId).maybeSingle()
  if (admin && !admin.disabled_at && ['super_admin', 'admin', 'support'].includes(admin.role)) {
    return { allowed: true, via: 'admin', organisationId: order.organisation_id }
  }

  const { data: owned } = await client
    .from('organisations').select('id, owner_id').eq('id', order.organisation_id).maybeSingle()
  if (owned && owned.owner_id === actorId) {
    return { allowed: true, via: 'organiser', organisationId: order.organisation_id }
  }

  const { data: member } = await client
    .from('organisation_members').select('organisation_id, user_id, role')
    .eq('organisation_id', order.organisation_id).eq('user_id', actorId).maybeSingle()
  if (member && ['owner', 'admin', 'manager'].includes(member.role)) {
    return { allowed: true, via: 'organiser', organisationId: order.organisation_id }
  }

  return { allowed: false, reason: 'not_authorised' }
}
```

- [ ] **Step 5: Run, expect pass.** Run: `npm run test -- refund-scope` -> PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payments/refund-scope.ts src/lib/admin/rbac.ts tests/unit/payments/refund-scope.test.ts
git commit -m "feat(refund): resolveRefundScope authorisation + admin.refunds.process capability"
```

---

## Task 5: Proportional amount allocator (pure, TDD)

**Files:**
- Create: `src/lib/payments/refund-amount.ts`
- Test: `tests/unit/payments/refund-amount.test.ts`

Note: the RPC computes the authoritative amount in SQL; this pure helper mirrors the same formula for the UI preview and unit-proves the rounding. Single formula, two call sites stay in sync by test.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { allocateRefundAmountCents } from '@/lib/payments/refund-amount'

describe('allocateRefundAmountCents', () => {
  it('full selection returns the whole total', () => {
    expect(allocateRefundAmountCents({ totalCents: 10000, selectedFaceCents: 8000, allFaceCents: 8000 })).toBe(10000)
  })
  it('half the face value returns half the gross (rounded)', () => {
    expect(allocateRefundAmountCents({ totalCents: 10000, selectedFaceCents: 4000, allFaceCents: 8000 })).toBe(5000)
  })
  it('rounds to nearest cent', () => {
    expect(allocateRefundAmountCents({ totalCents: 10000, selectedFaceCents: 3333, allFaceCents: 10000 })).toBe(3333)
  })
  it('throws on zero all-face', () => {
    expect(() => allocateRefundAmountCents({ totalCents: 1, selectedFaceCents: 1, allFaceCents: 0 })).toThrow()
  })
})
```

- [ ] **Step 2: Run, expect fail.** Run: `npm run test -- refund-amount`

- [ ] **Step 3: Implement**

```ts
export function allocateRefundAmountCents(args: {
  totalCents: number; selectedFaceCents: number; allFaceCents: number
}): number {
  const { totalCents, selectedFaceCents, allFaceCents } = args
  if (allFaceCents <= 0) throw new Error('allFaceCents must be positive')
  return Math.round((totalCents * selectedFaceCents) / allFaceCents)
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/refund-amount.ts tests/unit/payments/refund-amount.test.ts
git commit -m "feat(refund): proportional by-ticket amount allocator"
```

---

## Task 6: Extend `refund.ts` for explicit idempotency key (TDD)

**Files:**
- Modify: `src/lib/payments/refund.ts`
- Test: `tests/unit/payments/refund.test.ts` (existing — add a case)

- [ ] **Step 1: Read the existing `tests/unit/payments/refund.test.ts`** to match its stub style (`__setStripeClientForTests`).

- [ ] **Step 2: Add a failing test** asserting that when `idempotencyKey` is provided it is passed verbatim and `metadata.refund_id` is forwarded.

```ts
it('uses an explicit idempotency key and forwards refund_id', async () => {
  const create = vi.fn().mockResolvedValue({ id: 're_1', status: 'succeeded', amount: 500, currency: 'aud' })
  __setStripeClientForTests({ refunds: { create } } as any)
  await refundOrder({
    orderId: 'o1', paymentIntentId: 'pi_1', amountCents: 500,
    reason: 'requested_by_buyer', initiatedBy: 'admin',
    idempotencyKey: 'refund:rf_1', metadata: { refund_id: 'rf_1' },
  })
  expect(create.mock.calls[0][1]).toEqual({ idempotencyKey: 'refund:rf_1' })
  expect(create.mock.calls[0][0].metadata).toMatchObject({ refund_id: 'rf_1' })
})
```

- [ ] **Step 3: Run, expect fail** (type error: `idempotencyKey` not on input).

- [ ] **Step 4: Implement** — add optional `idempotencyKey?: string` to `RefundOrderInput`; in `refundOrder`, use `input.idempotencyKey ?? \`refund:${input.orderId}:${input.amountCents}:${input.initiatedBy}\``. Leave the rest unchanged.

- [ ] **Step 5: Run full payments test file, expect pass** (existing cases still green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/payments/refund.ts tests/unit/payments/refund.test.ts
git commit -m "feat(refund): refund.ts accepts explicit idempotency key for per-refund-row keying"
```

---

## Task 7: Phase A service `refund-service.ts` (TDD)

**Files:**
- Create: `src/lib/payments/refund-service.ts`
- Test: `tests/unit/payments/refund-service.test.ts`

- [ ] **Step 1: Failing test** — given an authorised actor and a stubbed admin client whose `.rpc('create_refund_request')` returns `{ refund_id, amount_cents, currency, payment_intent_id }`, and a stubbed `refundOrder` (via module mock), `requestTicketRefund` calls the RPC, then Stripe, then updates the refund row with `stripe_refund_id` and keeps status `processing`; on Stripe throw it sets status `failed` and rethrows a typed error. Assert call order and the failure-path update.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement `requestTicketRefund`** with this signature and behaviour:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { refundOrder, type RefundReason, type RefundInitiator } from './refund'
import { resolveRefundScope } from './refund-scope'

export interface RequestTicketRefundInput {
  orderId: string
  ticketIds: string[]
  reason: RefundReason
  initiator: RefundInitiator
  actorId: string
  buyerMessage?: string | null
}
export interface RequestTicketRefundResult {
  refundId: string
  amountCents: number
  currency: string
  stripeRefundId: string
  status: 'processing'
}

export async function requestTicketRefund(
  admin: SupabaseClient,
  input: RequestTicketRefundInput,
): Promise<RequestTicketRefundResult> {
  const scope = await resolveRefundScope(admin, input.orderId, input.actorId)
  if (!scope.allowed) throw new RefundNotAuthorisedError(scope.reason)

  const { data, error } = await admin.rpc('create_refund_request', {
    p_order_id: input.orderId,
    p_ticket_ids: input.ticketIds,
    p_reason: input.reason,
    p_initiator: input.initiator,
    p_actor_id: input.actorId,
    p_buyer_message: input.buyerMessage ?? null,
  })
  if (error) throw new RefundRequestError(error.message)
  const row = Array.isArray(data) ? data[0] : data
  const { refund_id, amount_cents, currency, payment_intent_id } = row

  try {
    const res = await refundOrder({
      orderId: input.orderId,
      paymentIntentId: payment_intent_id,
      amountCents: amount_cents,
      reason: input.reason,
      initiatedBy: input.initiator,
      idempotencyKey: `refund:${refund_id}`,
      metadata: { refund_id },
    })
    await admin.from('refunds').update({
      stripe_refund_id: res.stripeRefundId, processed_by: input.actorId,
    }).eq('id', refund_id)
    return { refundId: refund_id, amountCents: amount_cents, currency, stripeRefundId: res.stripeRefundId, status: 'processing' }
  } catch (err) {
    await admin.from('refunds').update({
      status: 'failed', failure_reason: err instanceof Error ? err.message : 'stripe_error',
    }).eq('id', refund_id)
    throw err
  }
}

export class RefundNotAuthorisedError extends Error {}
export class RefundRequestError extends Error {}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/refund-service.ts tests/unit/payments/refund-service.test.ts
git commit -m "feat(refund): Phase A service - scope check, create_refund_request, Stripe, failure latch"
```

---

## Task 8: Webhook reconcile integration

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (`handleChargeRefunded`)

- [ ] **Step 1: Rewrite `handleChargeRefunded`** to iterate `charge.refunds?.data ?? []`; for each `r`, call `await adminClient.rpc('reconcile_refund', { p_stripe_refund_id: r.id, p_charge_id: charge.id, p_refund_amount_cents: r.amount })`. If the RPC returns `'no_refund_row'` for every refund (orphan), fall back to the existing order-level void (keep current code as the safety net under the in-app-only operating rule). After a `'reconciled'` result, send the per-refund email passing `r.amount` and the count of tickets in THIS refund. Keep waitlist promotion. Keep all error capture; a reconcile error returns 500 so Stripe retries (the RPC is idempotent, so retry is safe).

- [ ] **Step 2: Adjust `sendRefundConfirmationEmail`** to accept an explicit `amountCents` and `ticketCount` (additive optional params; fall back to `charge.amount_refunded` and the void-count query when omitted, preserving current behaviour for the orphan path).

- [ ] **Step 3: Typecheck + run existing webhook tests if any.** Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(refund): webhook reconcile per refund id, per-refund email, orphan safety net"
```

---

## Task 9: Curated DB types [SHARED]

**Files:**
- Modify: `src/types/database.ts`
- Regenerate: `src/types/database.generated.ts` via `npm run db:types` (after migration applied)

- [ ] **Step 1: Hand-add `Refund` and `RefundTicket` interfaces** to `src/types/database.ts` matching the file's existing convention (mirror an existing interface like `Ticket`). Fields per the refunds + refund_tickets schema.

- [ ] **Step 2: Typecheck.** Run: `npm run typecheck` -> 0 errors.

- [ ] **Step 3: Commit with [SHARED] prefix** (per CLAUDE.md, coordinate before merge)

```bash
git add src/types/database.ts
git commit -m "[SHARED] types(refund): add Refund and RefundTicket curated interfaces"
```

(Refresh `database.generated.ts` after the migration is applied, in the verification phase.)

---

## Task 10: Shared refund dialog component

**Files:**
- Create: `src/components/refunds/refund-dialog.tsx`

- [ ] **Step 1: Build a client component** `RefundDialog` taking props `{ orderId, tickets: {id, code, holderName, status, faceCents}[], currency, totalCents, allFaceCents, onSubmit }`. Renders: ticket checkboxes (44px rows) with a "refund all remaining" toggle, a `reason` select (`requested_by_buyer | duplicate | fraudulent | event_cancelled | cannot_attend | other`), optional buyer message textarea, a live amount preview via `allocateRefundAmountCents`, a confirm step, and loading/error/empty states. No em/en dashes. Inherit tokens from the M7 admin panel (read `src/components/admin/*` for exact classes). `onSubmit(ticketIds, reason, buyerMessage)` is the only side-effect; the page wires it to its server action.

- [ ] **Step 2: Typecheck + lint.** Run: `npm run typecheck && npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/refunds/refund-dialog.tsx
git commit -m "feat(refund): shared RefundDialog component - by-ticket select, confirm, amount preview"
```

---

## Task 11: Admin order/attendee view + server action

**Files:**
- Create: `src/app/admin/(authed)/orders/page.tsx` (list/search by email or order number)
- Create: `src/app/admin/(authed)/orders/[orderId]/page.tsx` (detail + RefundDialog)
- Create: `src/app/admin/(authed)/orders/[orderId]/actions.ts` (`'use server'`)
- Modify: admin sidebar/nav to add an "Orders" entry (match existing nav file).

- [ ] **Step 1: Read an existing M7 admin page** (e.g. `src/app/admin/(authed)/events/page.tsx`) for the exact session guard (`requireAdminSession`), layout shell, and table styling. Mirror it.

- [ ] **Step 2: Build the list page** — `requireAdminSession()` + `assertCapability(session.admin.role, 'admin.refunds.process')`; query recent orders (admin client) with search by `order_number`/`guest_email`; link each row to the detail page.

- [ ] **Step 3: Build the detail page** — load order, tickets (with tier face value), existing refunds; render order summary + tickets + `RefundDialog`; empty/loading/error states.

- [ ] **Step 4: Server action** `submitAdminRefund(orderId, ticketIds, reason, buyerMessage)`:

```ts
'use server'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCapability } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestTicketRefund } from '@/lib/payments/refund-service'
import { recordAuditEvent } from '@/lib/admin/audit'

export async function submitAdminRefund(input: {
  orderId: string; ticketIds: string[]; reason: any; buyerMessage?: string
}) {
  const session = await requireAdminSession()
  assertCapability(session.admin.role, 'admin.refunds.process')
  const admin = createAdminClient()
  const res = await requestTicketRefund(admin, {
    orderId: input.orderId, ticketIds: input.ticketIds, reason: input.reason,
    initiator: 'admin', actorId: session.userId, buyerMessage: input.buyerMessage ?? null,
  })
  await recordAuditEvent({
    action: 'admin.refund.request', targetType: 'refund', targetId: res.refundId,
    metadata: { order_id: input.orderId, amount_cents: res.amountCents, reason: input.reason, ticket_ids: input.ticketIds },
    session,
  })
  return res
}
```

- [ ] **Step 5: Typecheck + lint.** Run: `npm run typecheck && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(authed)/orders" src/components/layout 2>/dev/null; git add -A && git commit -m "feat(admin): order/attendee view with refund action, audited"
```

---

## Task 12: Organiser refund button + server action

**Files:**
- Modify: `src/app/(dashboard)/dashboard/events/[id]/orders/[orderId]/page.tsx`
- Create: a colocated `'use server'` action (or `actions.ts` next to the page).

- [ ] **Step 1: Read the existing organiser order page** and the `getOrganiserEvent` ownership gate (per memory `project_organiser_reporting`). Reuse the gate.

- [ ] **Step 2: Add the RefundDialog** to the page, gated so only owners/managers see it.

- [ ] **Step 3: Server action** `submitOrganiserRefund(...)` — resolve the organiser session, call `requestTicketRefund` with `initiator: 'organiser'`, `actorId = user.id`; `requestTicketRefund` enforces scope, and `getOrganiserEvent` pre-gates the page. Audit with `admin.refund.request` (actor = organiser).

- [ ] **Step 4: Typecheck + lint.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(organiser): refund button on own-event orders, scope-enforced"
```

---

## Task 13: Apply migration (founder-run), regen types, verify build gates

- [ ] **Step 1: Hand to founder for apply** (STOP). Provide:

```
supabase migration list --linked
supabase db push --linked
```

- [ ] **Step 2: After apply, regenerate generated types.** Run: `npm run db:types` (writes `src/types/database.generated.ts`). Commit if changed (no `[SHARED]` needed; generated file).

- [ ] **Step 3: Gates.** Run: `npm run typecheck` (0), `npm run lint` (0), `npm run test` (green), `npm run build` (pass).

- [ ] **Step 4: Commit any fixes.**

---

## Task 14: End-to-end verification in test mode (real rows, then restore)

**Files:**
- Create: `scripts/verify/refund-e2e.md` (a runbook recording the verification evidence)

- [ ] **Step 1: Create a real paid order** via the actual purchase/checkout flow against the test organiser (Stripe test mode). Record order id, ticket ids, payment_intent.

- [ ] **Step 2: Full refund via the admin UI.** Assert, by querying real rows:
  - Stripe: refund `succeeded` (Stripe dashboard / API).
  - `organiser_balance_ledger`: `refund_from_balance` + `refund_from_reserve` + `reserve_release` rows for this refund; sum of deltas equals the correct inverse of the sale share.
  - `payout_holds`: matching reserve hold `released_at` set (or amount reduced to 0).
  - `ticket_tiers.sold_count` returned by the refunded count.
  - tickets `status='refunded'`; the admission/scan path rejects the QR.
  - refund email sent (Resend logs).
  - `audit_log`: `admin.refund.request` row with who/amount/reason.
  - `refunds.status='completed'`, `orders.status='refunded'`.

- [ ] **Step 3: Replay the webhook** (re-deliver `charge.refunded`). Assert NO new ledger rows, NO double void, ledger sum unchanged (idempotent).

- [ ] **Step 4: Partial refund** (new order, refund 2 of 5 tickets). Assert proportional amount, only 2 tickets refunded, 2 inventory returned, `orders.status='partially_refunded'`.

- [ ] **Step 5: Unauthorised actor** — a non-owning organiser attempts a refund; assert rejection (scope error, no refund row, no Stripe call).

- [ ] **Step 6: Restore** all test rows created (delete test orders/tickets/refunds/ledger entries) so the environment is clean.

- [ ] **Step 7: Visual + a11y gates** — Lighthouse 95+ on the admin orders route (median-of-5, Vercel preview), Playwright at 1440/768/375 of the refund dialog, axe-core 0.

- [ ] **Step 8: Commit verification evidence + open PR (no admin merge).**

```bash
git add scripts/verify/refund-e2e.md && git commit -m "docs(refund): end-to-end verification evidence (test mode)"
git push -u origin feat/m6-refund-operator-path
gh pr create --title "feat(M6): refund operator path - webhook-driven reconcile, by-ticket, idempotent" --body "<evidence + operating rule: refunds always initiated in-app, never Stripe dashboard; [COORDINATION] merge before payout>"
```

---

## Self-Review notes

- Spec coverage: migration (T1-3), scope+RBAC (T4), amount (T5), idempotency key (T6), Phase A service (T7), webhook reconcile (T8), types (T9), UI (T10-12), apply+gates (T13), E2E+restore (T14). All spec sections mapped.
- Concurrency: order `FOR UPDATE` in `create_refund_request` (T2) + partial unique index (T1) cover refinement 1. Idempotency latch in `reconcile_refund` (T3).
- Open verification CHECKPOINTS flagged inline (column names `unit_price_cents`, `gateway_payment_id`, `payout_holds.metadata.order_id`) — confirm against baseline migrations during T2/T3 before applying.
- Orphan path operating rule (refinement 2) in T8 + PR. Apply commands use `supabase` directly (refinement 3) in T13.
