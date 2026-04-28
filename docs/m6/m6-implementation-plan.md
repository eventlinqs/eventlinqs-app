# M6 Stripe Connect — implementation plan

**Date:** 2026-04-28
**Status:** Plan only. No code in this session. Awaiting Lawal's review and explicit go-ahead before any implementation begins.
**Companion doc:** `docs/m6/m6-current-state-audit.md`
**Test mode only:** every step below assumes Stripe **test mode**. Production cutover is a separate phase gated by a Lawal sign-off.

---

## 1. Architectural decisions

These are recommendations to lock before code. Each one has a one-line rationale plus the alternative considered. Decisions marked **OPEN** need Lawal's explicit call.

### 1.1 Account type — Express (recommended)

**Recommend:** Stripe Express accounts.

| | Express | Standard | Custom |
|---|---|---|---|
| Onboarding UX | Stripe-hosted, ~5 min | Stripe-hosted, organiser sees full Stripe dashboard | Fully custom UI we build |
| KYC handling | Stripe handles end-to-end | Stripe handles end-to-end | Platform handles, must build screens |
| Branding | Light branding (logo + colours) | Stripe-branded | Full platform brand |
| Compliance burden | Low | Low | High (we own KYC, sanctions, ToS) |
| Disputes & chargebacks | Stripe-managed dashboard for organiser | Stripe-managed | Platform-managed |
| Payout schedule control | Platform sets default, organiser can override | Organiser controls | Platform controls fully |
| Self-serve fit | Strong (Lawal's stated requirement) | Strong | Weak (requires our build investment) |
| Time-to-launch | Fastest | Fast | Slowest |

**Why Express:** matches "self-serve, no manual sales process, 5-minute signup" requirement. KYC is owned by Stripe (no Sumsub integration, no government-ID upload UI to build). AU ABN, US EIN, UK Companies House, NG CAC are all collected by Stripe's hosted flow per region. We control branding enough to feel native. Standard makes the organiser leave our brand for Stripe-branded dashboards. Custom is months of work for a v1 we don't need.

**Alternative if rejected:** Standard. Same Connect onboarding API, less branding control. Custom is off the table for v1.

### 1.2 Charge type — Destination charges (recommended)

**Recommend:** Destination charges with `application_fee_amount`.

| | Destination charges | Separate charges + transfers | Direct charges |
|---|---|---|---|
| Money flow | Buyer → platform → organiser (atomic) | Buyer → platform, then explicit transfer | Buyer → organiser, platform receives application fee |
| Statement of merchant | Platform (or `on_behalf_of` for organiser) | Platform | Organiser |
| Refund handling | Single flow, platform fee returned/retained per param | Two-step (refund charge, reverse transfer) | Organiser owes platform fee back |
| Webhook complexity | Lower | Higher (transfer.* events to track) | Lowest |
| Use in resale / split | Hard | Natural | Hard |
| Cross-currency conversion | Stripe auto-converts at payout | Manual | Stripe auto-converts |
| AU-friendly | Yes | Yes | Yes |

**Why destination:** atomic flow, single PaymentIntent, fee retention via `application_fee_amount` parameter, refund logic single-path. Separate-charges is more flexible (resale market and squad payments may need it later) but introduces transfer tracking we don't need on day one. Direct charges flips the merchant-of-record to organiser, which complicates the platform's chargeback dashboard ambition.

**`on_behalf_of`:** set to organiser's connected account so the organiser appears as merchant on the buyer's statement. Reduces "Why did EventLinqs charge me?" support tickets and shifts dispute liability onto the connected account (Stripe-recommended for marketplaces).

**Alternative if rejected:** separate charges + transfers. Adds a `transfers` table, `transfer.created` / `transfer.failed` webhooks, and post-charge reconciliation step. ~3-4 days additional engineering.

### 1.3 Platform fee read-path

**Recommend:** at PaymentIntent creation, `application_fee_amount` is computed by `PaymentCalculator` (already reads `pricing_rules`). Same number that goes into `orders.platform_fee_cents` is what we hand to Stripe. Single source of truth, no drift.

**Implication:** `application_fee_amount` includes the percentage + fixed-per-ticket components already encoded in `pricing_rules`. The Stripe API takes a single integer in cents.

### 1.4 Payout schedule default — Daily (recommended)

**Recommend:** daily payout schedule for all newly onboarded organisers.

- Stripe AU default is daily, 2-business-day rolling. Matches Lawal's "fast payouts" promise.
- Organisers can change to weekly or monthly via Stripe Express dashboard.
- Instant payout (1.5% fee per `pricing_rules.instant_payout_fee`) exposed as a button in our payout dashboard, calls `stripe.payouts.create` on connected account.
- 7-day post-event hold for new / unverified organisers per Scope §3.7.2 implemented as a platform-side `payout_holds` table that delays the *transfer* (not the underlying Stripe payout). Stripe payout schedule stays daily; the platform retains the funds until hold expires.

**OPEN:** does Lawal want a 7-day hold for *every* organiser's first event regardless of verification, or only for non-Stripe-verified accounts? Scope says "new or unverified". Recommend: hold only on the first event, then drop the hold once that event has settled with no disputes. Needs sign-off.

### 1.5 Refund cost-allocation

**Recommend:** at refund time, refund the original PaymentIntent in full (which automatically reverses the application fee back to the platform). Then re-charge the platform fee back to the organiser as part of the next payout deduction. This matches Scope §3.7.3 priority order:

1. Organiser balance (deduct from next payout) — primary.
2. Upcoming payout deduction — same as above mechanically.
3. Gateway partial reversal — used when refund exceeds organiser's pending balance, Stripe pulls from the connected account's available balance.
4. Platform float — last resort, recovered from organiser's future earnings via balance ledger.

**Implication:** we need a platform-side `organiser_balance_ledger` table. Each row is a delta against an organiser's running balance (positive on confirmed orders, negative on refunds and chargebacks).

### 1.6 Multi-currency settlement

**Recommend:** organiser's connected account is created with a primary currency matching their country of operation (default AUD for AU organisers, override at onboarding). Stripe handles FX automatically at payout. Cross-currency platform-fee math stays in the buyer's currency on `orders.platform_fee_cents`; the same integer goes to Stripe; Stripe converts at payout.

**OPEN:** EUR is in scope (per §3.7.2) but not in the current `pricing_rules` seed. Need to add EUR pricing rules before EU launch. Out of M6 scope; flag for Module 11 (Africa expansion) prep.

### 1.7 Compliance handoff — Stripe owns it

- 1099-K (US) filed by Stripe for connected accounts above platform threshold.
- AU equivalent: Stripe Reporting handles AU PAYG and ABN-related reporting. Platform exposes year-end summary in payout dashboard, sourced from Stripe API.
- KYC, sanctions, AML: Stripe Express handles. Platform receives `account.updated` webhooks indicating capabilities cleared.
- ToS: organiser sees and accepts Stripe's Connect platform agreement during Express hosted onboarding. We do not need a custom ToS modal for the Stripe portion. We *do* need to update our organiser ToS (`src/app/legal/organiser-terms/page.tsx`) to reference the Stripe Connect agreement and the platform fee structure. Out-of-band copy update.

---

## 2. Phased delivery

Six phases. Each is independently committable, individually testable in Stripe test mode, and reversible if needed. Phase 1 lays the schema; Phase 6 is production cutover.

### Phase 1 — Schema and webhook plumbing (1.5 days)

**Goal:** unblock everything else. No user-visible behaviour change.

- Add migration `20260429000001_m6_connect_schema.sql`:
  - Extend `organisations`: add `stripe_account_country TEXT`, `stripe_charges_enabled BOOLEAN DEFAULT FALSE`, `stripe_payouts_enabled BOOLEAN DEFAULT FALSE`, `stripe_capabilities JSONB DEFAULT '{}'`, `stripe_requirements JSONB DEFAULT '{}'`, `payout_schedule TEXT DEFAULT 'daily' CHECK (payout_schedule IN ('daily','weekly','monthly','manual'))`, `risk_tier TEXT DEFAULT 'standard' CHECK (risk_tier IN ('standard','elevated','high'))`.
  - New table `payouts`: `id`, `organisation_id`, `stripe_payout_id`, `amount_cents`, `currency`, `arrival_date`, `status` (`pending|in_transit|paid|failed|canceled`), `failure_reason`, `created_at`, `updated_at`. RLS: organiser owners can SELECT their own org's rows.
  - New table `payout_holds`: `id`, `organisation_id`, `event_id`, `amount_cents`, `currency`, `release_at`, `released_at` (nullable), `reason` (`new_organiser|chargeback|admin_hold`), `created_at`. RLS: organiser owners can SELECT their own org's rows.
  - New table `organiser_balance_ledger`: `id`, `organisation_id`, `delta_cents`, `currency`, `reason` (`order_confirmed|refund|chargeback|payout|adjustment`), `reference_id` (UUID, polymorphic to `orders.id` or `payouts.id`), `created_at`. RLS: organiser owners read-only.
- Update TypeScript types in `src/types/database.ts` to mirror new columns and tables.
- Extend `src/app/api/webhooks/stripe/route.ts` to handle `account.updated`, `account.application.deauthorized`, `payout.created`, `payout.paid`, `payout.failed`, `payout.canceled`, `charge.dispute.created`. Stub handlers that log + write minimum viable rows. No business logic yet.
- Register new webhook events in Stripe test-mode dashboard.

**Definition of done:** local Supabase migration runs clean, types compile, webhook handler returns 200 for stub events, no user-visible change.

### Phase 2 — Express onboarding flow (2 days)

**Goal:** organiser can click "Connect Stripe" and complete Stripe Express onboarding.

- New service: `src/lib/services/stripe-connect.ts`. Exports `createConnectedAccount(orgId, country)`, `createOnboardingLink(orgId, returnUrl, refreshUrl)`, `retrieveAccount(stripeAccountId)`, `createDashboardLink(stripeAccountId)`.
- New server action: `src/app/actions/connect-onboarding.ts`. Functions: `startOnboarding(orgId)`, `refreshOnboarding(orgId)`. Both gated by `org.owner_id === auth.uid()`.
- New routes:
  - `/dashboard/organisation/payouts/connect` — initiates onboarding, redirects to Stripe-hosted Express flow.
  - `/dashboard/organisation/payouts/return` — return URL after Stripe flow. Re-fetches account, updates `stripe_charges_enabled` etc, redirects to `/dashboard/payouts`.
  - `/dashboard/organisation/payouts/refresh` — refresh URL when Stripe link expires. Generates a new link and redirects.
- Wire `account.updated` webhook in Phase 1 to set `stripe_onboarding_complete = (charges_enabled AND payouts_enabled AND details_submitted)`.
- Update `get-started-checklist.tsx` step 3 CTA to point at `/dashboard/organisation/payouts/connect`.
- Update `dashboard/organisation/page.tsx`: add a "Connect Stripe" button when `!stripe_onboarding_complete`, and a "Manage payouts" button when complete (calls `createDashboardLink`).

**Definition of done:** in test mode, an organiser can complete Stripe Express onboarding end-to-end, the org row updates, the checklist step ticks. Tested with at least one AU and one non-AU test organiser.

### Phase 3 — Destination-charge wiring (1.5 days)

**Goal:** every PaymentIntent created for an organiser with a connected account routes funds via destination charge.

- Extend `CreatePaymentIntentParams` in `src/lib/payments/gateway.ts` with optional `connected_account_id?: string`, `application_fee_cents?: number`, `on_behalf_of?: string`.
- Update `StripeAdapter.createPaymentIntent` to set `transfer_data.destination`, `application_fee_amount`, and `on_behalf_of` when `connected_account_id` is supplied.
- Update `src/app/actions/checkout.ts:355` and `:603` to look up `org.stripe_account_id` + `org.stripe_onboarding_complete` and pass through. Also `src/app/actions/squad-checkout.ts:205`.
- **Hard guard:** if event's organiser is not `stripe_onboarding_complete = true` AND event is paid (any tier > 0 cents), refuse to create the PaymentIntent and return a friendly error pointing the organiser at onboarding. Free events bypass.
- **Hard guard:** before allowing `events.status` transition to `published` for paid events, require `org.stripe_onboarding_complete = true`. Migration to add a database trigger; UI surface to display a "Connect payouts before publishing" warning.
- Update webhook `payment_intent.succeeded` handler to write a `+order_total` row to `organiser_balance_ledger` and a `−platform_fee` adjustment.
- Update `charge.refunded` handler to write a `−refund_total` row plus restore platform fee to the platform side.

**Definition of done:** test-mode end-to-end ticket purchase against an organiser with a connected account routes the application fee to the platform Stripe account and the residual to the connected account. Refund returns funds and reverses ledger correctly.

### Phase 4 — Payout dashboard (2 days)

**Goal:** replace the placeholder at `/dashboard/payouts` with a real dashboard.

- New page: `src/app/(dashboard)/dashboard/payouts/page.tsx` (rewrite, delete placeholder).
- KPI row: available balance (from Stripe `balance.retrieve` on connected account), pending balance (orders confirmed but not yet in Stripe transit), in-transit (Stripe payouts not yet paid), paid out total (lifetime).
- Transactions panel: paginated `payouts` table rows with arrival date, amount, status badge, link to Stripe receipt.
- Upcoming payouts panel: derived from Stripe balance + payout schedule.
- Held funds panel: rows from `payout_holds` with release date.
- Tax summary panel: Stripe Reporting download links + year-to-date gross.
- "Instant payout" button: only visible when Stripe `instant_available` > 0. Calls a server action that triggers `stripe.payouts.create` with `method: 'instant'` and writes the 1.5% fee to `organiser_balance_ledger`.
- "Update bank details" button: calls `createDashboardLink` to send organiser into Stripe Express dashboard for that account.
- All numbers formatted via the same currency formatter used elsewhere.
- Empty state: when no payouts yet, friendly "Your first payout will appear after your first event" copy.

**Definition of done:** dashboard renders against a real test-mode connected account with at least one test payout and one held order. Mobile layout passes Lighthouse (preserve current 0.80 perf floor).

### Phase 5 — Refund + chargeback flows (2 days)

**Goal:** refunds and chargebacks correctly allocate fees and ledger.

- Extend existing refund server action (or create one — needs separate audit if it doesn't exist) to use `stripe.refunds.create` with `refund_application_fee: true` for full refunds and `false` for partial keep-fee scenarios.
- Per Scope §3.7.3 priority: if organiser balance >= refund amount, deduct from next payout. Otherwise, attempt gateway reversal. Otherwise, platform float (write a negative ledger row, alert admin via Sentry).
- Wire `charge.dispute.created` webhook to: (a) freeze affected funds via `payout_holds`, (b) compile evidence pack from order metadata + IP + ticket scan history (Scope §3.7.4), (c) auto-submit via `stripe.disputes.update`.
- Extend `dashboard/payouts/page.tsx` to surface disputes.
- Negative-balance state machine: when `organiser_balance_ledger` running sum < 0, set `organisations.payout_status = 'on_hold'`, send email + Sentry alert, withhold all future payouts until cleared.

**Definition of done:** test-mode refund of a confirmed order returns funds, reverses the application fee (full refund) or retains (partial), and writes correct ledger rows. Test-mode dispute submission lands the evidence pack on Stripe. Negative-balance scenario tested.

### Phase 6 — Production cutover (0.5 day, plus monitoring window)

**Goal:** flip from test mode to live mode with confidence.

- Stripe live-mode platform account verified by Lawal (Stripe AU verification can take a few business days — kick off early).
- Live-mode publishable + secret keys added to Vercel Production env (Preview / Development stay on test mode).
- Live-mode webhook endpoint registered (separate from test-mode endpoint) with both platform + Connect events subscribed.
- Live-mode webhook signing secret in Vercel Production env.
- Update `src/app/legal/organiser-terms/page.tsx` to reference Stripe Connect agreement and platform fee structure.
- Smoke test: Lawal creates a real organiser, completes live onboarding, lists a $1 ticket, makes a real purchase with own card, refunds, confirms ledger and payout.
- Monitor for 48 hours: Sentry quiet, Stripe Dashboard shows expected charges + transfers + payouts.
- Document rollback plan: feature-flag `connectEnabled` env var so we can fall back to platform-only PaymentIntents in 60 seconds if the connected-account path breaks.

**Definition of done:** real money flows from a real buyer to a real organiser net of platform fee. No Sentry errors. Lawal signs off.

---

## 3. Test plan summary

Per phase, all tests run against Stripe **test mode** unless explicitly Phase 6.

| Phase | Test scenarios |
|---|---|
| 1 | Migration up + down clean. Webhook handler returns 200 for each stub event. Type compile. |
| 2 | AU organiser onboarding end-to-end. Non-AU organiser onboarding (e.g. UK). Refresh URL flow when link expires. Re-onboarding an org that already has `stripe_account_id` (idempotent). |
| 3 | Paid event with onboarded organiser → destination charge succeeds. Paid event with non-onboarded organiser → blocked with friendly error. Free event with non-onboarded organiser → succeeds (zero-Stripe path). Squad checkout against connected account. |
| 4 | Dashboard renders with no payouts (empty state). With one paid payout. With one in-transit. With one held. Instant payout button visible only when Stripe says yes. |
| 5 | Full refund: application fee returned to platform, ledger correct. Partial refund: application fee retained. Refund larger than organiser balance: gateway reversal path. Disputed charge: evidence pack auto-submitted. Negative balance: future payouts withheld. |
| 6 | Live-mode smoke test, single $1 ticket, full lifecycle. |

Use Stripe's [test Connect accounts](https://stripe.com/docs/connect/testing) for Phase 2-5. Use real cards (Lawal's) only in Phase 6.

---

## 4. Effort estimate

| Phase | Effort | Cumulative |
|---|---|---|
| 1 — Schema + webhook plumbing | 1.5 d | 1.5 d |
| 2 — Express onboarding | 2 d | 3.5 d |
| 3 — Destination-charge wiring | 1.5 d | 5 d |
| 4 — Payout dashboard | 2 d | 7 d |
| 5 — Refund + chargeback | 2 d | 9 d |
| 6 — Production cutover | 0.5 d + 48h monitor | 9.5 d |

**Total:** ~9.5 working days for full M6. Floor estimate; assumes no surprises in Stripe Express onboarding for non-AU jurisdictions and no scope creep.

**Critical-path acceleration option:** Phases 1-3 alone (~5 days) deliver an organiser-self-serve Connect path with destination charges. Phase 4 dashboard could ship as a "view in Stripe" link to the Stripe Express dashboard for v1, deferring the in-platform dashboard to a later sprint. This trims to ~5.5 days but breaks the "modern dashboard, clear payout visibility" promise. Recommend full plan unless launch date forces the cut.

---

## 5. Architectural decisions awaiting Lawal's call

These are listed in §1 with **OPEN** flags. Repeated here for visibility:

1. **§1.4 — first-event hold policy.** Hold every first event, or only non-Stripe-verified accounts? Recommend: first event only, drops after settlement.
2. **Charge type override.** §1.2 recommends destination charges. If Lawal wants the resale market or split-payments to drive the architecture, separate charges + transfers becomes the right call. Adds ~3-4 days.
3. **Country support at v1.** Express supports AU, US, UK, EU, NZ, SG, and others. NG, KE, GH, ZA are *not* on Stripe Connect Express. Scope §3.7.2 lists those African currencies as required. Two paths:
   - Launch with Stripe Connect for AU/US/UK/EU only; defer African organisers to Paystack/Flutterwave Connect equivalents (Phase 2 of payments).
   - Ship Stripe v1 for the supported markets; explicitly mark the African organiser path as "coming with Module 11".
   Recommend: option 2. Lawal needs to confirm.
4. **Risk-tier admin UI.** Phase 1 schema includes `risk_tier`. Admin UI to change it lives in M7. Confirm we want the column shipped now (yes — set default `standard`, no UI yet) or defer entirely until M7.

---

## 6. Recommended starting phase

**Phase 1 (schema + webhook plumbing).** It is fully reversible (a single migration), unblocks every subsequent phase, and the only way to find out if anything in the design conflicts with the existing schema. Phase 1 deliverable is a green-tests merge with no user-visible change, which makes it the safest first commit on a launch-blocker module.

After Phase 1 lands and is reviewed, Phase 2 (onboarding) is the next clear next step.

---

## 7. Production credentials policy

No production Stripe credentials are touched in any phase before Phase 6. Phases 1-5 use:

- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_test_...`

Production keys (`sk_live_...`, `whsec_live_...`) are added to Vercel **only** during Phase 6 cutover after Lawal explicit sign-off. Until then, all Connect calls are test-mode-only and any accidental production flow is impossible because the platform Stripe live account is not configured.

---

## 8. References

- Audit: `docs/m6/m6-current-state-audit.md`
- Scope: `docs/EventLinqs_Scope_v5.md` §3.7.2, §3.7.3, §3.7.4, §3.9.3
- Existing M3 spec: `docs/modules/M3-checkout-payments.md`
- Stripe Connect docs: https://stripe.com/docs/connect, https://stripe.com/docs/connect/express-accounts, https://stripe.com/docs/connect/destination-charges
- Launch blocker tracker: `docs/sprint1/launch-blocker-priorities.md`
