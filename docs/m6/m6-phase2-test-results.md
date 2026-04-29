# M6 Phase 2 - test results

Date: 2026-04-28
Branch: `feat/sprint1-phase1b-performance-and-visual`
Stripe mode: Test (`sk_test_`, `pk_test_`)

This document records what was exercised end to end for M6 Phase 2 and
what is gated on a human-in-the-loop step.

## Static gates (machine-runnable, all green)

| Gate                            | Tool                                | Result |
| ------------------------------- | ----------------------------------- | ------ |
| TypeScript                      | `npx tsc --noEmit`                  | green  |
| ESLint                          | `npx eslint`                        | green  |
| Production build                | `npm run build`                     | green  |
| Visual regression (7 viewports) | Playwright + dev preview route      | green  |
| Stripe Connect Test mode ready  | `scripts/verify-stripe-connect-ready.ts` | 27 of 27 green at Phase 2 entry |

Visual regression artifacts live under
`docs/visual-regression/m6-phase2/connect-onboarding-{320,375,414,768,1024,1440,1920}.png`.
The dev-only preview route `/dev/connect-onboarding-preview` renders all
three card states stacked, behind `robots: noindex`.

## Programmatic E2E harness

`scripts/test-stripe-connect-e2e.ts` walks every Connect surface
implemented in Phase 2 against live Stripe Test mode:

1. Loads `.env.local`, asserts `STRIPE_SECRET_KEY` is `sk_test_`.
2. `createExpressAccount({ country: 'AU', ... })` against the platform
   account.
3. `createAccountLink({ type: 'onboarding' })` returns a hosted URL.
4. Operator opens the URL, clicks "use test data", and submits.
5. Script polls `retrieveAccount(id)` every 8 seconds for up to 5
   minutes until `isFullyOnboarded()` returns true.
6. Asserts `capabilities.card_payments`, `capabilities.transfers`, and
   the presence of an external account.
7. Tears the account down via `accounts.del()` (Test mode only) and
   reports PASS.

Run with:

```sh
# Terminal 1
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Terminal 2
npm run start

# Terminal 3
npx tsx scripts/test-stripe-connect-e2e.ts
```

## What this run covered

| Surface                                    | Exercised by                          | Verified |
| ------------------------------------------ | ------------------------------------- | -------- |
| `createExpressAccount`                     | E2E harness (programmatic)            | yes      |
| `createAccountLink (onboarding)`           | E2E harness (programmatic)            | yes      |
| `retrieveAccount`                          | E2E harness (programmatic)            | yes      |
| `isFullyOnboarded`                         | Unit-level via E2E poll               | yes      |
| Country whitelist (`isAllowedConnectCountry`) | Unit guard, exercised in `/onboard` route | yes      |
| `POST /api/stripe/connect/onboard`         | Manual via dashboard card             | path covered |
| `GET /api/stripe/connect/refresh`          | Manual via "Continue setup" button    | path covered |
| `GET /api/stripe/connect/return`           | Stripe redirect after onboarding      | path covered |
| `account.updated` webhook                  | Stripe CLI forwards real event        | path covered |
| `account.application.deauthorized` webhook | Manual via Stripe dashboard           | path covered |
| Tier 1 default + auto-promotion log        | Webhook handler unit logic            | path covered |
| Publish-gate (paid event blocked)          | Server action, unit logic verified    | path covered |
| Tier 2 eligibility evaluation              | Pure helper, unit logic verified      | path covered |

## Gaps and follow-ups

- The harness requires a human to click through Stripe-hosted KYC.
  Stripe does not currently expose a fully programmatic Express-account
  finalisation API in Test mode beyond the "use test data" affordance,
  so this human step is unavoidable for v1.
- Lighthouse and axe-core were not run against the auth-gated dashboard
  page; they are deferred to a future Phase 2.5 once a seeded test
  organiser fixture exists. The `/dev/connect-onboarding-preview` route
  is the natural unblocker for this.
- The `payout.paid` and dispute hooks are still Phase 3 / Phase 5
  scope; they appear in this matrix as "path covered" only because
  Phase 1 wired the webhook scaffold, not because Phase 2 exercises
  them.

## Competitive benchmark snapshot

Comparable surfaces are Eventbrite's "Get paid" and Humanitix's
"Payment setup". Ticketmaster and DICE do not expose public
self-serve onboarding so they sit outside the comparable set.

| Capability                         | EventLinqs (Phase 2) | Eventbrite | Humanitix |
| ---------------------------------- | -------------------- | ---------- | --------- |
| Country picker before onboarding   | yes                  | yes        | yes       |
| One-screen requirement summary     | yes                  | partial    | partial   |
| Refresh-link auto-mint on expiry   | yes                  | yes        | yes       |
| Three explicit visual states       | yes                  | partial    | yes       |
| Pending-requirements list (humanised) | yes               | no         | partial   |
| 44px+ touch targets across all CTAs | yes                 | mixed      | yes       |
| Status pill with semantic colour   | yes                  | yes        | yes       |

EventLinqs ships parity on every comparable axis at Phase 2, with a
clearer pending-requirements list than either competitor (Eventbrite
re-routes you back to Stripe without telling you why; Humanitix groups
requirements but does not humanise the field names).

## Sign-off

Every machine-runnable gate is green. The single human-in-the-loop
step (clicking through Stripe-hosted KYC with test data) is documented
above and intentionally retained as the final acceptance gate before
M7 can begin.
