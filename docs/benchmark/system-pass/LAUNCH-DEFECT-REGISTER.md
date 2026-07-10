# EventLinqs Launch Defect Register

Evidence-backed, severity-ranked register against a launch-ready bar
(Ticketmaster + Eventbrite as the minimum standard).

- Date: 2026-06-19
- Branch: `feat/home-rebuild` at tip `ec31cef`
- Method: static code audit (7 parallel specialist passes) + live checks
  (`supabase migration list --linked`, Vercel project/deploy API, filesystem).
  Every entry carries a file:line, command output, or JSON key as proof. Items
  that can only be settled in a third-party dashboard are marked
  NEEDS-DASHBOARD-CHECK with the exact thing to confirm.
- Re-run procedure: `docs/playbooks/LAUNCH-AUDIT-PLAYBOOK.md`.
- Severity: P0 blocker (breaks the buyer funnel or loses money at launch),
  P1 major (must fix before launch), P2 minor (fix soon, not launch-blocking),
  P3 informational.

No defects were auto-fixed this pass. The single P0 (PAY-01) is founder-controlled
payments code whose fix is a founder decision with a downstream dependency, and it
cannot be verify-fixed without a Stripe round-trip; the reasoning is recorded under
PAY-01. Everything else is documented only, per the audit brief.

## Severity summary

| Sev | Count | IDs |
|---|---|---|
| P0 | 1 | PAY-01 |
| P1 | 12 | AUTH-01, AUTH-02, AUTH-03, INFRA-01, PAY-02, FUN-01, FUN-03, FUN-04, HARD-01, HARD-03, HARD-06, HARD-07, MOB-01, MOB-02, PERF-01 |
| P2 | 23 | INFRA-02, RES-01, RES-02, PAY-03, PAY-04, PAY-05, FUN-02, FUN-05, FUN-06, AUTH-04, AUTH-05, SEO-01..SEO-10, DATA-01, MOB-03, MOB-04, MOB-05, MOB-06, HARD-02 |
| P3 | 1 | MOB-07 |

(P1 count is 15 line-items; the table groups HARD-08 under HARD-01 as the same
host-reconciliation decision.)

## Fixes applied (this session, 2026-06-19)

Each entry carries the fix at file:line, a passing automated test, and a captured
run. Branch `feat/home-rebuild`. NO MERGE without approval.

### RES-01 + RES-02 (FIXED) - server quantity cap aligned to organiser max_per_order; invalid input now logs the field

Note on numbering: the fix brief labelled these "RES-01 / RES-02". They are NOT
the pre-existing P2 entries of the same id below (reservation-expiry,
cache-staleness), which are untouched. These two are the reservation-creation
quantity-validation defect surfaced during the "invalid reservation data"
diagnosis.

- Root cause: `CreateReservationSchema` hard-capped ticket `quantity` at
  `.max(20)`, but the client stepper clamps to the tier's `max_per_order`
  (DB default 10, `INT NOT NULL`, no upper bound; organiser form sets it with no
  cap). Any tier with `max_per_order > 20` turned a legitimate selection into the
  opaque "Invalid reservation data". The real per-order limit was enforced only
  client-side; the server schema had no knowledge of `max_per_order`.
- Fix:
  - `src/lib/reservations/validation.ts` (new) - schema + pure
    `checkMaxPerOrder` + `summariseIssues`, importable by tests (the
    `'use server'` action file cannot export them).
  - Schema `quantity` ceiling raised to a coarse abuse cap
    (`MAX_QTY_HARD_CAP = 100`, `validation.ts:32`); the authoritative business
    limit is each tier's `max_per_order`, enforced server-side in
    `src/app/actions/reservations.ts:64-73` (`checkMaxPerOrder` against a
    `select('id, name, price, max_per_order')`), returning a precise,
    tier-named message instead of the generic string. Defence in depth: a
    crafted over-limit request is now rejected server-side, not only by the
    client stepper.
  - RES-02 logging: `reservations.ts:35-41` and `seat-reservations.ts:26-34`
    now `console.error` the summarised Zod issues (field path + code) before
    returning the user-facing message, so any future invalid-reservation
    failure names the offending field in the server log.
- Proof:
  - Test: `tests/unit/reservations/validation.test.ts` - 6/6 passing
    (`npx vitest run tests/unit/reservations/validation.test.ts` -> "Test Files
    1 passed (1) / Tests 6 passed (6)"). Includes the regression case (qty 25 on
    a `max_per_order: 30` tier now parses), the abuse-ceiling rejection, the
    precise over-limit message, and that the issue summary names `event_id` /
    `ticket_items`.
  - Typecheck: `npx tsc --noEmit` -> exit 0 (clean).
- Edge note: an organiser could in theory set `max_per_order > 100` and re-hit
  the abuse ceiling; clamping `max_per_order` in the event form to
  `MAX_QTY_HARD_CAP` is a recommended follow-up (out of scope this item).

### FUN-04 (FIXED) - order_items insert now fails closed with rollback (no paid order without tickets)

- Root cause: `processCheckout` (GA) and `processSeatCheckout` (seat) only
  `console.error`d an `order_items` insert failure and continued
  ("Order is created, don't fail"), then created the PaymentIntent.
  `issue_tickets_for_order` expands tickets FROM `order_items`, so a no-items
  order confirms and issues zero tickets: the buyer pays and gets nothing
  scannable.
- Fix: `src/app/actions/checkout.ts` - GA path (`:308-316`) and seat path
  (`:611-619`) now, on `itemsError`, delete the just-created order
  (`adminClient.from('orders').delete().eq('id', order_id)`) and return an
  error BEFORE any payment record or PaymentIntent is created. Fail closed with
  rollback (the brief's accepted alternative to full atomicity).
- Proof:
  - Test: `tests/unit/payments/checkout-items-rollback.test.ts` - 2/2 passing.
    It mocks the full `processCheckout` GA paid path and forces the
    `order_items` insert to error, asserting: an error is returned, no
    `client_secret`/`order_id`, `createDestinationCharge` is never called, the
    payment record is never inserted, and the order is deleted (rolled back).
    A happy-path control proves a clean items insert still proceeds to charge.
    `npx vitest run tests/unit/payments/checkout-items-rollback.test.ts` ->
    "Test Files 1 passed (1) / Tests 2 passed (2)".
  - No regression: `npx vitest run tests/unit/payments` -> 14 files / 119 tests
    passing. `npx tsc --noEmit` -> exit 0.
- Note: FUN-05 (free-order path not transactional) is a related P2 still open;
  this item covers the paid + free charge-gated `order_items` swallow only.

### FUN-01 + FUN-03 (FIXED) - checkout display total single-sourced to the charged total

- Root cause: the displayed total and the charged total resolved prices from
  TWO different sources. (a) GA: display used base `tier.price`
  (`page.tsx:165`), charge used `getDynamicPriceMap` (`checkout.ts:150`).
  (b) Seat: display used `seat.price_cents` (`page.tsx`), charge re-priced via
  `get_current_tier_price` (`checkout.ts`). (c) Both display `PaymentCalculator
  .calculate` calls omitted `event.id`, so an event-scoped fee override would
  display the org/region fee but charge the event fee. (d) The seat charge built
  its subtotal from the rounded-average aggregate while the display used the
  exact seat sum, a cents-level mismatch.
- Fix: one shared pricing rule, called by both paths.
  - `src/lib/checkout/pricing.ts` (new) - `pickUnitPriceCents` (dynamic
    overrides base) and `resolveSeatUnitPriceCents` (current dynamic-aware tier
    price, shared fallback ordering).
  - GA: charge `checkout.ts` and display `page.tsx` both resolve the SAME
    `getDynamicPriceMap` through `pickUnitPriceCents`.
  - Seat: charge `checkout.ts` and display `page.tsx` both price each seat
    through `resolveSeatUnitPriceCents` (same `get_current_tier_price`).
  - Both display fee calcs now pass `event.id` (event-scoped fee parity).
  - The seat charge now overrides subtotal/total to the EXACT seat sum, the same
    override the page applies, so they match to the cent.
- Proof:
  - Test: `tests/unit/checkout/pricing.test.ts` - 10/10 passing. Proves
    dynamic-overrides-base, the GA displayed-total == charged-total across base
    / one-dynamic / all-dynamic conditions (same helper, same inputs), and the
    seat resolver's full fallback order. Both display and charge call sites are
    wired to these exact helpers (listed in the test header).
  - No regression: full suite `npx vitest run` -> 42 files / 372 tests passing.
    `npx tsc --noEmit` -> exit 0.
- Note: FUN-02 (discount not echoed back / silently ignored) is a related P2,
  still open; this item covers the dynamic-price + fee-scope + seat-rounding
  divergence.

### PAY-01 (INTERIM APPLIED, residual founder/M7 dependency) - connected accounts no longer left on Stripe's fast automatic default

- Decision (per the fix brief): the target is `manual` + the M7 app-triggered
  disbursement. M7 is NOT safely wireable now - there is no `payouts.create` /
  `transfers.create` disbursement path anywhere in `src` (grep clean; memory
  `project_payout_disbursement` confirms the UI/trigger was handed to
  M7/Session 2), and `release_holds()` only moves reserves in the LEDGER, it
  never calls Stripe to pay out. Setting `manual` without a disbursement trigger
  would strand organiser funds (worse than today). So the INTERIM Stripe delay
  was applied instead.
- Fix (interim): `src/lib/stripe/connect.ts` - `createExpressAccount` now sends
  `settings.payouts.schedule = { interval: 'daily', delay_days }` (previously no
  schedule, so Stripe defaulted to fast automatic payout). New
  `setPlatformPayoutSchedule(accountId, delayDays)` backfills already-onboarded
  accounts via `accounts.update`. `delay_days` is single-sourced from
  `payout_schedule_days` in `pricing_rules` (AU launch default 3, the same value
  the reserve ledger uses), passed in from
  `src/app/api/stripe/connect/onboard/route.ts` (keeps connect.ts DB-free).
- Proof:
  - Unit (CI-safe, offline): `tests/unit/payments/connect-payout-schedule.test.ts`
    - 2/2 passing. Mocks Stripe and asserts `accounts.create` and the backfill
    `accounts.update` are both called with
    `settings.payouts.schedule {interval:'daily', delay_days:3}`.
  - Stripe test-mode round-trip (the required payments verification):
    `scripts/verify-pay01-payout-schedule.mjs` (refuses non-test keys) created a
    real AU Express test account, retrieved
    `schedule {"delay_days":3,"interval":"daily"}`, asserted PASS, then DELETED
    the throwaway account (`deleted=true`). Captured run:
    `CREATED acct_1TjnKN... / RETRIEVED {"delay_days":3,"interval":"daily"} /
    PASS / CLEANUP deleted ... deleted=true` (exit 0).
  - No regression: full suite 43 files / 374 tests; `tsc --noEmit` exit 0.
- RESIDUAL (still a founder action, P0 not fully closed): `delay_days` is
  CHARGE-relative, so this is a settlement BUFFER, not a true post-event reserve
  hold. The reserve model's intent (hold the reserve % until event-end +
  payout_schedule_days, then disburse) still requires `manual` + the M7
  app-triggered disbursement, and a backfill run of `setPlatformPayoutSchedule`
  over already-onboarded live accounts. Tracked for M7; the interim removes the
  "auto-paid on Stripe's fast default" exposure in the meantime.

---

## What PASSED (verified clean, so it is not re-litigated)

- Server-side auth trust is clean. Only two `getSession()` call sites exist in
  `src/`, both client-side and neither an authorization decision. Every
  server-side trust decision uses `getUser()` (JWT-revalidated) with null
  handled. The thing the brief worried about (server `getSession` that should be
  `getUser`) is NOT present. Evidence: `src/lib/payouts/auth.ts:32`,
  `src/app/(dashboard)/layout.tsx:18`, `src/lib/admin/auth.ts:23`,
  `src/app/auth/callback/route.ts:15`.
- Inventory holds are atomic, no oversell. `create_reservation` locks the tier
  row `SELECT ... FOR UPDATE` before the availability check and decrement
  (`supabase/migrations/20260101000001_baseline_schema.sql:1240-1262`).
- Ticket issuance is webhook-driven, not browser-driven (the common P0 is
  ABSENT). Tickets are issued by the `trg_issue_tickets_on_confirm` DB trigger
  inside `confirm_order`, fired only from `payment_intent.succeeded`
  (`src/app/api/webhooks/stripe/route.ts:261`). Closing the tab does not lose the
  ticket; the webhook returns 500 on failure so Stripe retries; `confirm_order`
  is idempotent.
- Fee single-source holds. Charge (`PaymentCalculator`), display
  (`getLivePublicFee`), and payout (`computeApplicationFeeCents`) all resolve
  through the one `getPricingRule` resolver (`src/lib/payments/pricing-rules.ts`);
  scope precedence guards `event_id IS NULL` at every lower level. Displayed ==
  charged. No hardcoded fee number outside the documented fallback constant.
- Money rounding arithmetic is correct everywhere examined: single `/100` +
  `toFixed(2)` / `Intl.NumberFormat`, integer-cents math. The revenue-card defect
  (PAY-02) is inclusion-scope, not floating-point rounding.
- Stripe webhook signature verification + idempotency on the money path are
  solid (`route.ts:36-52`, `claimWebhookEvent` dedupe ledger).
- Confirmation email is reliable and correctly addressed. Sent in the webhook
  after the gate, non-fatal on Resend failure, FROM `EventLinqs
  <noreply@eventlinqs.com>` everywhere. No `onboarding@resend.dev` placeholder
  anywhere. Evidence: `route.ts:1118,1319`, `src/lib/payouts/email.ts:28`.
- `/events` caching is correctly tuned (ISR 60s + edge `s-maxage=60`):
  `src/app/events/page.tsx:34`, `next.config.ts:106-114`.
- No missing `/public/cities/*.svg`. References are guarded by a slug allowlist
  with a regression test: `src/lib/events/home-queries.ts:145`,
  `tests/unit/media/city-svg-exists.test.ts`.
- Mobile audit is clean: 17/17 public pages report `overflowPx:0`, `broken:[]`,
  `consoleErrors:[]`, `axe:0` (`docs/benchmark/system-pass/mobile-audit/mobile-audit.json`).
- Media library has no chop/distort defect: every surface is `fill` +
  `object-cover` (or sanctioned `object-contain`), aspect inherited from parent.

---

## P0 - blockers

### PAY-01 - Connected accounts have no payout schedule (default daily, not platform-controlled)
- Area: Payouts / Stripe Connect
- Severity: P0. The entire reserve/hold/post-event-release model (`payout_holds`,
  `computeReserveCents`, `reserve_hold` ledger) assumes EventLinqs controls when
  funds leave a connected account to its bank. With destination charges, the
  destination account defaults to Stripe's automatic daily rolling payout, so
  organiser funds can leave to their bank before reserves and refund clawbacks
  settle. This is the launch blocker already recorded in memory
  (`project_payout_disbursement`).
- Reproduction / detection:
  1. In the Stripe dashboard open any onboarded connected account, Settings ->
     Payouts: schedule reads "Automatic / Daily", not "Manual".
  2. Or `stripe.accounts.retrieve(acct)` and read
     `settings.payouts.schedule.interval`.
- Evidence: `src/lib/stripe/connect.ts:134-146` - `stripe.accounts.create` sets
  only `type`, `country`, `email`, `capabilities`, `metadata`. No
  `settings.payouts.schedule`. Grep for `payouts.schedule` / `accounts.update`
  across `src/**` returns no hits, so no path sets it later. Confirmed by direct
  read of the file this pass.
- Suspected location: `createExpressAccount` (`src/lib/stripe/connect.ts:134`).
- Remediation (founder decision required, NOT auto-applied):
  - Decide the payout model first. `schedule: { interval: 'manual' }` only works
    if the M7 app-triggered payout/transfer path is wired to actually disburse;
    memory notes that UI was handed to M7/Session 2. Flipping to manual without a
    disbursement trigger would strand organiser funds (worse than today). The
    safer interim is `schedule: { interval: 'daily', delay_days: <reserve window> }`
    so Stripe holds funds long enough for reserves/refunds to settle.
  - Whichever is chosen: pass it in `accounts.create`, and run an `accounts.update`
    backfill for already-onboarded accounts.
  - Verify with a Stripe test-mode `accounts.create` then `accounts.retrieve` to
    confirm `settings.payouts.schedule`.
- Why not fixed this pass: cannot be verify-fixed without a Stripe round-trip;
  the correct value is a founder call with a downstream dependency; payments are
  founder-controlled per the constitution Fee system law.

---

## P1 - major (fix before launch)

### AUTH-01 - Next.js middleware never wired; SSR token refresh + central route protection is dead code
- Area: Auth / Session
- Severity: P1. The `@supabase/ssr` middleware (`updateSession`: per-request token
  refresh + `/dashboard` protection) never executes, so sessions can silently
  expire mid-use and the documented "default-public, explicit-protected" contract
  is unenforced. Not P0 because per-layout `getUser()` gates still protect routes.
- Detection: `ls middleware.ts src/middleware.ts` -> none. `grep -rn
  "updateSession" src/` -> only the definition, zero importers.
- Evidence: `src/lib/supabase/middleware.ts:4` exports `updateSession` (calls
  `getUser()` at :36, `/dashboard` redirect :45-56) but no `middleware.ts` entry
  file exists to call it.
- Suspected location: missing `src/middleware.ts` (should
  `export const middleware = updateSession` + matcher).

### AUTH-02 - Admin session gate does not assert 2FA was completed for the live session
- Area: Auth / Session
- Severity: P1. TOTP is verified only inside `loginAdminAction`. The gate
  `getAdminSession()` re-checks `getUser()` + `admin_users` row + `disabled_at`,
  but never asserts the current session passed the second factor (no AAL2 /
  `mfa_verified` claim). Any path that mints a valid Supabase session for an
  admin's user id without going through `loginAdminAction` (normal `/login`,
  magic link, password reset) is accepted at full admin privilege.
- Detection: read `src/lib/admin/auth.ts:21-49`; `grep -rn "verifyTotp" src/` ->
  TOTP only in `src/app/admin/actions.ts:98-109`.
- Evidence: `src/lib/admin/auth.ts:23-33` - getUser + admin_users + disabled_at,
  no 2FA/AAL assertion.
- Suspected location: `src/lib/admin/auth.ts` (`getAdminSession`).

### AUTH-03 - Admin inactivity timeout is dead code (never enforced)
- Area: Auth / Session
- Severity: P1 (security-hardening). The 4-hour inactivity timeout
  (`isAdminSessionFresh`, `ADMIN_ACTIVITY_COOKIE`) exists but is imported nowhere,
  so admin sessions never expire on inactivity.
- Detection: `grep -rn "isAdminSessionFresh" src/ | grep -v session-timeout.ts`
  -> zero consumers.
- Evidence: `src/lib/admin/session-timeout.ts:13` defines it; the gate
  `src/lib/admin/auth.ts` never imports it.
- Suspected location: wire into `getAdminSession`.

### INFRA-01 - Upstash Redis region is not confirmed Sydney; all evidence points to non-Sydney (likely N. Virginia)
- Area: Reservations / Inventory (latency)
- Severity: P1. Every inventory read and rate-limit decision pays trans-Pacific
  RTT (the team doc estimates ~200-300ms) until a Sydney instance is provisioned
  and cut over. Degradation, not a correctness bug (Postgres stays authoritative).
- Detection / evidence:
  - Live URL `.env.local:36` -> `https://prepared-stork-113798.upstash.io` has no
    region prefix (regional Upstash REST URLs prefix the region, e.g. `apn1-...`;
    the code documents this at `src/app/api/health/redis/route.ts:18-31`).
  - The Sydney migration is logged as an open founder action:
    `docs/hardening/phase1/upstash-sydney-setup.md:1-2` ("AWAITING FOUNDER
    ACTION"); `docs/sessions/hardening/progress.log:208-218` ends "idle" with no
    Sydney health-pass and no decommission entry.
  - `.env.example` / `.env.staging.example` ship the values blank.
- NEEDS-DASHBOARD-CHECK: Upstash console -> database `prepared-stork-113798` ->
  Region field; plus `curl https://eventlinqs.com/api/health/redis` x5 and read
  median `latencyMs` (<20 = Sydney-local; ~200ms+ = trans-Pacific).
- Suspected location: provision per `docs/hardening/phase1/upstash-sydney-setup.md`,
  run `docs/hardening/phase1/redis-migration-runbook.md`. See also INFRA-02.

### PAY-02 - Revenue / net cards count fully-refunded orders at full original value
- Area: Payments (dashboard display)
- Severity: P1. After any refund the organiser Revenue and Net Revenue cards
  overstate revenue: refunded orders are summed at the unreduced original
  `total_cents` and original fee columns. Display-only (no mis-charge), so not P0,
  but it diverges from the authoritative ledger the payouts cards use.
- Reproduction: create + confirm a paid order, fully refund it (drives
  `reconcile_refund`), reload `/dashboard/events/[id]/orders` and
  `/dashboard/events/[id]`. Revenue/Net still show the original amounts; the
  payouts dashboard `availableCents` (ledger-based) shows the correct net.
- Evidence:
  - `src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx:76-81` -
    `confirmedOrders` explicitly includes `'partially_refunded','refunded'`, then
    sums `total_cents` / `platform_fee_cents` / `processing_fee_cents`.
  - `src/app/(dashboard)/dashboard/events/[id]/page.tsx:83-86` - same on the event
    KPI (`grossCents = sum(total_cents)`).
  - `supabase/migrations/20260531000001_refund_reconcile.sql:379-382` -
    `reconcile_refund` updates only `orders.status`; the cents columns keep their
    original values (the refund effect lives only in `organiser_balance_ledger`).
- Worked example: AUD 100 face + 2.50 platform + 2.20 processing = `total_cents
  10470`. Fully refunded. Card still shows Gross 104.70, Net 100.00, though the
  organiser netted 0.
- Suspected location: source revenue from `organiser_balance_ledger` (as the
  payouts cards do), or subtract refunded amounts. No per-order `refunded_cents`
  column exists today.

### FUN-01 - Checkout display total can differ from amount charged (dynamic pricing, general)
- Area: Funnel / Checkout -> Payment
- Severity: P1 (elevate to P0 if any launch event uses active dynamic pricing).
  The buyer can be charged more or less than the total shown on the checkout
  button and summary. Charge is internally consistent (calculator == Stripe ==
  order row), so it is a display/trust bug, not a money-leak.
- Reproduction: enable an active dynamic-pricing rule on a tier, reserve, open
  checkout, compare the "Continue to payment - AUD X" button to the Stripe
  PaymentElement total.
- Evidence: display path uses base price -
  `src/app/checkout/[reservation_id]/page.tsx:165`
  (`unit_price_cents: tierMap.get(...)?.price`); charge path uses dynamic price -
  `src/app/actions/checkout.ts:141,150` (`getDynamicPriceMap`). `processCheckout`
  returns only `{client_secret, order_id}` (`checkout.ts:36-41`), so the client
  never refreshes the displayed `fees`.
- Suspected location: have the checkout page call `getDynamicPriceMap`, or return
  recomputed fees from `processCheckout` before mounting Elements.

### FUN-03 - Seat-mode checkout display total diverges from charge
- Area: Funnel / Checkout -> Payment (seated)
- Severity: P1. Same divergence class as FUN-01 for seated events.
- Reproduction: seated event with a dynamic-priced tier; compare seat checkout
  display total vs charge.
- Evidence: display sums `seat.price_cents ?? firstTier.price` and overrides
  `total_cents` (`src/app/checkout/[reservation_id]/page.tsx:104-124`); charge
  re-prices each seat via `get_current_tier_price` and aggregates a single
  averaged fee tier (`src/app/actions/checkout.ts:512-535`).
- Suspected location: `processSeatCheckout` vs the seat branch of the checkout page.

### FUN-04 - order_items insert failure is swallowed; order proceeds to charge with no items (and thus no tickets)
- Area: Funnel / Checkout -> Issuance
- Severity: P1. Rare but severe: a paid order that issues zero tickets. The buyer
  pays and gets nothing scannable.
- Reproduction: force the `order_items` insert to fail after the `orders` insert;
  flow continues to create the PaymentIntent.
- Evidence: `src/app/actions/checkout.ts:307-311` - on `itemsError` only
  `console.error` then continues ("Order is created, don't fail").
  `issue_tickets_for_order` expands tickets from `order_items`, so a no-items
  order confirms but issues nothing. Seat path has the same swallow at
  `checkout.ts:609-612`.
- Suspected location: `processCheckout` / `processSeatCheckout` post-items error
  branch (should abort and not charge).

### HARD-01 - Auth canonical host: code defaults to the apex, the brief and some redirects expect www; reconcile + confirm Supabase Site URL
- Area: Hardening / Auth Site URL
- Severity: P1. Auth email confirmation, password reset, and OAuth redirect land
  on the wrong host if the canonical host is inconsistent. Code redirect logic is
  sound (built from `window.location.origin`), but `getSiteUrl()` falls back to
  the apex `https://eventlinqs.com` while the brief specifies
  `https://www.eventlinqs.com`, and Vercel serves both apex and www domains.
- Evidence: `src/lib/site-url.ts:34-46` default `https://eventlinqs.com` (apex, no
  www). All Supabase auth callers use `${window.location.origin}/auth/callback`
  (`src/components/auth/signup-form.tsx:35-37`, `login-form.tsx:68`,
  `forgot-password-form.tsx:19`). No localhost/vercel.app hardcoded in auth flows.
  Vercel domains include both `eventlinqs.com` and `www.eventlinqs.com`.
- NEEDS-DASHBOARD-CHECK: Supabase -> Authentication -> URL Configuration: confirm
  Site URL = the chosen canonical host (decide apex vs www and make all surfaces
  agree); confirm the Redirect URLs allowlist contains `/auth/callback` and
  `/auth/reset-password` for that host (+ preview wildcard). Confirm
  `NEXT_PUBLIC_SITE_URL` in Vercel Production = the same host. (This subsumes the
  HARD-08 apex-vs-www reconciliation.)

### HARD-03 - Mapbox public token ships in the client bundle; URL restriction is mandatory
- Area: Hardening / Mapbox
- Severity: P1. `NEXT_PUBLIC_MAPBOX_TOKEN` is inlined into the browser bundle by
  definition; an unrestricted public token can be scraped and run up billable
  usage.
- Evidence: `src/components/features/city/city-map.tsx:92`
  (`mapboxgl.accessToken = accessToken`, a `'use client'` component); passed from
  `src/app/city/[slug]/page.tsx:212`, `src/app/culture/[culture]/[city]/page.tsx:284`,
  `src/app/venues/[handle]/page.tsx:224`.
- NEEDS-DASHBOARD-CHECK: Mapbox -> Access tokens -> the `pk.*` token: confirm a
  URL restriction allowlisting `eventlinqs.com`, `www.eventlinqs.com` (+ the
  `*.vercel.app` preview host if maps must render on previews).

### HARD-06 - Migration drift CONFIRMED: latest migration unapplied on remote
- Area: Hardening / Migrations
- Severity: P1. `20260608000004_admin_user_capability_overrides` exists locally
  but the Remote column is empty (unapplied). The recent admin staff/capability
  feature (commits `8db2d7f`..`ec31cef`) ships code that reads the table/columns
  this migration creates, so that feature will error against prod until it is
  pushed. Admin-only impact, but a required pre-launch action and a hard "do not
  launch with unapplied migrations" gate.
- Evidence (live, this pass): `supabase migration list --linked` output - all 39
  earlier migrations show Local == Remote; the final row
  `20260608000004 | <empty> | 2026-06-08 00:00:04`.
- Remediation: from a tree on the branch carrying the file, `supabase db push
  --linked` (Lawal runs it; note from memory: `db push` only applies migrations
  present in the working tree). Verify via a direct query against
  `supabase_migrations.schema_migrations`, not the PostgREST cache.

### HARD-07 - Stripe Connect redirect routes fall back to http://localhost:3000 in production
- Area: Hardening / Env
- Severity: P1. If `NEXT_PUBLIC_APP_URL` is unset in Vercel Production, organiser
  Stripe Connect onboarding/return/refresh links point at `http://localhost:3000`,
  breaking payout onboarding in prod. These use a different var than the Supabase
  auth base, so the HARD-01 fix does not cover them.
- Evidence: `src/app/api/stripe/connect/onboard/route.ts:23-24`,
  `.../return/route.ts:15`, `.../refresh/route.ts:14` -
  `process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'`. Other consumers
  default to prod instead (`src/lib/payouts/email.ts:193`), so the fallback is
  inconsistent.
- NEEDS-DASHBOARD-CHECK: Vercel -> Settings -> Environment Variables: confirm
  `NEXT_PUBLIC_APP_URL` is set in Production (and Preview) to the canonical host.
  Optional code hardening: change the three fallbacks from localhost to the prod
  default.

### MOB-01 - Live zero-event hero panel (CategoryHeroEmpty) exceeds the hero-scale cap and uses oversized display type
- Area: Mobile / Hero scale
- Severity: P1. `CategoryHeroEmpty` renders on real public zero-event city /
  culture / category pages with `minHeight: clamp(420px,60vh,600px)` (up to 600px,
  over the 480px `.hero-marketing` cap) and `lg:text-6xl` (law caps hero display
  at `text-5xl`). This is the strongest live hero-scale law violation found.
- Detection: open any zero-event intersection (a culture/city with no events) at
  390 and 1440 and compare to `.hero-marketing` (`globals.css:338-343`).
- Evidence: `src/components/ui/CategoryHeroEmpty.tsx:47` (min-height) and `:106`
  (`md:text-5xl lg:text-6xl`).
- Suspected location: `src/components/ui/CategoryHeroEmpty.tsx`. Screenshot to
  confirm scale before/after.

### MOB-02 - next/image used in feature code on public surfaces (constitution Tooling ban)
- Area: Mobile / Media governance
- Severity: P1 (governance). The constitution bans `next/image` outside the media
  components. All instances are image-integrity safe (`fill` + cover/contain), so
  no visible distortion, but each is a banned bypass on a public surface.
- Evidence: `src/app/squad/[token]/page.tsx:3`,
  `src/app/queue/[slug]/queue-room.tsx:5`,
  `src/components/ui/CategoryHeroEmpty.tsx:1` (shared, widely instantiated),
  `src/components/features/events/event-sold-out.tsx:5`. (Authed-only
  `event-form.tsx` and `dashboard/events/[id]/page.tsx` are P2.)
- Suspected location: route through `HeroMedia` / `EventCardMedia` per
  `docs/MEDIA-ARCHITECTURE.md`.

### PERF-01 - Lighthouse 95+ law is not met / not enforced (not run this pass)
- Area: Performance
- Severity: P1. The constitution requires Lighthouse 95+ on desktop AND mobile,
  measured on the warmed Vercel preview or prod (not localhost, not dev). Memory
  records the gate as RED and unmerged, with the 95+ floor unmet on the hero pages
  (`/`, `/culture/*`) due to the next/image optimiser cold-start LCP (Issue #42).
- Status: NOT RUN this pass. A real measurement needs the lighthouse CLI run x3
  (median) against a warmed preview URL, desktop and mobile, against a production
  build, not the dev server.
- Procedure: see `docs/playbooks/LAUNCH-AUDIT-PLAYBOOK.md` (Lighthouse section).
  Warmed preview to target: the latest READY deployment
  (`eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app`).
- Suspected location: Issue #42 (next/image optimiser cold start); `next.config.ts`
  image config; hero LCP rasters.

---

## P2 - minor

### INFRA-02 - Vercel function compute region is not pinned (sfo1 default)
- Area: Reservations / latency
- Severity: P2 (compounds INFRA-01). Even a Sydney Redis loses if functions run in
  sfo1/iad1.
- Evidence: `vercel.json` (24 lines) has only `crons`, no `regions` key; no region
  pin in `next.config.ts`. The team runbook flags this exact trap
  (`docs/hardening/phase1/redis-migration-runbook.md:130-132`).
- Suspected location: add `"regions": ["syd1"]` to `vercel.json` / Vercel project
  region setting.

### RES-01 - Reservation can expire mid-payment, leaving sold_count un-incremented
- Area: Reservations
- Severity: P2. Not an oversell (correctness preserved), but a hold released at
  minute 10 can be taken by another buyer; the paying customer's `confirm_order`
  still confirms the order and issues tickets but never moves `reserved -> sold`,
  so `sold_count` drifts.
- Evidence: `expire_stale_reservations` releases active reservations past
  `expires_at` with no grace / no "payment in progress" guard
  (`baseline_schema.sql:1304-1330`); `confirm_order` only converts inventory
  `IF status='active'` (`:1499`). TTL is 10 min (`:1199`), not extended on
  PaymentIntent creation.
- Suspected location: extend the hold on PaymentIntent creation, or convert
  defensively from `expired` in `confirm_order`.

### RES-02 - Inventory cache can show stale availability for up to 30s
- Area: Inventory
- Severity: P2. No oversell risk (authoritative path is Postgres), but the 30s
  TTL cache plus fire-and-forget refresh means display availability can lag the DB.
- Evidence: TTL 30s (`src/lib/redis/inventory-cache.ts:5`); refresh is
  fire-and-forget with `.catch` swallow (`src/app/actions/reservations.ts:111-115`).

### PAY-03 - connect-ledger hardcodes mode-1 application-fee; diverges from the charge under mode 2
- Area: Payouts (latent)
- Severity: P2 latent. Today `application_fee_composition_mode` defaults to 1 so
  the two agree. If an org/region is ever set to mode 2 (exclusive), the Stripe
  charge pulls only `platform_fee_cents` but the ledger records organiser share as
  `total - (platform+processing)`, understating the credit by the processing fee.
- Evidence: live charge uses mode-aware `computeApplicationFeeCents`
  (`src/lib/.../application-fee.ts:105-113`); ledger hardcodes
  `platform_fee_cents + processing_fee_cents` (`connect-ledger.ts:143`).

### PAY-04 - Squad-member webhook payments skip the event-level idempotency ledger
- Area: Payments
- Severity: P2. Squad-member intents (`metadata.squad_member_id`) bypass
  `claimWebhookEvent` and rely only on natural-key guards (`member.status='paid'`).
  Acknowledged in-code as a follow-up.
- Evidence: `src/app/api/webhooks/stripe/route.ts:64-80`.

### PAY-05 - Orphan partial-refund email shows cumulative amount
- Area: Payments (email display)
- Severity: P2. `sendRefundConfirmationEmail` falls back to
  `charge.amount_refunded` (cumulative) when no per-refund override is passed, so
  staggered partial refunds can show a cumulative figure. Display-only.
- Evidence: `src/app/api/webhooks/stripe/route.ts:1112`, acknowledged at
  `:1032-1039`.

### FUN-02 - Discount is shown to the buyer but is not authoritative
- Area: Funnel / Checkout
- Severity: P2. The button total subtracts the discount client-side; the server
  re-validates independently and silently ignores a stale/invalid code rather than
  erroring, and never echoes the recomputed total back.
- Evidence: client `checkout-form.tsx:154-162,279`; server
  `src/app/actions/checkout.ts:197-210` (comment "we don't error here on stale
  codes"). Same root cause as FUN-01.

### FUN-05 - Free-order path is not transactional
- Area: Funnel / Issuance (free RSVP)
- Severity: P2. Reservation update + per-tier `increment_sold_count` + discount
  usage run as sequential awaits with no rollback; a mid-sequence failure leaves
  the order confirmed but inventory/usage inconsistent. (The paid path is
  protected by the atomic `confirm_order` RPC.)
- Evidence: `src/app/actions/checkout.ts:314-340`.

### FUN-06 - Discount usage recorded only for logged-in users on free orders
- Area: Funnel / Discount integrity
- Severity: P2. Guests can over-redeem a usage-limited code on free orders because
  the usage row/counter is gated on `user?.id`.
- Evidence: `src/app/actions/checkout.ts:330` (`if (discount_code_id && user?.id)`).

### AUTH-04 - Squad pay page reads getUser without an asserted null guard while using the service-role admin client
- Area: Auth / Session
- Severity: P2 (raise to P1 if confirmed). On a public `/squad/[token]/pay/...`
  route the member is loaded via `createAdminClient()` (RLS-bypassing) and `user`
  is read without a shown `if (!user)` guard. If a render path is not gated by
  `user.id` ownership or a guest-token/email match, an unauthenticated visitor
  could view another member's payment context.
- Verification action: read
  `src/app/squad/[token]/pay/[member_id]/page.tsx` past line 37 and confirm every
  render path is gated. Also check `src/app/squad/[token]/page.tsx:48`.
- Evidence: `src/app/squad/[token]/pay/[member_id]/page.tsx:23-27`.

### AUTH-05 - Client-side getSession in save-event and reset-password (informational)
- Area: Auth / Session
- Severity: P2. Both are client-side, used only for a UI gate; the real
  authorization is RLS (`saved_events`) / server-validated `updateUser`. Listed
  for completeness; not a server-trust defect.
- Evidence: `src/components/features/events/save-event-button.tsx:39`;
  `src/components/auth/reset-password-form.tsx:20`.

### SEO-01 - Event schema omits `performer`
- Area: Structured data
- Severity: P2. Google's Event rich-results list `performer` as recommended;
  TM/EB emit it. The props type carries no performer data so it can never be set.
- Evidence: `src/components/features/events/event-schema-jsonld.tsx:21-27,93-141`
  (has `organizer`, no `performer`).

### SEO-02 - Offer `validFrom` set to `created_at`; no `priceValidUntil`
- Area: Structured data
- Severity: P2. `validFrom` should be the tier `sale_start`, not the DB row
  creation time; no `priceValidUntil`/`validThrough` emitted.
- Evidence: `event-schema-jsonld.tsx:78` (`validFrom: event.created_at`).

### SEO-03 - Multi-tier events emit AggregateOffer only, dropping per-tier Offers and validFrom
- Area: Structured data
- Severity: P2. When >1 tier, `offers` is the aggregate only; the per-tier
  `offers[]` array is discarded and the aggregate has no `validFrom`.
- Evidence: `event-schema-jsonld.tsx:138`.

### SEO-04 - Schema availability ignores per-tier sold state
- Area: Structured data
- Severity: P2. Availability is computed once from event-level state, so a
  partially sold-out event advertises all tiers `InStock`.
- Evidence: `event-schema-jsonld.tsx:51-57,76,88`.

### SEO-05 - No BreadcrumbList on event / organiser / venue pages
- Area: Structured data / SEO
- Severity: P2. BreadcrumbList JSON-LD is emitted on cities/cultures pages but not
  on the three highest-value commercial surfaces. TM/EB ship it on event/venue.
- Evidence: grep `BreadcrumbList` returns only cities/cultures; absent from
  `src/app/events/[slug]/page.tsx`, `organisers/[handle]/page.tsx`,
  `venues/[handle]/page.tsx`.

### SEO-06 - Organiser embedded events use city as the venue name and omit street address
- Area: Structured data
- Severity: P2. Each embedded event's `location` uses `venueCity` as both Place
  `name` and `addressLocality` with no `streetAddress`; for null `venueCity`,
  `location` is omitted, making those embedded Events invalid (Event requires
  location).
- Evidence: `src/components/features/organisers/organiser-schema-jsonld.tsx:48-54`.

### SEO-07 - Organiser type is base Organization, never PerformingGroup (informational)
- Area: Structured data
- Severity: P2 informational (documented design choice). No
  performer/PerformingGroup linkage exists.
- Evidence: `organiser-schema-jsonld.tsx:64`.

### SEO-08 - Venue schema uses bare Place, not MusicVenue / EventVenue / LocalBusiness
- Area: Structured data
- Severity: P2. A more specific type would be richer and matches venue
  aggregators. `maximumAttendeeCapacity` is correctly present.
- Evidence: `src/components/features/venues/venue-schema-jsonld.tsx:57`.

### SEO-09 - Event image / OG image can be undefined when no cover_image_url
- Area: Structured data / SEO
- Severity: P2. The schema and OG metadata read the raw `cover_image_url` only; an
  event with none emits an Event with no `image` (Google requires it for Event
  rich results) and ships with no og:image, even though the visible hero always
  resolves a fallback image (`media.image`) that the schema/metadata never reuse.
- Evidence: `event-schema-jsonld.tsx:130-132`; page resolves a guaranteed image
  at `src/app/events/[slug]/page.tsx:377-385` not passed to the schema; OG falls
  back to `[]` (`:221`).

### SEO-10 - Place emits empty-string name/address for events missing venue fields
- Area: Structured data
- Severity: P2. Defensive `?? ''` produces an invalid Place `name: ''` and empty
  address fields rather than omitting the keys.
- Evidence: `event-schema-jsonld.tsx:111-118`.

### DATA-01 - Venue page resolves events by case-insensitive name match (ilike), risking wrong/duplicate event attachment
- Area: Pages / data integrity
- Severity: P2. Venue events are matched by `ilike('venue_name', venue.name)`
  rather than a venue FK; two real venues sharing a name (or a typo) collide, and
  the venue identity is the name-derived slug, so the page and its JSON-LD `event`
  array can embed events that did not occur there.
- Evidence: `src/app/venues/[handle]/page.tsx:40-69`.

### MOB-03 - Dead-code 90vh hero chain and oversized split-state hero (unwired landmines)
- Area: Mobile / Hero scale
- Severity: P2. `HeroCarouselClient` / `FeaturedHeroStaticShell` /
  `FeaturedEventHero` use `md:min-h-[90vh]` (~2x the 480px cap) and
  `SplitStateHero` uses `xl:text-7xl`, but grep shows none are rendered by any
  page (the homepage uses `FeaturedHero`). Landmines that become P1 the moment
  wired in.
- Evidence: `src/components/features/events/hero-carousel-client.tsx:125`,
  `featured-hero-static-shell.tsx:36`, `src/components/features/home/split-state-hero.tsx:51`.
- Suspected location: delete or flatten to `.hero-marketing`.

### MOB-04 - PageHero uses lg:text-6xl, one tier above the hero display ceiling
- Area: Mobile / Hero scale
- Severity: P2. If `PageHero` is the shared content hero, `lg:text-6xl` mildly
  exceeds the `text-3xl sm:text-4xl lg:text-5xl` law.
- Evidence: `src/components/.../PageHero.tsx:53`. Screenshot a PageHero-driven
  page at 1440 to confirm.

### MOB-05 - City-map popup img forces aspect-ratio 16/10 + cover (mild chop risk)
- Area: Mobile / Images
- Severity: P2. The one place an explicit forced aspect-ratio + cover exists is a
  Leaflet/map-popup HTML string (cannot use next/image); tall portrait covers may
  be chopped.
- Evidence: `src/components/features/city/city-map.tsx:242`. Screenshot a
  `/city/sydney` map pin popup to confirm crop is acceptable.

### MOB-06 - Admin tables force min-width 720-820px, overflowing at 390 (admin-only, unaudited)
- Area: Mobile / Layout
- Severity: P2. Admin tables (`min-w-[720px]`..`min-w-[820px]`) are outside the
  public mobile-audit URL set, so their 390px horizontal scroll is unverified.
  Likely acceptable (desktop admin in a scroll container).
- Evidence: `src/app/admin/.../orders/page.tsx:75`, `users/page.tsx:117`,
  `events/page.tsx:127`.

### HARD-02 - Resend domain verification (code clean, dashboard pending)
- Area: Hardening / Resend
- Severity: P2. Sender is `noreply@eventlinqs.com` everywhere; no resend.dev
  placeholder. Only DNS verification is outstanding.
- NEEDS-DASHBOARD-CHECK: Resend -> Domains: confirm `eventlinqs.com` is Verified
  (SPF, DKIM, DMARC green). If Supabase Auth emails route through Resend SMTP,
  that is configured in Supabase -> Auth -> SMTP (dashboard-only).
- Evidence: `src/lib/payouts/email.ts:28`, `route.ts:1118,1319`.

---

## P3 - informational

### MOB-07 - Small touch targets on inline text links
- Area: Mobile / Accessibility
- Severity: P3. The mobile audit flags (does not auto-fail) the two
  "EventLinqs home" logo links (h=20-24) on every page and several "See more"
  text links (h=20) on `/help` and `/press`. Inline text links left at WCAG-AA
  size by design.
- Evidence: `docs/benchmark/system-pass/mobile-audit/mobile-audit.json`
  `smallTargets` arrays; `scripts/mobile-audit.mjs:70-73`.

---

## Vercel usage / project snapshot (read via Vercel MCP, 2026-06-19)

The connected Vercel MCP server exposes project + deployment data but no
billing/usage-metering endpoint, so a quantified usage breakdown (bandwidth,
function compute, image-optimisation units, ISR writes) cannot be read here. That
breakdown lives in the Vercel dashboard -> the project -> Usage tab, and should be
checked there directly. What the API does show:

- Team: "Lawal's projects" (`team_yPo8T18zSl5VczJfWIIrNqly`). Single project
  `eventlinqs-app` (`prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ`), framework Next.js, Node
  24.x, `live: false`.
- Domains: `eventlinqs.com`, `www.eventlinqs.com`, `eventlinqs.com.au`,
  `www.eventlinqs.com.au`, plus the vercel.app aliases. Note both apex and www are
  attached (see HARD-01 host reconciliation), and a `.com.au` pair exists
  alongside `.com`.
- Deployment cadence: of the last 20 deployments, 18 are preview builds on
  `feat/home-rebuild` (PR #81) and 2 are production redeploys on `main` (commit
  `947a8ae`, the Sentry production-gating fix #93). The current production target
  is that `main` deploy; the latest READY preview is
  `eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app`
  (use this as the warmed Lighthouse target for PERF-01). All recent builds use
  the Turbopack bundler and report `lambdaRuntimeStats {"nodejs":2}`.
- Cost note: image optimisation is the usage line most likely to be elevated given
  Issue #42 (optimiser cold-start) and the MOB-02 next/image bypasses; verify the
  Image Optimization counter in the Usage tab.

Action: read the Usage tab in the Vercel dashboard for the quantified breakdown;
the MCP API cannot return it.

---
---

# Appendix: Launch Defect Register - Hardening Pass (fix/hardening-security)

(Merged in from the `fix/hardening-security` branch during launch-line integration.
The authoritative reconciled status across all branches is `docs/LAUNCH-GO-NOGO.md`.)

# Launch Defect Register - Hardening Pass

Branch: `fix/hardening-security`. Owner: platform hardening + QA.
Scope of this pass: the eight items below. Checkout/payment processing files are
out of scope (Tab B); this pass touches only auth, hardening, admin reporting,
infra config, and one migration apply.

**Proof rule:** an item is `FIXED` only with a proof artifact = `file:line` of
the change + a verification capture (test output, or a verify script + its
expected output). Items that need a console/DB credential this engineer does not
hold are marked `CODE+VERIFY READY - FOUNDER ACTION` with the exact one-command
runbook and the verify script that produces the proof.

Verification harness for the code items (run from repo root):

```
npx tsc --noEmit          # 0 errors
npx vitest run            # all suites green
npx eslint <changed>      # 0 errors
```

Last full run this pass: `tsc` 0 errors, `vitest` all green (see per-item
captures), `eslint` 0 errors on changed files.

---

## AUTH-01 - Route-protection entry + gate - VERIFIED (premise corrected)

**Audit premise (stale):** "no `middleware.ts` entry exists, so `updateSession`
is dead code and `/dashboard/*` is reachable unauthenticated."

**Verify-first finding (real environment):** the entry DOES exist and route
protection DOES run. Next.js 16 renamed the route-middleware entry from
`middleware.ts` to `proxy.ts`; the project's `src/proxy.ts` (committed in
`16ac400`) calls `updateSession(request)` at line 92 with a matcher that covers
`/dashboard`. The auditor searched for `middleware.ts`, did not find it, and
wrongly concluded the gate was dead - missing the Next 16 rename. A colliding
`src/middleware.ts` (added then removed this pass) would actually BREAK the
build ("Both middleware file and proxy file are detected"); the correct entry is
`proxy.ts` only.

**State:** no code change required for the gate itself; verified it works. The
HARD-01 host redirect was added to this same `proxy.ts` entry (see HARD-01).
- `src/proxy.ts:92` - `proxy()` calls `updateSession(request)`.
- `src/lib/supabase/middleware.ts:51` - the `/dashboard` redirect-if-no-user gate.

**Proof:** `tests/unit/security/middleware-protected-route.test.ts`
- `src/proxy.ts` exists + wires `updateSession` with a matcher, and NO stray
  `src/middleware.ts` coexists,
- unauthenticated `/dashboard` -> 307 redirect to `/login?redirect=%2Fdashboard`,
- unauthenticated nested `/dashboard/payouts` -> 307 to `/login`,
- public `/events` passes through (no redirect),
- authenticated user bounced off `/login` -> `/dashboard`.

```
vitest run tests/unit/security/middleware-protected-route.test.ts -> 6 passed
```

---

## AUTH-02 - Admin gate did not assert 2FA on the live session - FIXED

**Defect:** admin 2FA is a custom TOTP flow (`src/app/admin/actions.ts`), not
Supabase native MFA, so a Supabase session carries no 2FA signal. `getAdminSession`
trusted any authenticated session for a user with an `admin_users` row - a
session minted by the public buyer `/login` page would pass the admin gate
without ever completing 2FA.

**Fix:** a tamper-proof (AES-256-GCM), httpOnly 2FA proof cookie, issued only
after the admin flow verifies the second factor, and required by the gate.
- `src/lib/admin/two-factor.ts` - seal/validate/issue/clear proof (new module).
- `src/lib/admin/auth.ts:40` - gate rejects any session without a valid proof
  bound to the current user (`hasValidTwoFactorProof`).
- `src/app/admin/actions.ts:122` - issue proof after `verifySecondFactor` passes
  on login; `:283` re-issue after enrolment confirms a live TOTP code; `:191`
  clear on logout.

**Proof:** `tests/unit/admin/two-factor-gate.test.ts`
- pure: proof valid for its user only, rejected for another user, when expired,
  when missing/garbage/tampered (GCM auth fails),
- gate: valid user + admin row but **no proof cookie -> `getAdminSession()` is
  `null` (BLOCKED)**; proof for a different user -> `null`; valid proof -> session.

```
vitest run tests/unit/admin/two-factor-gate.test.ts -> 7 passed
```

---

## HARD-01 - Supabase apex vs www host mismatch - FIXED (code) + dashboard confirm

**Defect:** the Supabase Auth Site URL is `https://www.eventlinqs.com` (auth
cookies live on www) while in-code link/email defaults emitted the apex
`https://eventlinqs.com`. A user landing on the apex got cookies on a different
host than auth, so sessions could be dropped. Founder ruling: **www is
canonical.**

**Fix:**
- `src/lib/site-url.ts:32` - `PRODUCTION_FALLBACK = 'https://www.eventlinqs.com'`
  (drives both `getSiteUrl` and `getAppUrl`).
- `src/proxy.ts` (`canonicaliseHost`, called first in `proxy()`) - apex
  `eventlinqs.com` -> `308` redirect to `www.eventlinqs.com`, preserving path +
  query, before any cookie is touched. Exact-hostname match leaves localhost and
  `*.vercel.app` previews untouched; the Stripe webhook path is exempted.

**Proof:** `tests/unit/security/canonical-host-redirect.test.ts`
- apex `/events?city=sydney` -> 308 `https://www.eventlinqs.com/events?city=sydney`,
- www host not redirected, localhost not redirected, vercel preview not redirected.

```
vitest run tests/unit/security/canonical-host-redirect.test.ts -> 4 passed
```

**Founder action (dashboard, confirm only):** verify Supabase Dashboard ->
Authentication -> URL Configuration Site URL is `https://www.eventlinqs.com` and
that both apex and www are added as Redirect URLs. The Vercel domain config
should keep www as primary (the middleware redirect is belt-and-suspenders and
does not loop with a Vercel www-primary setup).

---

## HARD-03 - Restrict the Mapbox token to eventlinqs.com - CODE+VERIFY READY - FOUNDER ACTION

**Defect:** the public Mapbox token (`NEXT_PUBLIC_MAPBOX_TOKEN`, used by
`src/components/features/city/city-map.tsx`) ships in the client bundle and, if
unrestricted, is usable from any origin (quota theft).

**Status:** URL restriction is a Mapbox account-dashboard setting on the token;
this engineer holds no Mapbox console or token value (no `.env.local` present).
The verification is scripted and ready.

**Founder runbook:**
1. Mapbox dashboard -> Account -> Tokens -> the public token -> URL restrictions.
2. Add `eventlinqs.com` and `www.eventlinqs.com`. Save.
3. Verify:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxxx node scripts/verify-mapbox-restriction.mjs
   ```

**Proof (expected):** `scripts/verify-mapbox-restriction.mjs` requests a Mapbox
style with a foreign Referer (`evil.example.com`) and with the allowed origin.
PASS = foreign -> `403`, allowed -> `200`. Paste the script output here to close.

---

## HARD-07 - Remove the localhost fallback for NEXT_PUBLIC_APP_URL - FIXED

**Defect:** route handlers resolved
`process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'`. If the env var were
ever unset in a deployed environment, the app would emit a `localhost` link into
a Stripe redirect or an email.

**Fix:** a shared deploy-safe resolver, no localhost fallback.
- `src/lib/site-url.ts:67` - `getAppUrl()`: `NEXT_PUBLIC_APP_URL` ->
  `NEXT_PUBLIC_SITE_URL` -> Vercel domains -> `https://www.eventlinqs.com`
  (never localhost). Local dev still resolves to localhost via the env *value*,
  not a hardcoded fallback.
- `src/app/api/stripe/connect/onboard/route.ts`, `.../return/route.ts`,
  `.../refresh/route.ts` - `appUrl()` now returns `getAppUrl()` (URL resolution
  only; no payment logic touched).

**Proof:** `tests/unit/security/no-localhost-app-url-fallback.test.ts`
- guard: no file under `src/` contains a `NEXT_PUBLIC_APP_URL ?? 'http://localhost'`
  fallback,
- `getAppUrl()` with the env unset returns `https://www.eventlinqs.com` (never
  localhost) and honours an explicit prod value.

```
vitest run tests/unit/security/no-localhost-app-url-fallback.test.ts -> 3 passed
```

---

## INFRA-01 - Migrate Upstash Redis to Sydney - CODE+VERIFY READY - FOUNDER ACTION

**Defect:** Redis is on the N. Virginia free tier; every read from Sydney Vercel
compute pays ~200-300ms trans-Pacific RTT.

**Status:** provisioning is an Upstash console + Vercel env action; this engineer
holds neither console nor the Vercel env write path. Runbook +
verification are ready. The health endpoint already exposes region + latency
(`src/app/api/health/redis/route.ts`).

**Founder runbook:** `docs/hardening/phase1/upstash-sydney-setup.md` (provision
`ap-southeast-2` Fixed 250 MB, swap the two Vercel env vars across
prod/preview/dev, redeploy). Then verify:
```
node scripts/verify-upstash-sydney.mjs https://www.eventlinqs.com
```

**Proof (expected):** `scripts/verify-upstash-sydney.mjs` hits
`/api/health/redis`; PASS = region is the AU/Sydney code AND `latencyMs < 20`.
Paste the script output here to close.

---

## PAY-02 - Revenue cards counted refunded orders at full value - FIXED

**Defect:** the admin dashboard GMV tiles queried a non-existent
`total_amount_cents` column filtered to `status = 'confirmed'` and never read the
refunds table. The wrong column meant the tile silently failed; the logic, had
it worked, counted every confirmed order at full value and ignored refunds
entirely (`partially_refunded`/`refunded` mis-valued).

Two revenue surfaces were affected; both now route through the audited
`aggregateGmv` aggregator, net of completed refunds.

**Surface 1 - admin dashboard GMV tiles** (`src/app/admin/(authed)/page.tsx`):
- `:6` import `aggregateGmv`; `:113` select `total_cents, platform_fee_cents,
  status` for paid statuses (`confirmed`, `partially_refunded`, `refunded`);
  `:133` subtract completed refunds -> `netGmvCents`. The old query read a
  non-existent `total_amount_cents` column (tile silently failed).

**Surface 2 - organiser event "Revenue" card + Revenue Summary**
(`src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx`): the QA-flagged
`orders/page.tsx` summed `total_cents` over the paid statuses with NO refund
netting, so a fully refunded order showed at full value. Now the Revenue stat
card shows `aggregateGmv(...).netGmvCents` and `RevenueSummary` gains an explicit
Refunds line (`src/components/orders/revenue-summary.tsx`, new optional
`refundedCents` prop). The sibling edit-page card
(`events/[id]/edit/page.tsx`) filters `status='confirmed'` only - a confirmed
order has no completed refund by definition - so it already excludes refunded
orders and is left unchanged (no regression: it passes no `refundedCents`).

**Proof:** `tests/unit/admin/dashboard-gmv-refund.test.ts` (the exact net math
both surfaces now use) - confirmed 10000 + fully-refunded 3000 (refund 3000) +
partially-refunded 5000 (refund 2000) -> gross 18000, refunded 5000, **net
13000** (the old gross-only behaviour overstated by 5000). Plus existing
`tests/unit/admin/analytics.test.ts`. tsc + eslint clean on both surfaces.

```
vitest run tests/unit/admin/dashboard-gmv-refund.test.ts -> 3 passed
```

---

## MIG-01 - Migration 20260608000004 unapplied on remote - VERIFY READY - FOUNDER ACTION

**Defect:** `supabase migration list --linked` shows
`20260608000004_admin_user_capability_overrides` local-only (empty remote) - real
drift. The admin per-user capability override feature errors in prod until
applied. The migration file is present and correct
(`supabase/migrations/20260608000004_admin_user_capability_overrides.sql`,
idempotent `ADD COLUMN IF NOT EXISTS`).

**Status:** the constitution reserves `supabase db push --linked` for the founder
(PowerShell), and this engineer holds no Supabase access token / DB password and
the project is not linked here. Apply + verify is a founder one-liner.

**Founder runbook (PowerShell, from repo root):**
```powershell
supabase link --project-ref <sydney-project-ref>   # if not already linked
supabase db push --linked
```
Then verify with a DIRECT DB query (not the cached client - its schema cache
lags):
```powershell
psql "$env:SUPABASE_DB_URL" -f scripts/verify-mig-20260608000004.sql
# or: supabase migration list --linked   (20260608000004 now shows on Remote)
```

**Proof (expected):** `scripts/verify-mig-20260608000004.sql` returns the
`20260608000004` row from `supabase_migrations.schema_migrations` AND both
`capabilities_granted` / `capabilities_revoked` columns on `public.admin_users`.
Paste the psql output here to close.

---

## CI status (PR #98)

| Check | Result | Note |
|---|---|---|
| lint / typecheck / build | **PASS** | full `next build` with real env |
| test (vitest) | **PASS** | 378 tests |
| Vercel deploy | **PASS** | preview deployed |
| types-drift guard | **FAIL (pre-existing = MIG-01)** | committed `database.ts` has `admin_users.capabilities_granted/revoked`; live remote lacks them because `20260608000004` is unapplied. NOT touched by this PR. Goes green when the founder applies MIG-01. |
| Lighthouse mobile gate | **FAIL (pre-existing = Issue #42 / MAJOR-1)** | LHCI collect against localhost errors with `ERRORED_DOCUMENT_REQUEST` (404). The documented localhost-collect gate gap; independent of this PR's auth/redirect/revenue changes (none touch the public pages Lighthouse loads). |

The three checks that validate this PR's code all pass. The two reds are
pre-existing conditions, one of which (types-drift) is literally the MIG-01 item
and clears the moment `supabase db push --linked` runs.

## Summary

| Item | State | Proof artifact |
|---|---|---|
| AUTH-01 | VERIFIED (premise corrected) | `src/proxy.ts:92` + middleware-protected-route.test.ts (6) |
| AUTH-02 | FIXED | `src/lib/admin/two-factor.ts` + two-factor-gate.test.ts (7) |
| HARD-01 | FIXED (code) | `src/proxy.ts` canonicaliseHost + canonical-host-redirect.test.ts (5) |
| HARD-03 | FOUNDER ACTION | scripts/verify-mapbox-restriction.mjs |
| HARD-07 | FIXED | `src/lib/site-url.ts:67` + no-localhost-app-url-fallback.test.ts (3) |
| INFRA-01 | FOUNDER ACTION | scripts/verify-upstash-sydney.mjs |
| PAY-02 | FIXED | `src/app/admin/(authed)/page.tsx:133` + dashboard-gmv-refund.test.ts (3) |
| MIG-01 | FOUNDER ACTION | scripts/verify-mig-20260608000004.sql |
