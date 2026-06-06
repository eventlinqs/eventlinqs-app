# Organiser payouts dashboard: landing report (2026-06-06)

Lands the organiser-facing payouts dashboard from the flagged orphan branch
`feat/m6-phase4-payouts-dashboard` onto `chore/payouts-dashboard-landing`,
reconciled against current `main`. The flagged branch was confirmed NOT
superseded by the admin payout cockpit (PRs 74-77): that work is the
admin-facing surface (`src/app/admin/(authed)/payouts/**`, `src/lib/admin/payouts.ts`),
whereas this is the organiser-facing dashboard a connected organiser sees at
`/dashboard/payouts`. See `docs/launch-hardening/flagged-branch-triage.md` (1a).

## What landed

- `src/lib/payouts/queries.ts` - server-side data layer (payouts list, summary,
  reserve-release schedule, refund/chargeback impact, payout terms).
- `src/lib/payouts/auth.ts` - owner-scoped resolver (`getUser()`, never
  `getSession()`; admin client only after the auth check).
- `src/lib/payouts/stripe-link.ts` - Stripe Express dashboard login-link helper.
- `src/lib/payouts/email.ts` - organiser payout notification emails (lib only;
  webhook wiring deferred, see below).
- `src/app/api/payouts/{list,summary,refunds,stripe-dashboard-link}/route.ts`.
- `src/components/payouts/*` - summary cards, payout-terms card, reserve-release
  timeline, refunds list, payout history table, Stripe dashboard button, format.
- `src/app/(dashboard)/dashboard/payouts/page.tsx` - full dashboard for onboarded
  organisers; keeps the existing onboarding card for not-yet-onboarded orgs.
- `src/lib/rate-limit/policies.ts` - `payouts-read` and `payouts-stripe-link`.
- `tests/unit/payouts/*` - 38 unit tests (queries, API routes, email).

## Reconciliation against current main (evidence)

1. **Type drift.** The flagged branch imported `LedgerReason` and
   `PayoutHoldType` from `@/types/database`. Current generated types expose
   `organiser_balance_ledger.reason` and `payout_holds.hold_type` as plain
   `string` (no Postgres enums; only `refund_reason` is an enum). Defined both as
   local union types in `queries.ts`, kept in lockstep with the CHECK constraints
   in `20260428000001_m6_connect_schema.sql`. `PayoutRecordStatus` still exists
   and is imported as before.

2. **Currency-case bug -> admin agreement.** The accounting tables store currency
   UPPERCASE (`orders.currency DEFAULT 'AUD'` -> ledger/holds), and the admin
   cockpit reads with `PAYOUT_CURRENCY = 'AUD'`. The flagged branch filtered
   `payouts.currency` with `.toLowerCase()` and summed holds across all
   currencies while reporting a "picked" currency. Reconciled:
   - Available balance now comes from the SAME `organiser_available_balance()`
     SECURITY DEFINER RPC the admin uses, called with `'AUD'` - identical input,
     identical number. Organiser-view and admin-view cannot disagree on available
     balance.
   - On-hold now filters `currency = 'AUD'`, unreleased only - identical to
     `src/lib/admin/payouts.ts`.
   - The optional `payouts` currency filter switched to `ilike` (no case
     mangling).

3. **Tier / cadence / reserve (organiser-terms promise).** The organiser terms
   (`src/app/legal/organiser-terms`) state: "The current payout tier, cadence,
   and reserve that apply to your account are shown in your organiser dashboard."
   The flagged branch did not render these. Added `getOrganiserPayoutTerms()` +
   `PayoutTermsCard`:
   - Tier from `organisations.payout_tier` (tier_1/2/3 -> Standard/Verified/Trusted).
   - Cadence days from `getPayoutScheduleDays()` and on-demand eligibility from
     `organisations.payout_schedule`.
   - Reserve % from `getReservePercentage()` - the same pricing-rules source the
     settlement and reserve workers use, so what the organiser is told equals
     what is actually held. Matches the locked tiered model in
     `docs/m6/m6-implementation-plan.md` Sec 1.4-1.5 (Tier 1: 20%, 3 business
     days post-event).

4. **`stripe_requirements` Json narrowing.** Kept current main's
   `jsonAsRecord(org.stripe_requirements)` narrowing in the page (the flagged
   branch passed the raw Json union, which would not typecheck now).

5. **Brand reconciliation.** Replaced off-brand raw Tailwind palette
   (`amber/emerald/blue/red-*`) with semantic tokens (`success/warning/error/info`)
   and non-existent ink shades (`ink-50/300/500/700`, `gold-200`) with theme
   tokens (`ink-100/200/400/600/900`, `gold-400`). Replaced the forbidden legacy
   navy `#1A1A2E` in the email shell with `#0A1628` (ink-900). No em-dashes; no
   "diaspora"; Australian English.

## Cross-session boundaries (CLAUDE.md ownership)

- **Avoided editing `src/lib/stripe/connect.ts` (Session 1).** The flagged
  branch added `createDashboardLoginLink` there. Relocated it to
  `src/lib/payouts/stripe-link.ts`, reusing the canonical `getStripeClient()`
  exported by `src/lib/payments/payout.ts` (import only, no edit).
- **Deferred the Stripe webhook wiring (Session 1 owns
  `src/app/api/webhooks/stripe/route.ts`, currently active on the refunds
  manager).** The `email.ts` lib ships ready and unit-tested; the ~30-line
  hook-up is handed to the backend session as the patch below.

### Deferred patch for the backend session (payout-event emails)

Apply in `handleConnectPayoutEvent` after the payout upsert in
`src/app/api/webhooks/stripe/route.ts`:

```ts
import { sendPayoutEmail, type PayoutEmailKind } from '@/lib/payouts/email'

// ...after the payout row upsert, inside handleConnectPayoutEvent:
const emailKind = mapPayoutEventToEmailKind(eventType)
if (emailKind) {
  try {
    await sendPayoutEmail(adminClient, org.id, emailKind, {
      amountCents: payout.amount,
      currency: payout.currency,
      arrivalDate,
      failureReason: payout.failure_message ?? null,
    })
  } catch (err) {
    console.error('[m6] payout email send failed', { eventId, eventType, payoutId: payout.id, err })
  }
}

function mapPayoutEventToEmailKind(
  eventType: 'payout.created' | 'payout.paid' | 'payout.failed' | 'payout.canceled',
): PayoutEmailKind | null {
  switch (eventType) {
    case 'payout.created': return 'payout_initiated'
    case 'payout.paid': return 'payout_paid'
    case 'payout.failed': return 'payout_failed'
    case 'payout.canceled': return null
  }
}
```

Variable names (`adminClient`, `org`, `payout`, `arrivalDate`, `eventType`,
`eventId`) follow the flagged branch's handler; the backend session should bind
them to whatever the current handler exposes.

## Verification

- `tsc --noEmit`: 0 errors.
- `eslint` (payouts surface): 0 errors, 0 warnings.
- `vitest run tests/unit/payouts`: 38/38 passing.
- `next build`: see commit/CI (production build green).
- No migrations added or applied; all tables/RPC already on `main`.
- No buyer browse/checkout components touched.

### Deferred to staging (authed visual pass)

Playwright at 3 viewports against the live authenticated dashboard needs a
seeded organiser with a completed Stripe Connect onboarding and payout/hold/
ledger rows. The staging rig is not provisioned and the live Sydney DB must not
be seeded for this, so the authed visual pass + axe run is gated to staging,
consistent with the refund/payout-UI verification pattern. Plan when staging is
up:

1. Seed an organiser (tier_1) with: 1 paid payout, 1 pending payout, 1 reserve
   hold, 1 refund ledger row, a non-zero available balance.
2. Sign in; load `/dashboard/payouts` at 390px, 768px, 1280px.
3. Assert: payout-terms card shows Standard / "3 business days after each event"
   / "20% of gross"; available-balance card equals the admin cockpit's
   available figure for the same org (cross-check `/admin/.../payouts`); history,
   reserve timeline, and refunds render; touch targets >= 44px.
4. axe-core: 0 violations. Confirm no regression to `/admin` payouts.
