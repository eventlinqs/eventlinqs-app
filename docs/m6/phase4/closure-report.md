# M6 Phase 4 - Payouts Dashboard - Closure Report

Branch: `feat/m6-phase4-payouts-dashboard`
Author: Session 1 (Backend / Logic / Payments)
Date: 2026-05-02

## 1. Mission

Ship an organiser-facing payouts dashboard for the M6 Stripe Connect
destination-charge model that landed in Phase 3. Surface every payout,
reserve hold, and refund that affects the organiser's balance, with
direct access to the Stripe Express dashboard for deep-dive forensics.

## 2. Deliverables

### 2.1 Server-side data layer (`src/lib/payouts/queries.ts`)

Four query functions, all callable with an injectable Supabase client
(used by tests) or the default admin client (used by API routes):

- `getOrganiserPayouts(orgId, options)` - paginated history with status,
  currency, and arrival-date range filters. Returns `{ rows, total,
  limit, offset }`. Limit clamped to MAX 100.
- `getOrganiserPayoutSummary(orgId)` - one trip per aggregate: pending
  (`pending` + `in_transit`), paid this month (`paid` since UTC start
  of month), on hold (unreleased payout_holds), lifetime paid. Resolves
  currency from row data first, then `organisations.stripe_account_country`,
  then defaults to AUD.
- `getReserveReleaseSchedule(orgId, daysAhead = 30)` - upcoming
  unreleased holds with event titles flattened. Tolerates Supabase's
  array-vs-object relation quirk.
- `getRefundImpact(orgId, options)` - paginated ledger rows filtered to
  the six refund and chargeback reasons.

### 2.2 Auth helper (`src/lib/payouts/auth.ts`)

`resolveOrganiserScope()` authenticates the user via the session client
and resolves the owned organisation via the admin client. Owner-only
for v1; member-scope (read-only finance role) is deferred until the
membership-role model lands.

### 2.3 API routes

| Route | Method | Policy | Purpose |
|-------|--------|--------|---------|
| `/api/payouts/list` | GET | `payouts-read` (60/min) | Paginated payout history |
| `/api/payouts/summary` | GET | `payouts-read` | Summary + reserve release schedule |
| `/api/payouts/refunds` | GET | `payouts-read` | Refund and chargeback impact |
| `/api/payouts/stripe-dashboard-link` | POST | `payouts-stripe-link` (6/min) | Mints Stripe Express login link |

Two new policies in `src/lib/rate-limit/policies.ts`. The Stripe link
policy is intentionally tight (6/min) to avoid burning Stripe's
login-link quota or leaking tokens at scale.

### 2.4 Stripe helper extension (`src/lib/stripe/connect.ts`)

`createDashboardLoginLink(accountId)` wraps `stripe.accounts.createLoginLink`.
The link is single-use and short-lived; callers open it in a new tab.

### 2.5 Dashboard UI

Replaces the prior `/dashboard/payouts` page body when the organisation
is fully Connect-onboarded; un-onboarded organisations continue to see
the existing `ConnectOnboardingCard`.

Components under `src/components/payouts/`:

- `summary-cards.tsx` - 4 stats cards (pending, paid this month, on
  hold, lifetime). Mobile-first grid: 1 col / 2 cols / 4 cols.
- `reserve-release-timeline.tsx` - upcoming releases with event title,
  hold-type label, amount, release date.
- `payouts-history-table.tsx` - filterable client component with status
  pills, pagination, mobile-friendly horizontal scroll.
- `stripe-dashboard-button.tsx` - client button that POSTs to the link
  endpoint and opens the result in a new tab with `noopener,noreferrer`.
- `refunds-list.tsx` - refund and chargeback list with reason labels
  and signed amounts (red for negative, green for positive).
- `format.ts` - shared `formatCents`, `formatDate`, `formatDateTime`
  helpers using `Intl.NumberFormat` and `en-AU` locale.

Accessibility:
- All interactive elements meet 44px touch target.
- `aria-labelledby`, `aria-live="polite"`, `role="alert"` applied.
- Status pill colour semantics back-stopped by text, not icon-only.

### 2.6 Email notifications (`src/lib/payouts/email.ts`)

`sendPayoutEmail(adminClient, organisationId, kind, payload)` with four
canonical kinds:

- `payout_initiated` - wired to `payout.created` Stripe webhook
- `payout_paid` - wired to `payout.paid`
- `payout_failed` - wired to `payout.failed`
- `reserve_released` - helper exposed for the reserve release worker
  (Phase 4-cron follow-up; no in-process trigger today)

Sender: `EventLinqs <noreply@eventlinqs.com>` (matches existing buyer
confirmation sender). No-ops when `RESEND_API_KEY` is unset so local
dev and CI never block on email delivery. HTML payload escaped to
prevent injection of failure-reason text from Stripe.

`payout.canceled` is intentionally not emailed - it almost always
occurs as the precursor to a corrective `payout.created`, and Stripe's
own dashboard does not surface it as a user-actionable event.

### 2.7 Tests

33 tests across 3 files (target was 20+):

- `tests/unit/payouts/queries.test.ts` - 16 tests
- `tests/unit/payouts/api-routes.test.ts` - 11 tests
- `tests/unit/payouts/email.test.ts` - 6 tests

Full suite: 138/138 passing (105 pre-existing + 33 new).

## 3. Quality gates

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript strict | PASS | `npx tsc --noEmit` clean, no output |
| ESLint zero errors | PASS | `npx eslint .` clean |
| ESLint zero warnings | PASS | `npx eslint . --max-warnings=0` exit 0 |
| Vitest | PASS | 138/138 (33 new) in 3.7s |
| Next.js build | PASS | Compiled successfully in 15.2s, all 6 new routes registered |
| No em-dashes | PASS | Grep [—–] across owned files - no matches |
| No exclamation marks in copy | PASS | All `!` matches are JS negation operators |
| Australian English | PASS | "organiser", "organisation", "favourites", "cancelled" throughout |

Build output confirms registration:

```
├ ƒ /api/payouts/list
├ ƒ /api/payouts/refunds
├ ƒ /api/payouts/stripe-dashboard-link
├ ƒ /api/payouts/summary
├ ƒ /dashboard/payouts
```

## 4. Architectural notes

### 4.1 Why no migration

Existing schema from `20260428000001_m6_connect_schema.sql` was
sufficient. The founder's spec mentioned `scheduled_arrival_date`,
`released_at`, and `reserve_amount_cents` on `payouts`, but in the
current schema these concepts live on:

- `payouts.arrival_date` (Stripe's authoritative timestamp)
- `payout_holds.released_at` and `payout_holds.amount_cents`

No migration was added. If a Phase 4-cron worker needs to track
release-job state, a follow-up migration may add `payout_holds.released_by`.

### 4.2 Why owner-only auth in v1

The org membership-role model (`organisation_members.role`) does not
yet have a `finance_read` role. Phase 4 ships as owner-only to avoid
inventing the role here. Member access lands in M7 admin's organisation
permissions phase.

### 4.3 Reserve-released email is not yet triggered

The helper exists and is unit-tested. The triggering worker (cron job
that releases due holds and emits the email) is a Phase 4-cron
follow-up. The current `payout_holds.released_at` column is not set by
any code path yet, so emitting the email today would be premature.

## 5. Coordination

### 5.1 [COORDINATION] Session 2 (Hardening)

Two new rate-limit policies added (`payouts-read`, `payouts-stripe-link`).
Both follow the existing `POLICIES` pattern in
`src/lib/rate-limit/policies.ts`. No infrastructure-level changes
required.

### 5.2 [COORDINATION] Session 3 (Admin / M7)

The admin org-financial-controls phase will need to hit the same
`pricing_rules` invalidation hook documented in the Phase 3 v2 closure
report. No new admin coupling introduced by Phase 4.

## 6. Founder review checklist

- [ ] Confirm UI palette and copy meet Hollywood/Airbnb standard
      (Playwright competitive review)
- [ ] Confirm reserve-released email trigger is acceptable as Phase
      4-cron deferral (no email fires today)
- [ ] Confirm owner-only access is acceptable for v1 (no member-finance
      role yet)
- [ ] Approve commit grouping for merge (5 commits, all green)

## 7. Commits on this branch (in order)

1. `feat(payouts): server-side queries layer for organiser payouts dashboard`
2. `feat(payouts): API routes for list, summary, refunds, and Stripe dashboard link`
3. `feat(payouts): dashboard UI with summary, schedule, history, and Stripe link`
4. `feat(payouts): email notifications wired to payout webhook events`
5. `test(payouts): unit coverage for queries, API routes, and email helper`

[GATE] Phase 4 complete - STOP for founder review before any Phase 5 work.
