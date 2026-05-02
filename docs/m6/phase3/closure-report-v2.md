# M6 Phase 3 Closure Report v2 (Rework)

**Branch:** `feat/m6-phase3-destination-charges`
**Session:** Backend / Logic / Payments (Session 1)
**Authored:** 2026-05-02
**Supersedes:** `docs/m6/phase3/closure-report.md` (v1, REVOKED by founder review on 2026-05-02)
**Predecessor:** M6 Phase 2 closed 2026-05-01

---

## 0. Why v2 exists

The v1 implementation shipped Phase 3 against `RESERVE_PERCENT_BY_TIER` constants in `application-fee.ts` and assumed a wide-format `pricing_rules` row that the schema does not actually have. The founder rejected closure for two reasons:

1. The platform's "no hardcoded fees" rule is non-negotiable. Reserve percentages, processing fees, payout schedules, and application-fee composition mode all must be database-driven.
2. The tier_1/tier_2/tier_3 system does not match industry practice. Per-region defaults with per-organisation overrides match how Stripe, Eventbrite, and Ticketmaster actually price connected accounts.

Investigation surfaced a latent bug in `payment-calculator.ts`: it was reading wide-format columns (`market_code`, `platform_fee_percent`, `payment_processing_percent`, etc.) that do not exist on the long-format `pricing_rules` table that production has been running since baseline. No money flowed through the buggy code path because Phase 3 had not yet shipped, but the calculator was silently falling back to defaults on every cart load.

v2 fixes both: it removes every hardcoded percentage, deletes the tier-based reserve system, fixes the calculator's wide-format read, and routes every fee/reserve/payout-policy decision through a single pricing-rules service that walks a precedence ladder over the long-format table.

---

## 1. What changed in v2

### 1.1 Database (`supabase/migrations/20260502000002_pricing_rules_extension.sql`, idempotent)

- Added `pricing_rules.organisation_id UUID NULL` with FK to `organisations(id) ON DELETE CASCADE` for per-org enterprise overrides.
- Replaced the `rule_type` CHECK constraint with the extended set: original 6 types plus `processing_fee_percentage`, `processing_fee_fixed_cents`, `processing_fee_pass_through`, `reserve_percentage`, `payout_schedule_days`, `application_fee_composition_mode`.
- Extended `value_type` CHECK to include `'integer'` for the new mode/code rules.
- Two partial unique indexes covering region defaults (organisation_id IS NULL) and per-org overrides (organisation_id IS NOT NULL) so PostgreSQL's NULLS DISTINCT default semantics do not silently allow duplicates.
- One lookup-shaped composite index `(rule_type, country_code, currency, organisation_id, effective_from)`.
- Seeded all 6 new rule types for AU/GB/US/NG/GH/KE/ZA/GLOBAL per founder spec. Idempotent via `ON CONFLICT DO NOTHING`. African seeds are present even though Connect onboarding for those regions is M11; the rows are platform-side billing defaults, not Connect activation.

### 1.2 New module `src/lib/payments/pricing-rules.ts`

Single read path for every fee, reserve, and payout-policy value the platform charges. Walks a 4-level precedence ladder: per-org override → region default → GLOBAL with same currency → GLOBAL with any currency → throws `PricingRuleNotFoundError`.

- 60-second Upstash Redis cache with explicit invalidation hook (`invalidatePricingRule`) for admin-panel mutations to call after every UPDATE/INSERT.
- Falls back to direct DB reads when Redis is unavailable so tests and local dev work without Redis credentials.
- Convenience helpers: `getPlatformFeePercentage`, `getPlatformFeeFixedCents`, `getProcessingFeePercentage`, `getProcessingFeeFixedCents`, `getProcessingFeePassThrough`, `getReservePercentage`, `getPayoutScheduleDays`, `getApplicationFeeCompositionMode`.
- Typed return values for the integer-coded rules: `ProcessingFeePassThrough = 0|1|2`, `ApplicationFeeCompositionMode = 1|2`. Out-of-range values throw rather than silently coerce.

### 1.3 Refactor `src/lib/payments/application-fee.ts`

- Deleted `RESERVE_PERCENT_BY_TIER` and the entire tier-based reserve helper.
- Kept `CONNECT_CURRENCY_MAP` (structural Stripe Connect country-to-currency map; not pricing policy).
- `computeApplicationFeeCents(fees, countryCode, currency, organisationId)` is now async and reads `application_fee_composition_mode` from pricing_rules.
- Added `composeApplicationFee(fees, mode)` pure synchronous helper for tests and callers that already know the mode.
- `computeOrganiserShareCents` and `computeReserveCents` are now async and read from pricing_rules.
- `assertCanCreateDestinationCharge` validates against composition mode 1 (the strictest case); if mode-1-passing, mode-2 is implicitly safe because mode 2's app fee is always smaller.

### 1.4 Application-fee composition modes

The platform now switches between two modes per region/per org without code changes:

- **Mode 1 (`stripe_fee_inclusive`, default):** `app_fee = platform_fee + processing_fee`. Buyer-paid processing fee covers Stripe's actual cost from the platform balance; platform stays cash-flow positive on every charge. This is what v1 implemented and what the global default seed enforces.
- **Mode 2 (`stripe_fee_exclusive`):** `app_fee = platform_fee`. Buyer-paid processing fee bonuses to the organiser; Stripe's actual cost still comes from the platform balance, so the platform subsidises processing out of its commission. Use sparingly — for marquee organisers, partner deals, or jurisdictions where pass-through is regulated.

This resolves v1's §4.1 "composition deviation" item by making it a database setting rather than a code decision.

### 1.5 Full rewrite `src/lib/payments/payment-calculator.ts`

Fixed latent wide-format bug. New signature:

```
calculate(tickets, addons, currency, fee_pass_type?, discount_cents=0, organisationId?)
```

- Reads `platform_fee_percentage`, `platform_fee_fixed`, `processing_fee_percentage`, `processing_fee_fixed_cents`, `processing_fee_pass_through` from pricing_rules in parallel via Promise.all.
- When `fee_pass_type` is undefined, resolves it from `processing_fee_pass_through` (region/org default). Caller can override (per-event organiser setting).
- Tax read fixed to interpret `tax_rules.tax_rate` as a fraction (0.10 = 10%) and convert to percent.
- `breakdown_display` now exposes `platform_fee` and `processing_fee` as separate fields (replacing the lumped `fees` field) so checkout UI can render Eventbrite-style separate lines.

### 1.6 Refactor `src/lib/payments/connect-ledger.ts`

- Removed `payout_tier` from the org load. `loadOrg` now selects `stripe_account_country` only.
- Reserve percent and payout-schedule days resolved in parallel from pricing_rules (`getReservePercentage`, `getPayoutScheduleDays`) keyed by the org country.
- Renamed `addThreeBusinessDays(date) → addBusinessDays(date, n)`. Kept `addThreeBusinessDays` as a backward-compatible wrapper for existing tests.
- `computeReleaseAt(eventEndDateIso, businessDays)` now takes the business-days count from the pricing rule.
- Reserve hold metadata records `reserve_percent`, `payout_schedule_days`, `order_id`, plus the existing `stripe_payment_intent_id` / `stripe_charge_id` so the source of truth survives in the row.

### 1.7 Update `src/lib/payments/create-destination-charge.ts`

- Removed `payout_tier` from `OrgChargeFields` and from the SELECT.
- Removed `payoutTier` from `CreateDestinationChargeResult`.
- `applicationFeeCents` now resolved via `await computeApplicationFeeCents(fees, country, currency, organisationId)`.

### 1.8 Buyer checkout UI: split fee display

`src/components/checkout/checkout-summary.tsx` now renders two distinct lines instead of a lumped "Service fee":

- **Service fee** = `breakdown_display.platform_fee` (EventLinqs commission)
- **Payment processing fee** = `breakdown_display.processing_fee` (Stripe cost passed to buyer)

Eventbrite/DICE pattern. Each line is conditional on `> 0`, so absorb-mode events display neither (with the existing "All fees included in ticket price" footnote).

### 1.9 Call-site wiring

All 4 PaymentCalculator call sites now pass `event.organisation_id`:

- `src/app/actions/checkout.ts:213` (GA processCheckout)
- `src/app/actions/checkout.ts:521` (seat path)
- `src/app/actions/squad-checkout.ts:106` (squad checkout)
- `src/app/checkout/[reservation_id]/page.tsx:106,164` (initial fees on page load, both seat and GA paths)

### 1.10 Tests

Updated the entire Phase 3 suite plus added a new pricing-rules service test:

- `tests/unit/payments/application-fee.test.ts`: rewritten for async signatures, mocks pricing-rules service, verifies mode 1 and mode 2 composition, tests per-org reserve override.
- `tests/unit/payments/create-destination-charge.test.ts`: rewritten with pricing-rules mock, `payout_tier` removed from fixtures, mode 1 / mode 2 tested separately.
- `tests/unit/payments/connect-ledger.test.ts`: rewritten with pricing-rules mock, `payout_tier` swapped for `stripe_account_country`, reserve override test added.
- `tests/unit/payments/destination-charge-flow.test.ts`: integration test updated for new fixtures and pricing-rules mock.
- `tests/unit/payments/pricing-rules.test.ts` (new): precedence ladder (levels 1-5), typed value coercion (range checks for `0|1|2` and `1|2`), caching (hit/miss/invalidate/Redis-unavailable fallback).

**Vitest:** 73 tests across 6 files, all passing. Run with `npx vitest run tests/unit/payments/`.

---

## 2. Gates

| Gate | Status | Evidence |
|---|---|---|
| TypeScript | clean | `npx tsc --noEmit` produces no output |
| Vitest (payments) | 73/73 passing | `npx vitest run tests/unit/payments/` |
| ESLint (Phase 3 owned files) | clean | `npm run lint` produces no Phase 3 file errors |
| Next.js compile | clean | `npm run build` reports `✓ Compiled successfully` |
| Next.js page-data collection | not exercised | This worktree has no `.env.local`; collection requires `supabaseUrl`. Vercel preview deploy will exercise the full pipeline. |

### Pre-existing issues NOT in Phase 3 scope

- `src/components/layout/site-header-client.tsx:58` — `react-hooks/set-state-in-effect` lint error, present on the branch before any v2 changes. Session 3 (admin/marketing) territory; flagged for that session.
- 14 lint warnings unchanged from v1 (unused eslint-disable directives, an unused import in `tests/fixtures/auth.mts`). Not Phase 3 regressions.

---

## 3. Coordination notices

### 3.1 Session 3 — pricing_rules table ownership

Phase 3 v2 adds `organisation_id` to `pricing_rules` and 6 new `rule_type` values. The admin panel that Session 3 is building (M7) will need an editor for these rows.

**Required from Session 3 admin panel work:**

- An admin UI for browsing/filtering `pricing_rules` rows by `(rule_type, country_code, currency, organisation_id)`.
- An edit form that respects the value_type semantics (percentage vs fixed-cents vs integer).
- After every `UPDATE` or `INSERT`, the admin handler MUST call `invalidatePricingRule({ ruleType, countryCode, currency, organisationId })` from `@/lib/payments/pricing-rules` so the change propagates within one read instead of waiting up to 60 seconds for the cache TTL.
- The 4-level lookup precedence should be visible in the UI ("This rule will be used as: per-org override / region default / global currency default / global wildcard"), so admins do not accidentally shadow a more-specific rule.

This is a coordination notice, not a request to start now. It documents the shape of the contract Session 1 has already shipped so Session 3 builds against it correctly.

### 3.2 Hardening (Session 2) — rate-limit wiring

Per founder clarification, Phase 3 does not wire rate limits. The hardening doc at `docs/hardening/phase1/rate-limit-handoff.md` lives in Session 2's worktree. Rate limit application to checkout endpoints is **deferred to the merge cycle** when Session 1 and Session 2 work converge. Documented here so it is not lost.

---

## 4. Files touched (this rework)

### New
- `supabase/migrations/20260502000002_pricing_rules_extension.sql`
- `src/lib/payments/pricing-rules.ts`
- `tests/unit/payments/pricing-rules.test.ts`
- `docs/m6/phase3/closure-report-v2.md` (this file)

### Refactored
- `src/lib/payments/application-fee.ts`
- `src/lib/payments/payment-calculator.ts`
- `src/lib/payments/connect-ledger.ts`
- `src/lib/payments/create-destination-charge.ts`
- `src/components/checkout/checkout-summary.tsx`
- `src/app/actions/checkout.ts` (call sites)
- `src/app/actions/squad-checkout.ts` (call site)
- `src/app/checkout/[reservation_id]/page.tsx` (call sites)
- `tests/unit/payments/application-fee.test.ts`
- `tests/unit/payments/create-destination-charge.test.ts`
- `tests/unit/payments/connect-ledger.test.ts`
- `tests/unit/payments/destination-charge-flow.test.ts`

### Untouched but worth noting
- `src/types/database.ts` — Organisation row still has `payout_tier`. SHARED file owned by Session 2 (auto-gen from Supabase). Not removed in this rework; the column stays in the database and the type until Session 2 regenerates after a future migration drops it. Code paths in `connect-ledger.ts` and `create-destination-charge.ts` no longer read it.
- `src/lib/stripe/connect-handlers.ts` and `src/app/api/webhooks/stripe/route.ts` — still reference `payout_tier` for tier-promotion webhooks (`account.updated`). Out of Phase 3 scope; tier promotion mechanics are Phase 5/6. The pricing-rules service does not block them.
- `docs/m6/phase3/scope.md` and `docs/m6/phase3/live-mode-prep-checklist.md` — v1 content references the deleted tier system in places. These are advisory documents; not regenerated as part of this rework. To be revised when Phase 4 starts.

---

## 5. Founder review checklist

Before live activation:

1. Confirm seeded values in `supabase/migrations/20260502000002_pricing_rules_extension.sql` match desired launch pricing for AU/GB/US/EU.
2. Confirm `application_fee_composition_mode = 1` (inclusive) is the right default for v1 launch. Mode 2 can be set per-region or per-org later via admin panel without code changes.
3. Confirm 60-second cache TTL is acceptable for admin-panel propagation. (Admin handlers will call `invalidatePricingRule` so the lag only applies if invalidation is missed.)
4. Confirm that having `organisation_id` NULL for region defaults and a UUID for per-org overrides is the right precedence model (no event-level overrides yet; per-event `fee_pass_type` continues to flow through `events.fee_pass_type` as a separate column).
5. Confirm the deferred rate-limit wiring is on the merge-cycle list.

---

[GATE] Phase 3 v2 complete — STOP for founder review before any Phase 4 work.
