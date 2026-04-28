# M6 Stripe Connect: current state audit

**Date:** 2026-04-28
**Branch:** `feat/sprint1-phase1b-performance-and-visual`
**Author:** Audit conducted before any M6 implementation begins.
**Scope source of truth:** `docs/EventLinqs_Scope_v5.md` §3.7.2 (Organiser Payouts), §3.7.3 (Refunds), §3.7.4 (Chargebacks), §3.9.3 (Organiser KYC).
**Audit purpose:** establish exactly what exists, what is stubbed, and what is missing before code touches real-money flows.

---

## 1. Authoritative scope (from Scope_v5.md)

There is **no standalone `docs/modules/M6-*.md` spec file.** `docs/modules/` only contains M1, M2, M3, M4. The `docs/MASTER-PLAN-V1.md` mentions payouts as a Phase 4 deliverable but does not enumerate the M6 build steps. The authoritative requirements live in `docs/EventLinqs_Scope_v5.md`. Relevant clauses (verbatim, paraphrased where indicated):

### 1.1 Organiser payouts (§3.7.2)

- Automated payouts to organiser bank account, daily or weekly, configurable per organiser.
- Instant payout option, default 1.5% of payout amount, configurable in admin.
- Payout dashboard: full transaction history, fee breakdowns, upcoming payouts, tax summaries.
- Multi-currency settlement: AUD, USD, GBP, EUR, NGN, KES, ZAR, GHS.
- New / unverified organisers: payouts held 7 days post-event, configurable.
- Admin can set rolling reserve % (default 0%) for higher-risk tiers, released 30 days post-event.
- Negative balance state: future payouts withheld until recovered, admin alerted.

### 1.2 Refunds (§3.7.3)

- Organiser-defined refund policy, displayed at checkout and on ticket.
- Refund priority: (1) organiser balance, (2) upcoming payout deduction, (3) gateway partial reversal, (4) platform floats and recovers from future earnings.
- Event cancellation: all attendees auto-refunded.

### 1.3 Chargebacks (§3.7.4)

- Auto-evidence pack to gateway dispute API (purchase confirmation, IP, fingerprint, scan history, refund-policy acceptance).
- Chargebacks deducted from organiser's next payout.
- Risk tiers (Standard, Elevated, High) drive rolling reserves and payout holds.

### 1.4 KYC (§3.9.3)

- Identity verification: government ID + selfie via Stripe Identity or Sumsub.
- Business verification: ABN (AU), EIN (US), CAC (NG), Companies House (UK).
- Verified badge on organiser profile.
- Tiered limits: unverified capped at 100 tickets per event and $5,000 total sales before verification required.

### 1.5 Pricing rules (§4.5 + schema)

Already implemented as a database table:

- `pricing_rules` rule types include `platform_fee_percentage`, `platform_fee_fixed`, `instant_payout_fee`, `resale_fee`, `featured_listing`, `subscription_price`.
- Seed includes `instant_payout_fee` GLOBAL AUD 1.0% and `resale_fee` GLOBAL 5%.
- Seed platform fee: 2.5% + fixed per-ticket fee (50¢ AUD / 40p GBP / 50¢ USD / ₦100 / GHS5 / KES50 / R10).

---

## 2. What exists (the working surface)

### 2.1 Schema

`organisations` table (`supabase/migrations/20260101000001_baseline_schema.sql:71-72`):

```sql
stripe_account_id TEXT,
stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
```

These two columns are the entire Connect schema today. There is **no payouts table, no payout_holds table, no organiser-tier or risk-tier column, no rolling-reserve config, no negative-balance ledger.**

`pricing_rules` table is fully populated per §1.5. The fee-calculation pipeline (`PaymentCalculator` in `src/lib/payments/payment-calculator.ts`) reads from it.

`orders` table records `platform_fee_cents` and `processing_fee_cents` per order (`src/types/database.ts:247-248`). These are computed at checkout and stored, but they do **not** flow to a Connect account or settlement record.

### 2.2 TypeScript types

`Organisation` interface (`src/types/database.ts:24-40`) carries `stripe_account_id: string | null` and `stripe_onboarding_complete: boolean`. Both are read in two places (see §3) and written in zero.

### 2.3 Stripe SDK + checkout integration (working today)

- `src/lib/payments/stripe-adapter.ts`: creates platform-only PaymentIntents (`stripe.paymentIntents.create({ amount, currency, automatic_payment_methods, receipt_email, metadata })`). No `transfer_data`, no `application_fee_amount`, no `on_behalf_of`. Money is received by the EventLinqs platform Stripe account end of story.
- `src/lib/payments/gateway-factory.ts`: returns `StripeAdapter` as the only registered gateway. Pattern is in place to add Paystack / Flutterwave / PayPal later.
- `src/lib/payments/payment-calculator.ts`: reads `pricing_rules`, computes `platform_fee_cents` + `payment_processing_fee_cents` per order. Free events bypass entirely.
- `src/app/actions/checkout.ts:355-368`: regular checkout calls `gateway.createPaymentIntent` with `metadata.organisation_id` set, but with **no destination charge wiring.**
- `src/app/actions/checkout.ts:603`: secondary checkout path (looks like a sibling code path; both touched by the same audit conclusion).
- `src/app/actions/squad-checkout.ts:205`: squad checkout same pattern.
- `src/app/api/webhooks/stripe/route.ts`: handles `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action`, `payment_intent.canceled`, `charge.refunded`. **No `account.updated` handler. No `payout.*` handlers. No `transfer.*` handlers.**

### 2.4 UI surfaces that read Connect state

Two and only two:

1. `src/app/(dashboard)/dashboard/page.tsx:221`:

   ```ts
   connectPayouts: Boolean(org?.stripe_onboarding_complete),
   ```

   Used by the get-started checklist to gate the "Connect payouts" step.
2. `src/app/(dashboard)/dashboard/organisation/page.tsx:75`:

   ```tsx
   {org.stripe_onboarding_complete ? 'Enabled' : 'Setup required'}
   ```

   Single text label on the organisation overview card.

### 2.5 UI surfaces that *render* a payout dashboard

`src/app/(dashboard)/dashboard/payouts/page.tsx`: a full-page placeholder. Renders an empty-state card with the literal copy *"Payouts dashboard coming soon. Stripe Connect is being wired for organiser payouts."* No data fetching, no Connect API call, no payout records read.

### 2.6 Get-started checklist step 3

`src/components/dashboard/get-started-checklist.tsx:34-40`:

```ts
{
  key: 'connectPayouts',
  label: 'Connect payouts',
  description: 'Link Stripe so you can get paid out for ticket sales.',
  href: '/dashboard/organisation',
  cta: 'Connect Stripe',
},
```

The CTA link points at `/dashboard/organisation` which has **no Connect onboarding entry point** on it. Clicking the CTA takes the organiser to the org overview page and dead-ends.

---

## 3. What is stubbed (UI exists, logic does not)

| Surface | File | Stub state |
|---|---|---|
| Organisation overview "Payouts" status pill | `src/app/(dashboard)/dashboard/organisation/page.tsx:72-77` | Reads `stripe_onboarding_complete`. Flag is never set true anywhere. |
| Get-started checklist "Connect payouts" CTA | `src/components/dashboard/get-started-checklist.tsx:34-40` | CTA visible, link is dead. |
| `/dashboard/payouts` page | `src/app/(dashboard)/dashboard/payouts/page.tsx` | Empty-state placeholder with "coming soon" copy. |
| Get-started checklist completion | `src/app/(dashboard)/dashboard/page.tsx:221` | Step never completes. |
| Revenue summary on event detail | `src/components/orders/revenue-summary.tsx` | Computes net = gross − platform − processing. Net is never paid out anywhere because no Connect account exists to pay out to. The footer literally says "Payouts are processed after the event" but no mechanism does so. |

---

## 4. What is missing (no surface, no logic)

### 4.1 Connect API surface

- No `stripe.accounts.create()` call anywhere.
- No `stripe.accountLinks.create()` (Express onboarding hosted flow).
- No `stripe.accountSessions.create()` (embedded Connect components).
- No `stripe.accounts.retrieve()` (status polling).
- No `account.updated` webhook handler.
- No `account.application.deauthorized` handler.

### 4.2 Money-routing on PaymentIntent

The current `paymentIntents.create` body has none of:

- `application_fee_amount` (platform takes a cut).
- `transfer_data: { destination: stripe_account_id }` (destination charges pattern).
- `on_behalf_of` (presents organiser as merchant of record on the buyer's statement).

Without these, all gross revenue lands in the platform account and stays there.

### 4.3 Payouts schema

- No `payouts` table (one row per Stripe payout to an organiser).
- No `payout_holds` table (7-day post-event hold per Scope §3.7.2).
- No `rolling_reserves` table.
- No risk-tier column on `organisations`.
- No `negative_balance` ledger / state machine.

### 4.4 Payout dashboard

Per Scope §3.7.2 needs to show: pending balance, in-transit, paid out, available, transaction history, fee breakdowns, upcoming payouts, tax summary. Currently shows a static placeholder.

### 4.5 Webhook handlers (Connect-side)

- `account.updated`: tracks `charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements.currently_due`. Drives `stripe_onboarding_complete = true` only when capabilities fully clear.
- `payout.created`, `payout.paid`, `payout.failed`: drives the payout dashboard rows.
- `payout.canceled`: rare but needed.
- `transfer.created`, `transfer.failed`: edge case for separate-charges-and-transfers (only relevant if we choose that pattern over destination charges).

### 4.6 Refund cost-allocation logic

Scope §3.7.3 requires a refund priority order: organiser balance → upcoming payout deduction → gateway partial reversal → platform float. Today the codebase has `charge.refunded` webhook handling that frees inventory and promotes waitlist, but **no fee-clawback logic, no platform-fee refund decision, no organiser-balance ledger to charge.**

### 4.7 Compliance / KYC

- Stripe Connect Express handles KYC ID verification, government ID, AU ABN / US EIN collection automatically. We do not need a custom KYC flow if we choose Express.
- Stripe Identity vs Sumsub mentioned in Scope §3.9.3 is a fallback if we ever pick Custom accounts. Express makes this moot for v1.
- 1099-K (US) and AU equivalent: Stripe Connect Express files these for connected accounts above platform thresholds. Platform is responsible for exposing year-end summary in dashboard.

### 4.8 Free-event handling

`PaymentCalculator` short-circuits zero-value carts and writes `platform_fee_cents: 0` (`src/app/actions/register-free.ts:182`). For Connect: free events should not need a connected account at all (no money moves). Need to confirm onboarding is not blocked for organisers running only free events, and that the get-started checklist accounts for this.

---

## 5. Schema-vs-UI mismatch summary

| Layer | Connect column | State |
|---|---|---|
| Postgres | `organisations.stripe_account_id` | Column exists, never written. |
| Postgres | `organisations.stripe_onboarding_complete` | Column exists, never written. |
| TypeScript types | `Organisation.stripe_account_id` | Mirrors schema, never set. |
| TypeScript types | `Organisation.stripe_onboarding_complete` | Mirrors schema, never set. |
| UI read | `dashboard/page.tsx` | Reads, always `false`. |
| UI read | `dashboard/organisation/page.tsx` | Reads, always `false`. |
| UI read | `get-started-checklist.tsx` | Reads via parent, always shows CTA. |
| UI write | (none) | No surface writes either column. |
| API write | (none) | No route, action, or webhook writes either column. |

The fields are dead schema. M6 wires them to live state.

---

## 6. Architectural decisions already made (don't re-litigate)

These are locked by the existing codebase or scope and feed into the implementation plan as constraints:

1. **Stripe is the only Connect gateway in v1.** Paystack / Flutterwave / PayPal use a different concept of "split payments" but are explicitly Phase-2 per `docs/modules/M3-checkout-payments.md:22`. M6 builds the Stripe Connect implementation only.
2. **Pricing rules are database-driven.** `pricing_rules` table exists and is wired into checkout. M6 must read platform fee from this table when computing `application_fee_amount`. No hardcoded percentages anywhere.
3. **Free events have zero platform fee, zero Stripe interaction.** Already enforced at `PaymentCalculator.calculate` (free path returns `platform_fee_cents: 0` and `total_cents: 0`). Free events should not require Connect onboarding.
4. **`organisations.owner_id` is the single ownership relation.** A Stripe Connect account is owned by `organisations`, not by `profiles`. Multi-org users get one Connect account per org.
5. **Webhooks use the admin Supabase client for writes** (existing pattern in `src/app/api/webhooks/stripe/route.ts`). M6 webhook additions follow the same pattern.
6. **Gateway adapter pattern is preserved.** Connect logic should slot into `StripeAdapter` (or a sibling `StripeConnectService` module that the adapter delegates to) rather than living inline in route handlers.
7. **Idempotency on payment creation already established.** The `idempotency_key = order_id` convention extends naturally to Connect-routed PaymentIntents.

---

## 7. Production-readiness gaps (must close before live)

These are the gates between "code merged" and "real money flows":

1. Connect platform account configured in Stripe Dashboard (Express enabled, branding set, country = AU primary, multi-country enabled).
2. Webhook endpoint registered in Stripe Connect dashboard for connected accounts (separate from platform webhooks).
3. Production webhook signing secret stored in Vercel env vars.
4. Real Stripe live-mode keys stored in Vercel env (Production / Preview / Development).
5. Organiser KYC test pass on at least one live test organiser through full Express onboarding.
6. Refund-with-clawback flow tested end-to-end (organiser balance, partial reversal, platform float).
7. Negative-balance recovery tested.
8. Multi-currency payout tested for at least AUD + one non-AUD currency (e.g. NGN or GBP).
9. PCI scope review: by using PaymentIntents + Stripe Elements + destination charges, the platform stays in SAQ-A scope. M6 must not introduce raw card data anywhere.
10. ToS update so organisers see and accept the Stripe Connect platform agreement before onboarding (Stripe Express handles this in their hosted flow).

---

## 8. Addendum: gaps revealed by Phase 0 plan refinements (added 2026-04-28 rev 1)

The Phase 0 plan refinement (`m6-implementation-plan.md` rev 1) introduced sections covering tiered payouts, reserve architecture, tax handling, ACL compliance, refund/chargeback policy, and KYC enforcement. Re-running the audit lens against these locked decisions surfaces additional gaps not flagged in §1 to §7 above.

### 8.1 Tax handling and TPAR (gap)

§4.7 of this audit briefly mentions 1099-K (US) but does not enumerate AU obligations. Refinement §1.11 of the plan locks the following AU-specific gaps that need code:

- **GST on platform fee column missing.** `orders` table has `platform_fee_cents` but no `platform_fee_gst_cents`. Phase 1 schema migration must add this column (or Phase 4 must compute on-the-fly when generating tax invoices). Decision: add the column in Phase 1 for clean storage.
- **TPAR export missing.** No admin export exists for the AU Taxable Payments Annual Report. Out of M6 scope; flag for M7 admin tools.
- **Tax invoice PDF generation missing.** No PDF generation library is in the dependency tree (`package.json` review). Phase 4 will need to add `@react-pdf/renderer` or similar.

### 8.2 Australian Consumer Law compliance (gap)

§1.12 of the refined plan locks the following surfaces that the audit did not check:

- **Refund-policy snapshot at checkout missing.** `orders` table does not store the refund-policy text the buyer saw at purchase. Required for chargeback evidence and ACL compliance. Phase 1 schema migration must add `orders.refund_policy_snapshot TEXT` and `orders.terms_version_hash TEXT` and `orders.terms_accepted_at TIMESTAMPTZ`.
- **Banned-phrase keyword screen missing.** No validation rejects organiser refund-policy text containing absolutist phrases. Phase 5 server-side validation required.
- **Refund-policy display at checkout unaudited.** Need to verify `src/app/checkout/[orderId]/page.tsx` displays the organiser's refund policy in a buyer-visible location. Spot-check required during Phase 5.

### 8.3 Refund window enforcement (gap)

§1.8 of the refined plan locks a 7-day pre-event refund window for buyer-initiated refunds. The audit did not check whether such a window exists today.

- **No refund window logic in code.** Codebase has `charge.refunded` webhook handling but no buyer-initiated refund server action and no time-based eligibility check. Phase 5 must add the server action with the 7-day boundary check.
- `organisations.refund_window_days` column does not exist; Phase 1 schema migration adds it (per the rev 1 column list).

### 8.4 Tier progression infrastructure (gap)

§1.4 and §1.6 of the refined plan introduce `payout_tier`, `tier_progression_log`, and a nightly tier-progression job. The audit's §4.3 mentioned only "no risk-tier column"; the refined scope is broader.

- **`tier_progression_log` table missing.** Phase 1 schema migration adds it.
- **Nightly tier-progression job missing.** No Supabase Edge Function or Vercel cron exists. Phase 6 (or earlier as a Phase 3.5 subtask) must add it.
- **Tier badge UI missing.** Phase 4 dashboard rev 1 surfaces tier and progress; today there is no tier surface anywhere.

### 8.5 KYC publish-gate trigger (gap)

§1.13 of the refined plan locks a database trigger that prevents `events.status` transitioning to `published` when the event is paid and the organiser is not KYC-complete. The audit's §4.7 mentions Stripe Express handles KYC but does not verify whether the publish path enforces it.

- **No publish-gate trigger today.** Spot-checked: `events` table has `status` column but no trigger on UPDATE that checks the parent organisation's `stripe_charges_enabled`. Phase 3 migration must add it (recommend a `BEFORE UPDATE` trigger that raises if `NEW.status = 'published'` AND any `ticket_tiers.price_cents > 0` AND organisation `stripe_charges_enabled = FALSE`).
- **No UI gate today.** `dashboard/events/[id]/edit/page.tsx` (or equivalent publish action) does not check organiser KYC before exposing the publish button. Phase 3 wiring required.

### 8.6 Reserve and float operational gap (gap)

§1.5 of the refined plan introduces per-event reserves with delayed release. The audit's §4.3 mentioned only "no rolling_reserves table"; the refined scope details are tighter.

- **Reserve calculation logic missing.** The `payment_intent.succeeded` webhook handler does not compute or write reserve holds. Phase 3 wires this.
- **Reserve-release scheduled job missing.** No mechanism marks `payout_holds.released_at` 3 business days after event end. Phase 4 (or a small Phase 3.5 subtask) must add the scheduled job.
- **Business-day math missing.** No utility exists for "3 business days post-event" (must skip AU public holidays plus weekends). Phase 3 needs a small `addBusinessDays` helper, with AU public-holiday list either inlined or fetched from a date-utility library.

### 8.7 Geographic country gate (gap)

§1.10 of the refined plan locks AU/UK/US/EU only at v1. The audit did not check whether the organisation creation flow today rejects unsupported countries.

- **No country gate today.** `organisations` insert path in the codebase accepts any country string without validation. Phase 2 onboarding adds the country gate; Phase 1 may want a CHECK constraint as defense-in-depth.

### 8.8 Geographic seed-data state (clarification, not a gap)

Production database currently has zero organisations (per existing `vercel env ls` checks and Sydney migration baseline). No African organisers exist to migrate; no waitlist UX needs to handle existing users. Confirms §1.10 is greenfield.

---

## 9. References

- Scope: `docs/EventLinqs_Scope_v5.md` §3.7.2, §3.7.3, §3.7.4, §3.9.3, §4.5
- M3 spec (existing checkout architecture): `docs/modules/M3-checkout-payments.md`
- Master plan phasing: `docs/MASTER-PLAN-V1.md`
- Launch blocker tracker: `docs/sprint1/launch-blocker-priorities.md`
- Stripe Connect docs (external): https://stripe.com/docs/connect, https://stripe.com/docs/connect/express-accounts
