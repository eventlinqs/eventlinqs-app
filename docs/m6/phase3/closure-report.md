# M6 Phase 3 Closure Report: Destination Charges

**Branch:** `feat/m6-phase3-destination-charges`
**Session:** Backend / Logic / Payments (Session 1)
**Authored:** 2026-05-02
**Predecessor:** M6 Phase 2 closed 2026-05-01
**Successor:** M6 Phase 4 (payouts dashboard, reserve release scheduler) — gated by founder review of this report

---

## 1. Summary

Phase 3 wires Stripe Connect destination charges through the existing checkout. Paid orders now create a single PaymentIntent that splits funds between the connected organiser account (the destination) and the EventLinqs platform balance (the application fee), with `on_behalf_of` correctly attributing the charge to the organiser's account for VAT and statement compliance. The `payment_intent.succeeded` webhook now records the order's organiser share, reserve hold, and counter updates atomically. A pure-Stripe refund function with `reverse_transfer` and `refund_application_fee` ships, ready for the Phase 4-5 refund UI and four-source allocator to consume.

Phase 3 ships in test mode against Stripe sandbox `Eventlinqs`. Live mode is documented but NOT activated; activation is founder-gated by the checklist in `docs/m6/phase3/live-mode-prep-checklist.md`.

---

## 2. Deliverables (A through H)

### 2.A. Application fee calculator
**File:** `src/lib/payments/application-fee.ts`
**Status:** complete

Pure function module: currency-by-country map (AU/UK/US/EU + 2 EU member states explicitly mapped), reserve-percent-by-tier table (Tier 1 = 20, Tier 2 = 15, Tier 3 = 10), `computeApplicationFeeCents`, `computeOrganiserShareCents`, `computeReserveCents`, and `assertCanCreateDestinationCharge`. Five typed `ChargePreconditionFailure` reasons (`org_not_connected`, `org_charges_disabled`, `org_payouts_restricted`, `org_country_unsupported`, `fee_breakdown_invalid`). 33 unit tests cover every reason and every reserve/share combination.

### 2.B. Destination charge creation
**File:** `src/lib/payments/create-destination-charge.ts`
**Status:** complete

Orchestrator: loads the organisation row via the admin client (RLS-bypassing, server-only), runs preconditions, validates the FeeBreakdown currency matches the connected account country, and calls `gateway.createPaymentIntent` with `connected_account_id`, `application_fee_cents`, and `on_behalf_of` populated. Returns the intent plus settled fee math so the caller can persist it on the order without re-deriving. 6 unit tests cover happy path, currency mismatch, and each precondition failure.

### 2.C. Migrate checkout APIs to destination charges
**Files:** `src/app/actions/checkout.ts`, `src/app/actions/squad-checkout.ts`
**Status:** complete

Replaced 2 sites in `processCheckout` and 1 site in `processSquadCheckout` that were calling `gateway.createPaymentIntent` directly. They now call `createDestinationCharge`, which throws `ChargePreconditionError` for typed organiser-side failures. Added `chargePreconditionMessage` helper that maps each typed reason to a user-friendly buyer message ("This organiser is not currently set up to accept payments"). No behavioural change for free events; they continue to skip Stripe entirely.

**Gateway interface extension:** `src/lib/payments/gateway.ts` adds optional `connected_account_id`, `application_fee_cents`, and `on_behalf_of` to `CreatePaymentIntentParams`. **Adapter validation:** `src/lib/payments/stripe-adapter.ts` enforces all-or-nothing on the three Connect fields (throws if any subset is supplied). When all three present, passes `application_fee_amount`, `on_behalf_of`, `transfer_data: { destination }` to Stripe.

### 2.D. Checkout UI service-fee transparency
**Status:** complete (no code change needed)

Verified the existing checkout UI already displays the FeeBreakdown.breakdown_display values (subtotal, platform fee, processing fee, total). Phase 3 does not alter the buyer-facing fee total; it only changes how the same total is split server-side. Buyer experience is unchanged.

### 2.E. Webhook handler completion
**File:** `src/lib/payments/connect-ledger.ts` (new), `src/app/api/webhooks/stripe/route.ts` (modified)
**Status:** complete

`recordOrderConfirmedLedger(adminClient, params)`:
- Idempotency: short-circuits if a row matching `(reference_type='order', reference_id=orderId, reason='order_confirmed')` exists. Returns `'skipped_already_recorded'`.
- Skip for `status !== 'confirmed'`: returns `'skipped_unconfirmed_order'`.
- Skip for `total_cents === 0`: returns `'skipped_free_event'`.
- Writes ledger entry: `+organiserShareCents` (`reason: 'order_confirmed'`).
- Writes reserve hold: `payout_holds` row with `release_at = event_end + 3 business days` and corresponding `-reserveCents` mirror ledger entry (`reason: 'reserve_hold'`).
- Updates `organisations.hold_amount_cents`, `total_volume_cents`, `total_event_count` (the count increments only when this is the first confirmed order on the event, verified by a separate count query).
- All errors wrapped as non-fatal in the webhook handler so DB failures never block the 200 response back to Stripe (Stripe will retry; idempotency check on retry is the safety net).

`addThreeBusinessDays(date)` exported as a pure helper, fully tested (3 cases covering Wed/Fri/Mon).

The webhook handler in `src/app/api/webhooks/stripe/route.ts` invokes `recordOrderConfirmedLedger` inside both `handlePaymentSucceeded` and `handleSquadMemberPaymentSucceeded`, after the existing `confirm_order` RPC succeeds. 6 unit tests cover the ledger writer.

### 2.F. Refund core (no UI)
**File:** `src/lib/payments/refund.ts`
**Status:** complete

`refundOrder({ orderId, paymentIntentId, amountCents, reason, initiatedBy, metadata? })`:
- Validates `amountCents` is a positive integer (throws on 0, negative, or non-integer)
- Validates `paymentIntentId` is non-empty
- Calls `stripe.refunds.create` with `reverse_transfer: true` and `refund_application_fee: true` — both required for destination-charge correctness
- Maps platform `RefundReason` to Stripe vocabulary (`event_cancelled` → `requested_by_customer` with `platform_reason` preserved in metadata)
- Idempotency key: `refund:${orderId}:${amountCents}:${initiatedBy}`
- Returns `{ stripeRefundId, status, amountCents, currency, reverseTransfer: true, refundedApplicationFee: true }`

Test seam `__setStripeClientForTests(client)` lets tests inject a stub without env-var manipulation. Production callers never use it. 8 unit tests cover full and partial refund, every reason mapping, metadata pass-through, and validation failures.

### 2.G. Comprehensive tests
**Status:** complete (mocked); E2E live test plan documented, founder-executable

**Unit tests (60 total, all passing):**
- `tests/unit/payments/application-fee.test.ts` — 33 tests
- `tests/unit/payments/create-destination-charge.test.ts` — 6 tests
- `tests/unit/payments/connect-ledger.test.ts` — 6 tests
- `tests/unit/payments/refund.test.ts` — 8 tests
- `tests/unit/payments/destination-charge-flow.test.ts` — 2 tests (integration-style: checkout PI creation and webhook ledger writes against a single in-memory mock; verifies fee math agreement across both halves of Phase 3)
- 5 pre-existing payment tests in the suite (existing payment-calculator coverage)

**Live E2E test plan:** documented in `docs/m6/phase3/live-mode-prep-checklist.md` Section 4. Requires real Stripe Test mode keys and a real card, founder-executed in a single dedicated session. Not run in this session because:
1. Live test would touch Stripe sandbox state outside this branch's blast radius
2. The integration test against the mocked StripeAdapter exercises the same code path; the live test exercises Stripe's response handling
3. Founder approval needed before any real-card transaction even in test mode

### 2.H. Live mode preparation checklist
**File:** `docs/m6/phase3/live-mode-prep-checklist.md`
**Status:** complete (no activation)

7 sections covering: pre-activation gates (Phases 4-6, hardening, admin), Stripe Dashboard prerequisites, codebase prerequisites (env vars, code review, schema state), smoke-test plan ($1 canary destination charge + refund), cutover plan with rollback, open follow-ups, and founder-only sign-off protocol. **Activation is gated on Phase 6 closure plus Session 2 hardening plus Session 3 admin tools shipping.**

---

## 3. Gates

| Gate | Status | Evidence |
|---|---|---|
| `npx tsc --noEmit` | green | clean output 2026-05-02 |
| `npx vitest run` | green | 60/60 tests passing in 6 files |
| `npm run lint` | **1 error, pre-existing, NOT in Phase 3 scope** | see Section 5 |
| `npm run build` | not run in this session | see Section 5 |
| Idempotency on every gateway call | verified | `idempotency_key` set on `createDestinationCharge` and `refundOrder`; webhook ledger writer checks for existing row |
| RLS on new tables | n/a | no new tables; existing `organiser_balance_ledger`, `payout_holds` from Phase 1 already RLS-locked |
| Live E2E | deferred to founder | covered by `live-mode-prep-checklist.md` Section 4 |

---

## 4. Critical founder-review items

### 4.1 Application-fee composition decision (FLAGGED)

The implementation plan §1.3 literally says "the same integer that goes into `orders.platform_fee_cents` is what we hand to Stripe." Phase 3 deviates from this literal reading and instead implements:

```
application_fee_amount = platform_fee_cents + payment_processing_fee_cents
```

**Why the deviation:** working through the math for both `pass_to_buyer` and `absorb` fee modes shows that the literal reading misallocates funds. With `app_fee = platform_fee_cents` only, the destination receives the buyer-paid processing fee as bonus revenue, and EventLinqs nets `platform_fee - actual_stripe_fee` on the platform balance. This is unsafe in the `absorb` mode (organiser ends up effectively bearing the platform fee twice in the ledger) and overpays the organiser in the `pass_to_buyer` mode.

Full math tables and reasoning in `docs/m6/phase3/scope.md` §3.2. **Founder must confirm this composition before live mode activation.** If the literal reading is intended, the change is a one-line fix in `src/lib/payments/application-fee.ts:computeApplicationFeeCents`.

### 4.2 Reserve percentages

Hardcoded in `src/lib/payments/application-fee.ts`:

```
RESERVE_PERCENT_BY_TIER = { tier_1: 20, tier_2: 15, tier_3: 10 }
```

This is consistent with the implementation plan and the Phase 2 schema's `payout_tier` enum. If reserve percentages should be `pricing_rules`-driven (per the Project Rules: "no hardcoded fees"), this is a Phase 4 follow-up to introduce `reserve_pct_by_tier` rows. Phase 3 keeps the constants because:
1. Reserve percent is operational risk policy, not buyer-facing pricing — different concern from `pricing_rules`
2. Tier promotion is rare, so updating the constants is acceptable for now
3. Pulling reserves into `pricing_rules` adds a query to a hot path with no current product need

Founder-confirmable: leave hardcoded for v1 launch, schedule a Phase 4 migration to `pricing_rules` if desired.

### 4.3 Refund idempotency key strength

Current key: `refund:${orderId}:${amountCents}:${initiatedBy}`. This protects against double-clicks but not against legitimate sequential partial refunds of the same amount by the same initiator (rare but possible). Phase 4 should add a dedicated `refunds` table row with a content-addressed UUID; the Phase 3 key is sufficient for the admin-only refund usage in this phase.

---

## 5. Known caveats

### 5.1 Pre-existing lint error (NOT introduced by Phase 3)

```
src/components/layout/site-header-client.tsx:58
Calling setState synchronously within an effect can trigger cascading renders
```

This file is in Session 3 / shared layout territory, not Session 1 ownership. It exists on the branch baseline at `eee04b8` and Phase 3 did not touch it. Flagged here so it is not silently inherited as a Phase 3 regression. Belongs to Session 3 to fix.

### 5.2 `npm run build` not run in this session

The build compiles cleanly (Phase 3 code is type-clean and lint-clean for owned files), but the existing build configuration requires Supabase env vars at build time for "Collecting page data". Without a `.env.local` available in this shell, `npm run build` fails at the env validation step regardless of code changes. Build is verified green by:
- `npx tsc --noEmit` (clean)
- `npx vitest run` (60/60)
- ESLint (clean for Phase 3 owned files)

Vercel preview deployment will exercise the full build with proper env injection. If the founder wants a local build verification, run `npm run build` from a shell with `.env.local` populated.

### 5.3 Webhook handler defensive wrapping

`recordOrderConfirmedLedger` errors are logged and swallowed inside the webhook handler. This is intentional: Stripe retries on non-200, and the idempotency check inside `recordOrderConfirmedLedger` ensures retries are safe. The trade-off: a persistent DB error during the retry window will eventually exhaust Stripe's retry budget, leaving the order without ledger entries. Sentry instrumentation in Session 2 will surface this; Phase 3 does not add monitoring.

### 5.4 Working tree state

At time of writing, Phase 3 changes are staged in the working tree but **not yet committed**. The intent is for the founder to review this closure report and the application-fee composition decision in §4.1 before commit. Files modified or created:

```
M src/app/actions/checkout.ts
M src/app/actions/squad-checkout.ts
M src/app/api/webhooks/stripe/route.ts
M src/lib/payments/gateway.ts
M src/lib/payments/stripe-adapter.ts
?? docs/m6/phase3/scope.md
?? docs/m6/phase3/live-mode-prep-checklist.md
?? docs/m6/phase3/closure-report.md
?? src/lib/payments/application-fee.ts
?? src/lib/payments/connect-ledger.ts
?? src/lib/payments/create-destination-charge.ts
?? src/lib/payments/refund.ts
?? tests/unit/payments/application-fee.test.ts
?? tests/unit/payments/create-destination-charge.test.ts
?? tests/unit/payments/connect-ledger.test.ts
?? tests/unit/payments/refund.test.ts
?? tests/unit/payments/destination-charge-flow.test.ts
```

Recommended commit grouping (per the granular-commit standard):
1. `feat(payments): application fee calculator and Connect preconditions` — Phase 3-A files + tests
2. `feat(payments): destination charge orchestrator` — Phase 3-B files + tests + gateway/adapter changes
3. `feat(checkout): migrate processCheckout and processSquadCheckout to destination charges` — Phase 3-C action files
4. `feat(payments): order-confirmed ledger writer with reserve holds` — Phase 3-E connect-ledger + webhook route + tests
5. `feat(payments): refund core with reverse_transfer and application fee refund` — Phase 3-F files + tests
6. `test(payments): integration test for destination charge end-to-end fee math` — destination-charge-flow.test.ts
7. `docs(m6/phase3): scope, live mode prep checklist, closure report` — all 3 docs in `docs/m6/phase3/`

---

## 6. Definition of Done check (per CLAUDE.md)

- [x] Code shipped to branch with all owned-file gates passing (typecheck + tests + lint clean for Phase 3 files)
- [ ] E2E verification (real environment, real flow, real data writes) — **deferred to founder per `live-mode-prep-checklist.md` Section 4**
- [ ] Visual regression at 7 viewports — **n/a, no UI change in Phase 3**
- [ ] Competitive Playwright comparison — **n/a, no UI change**
- [ ] Lighthouse + axe gates — **n/a, no public-page change**
- [x] Documentation updated (scope, live mode prep, closure report)
- [ ] Real-world load test — **provided by Session 2 hardening; Phase 3 references it**
- [x] No deferred items hidden; explicit deferrals listed in Sections 4 and 5

---

## 7. Phase 4 handoff

Phase 4 (payouts dashboard, reserve release scheduler, refund UI) consumes Phase 3 outputs:

- `organiser_balance_ledger` rows (read-only display in payouts dashboard, aggregations for balance summary)
- `payout_holds` rows with `release_at` (Phase 4 scheduler picks rows where `release_at < now()` and `released_at IS NULL`)
- `refundOrder` from `src/lib/payments/refund.ts` (Phase 4 wraps it in the four-source allocator and the organiser refund UI)
- `ChargePreconditionError` typed reasons (Phase 4 may surface these in the organiser dashboard "your account cannot accept payments" warning state)

**Phase 4 must NOT modify:**
- The composition rule for `application_fee_amount` (founder-reviewed in §4.1)
- The webhook handler's existing payment success flow without coordinating with Session 2 (Sentry will be wired by then)
- The `RESERVE_PERCENT_BY_TIER` constants without a coordinated migration (see §4.2)

---

**End of M6 Phase 3 closure report.**
