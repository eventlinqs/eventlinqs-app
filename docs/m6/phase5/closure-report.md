# M6 Phase 5 Closure Report: Refunds Manager

**Branch:** `feat/m6-phase5-refunds-manager`
**Session:** Backend / Logic / Payments (Session 1)
**Authored:** 2026-05-04
**Predecessor:** M6 Phase 4 (payouts dashboard) gated, awaiting founder merge on its own branch
**Successor:** M6 Phase 6 (disputes) and live-mode activation, both founder-gated

---

## 1. Summary

Phase 5 ships the end-to-end refund flow on top of the Phase 3 destination-charge mechanics. Buyers can self-request refunds on confirmed or partially-refunded orders; organisers can initiate refunds, approve/deny pending requests, and process them through Stripe. Each completed refund reverses the proportional application fee and the destination transfer in a single Stripe call, then writes the parent order back to `refunded` or `partially_refunded` based on cumulative completed refunds.

Refunds run on a new `refunds` table with strict RLS (organiser owners read their org rows, buyers read their own); all writes are admin-client-only so mutation logic gates through `src/lib/refunds/mutations.ts`. Five Resend email kinds notify the right party at the right step (organiser owner on request and failure, buyer on approval/processed/denied).

Phase 5 ships against Stripe sandbox `Eventlinqs`. No live-mode change required; the activation gate from Phase 3's `live-mode-prep-checklist.md` still stands.

---

## 2. Deliverables (A through H)

### 2.A. Schema and RLS
**File:** `supabase/migrations/20260503000001_refunds_extension.sql`
**Status:** complete

Creates three enums (`refund_reason` 6 values, `refund_status` 5 values, `refund_initiator` 4 values) via idempotent DO blocks. The `refunds` table carries 22 columns including FKs to `orders` and `organisations`, the Stripe IDs (`stripe_refund_id`, `stripe_application_fee_refund_id`, `refund_reverse_transfer`), buyer/organiser notes, audit timestamps (`requested_at`, `processed_at`, `cancelled_at`, plus standard `created_at` / `updated_at`), and `failure_reason`. Six indexes cover the read paths: `(organisation_id, status)`, `(order_id, status)`, `(requested_by, requested_at desc)`, `(stripe_refund_id)`, `(status)`, `(created_at desc)`. An `updated_at` trigger keeps the row stamped without app-level concern.

Three SELECT RLS policies: organiser owners (via `organisations.owner_id = auth.uid()`), buyer self-requested (`requested_by = auth.uid()`), and buyer-via-order ownership (`orders.user_id = auth.uid()`). No INSERT/UPDATE/DELETE policies are defined; this forces every write through the admin client and the `mutations.ts` service layer.

### 2.B. Server data layer
**Files:** `src/lib/refunds/queries.ts`, `src/lib/refunds/mutations.ts`, `src/lib/refunds/auth.ts`
**Status:** complete

`queries.ts` exports `getOrganiserRefunds`, `getBuyerRefundRequests`, `getRefundById`, and `getRefundStatistics`. The shared `REFUND_SELECT` joins `orders -> events -> profiles` and a flattening pass lifts `order_number`, `buyer_email`, `event_title`, etc. onto the row consumers see. Pagination clamps to `MAX_PAGE_SIZE = 100` (default 20). `getRefundStatistics` runs three reads in parallel: status-grouped counts, completed amount sum, and confirmed/partially-refunded order totals (used as denominator for `refund_rate_percent`). Every function accepts an optional `client` argument so unit tests can pass a mock Supabase builder.

`auth.ts` exports `resolveOrganiserRefundScope` (owner-only via `organisations.owner_id`) and `resolveBuyerScope`. Both return a discriminated union (`{ ok: true, ... }` or `{ ok: false, status, reason }`), letting routes branch with no try/catch noise.

`mutations.ts` exports four entry points:
- `createRefundRequest`: validates `amountCents` is a positive integer, loads the order, asserts status in `('confirmed', 'partially_refunded')`, asserts buyer matches `orders.user_id`, aggregates prior refunds (sums `completed`+`processing`, blocks if any `pending`+`processing` exist), inserts the row, fires `refund_requested` email
- `processRefund`: 404 if missing; 403 if `organisationId` mismatch; calls `executeStripeRefund`; on `completed` flips parent order to `refunded` if cumulative `completed` >= `total_cents`, else `partially_refunded`; fires `refund_processed` or `refund_failed`
- `cancelRefundRequest`: only `pending` rows; gates on org match for organiser path or `requested_by` match for buyer path; appends `[denied: REASON]` to internal notes for the organiser-deny path; fires `refund_denied` only when the organiser cancelled
- `escalateToDispute`: only `cancelled` or `failed` rows; appends `[escalated_to_dispute by=ID: RATIONALE]` to internal notes (Phase 6 will pick up the dispute creation)

### 2.C. Stripe Connect refund executor
**File:** `src/lib/stripe/refunds.ts`
**Status:** complete

`executeStripeRefund(adminClient, { refundId, processedBy })`:
- Loads the refund row; returns `skipped_not_pending` if already terminal
- Resolves `gateway_payment_id` from the most recent `payments` row with `status = 'completed'`; returns `missing_payment_intent` if absent (HTTP 409 from the route)
- Marks the row `processing` optimistically before the Stripe call
- Delegates to `refundOrder` from `@/lib/payments/refund` (Phase 3 helper) which sets `reverse_transfer: true` and `refund_application_fee: true`, and uses idempotency key `refund:${orderId}:${amountCents}:${initiatedBy}`
- On success: writes `status='completed'`, `stripe_refund_id`, `processed_at`, `processed_by`
- On Stripe error: writes `status='failed'`, `failure_reason` (error message), `processed_at`
- `normaliseReason` maps `cannot_attend` and `other` to `requested_by_buyer` for the Stripe vocabulary; the platform reason stays preserved on the row and in metadata

### 2.D. API routes
**Files:** `src/app/api/refunds/{request,list,[id],[id]/process,[id]/cancel}/route.ts`
**Status:** complete

All five routes use the Phase-2 `applyRateLimit` middleware. New policies in `src/lib/rate-limit/policies.ts`:
- `refunds-read`: 60 req/min (list + detail)
- `refunds-request`: 3 req/hour (the user-facing creation cap)
- `refunds-process`: 30 req/min (process + cancel)

`POST /api/refunds/request`: validates JSON, picks `creatorRole='buyer'` by default and `'organiser'` when `asOrganiser: true`. Buyer path stores `buyerMessage`; organiser path stores `organiserInternalNotes`. Returns 201 with the refund row.

`GET /api/refunds/list`: organiser-only. Parses query params (`status` validated against the enum or coerced to `'all'`, `fromDate`, `toDate`, `limit`, `offset`, `includeStats=true`). Runs page + stats fetches in parallel.

`GET /api/refunds/[id]`: tries organiser scope first (404 if missing, 403 if `organisation_id` mismatch), falls back to buyer scope (403 if `requested_by` mismatch). Returns the full row.

`POST /api/refunds/[id]/process`: organiser-only. 502 on `failed`, 409 on `missing_payment_intent`, 200 with `{stripeRefundId}` on `completed`.

`POST /api/refunds/[id]/cancel`: `asOrganiser` flag routes to organiser deny path with `denialReason`; default routes to buyer self-cancel (no email).

### 2.E. Email notifications
**File:** `src/lib/refunds/email.ts`
**Status:** complete

Five `kind` values: `refund_requested`, `refund_approved`, `refund_processed`, `refund_denied`, `refund_failed`. Sender constant `EventLinqs <noreply@eventlinqs.com>`. Recipient resolution:
- `refund_requested` and `refund_failed`: organiser owner (loaded from `organisations.owner_id` -> `profiles.email`)
- `refund_approved`, `refund_processed`, `refund_denied`: buyer (loaded from `orders.user_id -> profiles.email`, falls back to `orders.guest_email` when no user)

`escapeHtml` and `formatAmount` (`CODE 0.00` format using uppercase currency) sanitise every interpolated value. The `htmlShell` wrapper enforces brand styles: navy header, ink body, gold dividers, EventLinqs footer. The module no-ops silently if `RESEND_API_KEY` is unset and swallows transport errors so a failed send never blocks the mutation flow.

### 2.F. Organiser dashboard UI
**Files:** `src/app/(dashboard)/dashboard/refunds/page.tsx`, `[id]/page.tsx`, `src/components/dashboard/refunds/*`
**Status:** complete

`/dashboard/refunds` is a server component that fetches stats and the first refunds page in parallel. Renders four KPI cards (`refund-stats-cards.tsx`):
- Pending (amber/warning)
- Processing (neutral ink)
- Completed (emerald/success)
- Refund rate (navy ink-900 with gold-400 icon)

Below the cards, `refunds-history-table.tsx` ('use client') exposes a status filter dropdown, paginated rows, and a horizontally-scrollable table on mobile. Status pills colour-map per `STATUS_PILL`. Each row links to `/dashboard/refunds/[id]`.

`/dashboard/refunds/[id]` is the detail server component: status pill, dl grid (Reason, Buyer, Requested, Processed, Stripe refund, Failure reason), buyer message panel, internal notes panel, and `<RefundDetailActions />` (only renders when `status='pending'`). The Approve button POSTs to `/process`; the Deny button reveals a `denialReason` textarea then POSTs to `/cancel?asOrganiser=true`.

Format helpers in `src/components/dashboard/refunds/format.ts`: `formatCents` (`Intl.NumberFormat('en-AU', {currencyDisplay: 'code'})`), `formatDate`, `formatDateTime` (uses `'-'` fallback, never em-dash), `reasonLabel`, `statusLabel`. Mobile responsive 375 to 1920.

### 2.G. Buyer UI
**Files:** `src/app/orders/[order_id]/refund-request/{page.tsx,refund-request-form.tsx}`, `src/app/account/refund-requests/page.tsx`
**Status:** complete

`/orders/[order_id]/refund-request` server-renders three guards before showing the form: order ownership (`user_id === user.id`), refundable status (`confirmed` or `partially_refunded`), and absence of any active request (no `pending` or `processing` row on the order). Each guard renders a friendly inline message with a back-link.

The form (`'use client'`) has:
- Reason dropdown (`cannot_attend`, `event_cancelled`, `duplicate`, `requested_by_buyer` labelled as "Other personal", `other`)
- Amount input clamped to remaining order total (server displays the cap)
- Buyer message textarea, max 1000 chars

`/account/refund-requests` lists the authenticated buyer's own requests with status pills and links back to the originating order.

### 2.H. Tests
**Status:** complete

52 new tests across 5 files (157 total in the suite, all passing):
- `tests/unit/refunds/queries.test.ts` (10): pagination clamp, status filter, date range, offset, array-shaped events relation, buyer queries, detail not-found, detail shape, statistics aggregation
- `tests/unit/refunds/mutations.test.ts` (12): integer validation, missing order, status guard, ownership, dedupe of active requests, cap by total, organiser path, process happy path + flip-to-refunded, process Stripe failure, cancel buyer/organiser/non-pending, escalate happy/non-terminal
- `tests/unit/refunds/stripe-refunds.test.ts` (4): missing payment intent, success, Stripe failure, skip non-pending
- `tests/unit/refunds/api-routes.test.ts` (12): rate-limit, JSON validation, missing field, scope routing for buyer/organiser, list 401, status coercion, includeStats, detail 404/403/buyer-fallback, process 502/200, cancel buyer/organiser-with-denial
- `tests/unit/refunds/email.test.ts` (6): no-op without API key, organiser-bound recipient, buyer profile recipient, guest_email fallback, HTML escape, error swallowing

Mocks: `vi.hoisted` for hoisted dependency mocks, per-test `FakeDb` to avoid Supabase singleton coupling, `function MockResend()` constructable mock for the Resend SDK, and `vi.importActual` on the refund module to keep the `__setStripeClientForTests` seam intact.

---

## 3. Quality gates

| Gate | Result |
|---|---|
| Vitest | 157/157 passing |
| TypeScript (`npx tsc --noEmit`) | clean (after `rm -rf .next` to clear stale Phase 4 generated types) |
| ESLint (`--max-warnings=0`) | clean |
| Production build (`SKIP_ENV_VALIDATION=1 npm run build`) | success, `/orders/[order_id]/refund-request` and all `/api/refunds/*` routes registered |

No em-dashes, no en-dashes, no exclamation marks in copy. Australian English. Hyphen `-` used as the empty-cell fallback in tables.

---

## 4. Architectural notes

- **No INSERT/UPDATE/DELETE policies on `refunds`.** Writes go through the admin client only, so the mutation layer is the canonical write path. Any new write site must live in `src/lib/refunds/mutations.ts` (or be added with an explicit RLS policy review).
- **Phase 3 reuse.** `executeStripeRefund` calls `refundOrder` from `@/lib/payments/refund`, which already encodes `reverse_transfer`, `refund_application_fee`, and the idempotency key. No Stripe-side work was duplicated.
- **Order status flip rule.** After a `completed` refund the parent order becomes `refunded` if the sum of `completed` refund amounts is `>= orders.total_cents`, otherwise `partially_refunded`. The check is per-mutation, not denormalised.
- **Email is fire-and-forget.** `sendRefundEmail` is awaited in mutations but its internal try/catch never re-throws. A Resend outage cannot block a refund.
- **Rate limits live in Phase-2 middleware.** Three new policies were added; no new middleware shape.
- **Buyer self-cancel sends no email.** Only the organiser-deny path triggers `refund_denied`. This is intentional: a buyer cancelling their own request is not a notable event for them.

---

## 5. [COORDINATION] Cross-session notes

### Session 2 (hardening)
The new rate-limit policies (`refunds-read`, `refunds-request`, `refunds-process`) live in `src/lib/rate-limit/policies.ts`. If Session 2's Upstash Sydney migration changes how policies are keyed, these three need the same treatment.

### Session 3 (admin panel)
M7 admin will eventually surface a refunds moderation queue (cross-org, support-team view). It can reuse `getOrganiserRefunds` shape but needs a new `getAllRefundsForAdmin` query. The mutations layer is admin-friendly already (admin client is the write client). Do NOT add admin RLS policies to `refunds` until Session 1 reviews.

### Phase 6 (disputes, future)
`escalateToDispute` is a stub-grade audit-note appender. When Phase 6 builds the disputes table, this function should expand to insert a `disputes` row and link it back to the refund.

### `[SHARED]` files touched
- `src/types/database.ts`: added `RefundReasonEnum`, `RefundStatus`, `RefundInitiatorEnum`, `Refund` interface. Committed separately as `chore(types): ... [SHARED]`. No conflict with Phase 4 (Phase 4 added `Payout`/`PayoutHold` types in a separate region of the file).

---

## 6. Founder review checklist

Before merge:
- [ ] Apply migration: `supabase db push --linked` (verifies the three enums and table arrive cleanly on Sydney)
- [ ] Smoke: organiser dashboard `/dashboard/refunds` loads with no rows on a fresh org
- [ ] Smoke: buyer self-request from an existing confirmed test order, organiser approves, refund completes, order flips to `refunded` (or `partially_refunded` if partial), buyer receives `refund_processed` email
- [ ] Smoke: organiser deny path; buyer receives `refund_denied` with the denial reason
- [ ] Verify `RESEND_API_KEY` set in Vercel env (preview + production); verify Stripe `STRIPE_SECRET_KEY` and connected account have Connect enabled
- [ ] Confirm rate-limit Redis policy keys (`rf-r`, `rf-q`, `rf-p`) do not collide with any Session 2 keys

---

## 7. Commits on this branch (in order)

1. `chore(types): add Refund domain types [SHARED]`
2. `feat(refunds): add refunds schema with enums, RLS, and indexes`
3. `feat(refunds): server-side queries for organiser and buyer surfaces`
4. `feat(refunds): scope resolver, Stripe executor, and mutation layer`
5. `feat(refunds): brand-styled Resend notifications wired to mutations`
6. `feat(refunds): API routes for request, list, detail, process, cancel`
7. `feat(refunds): organiser dashboard with stats, history, and detail`
8. `feat(refunds): buyer refund-request form and account history view`
9. `test(refunds): unit coverage for queries, mutations, stripe, API, email`

---

[GATE] Phase 5 complete. STOP for founder review.
