# M6 Phase 3 Scope: Destination Charges

**Branch:** `feat/m6-phase3-destination-charges`
**Session:** Backend / Logic / Payments (Session 1)
**Status:** scoped, implementation pending
**Authored:** 2026-05-02
**Predecessor:** M6 Phase 2 closed 2026-05-01 (see `docs/m6/audit/phase2/closure-report.md`)
**References:**
- `docs/m6/m6-implementation-plan.md` §1.2 to §1.7, §1.13
- `docs/m6/audit/phase2/closure-report.md`
- `supabase/migrations/20260428000001_m6_connect_schema.sql` (Phase 1 schema)
- `CLAUDE.md` (Session 1 file ownership and hard rules)

---

## 1. Goal

Wire Stripe Connect destination charges through the existing checkout so paid orders split funds between the organiser's connected Stripe account (the destination) and the EventLinqs platform (the application fee). Funds settle on the platform balance first, with the organiser portion held there until reserve release, then payout. Free events continue to bypass Stripe entirely.

The phase ends with:
- a working paid-checkout flow that produces a destination charge against a real Stripe Test mode connected account
- ledger and reserve writes triggered by `payment_intent.succeeded`
- a refund function that reverses the transfer and refunds the application fee
- a Live mode preparation checklist (no activation)

## 2. Non-goals

This phase deliberately excludes:

- Refund UI and the four-source allocation engine. Phase 3 ships the pure refund function (gateway + reverse_transfer + refund_application_fee). The cost-allocator (balance, reserve, gateway, platform float per §1.7) is Phase 4-5 scope. Refund triggered automatically only via existing `charge.refunded` webhook handler extension.
- Payouts dashboard UI (Phase 4).
- Reserve release scheduler. Phase 3 writes `payout_holds` rows on order success with `release_at = event_end + 3 business days`. Releasing them is a Phase 4 scheduled job.
- Tier 2 / Tier 3 differentiation. Tier 1 is the only path that runs in Phase 3. Tier promotion fires from `account.updated` (already shipped in Phase 2) and from event-volume thresholds (Phase 5/6).
- Live mode activation. The Live mode prep checklist is written; activation is founder-gated and ships when launch readiness lands.
- Admin overrides for application fee. Application fee = `PaymentCalculator.platform_fee_cents` for every connected charge.

## 3. Architectural decisions

### 3.1 Destination charges, not separate charges or direct charges

Per implementation plan §1.2, EventLinqs uses the destination charges pattern:

```
PaymentIntent.create({
  amount,
  currency,
  application_fee_amount,
  on_behalf_of: connected_account_id,
  transfer_data: { destination: connected_account_id },
  ...
})
```

Why destination charges:
- The platform stays on-record for the charge (statement descriptor "EVENTLINQS"/"ELINQS"), which keeps buyer support inside EventLinqs.
- Funds settle on the platform balance, so refunds can pull from any of the four sources (§1.7) without forcing immediate transfer reversal.
- Reporting is straightforward: one charge, one platform_fee row, one transfer.
- `on_behalf_of` ensures the charge appears in the connected account's reporting and that VAT and statement compliance use the organiser's country.

### 3.2 Application fee derived from `FeeBreakdown` (single source of truth)

The Phase 1 brief in this session's prompt mentioned tier-based percentages (Tier 1 8 percent, Tier 2 6 percent, Tier 3 5 percent). **This is not what the schema or the implementation plan says.** Per implementation plan §1.3 and §1.4:

- Tier 1 and Tier 2 use the same standard fee schedule (the one configured in `pricing_rules`).
- Tier 3 is admin-set per organiser (M7 admin panel).
- The application fee handed to Stripe derives from the same `FeeBreakdown` that produces `orders.platform_fee_cents`. Single source of truth, no drift.

**Decision:** Phase 3 reads from the existing `FeeBreakdown`. No new tier-percentage logic, no override path. If product later wants tier discounts, they ship as `pricing_rules` rows that `PaymentCalculator` reads.

**Composition decision (CRITICAL — flagged for founder review):**

Implementation plan §1.3 literally says: "the same integer that goes into `orders.platform_fee_cents` is what we hand to Stripe." Read literally, this means:

```
application_fee_amount = order.platform_fee_cents
```

But Stripe's destination-charge model deducts the Stripe processing fee from the platform's balance, not the destination's. With `application_fee_amount = platform_fee_cents` only, the destination receives `total_cents - platform_fee_cents` and EventLinqs nets `platform_fee_cents - actual_stripe_fee`. This works mathematically only if the organiser is meant to receive any buyer-paid `processing_fee_cents` as bonus revenue.

Run the math for a $100 ticket, $5 platform fee, $3 processing fee:

| Mode             | Buyer pays | platform_fee | processing_fee | App fee = `platform_fee` | Destination gets | EventLinqs nets | Organiser semantic |
|------------------|------------|-------------|----------------|--------------------------|------------------|------------------|---------------------|
| pass_to_buyer    | $108       | $5          | $3             | $5                       | $103             | ~$2 (after Stripe takes its $3 from $5) | Organiser gets buyer's $3 processing passthrough — not what "pass_to_buyer" means |
| absorb           | $100       | $5          | $3             | $5                       | $95              | ~$2              | Organiser supposed to absorb $3 processing but didn't |

To make both `fee_pass_type` modes mathematically correct, the application fee must be `platform_fee_cents + processing_fee_cents`:

| Mode             | Buyer pays | App fee = `platform + processing` | Destination gets | EventLinqs nets | Organiser semantic |
|------------------|------------|-----------------------------------|------------------|------------------|---------------------|
| pass_to_buyer    | $108       | $8                                | $100             | $5 (pure platform fee)               | Organiser receives exactly subtotal — correct |
| absorb           | $100       | $8                                | $92              | $5               | Organiser absorbed both fees — correct |

**Implemented decision:** `application_fee_amount = platform_fee_cents + processing_fee_cents`. This is the only formula that preserves both `fee_pass_type` semantics. The implementation plan's literal §1.3 wording is either a simplification that conflates "platform's total take" with "platform_fee_cents", or an oversight; either way the plan's intent is clearly that EventLinqs nets `platform_fee_cents` after Stripe costs and the organiser nets per `fee_pass_type` semantics. The implemented formula achieves both.

**This decision is flagged in the closure report for founder confirmation.** If founder rules the literal §1.3 interpretation must apply (`application_fee = platform_fee_cents` only), it is a one-line change.

**Coordination point on PaymentCalculator drift:** the `PaymentCalculator` schema drift (it references denormalised columns that do not exist in current `pricing_rules`) is owned by Session 2 (Hardening). Phase 3 consumes whatever `PaymentCalculator.calculate()` returns. If `platform_fee_cents` ever returns 0 for a paid event because the calculator hits stale schema, Phase 3 must surface that as an error rather than silently send 0 to Stripe. Pre-condition check below covers this.

### 3.3 Currency selection from `organisations.stripe_account_country`

The Stripe connected account country dictates the settlement currency. Phase 3 uses a strict map keyed off `organisations.stripe_account_country`:

| Country code | Charge currency |
|--------------|-----------------|
| AU           | AUD             |
| GB           | GBP             |
| US           | USD             |
| CA           | CAD             |
| NZ           | NZD             |
| IE           | EUR             |
| EU member states (AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE) | EUR |

Note: DK, BG, CZ, HU, PL, RO, SE have local currencies; for Phase 3, EUR is used as the platform-side settlement currency on Stripe. If product later wants per-country local-currency billing, it ships as a separate enhancement (Phase 5+ candidate).

**No new `region` column.** The `country` column already exists from Phase 1.

### 3.4 Idempotency strategy

Stripe requires idempotency keys to be unique per side-effecting request. Today, `gateway.createPaymentIntent` uses `idempotency_key = order_id`. This is correct for the current "one PI per order" path because `order_id` is generated once per checkout submission and never reused.

For destination charges, the same key works: a retry of the same checkout submission must produce the same PaymentIntent. The connected account, application fee, and transfer destination are all derived from immutable inputs (the order's `organisation_id` and the calculator output for that order's reservation), so a retry is byte-identical.

**Decision:** keep `idempotency_key = order_id`. Do not switch to a hash; it adds complexity for no behavioural change and would break the existing pattern that the rest of the codebase already understands. Add a unit test that asserts the same `(order_id, params)` pair produces the same Stripe call.

### 3.5 Free-event short-circuit

Free events (`fees.total_cents === 0`) skip the entire Stripe path. Today's `processCheckout` already does this. Phase 3 must keep this branch intact and add no Connect lookups, no application fee calculation, and no PaymentIntent creation for free events.

### 3.6 Pre-condition checks for paid orders

Before calling Stripe with destination-charge params, Phase 3 runs these checks. Any failure returns a typed error to the checkout action; the action surfaces a user-friendly message and aborts (no PI created):

1. `organisations.stripe_account_id` is non-null.
2. `organisations.stripe_charges_enabled` is true.
3. `organisations.stripe_account_country` is non-null and present in the currency map.
4. `organisations.payout_status` is `'active'` (not `'on_hold'` or `'restricted'`).
5. `FeeBreakdown.platform_fee_cents` is greater than 0 and less than `FeeBreakdown.total_cents`.
6. `FeeBreakdown.total_cents` matches the persisted `orders.total_cents` for the order (sanity check; the calculator must not drift between order creation and PI creation).

The publish-gate (`src/lib/events/publish-gate.ts`) already prevents publication of paid events when 1, 2, and 4 fail. Checking again at checkout time defends against the case where an organisation was promoted to `on_hold` after publication.

### 3.7 Webhook ledger writes (`payment_intent.succeeded`)

When `payment_intent.succeeded` arrives for a destination charge, the existing `handlePaymentSucceeded` handler is extended to:

Confirmed `orders` schema (from `supabase/migrations/20260101000001_baseline_schema.sql:590-637`):
`subtotal_cents`, `addon_total_cents`, `platform_fee_cents`, `processing_fee_cents`, `tax_cents`, `discount_cents`, `total_cents`, `currency`, `fee_pass_type`. There is no `organiser_share_cents` or `gross_cents` column. Phase 3 derives them.

**Derived values (locked):**

```
organiser_share_cents = total_cents - platform_fee_cents - processing_fee_cents
                      (i.e. total minus the application_fee_amount sent to Stripe)

gross_revenue_cents   = subtotal_cents + addon_total_cents - discount_cents
                      (i.e. raw face-value ticket and addon revenue, before fees and tax)

reserve_amount_cents  = floor(organiser_share_cents * reserve_percent_for_tier / 100)
```

Webhook handler steps:

1. Insert one `organiser_balance_ledger` row (positive credit):
   - `delta_cents` = `organiser_share_cents`
   - `currency` = order currency
   - `reason` = `'order_confirmed'`
   - `reference_type` = `'order'`
   - `reference_id` = `order.id`
   - `metadata` = `{ stripe_payment_intent_id, stripe_charge_id, application_fee_amount_cents, gross_revenue_cents }`
2. Insert one `payout_holds` row:
   - `hold_type` = `'reserve'`
   - `amount_cents` = `reserve_amount_cents`
   - `currency` = order currency
   - `release_at` = `event_end_at + 3 business days` (computed; Phase 4 ships the release job)
   - `event_id` = `order.event_id`
   - `metadata` = `{ stripe_payment_intent_id, source: 'auto_reserve', tier: payout_tier_at_time }`
3. Insert one `organiser_balance_ledger` row mirroring the reserve hold:
   - `delta_cents` = `-reserve_amount_cents` (negative debit)
   - `currency` = order currency
   - `reason` = `'reserve_hold'`
   - `reference_type` = `'hold'`
   - `reference_id` = the hold row's id
   - `metadata` = `{ stripe_payment_intent_id, order_id }`
4. Increment `organisations.hold_amount_cents` by `reserve_amount_cents`.
5. Increment `organisations.total_volume_cents` by `gross_revenue_cents`.
6. Increment `organisations.total_event_count` by 1 only when this is the first `confirmed` order for `order.event_id` (separate query to detect; idempotent because the webhook is deduped).

**Idempotency on the webhook side:** the existing `webhook_events` table already deduplicates by Stripe event id, so the ledger writes only fire once per Stripe `event.id`. Adding `(reference_type, reference_id, reason)` uniqueness on the ledger table is out of scope for Phase 3 (would require a migration and may conflict with legitimate adjustment rows); the `webhook_events` dedup is the gate.

### 3.8 Reserve percentage by tier

| Tier   | Reserve percent | Source                                |
|--------|-----------------|---------------------------------------|
| tier_1 | 20              | implementation plan §1.5              |
| tier_2 | 20              | implementation plan §1.5              |
| tier_3 | 10              | implementation plan §1.5              |

A small helper `getReservePercent(payoutTier)` returns the integer percent. Phase 3 only exercises `tier_1` (per §3 above), but Tier 3 is included so Phase 4+ does not need a refactor.

### 3.9 Refund function

Phase 3 ships `src/lib/payments/refund.ts` exporting one function:

```
refundOrder(input: {
  orderId: string,
  amountCents: number,           // partial supported
  reason: 'requested_by_buyer' | 'duplicate' | 'fraudulent' | 'event_cancelled',
  initiatedBy: 'buyer' | 'organiser' | 'admin' | 'system',
  metadata?: Record<string, unknown>,
}): Promise<RefundResult>
```

It calls `stripe.refunds.create` with:
- `payment_intent` = order's `gateway_payment_id`
- `amount` = `amountCents`
- `reverse_transfer: true` (pulls funds back from the connected account)
- `refund_application_fee: true` (refunds the platform's application fee proportionally)
- `metadata.order_id`, `metadata.initiated_by`, `metadata.reason`

Idempotency key = `refund:${orderId}:${amountCents}:${Date.now()}` for now (tracked in `refunds` table; full uniqueness requires a follow-up table extension in Phase 4). Each refund is a discrete Stripe call.

**Phase 3 does not extend the `charge.refunded` webhook handler beyond what already exists (waitlist promotion).** Ledger writes for refunds (the four-source allocator) are Phase 4-5 scope. Phase 3 surfaces the refund response so callers can persist the refund row, but the cost-allocation ledger entries land later.

### 3.10 Stripe API version and adapter changes

`StripeAdapter.createPaymentIntent` is extended to accept three optional fields:

- `connected_account_id?: string`
- `application_fee_cents?: number`
- `on_behalf_of?: string`

When all three are present, the adapter passes `transfer_data.destination`, `application_fee_amount`, and `on_behalf_of`. When any are missing, it falls back to the platform-only path (used today by free-event PaymentIntents... except free events skip the adapter; the fallback exists only for safety and surfaces a developer error in tests).

API version stays `'2026-03-25.dahlia'`.

## 4. Files touched

### Created

- `src/lib/payments/application-fee.ts` (calculator wrapper, currency map, reserve percent helper, pre-condition checker)
- `src/lib/payments/create-destination-charge.ts` (orchestration: load org, run pre-conditions, call adapter)
- `src/lib/payments/refund.ts` (refund function)
- `tests/unit/payments/application-fee.test.ts`
- `tests/unit/payments/create-destination-charge.test.ts`
- `tests/unit/payments/refund.test.ts`
- `tests/unit/webhook-handlers/payment-intent-succeeded-ledger.test.ts`
- `tests/integration/checkout/destination-charge-flow.test.ts` (mocked Stripe)
- `tests/e2e/checkout/live-stripe-test-mode.test.ts` (gated by env, real Stripe Test mode call)
- `docs/m6/phase3/scope.md` (this file)
- `docs/m6/phase3/closure-report.md` (end of phase)
- `docs/m6/phase3/live-mode-prep-checklist.md`

### Modified

- `src/lib/payments/gateway.ts` (extend `CreatePaymentIntentParams`)
- `src/lib/payments/stripe-adapter.ts` (use new params)
- `src/app/actions/checkout.ts` (call `createDestinationCharge` for paid events)
- `src/app/actions/squad-checkout.ts` (same)
- `src/app/api/webhooks/stripe/route.ts` (extend `handlePaymentSucceeded` with ledger and reserve writes)
- `src/components/checkout/checkout-summary.tsx` (polish service-fee line, ensure parity with Phase 3 contract)

### Forbidden / not touched

- `src/types/database.ts` (SHARED, requires coordination — not needed if existing types are sufficient)
- `next.config.ts`, `package.json`, `package-lock.json` (SHARED)
- `src/components/admin/**`, `src/app/admin/**` (Session 3)
- `src/lib/redis/**`, `src/lib/email/**`, `src/lib/observability/**` (Session 2)

If `src/types/database.ts` turns out to need new types not already present (the summary indicates ledger and hold types are already there), this becomes a `[SHARED]` commit and triggers the coordination protocol.

## 5. Test plan

### 5.1 Unit (Vitest, no network)

- application-fee: currency map for every supported country; reserve percent per tier; pre-condition failures (missing account id, charges disabled, on-hold status, zero platform fee); free-event short-circuit returns null params.
- create-destination-charge: org lookup, pre-condition pass, params correctly assembled, idempotency key passthrough, error on missing org row.
- refund: full refund call shape, partial refund, metadata stamped, error propagation.
- webhook ledger handler: ledger row + reserve hold + mirror ledger row written on success; first-event-volume increment; no-op on duplicate event id (existing dedup).

### 5.2 Integration (mocked Stripe)

- Full `processCheckout` path for a paid event: pre-conditions pass, adapter receives destination charge params, returns mock client_secret, order moves to `pending_payment`. Free-event path unchanged.

### 5.3 E2E (live Stripe Test mode, gated)

Following the Phase 2 Track A pattern:
- Use the existing US Express test account `acct_1TSG4KGSxBgLYjFv` (verified onboarded).
- Create a real test event tied to that organisation, real reservation, real PI via destination charge.
- Confirm the PI server-side, fire the local `stripe-cli` listener, observe the `payment_intent.succeeded` webhook arrive.
- Assert: order moves to `confirmed`, ledger row exists, reserve hold exists, organisation totals incremented, application_fee_amount on the Stripe charge matches `platform_fee_cents` exactly.
- Refund half the order via `refundOrder()`. Assert: Stripe refund created with `reverse_transfer: true` and `refund_application_fee: true`; check Stripe Dashboard shows transfer reversal and application-fee refund.

E2E test is gated by `M6_E2E_LIVE=1` (matches Phase 2 convention) and skipped in CI unless the env is set.

### 5.4 Quality gates (every commit)

- `npm run lint` clean
- `npm run typecheck` clean
- `npm run build` clean
- `npm test` (unit + integration) green

## 6. Definition of done

Phase 3 is closed when all of the following are true:

1. All A-H deliverables landed and tests green.
2. E2E live Stripe Test mode test passes end-to-end with assertion log captured to `docs/m6/phase3/e2e-results.txt`.
3. Lighthouse mobile on `/checkout/[reservation_id]` (with a real test reservation) records Perf ≥ 95, A11y/BP/SEO 1.0, axe 0. Median of 5 runs against Vercel preview, never localhost.
4. `docs/m6/phase3/closure-report.md` written with: deliverables checklist, evidence pointers, test artefacts, known follow-ups for Phase 4-5.
5. `docs/m6/phase3/live-mode-prep-checklist.md` written (no activation, founder-gated).
6. `[GATE] Phase 3 complete` posted to `docs/sessions/backend/progress.log` with closure report pointer.
7. Branch pushed; STOP for founder review before Phase 4 starts.

## 7. Risks and unknowns

- **`orders` schema field names.** Phase 3 implementation will confirm the actual columns for organiser share, gross, platform fee. If the schema doesn't carry the split, Phase 3 derives it from `FeeBreakdown` fields persisted at order creation.
- **`PaymentCalculator` schema drift.** If `platform_fee_cents` returns wrong values due to Session 2's pending pricing_rules reconciliation, the Phase 3 pre-condition check fails closed. Phase 3 does not paper over the drift.
- **Multi-currency reserve currency.** Reserve currency = order currency = settlement currency. EU member states with local currencies (DK, SE, etc.) settle in EUR; reserves are EUR. If product later wants local-currency reserves, that is a multi-currency settlement project, not a Phase 3 fix.
- **Reserve release scheduler is Phase 4.** Reserves accumulate from Phase 3 onwards. Until Phase 4 ships the release job, reserves stay held. This is acceptable because Phase 3 in production sees zero real organisers (live mode is not on) and Phase 4 lands before launch.
- **Statement descriptor on connected account.** Connected accounts inherit their own statement descriptor. The platform's "EVENTLINQS" descriptor only applies to the platform side. Phase 3 does not touch connected account branding; that is Phase 5+ if required.
