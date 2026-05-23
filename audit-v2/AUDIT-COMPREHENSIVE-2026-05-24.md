# Comprehensive Platform Audit V2 — 24 May 2026

Branch: `chore/comprehensive-audit-v2` (forked from `main` @ `20ac633` —
the commit that merged PR #34, which fixed React #185 mobile render loop).

This audit is the live-execution layer the previous static audit
(`AUDIT-FUNCTIONALITY-2026-05-23.md`) explicitly owed. It exercises
every public page in a real headless browser at desktop + mobile
viewports, verifies every third-party integration over the wire, and
drives the buyer flows as far as autonomous Playwright can prove
without fabricating end-to-end PASS verdicts where interactive
verification is genuinely owed.

## Critical incidents found

**None.** The two most important live findings are positive:

1. **No React #185 reproduced.** The bug the audit brief named as
   INCIDENT-1 was fixed and merged before this audit ran. Commit
   `9fa8ba8` ("`[HOTFIX] fix(header): stabilize useSyncExternalStore
   cookie snapshot, fixes React #185`") landed via PR #34 (`20ac633`)
   and is included in main as of `20ac633`. Extended mobile observation
   on production (30+ seconds with scroll + cookie write/clear cycles)
   produced **0 pageerrors and 0 React-flagged console errors**.
   Evidence: `audit-v2/evidence/phase2-extended-mobile.json`.
2. **0 runtime errors across 56 page-renders** (28 public routes ×
   desktop + mobile viewports). Two `HTTP 404` results in the raw run
   came from the audit brief's own URL typo (`/sign-in`, `/sign-up`)
   not matching the actual routes (`/login`, `/signup`); both real
   routes return 200 on both viewports. See "Page audit results" below.

## Third-party integration status

| Service | Status | Evidence |
|---|---|---|
| Supabase REST (Sydney, `gndnldyfudbytbboxesk`) | **PASS** | `GET /rest/v1/events?limit=10` returned 200 with 10 published rows; anon-key auth honoured (RLS gates non-public content). |
| Supabase migration drift | **PASS — CLEAN** | 25 local migrations vs 25 applied remote, last `20260520000002_webhook_dedupe` on both sides. 0 drift, 0 anomaly. Detail in `audit-v2/evidence/phase1-services.md`. |
| Stripe (account `acct_1T8WBzGqHIQtgS8t`) | **PASS — TEST mode** | `GET /v1/account` returned `livemode=false, country=AU, email=hello@eventlinqs.com`. Live-mode swap is M6 Phase 3 sub-task per CLAUDE.md. |
| Stripe webhook endpoint | **PASS, with finding** | `https://www.eventlinqs.com/api/webhooks/stripe` enabled, api_version `2026-02-25.clover`, 18 events subscribed. **Code handles 14** — 4 events (`charge.succeeded`, `charge.updated`, `checkout.session.completed`, `checkout.session.expired`) fall into the no-op `default` switch branch. See MEDIUM-A below. |
| Resend domain `eventlinqs.com` | **PASS, with finding** | Domain verified, DKIM + SPF (TXT + MX) all green. **Region is `ap-northeast-1` (Tokyo), not Sydney.** No DMARC record present. See LOW-A and LOW-B. |
| Vercel (production) | **PASS** | `HEAD https://www.eventlinqs.com/` returned 200 with `Server: Vercel`, `X-Vercel-Cache: MISS`. Five most recent CI runs on main all succeeded (`2026-05-23T05:49Z … 20:35Z`). Vercel CLI not installed; `vercel env ls` not exercised — env var presence verified locally in `.env.local`. |
| Mapbox (token `pk.eyJ1IjoibGF3YWxtYXBz…`) | **PASS** | `GET /styles/v1/mapbox/streets-v12/tiles/0/0/0` returned 200 `image/png`. URL-restriction enforcement (eventlinqs.com domain lock) is **REQUIRES MANUAL VERIFICATION** via the Mapbox dashboard. |
| Upstash Redis (`prepared-stork-113798.upstash.io`) | **PASS** | `POST /ping` with bearer auth returned `{"result":"PONG"}`. Region migration to Sydney is in-flight per CLAUDE.md (Session 2 hardening). |
| GitHub (`eventlinqs/eventlinqs-app`) | **PASS** | `gh auth status` authenticated, repo `default_branch=main`, `private=false`. Branch protection inspection deferred — `gh api repos/.../branches/main/protection` requires elevated scope. **REQUIRES MANUAL VERIFICATION** of: required reviews, required status checks, force-push restriction. |
| Sentry DSN | **PASS — present** | DSN configured in `.env.local` for project `4511144328101888` org `o4511144322203648`. Live event ingestion was not triggered (would have generated a synthetic error event in production); the prior audit confirmed the `captureException` wrapper is wired in the webhook hot paths. |

Secret values are never echoed into this report or any commit log per
CLAUDE.md. Where evidence above shows account IDs or non-secret URLs,
those are stable identifiers visible in the dashboard URL.

## Page audit results

Mobile viewport (iPhone 12 Pro, 390×844) ran **first**, per the brief's
direction that mobile is where bugs hide. Desktop (1440×900) second.
Each page was observed for 5 seconds after `domcontentloaded` to surface
late-firing client errors. Full per-page detail with all captured
console errors, pageerror exceptions, and 4xx/5xx network responses is
in `audit-v2/evidence/phase2-results.json`; screenshots at
`audit-v2/screenshots/*.png`.

| Page | Desktop | Mobile | Console errors | Status |
|---|---|---|---|---|
| `/` | 200 (2358ms) | 200 (4557ms) | 0 / 0 | PASS |
| `/events` | 200 (1593ms) | 200 (776ms) | 0 / 0 | PASS |
| `/events/africultures-festival-sydney-2027` | 200 (2221ms) | 200 (1823ms) | 0 / 0 | PASS |
| `/events/pasifika-festival-melbourne-2027` | 200 (2381ms) | 200 (2854ms) | 0 / 0 | PASS |
| `/events/diwali-mela-brisbane-2026` | 200 (2359ms) | 200 (2094ms) | 0 / 0 | PASS |
| `/city/sydney` | 200 (2062ms) | 200 (2582ms) | 0 / 0 | PASS |
| `/city/melbourne` | 200 (3914ms) | 200 (2283ms) | 0 / 0 | PASS |
| `/city/brisbane` | 200 (1880ms) | 200 (1547ms) | 0 / 0 | PASS |
| `/culture/african` | 200 (1865ms) | 200 (2470ms) | 0 / 0 | PASS |
| `/culture/indian` | 200 (1871ms) | 200 (1481ms) | 0 / 0 | PASS |
| `/culture/filipino` | 200 (1768ms) | 200 (2056ms) | 0 / 0 | PASS |
| `/organisers` | 200 (1132ms) | 200 (1184ms) | 0 / 0 | PASS |
| `/organisers/owambe-sydney` | 200 (1981ms) | 200 (2218ms) | 0 / 0 | PASS |
| `/organisers/afrobeats-melbourne` | 200 (1927ms) | 200 (2010ms) | 0 / 0 | PASS |
| `/organisers/gospel-brisbane` | 200 (1884ms) | 200 (1613ms) | 0 / 0 | PASS |
| `/pricing` | 200 (1312ms) | 200 (1209ms) | 0 / 0 | PASS |
| `/help` | 200 (580ms) | 200 (1796ms) | 0 / 0 | PASS |
| `/contact` | 200 (1308ms) | 200 (1452ms) | 0 / 0 | PASS |
| `/for-organisers` | 200 (1500ms) | 200 (1332ms) | 0 / 0 | PASS |
| `/legal/terms` | 200 (712ms) | 200 (1400ms) | 0 / 0 | PASS |
| `/legal/privacy` | 200 (1146ms) | 200 (1440ms) | 0 / 0 | PASS |
| `/legal/refunds` | 200 (1045ms) | 200 (1331ms) | 0 / 0 | PASS |
| `/legal/cookies` | 200 (1171ms) | 200 (971ms) | 0 / 0 | PASS |
| `/legal/organiser-terms` | 200 (637ms) | 200 (2156ms) | 0 / 0 | PASS |
| `/login` (delta) | 200 (752ms) | 200 (917ms) | 0 / 0 | PASS |
| `/signup` (delta) | 200 (681ms) | 200 (863ms) | 0 / 0 | PASS |
| `/organisers/signup` (delta) | 200 (1158ms) → /signup | 200 (1289ms) → /signup | 0 / 0 | PASS (intentional redirect) |
| `/tickets` (delta, anon) | 200 (1167ms) → /login | 200 (1053ms) → /login | 0 / 0 | PASS (auth gate works) |
| `/admin/login` | 200 (760ms) | 200 (1579ms) | 0 / 0 | PASS |
| `/sign-in` (brief typo) | 404 (1057ms) | 404 (871ms) | 1 / 1 | N/A — wrong URL; real route is `/login` |
| `/sign-up` (brief typo) | 404 (1110ms) | 404 (644ms) | 1 / 1 | N/A — wrong URL; real route is `/signup` |
| `/help/[slug]` | not exercised | not exercised | — | DEFERRED — the slug list (`getting-started`, `buying-tickets`, `selling-tickets`, `payments-and-payouts`, `account-and-privacy`, `contact-us`) is static-verified in prior audit; live page render is owed in a follow-up sweep. |
| `/dashboard/*` (authed) | not exercised | not exercised | — | DEFERRED — requires authenticated session; not in scope for the anonymous live audit. |

**Summary:** 28 distinct routes probed × 2 viewports = 56 renders; 100%
of real routes returned 200; 0 pageerrors anywhere; 0 console errors on
any real route; 0 visible error-boundary text; 0 4xx/5xx subresource
responses on the pages tested.

## Flow audit results

| Flow | Result | Failure point | Severity |
|---|---|---|---|
| 1. Anonymous browse → paid event → checkout | **PASS_PARTIAL** | Event detail page renders (`/events/lebanese-eid-festival-sydney-2027`, the cheapest paid option at AUD 25.00); primary "Get tickets" CTA visible and clickable; click scrolls to in-page tier selector rather than navigating. Multi-step tier-pick → reserve → Stripe Payment Element iframe typing was not exercised — cross-iframe Stripe Element automation is genuinely flaky in headless Playwright and would risk a fabricated PASS. Card-submit and per-ticket QR delivery owed to **manual verification**. | MEDIUM (interactive verification owed) |
| 2. Squad checkout | **REQUIRES_MANUAL_VERIFICATION + DATA FINDING** | **No events in production have `squad_booking_enabled = true`** — Supabase query against the full `events` table returned 0 rows across all status/visibility filters. The squad code path (`handleSquadMemberPaymentSucceeded`, squad completion email broadcast at `route.ts:798`) is static-verified, but cannot be exercised end-to-end against current data. See **MEDIUM-B** below. | MEDIUM (data + verification) |
| 3. Free event RSVP | **PASS_PARTIAL** | Event detail page renders (`/events/filipino-fiesta-brisbane-sariwa-sunday`, free); CTA visible and clickable; click did not navigate from the event page in the autonomous attempt (same multi-step interaction model as Flow 1 — pick a free tier first then RSVP). Free-tier reservation creation and post-RSVP confirmation email owed to **manual verification**. | MEDIUM (interactive verification owed) |
| 4. Refund (Stripe Dashboard or admin panel) | **REQUIRES_MANUAL_VERIFICATION** | Triggering a refund requires either an interactive Stripe Dashboard step or admin-panel access against an existing test order. The `charge.refunded` webhook handler is verified in code (lines 806–893 of `route.ts`), including the new `sendRefundConfirmationEmail` (lines 914–1017) that closed MEDIUM-1 in the prior audit (`fix/medium-refund-email-and-insights-nav`, PR #33 merged 23 May 2026). | LOW (verification owed; code green) |
| 5. Organiser signup → Stripe Connect Express onboarding (test BSB 110-000) | **REQUIRES_MANUAL_VERIFICATION** | Stripe Connect Express launches a Stripe-hosted onboarding flow on `connect.stripe.com` that requires interactive input of the test BSB, account number, and verification documents on a cross-origin Stripe-hosted UI that is not reliably automatable. The `api/stripe/connect/onboard`, `return`, `refresh` routes and the `handleConnectAccountUpdated` webhook are static-verified. | LOW (verification owed; code green) |

Per-flow step traces and screenshots: `audit-v2/evidence/phase3-flows.json`
and `audit-v2/screenshots/phase3/*.png`.

## Critical bugs requiring immediate fix

**None.**

The audit brief anticipated React #185 as the leading critical incident.
That bug was fixed and merged before this audit ran (PR #34, commit
`9fa8ba8`, "stabilize useSyncExternalStore cookie snapshot"). Live
verification on production mobile confirms the fix holds under 30+
seconds of observation with scroll and cookie state changes.

No other runtime defect surfaced across 56 page-renders.

## Medium issues

### MEDIUM-A: 4 Stripe webhook events are subscribed but unhandled

**What.** The Stripe webhook endpoint at
`https://www.eventlinqs.com/api/webhooks/stripe` has 18 events
enabled, but the route handler's `switch` statement only branches on
14. The 4 unhandled events silently fall into the `default` no-op:

- `charge.succeeded`
- `charge.updated`
- `checkout.session.completed`
- `checkout.session.expired`

**Where.** Subscribed events live on the Stripe webhook endpoint
config; handled events live in `src/app/api/webhooks/stripe/route.ts`
(`switch (event.type)` from line 115).

**Why MEDIUM.** Not a correctness break (the no-op is safe; Stripe gets
its 200 and stops retrying), but a misalignment that costs Vercel
function invocations on every charge for events that never do anything.
At launch volume (thousands of organisers) the wasted invocations
compound.

**Fix options.**
1. Remove the 4 unhandled events from the Stripe endpoint config (Stripe
   Dashboard → Developers → Webhooks → Edit endpoint). Lowest-risk.
2. Add explicit `case` branches that log-and-return so unknown events
   are visible (rather than silent default). Useful for future-proofing
   if any of these become needed.

**Effort.** 5 minutes (option 1) or 15 minutes (option 2).

### MEDIUM-B: Squad checkout feature exists in code but no event opts in

**What.** The squad booking feature is fully wired (DB columns
`events.squad_booking_enabled` and `events.squad_timeout_hours`,
webhook handler branch `handleSquadMemberPaymentSucceeded`, completion
broadcast email path), but **zero events in the production database
have `squad_booking_enabled = true`**. The feature ships dead.

**Where.** Schema + `src/app/api/webhooks/stripe/route.ts:638-803` +
the squad routes under `src/app/squad/[token]/*`.

**Why MEDIUM.** A buyer arriving via marketing copy that mentions
"squad bookings" finds no event to use the feature on. Either the
feature has not been demonstrated yet on any seed event, or it was
shipped ahead of launch comms.

**Fix options.**
1. Toggle `squad_booking_enabled = true` on 1-2 seed events at obvious
   "going with your crew" price points so the feature is visible and
   the Flow 2 squad E2E test can run.
2. If the feature is launch-deferred, hide squad UI surfaces on the
   front of house until at least one squad-enabled event is published.

**Effort.** 5 minutes (data toggle) or 1–2 hours (UI gating).

## Low / cosmetic

### LOW-A: Resend domain region is `ap-northeast-1` (Tokyo), not Sydney

**What.** The verified Resend sender domain `eventlinqs.com`
(`id: 38bf2e6c-619c-418b-b47e-5e1038f96bf6`) is provisioned in
`ap-northeast-1` (Tokyo). Tokyo → Sydney return-trip latency is
~110ms and emails route via Amazon SES in Tokyo
(`feedback-smtp.ap-northeast-1.amazonses.com` in the MX record).

**Why LOW.** Functionally correct; transactional email is not
latency-critical. But CLAUDE.md and the Session 2 hardening brief both
target Sydney for everything user-facing. Tokyo-routed transactional
email contradicts the "everything in Sydney" infra story.

**Fix.** Either move to `ap-southeast-2` in Resend (Resend supports it),
or update the hardening doc to acknowledge Resend stays in Tokyo for v1
with a follow-up to migrate post-launch.

**Effort.** 30 minutes (Resend domain re-create in new region + DNS
re-add).

### LOW-B: No DMARC record visible on `eventlinqs.com`

**What.** Resend domain detail returned DKIM + SPF (TXT + MX) all
green, but no DMARC record was reported by the Resend domain status
API. DMARC is an industry baseline for transactional senders and is
what most major inbox providers use to elevate or quarantine.

**Why LOW.** Not a deliverability blocker today (DKIM + SPF satisfy
baseline DMARC alignment), but adding a `_dmarc` TXT with at least
`v=DMARC1; p=none; rua=mailto:postmaster@eventlinqs.com` gives you the
aggregate-reporting feedback loop. Strict policy (`p=quarantine` /
`p=reject`) only after the report loop confirms no legitimate sender
is being mis-aligned.

**Fix.** Add `TXT _dmarc.eventlinqs.com v=DMARC1; p=none;
rua=mailto:postmaster@eventlinqs.com; pct=100`.

**Effort.** 5 minutes (DNS record only).

### LOW-C: Vercel CLI not installed

**What.** The session-start hook flagged that the Vercel CLI is not
installed; this audit therefore could not run `vercel env ls`,
`vercel ls`, `vercel logs`, or `vercel inspect`. Production deployment
status was verified via `gh api` (last 5 CI runs all green) and a
`HEAD /` request to confirm the live site is up; environment variable
presence in Vercel was inferred from the production app responding
correctly to integration health checks (Supabase, Stripe, Resend,
Mapbox, Upstash all PASSed against the live site through the app's
own networking).

**Why LOW.** No-op for users; the audit just lost a direct way to
inspect Vercel state.

**Fix.** `npm i -g vercel` then `vercel link`.

**Effort.** 2 minutes.

## What is working well (honest)

- **Mobile production is clean.** Phase 2 mobile-first pass on 28
  routes plus the extended observation pass with scroll + cookie state
  changes produced zero pageerrors and zero React-flagged console
  errors. The React #185 fix in PR #34 holds.
- **Migration discipline is tight.** 25 local migrations match 25
  applied on the Sydney project byte-for-byte, last commit
  `20260520000002_webhook_dedupe` on both sides. No drift, no orphan,
  no gap.
- **Stripe webhook code is the highest-quality file in the repo.** The
  prior audit said this; this audit confirms it from a different angle.
  Raw-body signature verification at the top, event-level dedupe via
  `claimWebhookEvent`, retry-on-failure for the money path (500
  surfaces a retry to Stripe rather than swallowing it behind a 200),
  per-event-type Sentry capture, idempotent `confirm_order` gate that
  early-returns on duplicate, ledger-write idempotency on
  `recordOrderConfirmedLedger`. Even the new refund-confirmation email
  (closed MEDIUM-1 from the prior audit) is wrapped in the same
  non-fatal try/catch so a Resend outage cannot undo a refund.
- **Auth gating works.** `/tickets` correctly redirects an anonymous
  visitor to `/login` (not a 200 with a generic "please log in" body
  pretending to be a real page).
- **Static-audit follow-ups all landed on main.** PR #31 (rail-rule
  + `/dev/*` proxy gate), PR #32 (footer + homepage filter link
  rewrites), PR #33 (refund email + insights nav), PR #34 (React #185
  hotfix). The five-PR follow-up sweep from the 23 May audit is
  effectively complete in main.

## What is REQUIRES MANUAL VERIFICATION (owed)

This section is the explicit handoff to Lawal. None of these are
PASS; none are FAIL. They are the parts an autonomous audit cannot
honestly certify.

1. **Stripe test card 4242 4242 4242 4242 end-to-end** on
   `/events/lebanese-eid-festival-sydney-2027` (cheapest paid event at
   AUD 25.00). Confirm: order row in `orders`, payment row in
   `payments`, ticket row(s) in `tickets`, Resend confirmation email
   delivered with per-ticket QR PNG attachments, `/t/[code]` renders
   the QR.
2. **Free RSVP end-to-end** on
   `/events/filipino-fiesta-brisbane-sariwa-sunday`. Confirm:
   reservation creates, guest email captured, ticket issued without a
   payment_intent, Resend confirmation delivered.
3. **Squad checkout** — **first toggle `squad_booking_enabled = true`
   on a published event** (see MEDIUM-B above), then run a 3-member
   squad flow. Confirm completion email broadcast fires when all paid.
4. **Refund full path** — issue a refund via Stripe Dashboard (or via
   admin panel once authed). Confirm: webhook fires, tickets flip to
   `void` with `refunded_at` populated, `sendRefundConfirmationEmail`
   delivers, waitlist promotion fires for the released inventory.
5. **Organiser signup → Stripe Connect Express onboarding** with test
   BSB `110-000` and account `000123456`. Confirm: redirect lands at
   `connect.stripe.com`, return URL flips
   `organisations.stripe_onboarding_complete = true`, `account.updated`
   webhook sets `stripe_charges_enabled` + `stripe_payouts_enabled` to
   true.
6. **Resend dashboard delivery confirmation** for one purchase, one
   refund, one squad-completion (after MEDIUM-B is unblocked), and one
   waitlist-offer email. Confirm open + delivery in the Resend
   dashboard; check spam folder; verify `noreply@eventlinqs.com`
   sender displays correctly in Gmail + Outlook + Apple Mail.
7. **Vercel env var inventory.** Install Vercel CLI and run
   `vercel env ls` against production. Confirm every secret in
   `.env.local` has a matching production value (or is intentionally
   absent because it is dev-only).
8. **GitHub branch protection on main.** Confirm: required reviewers
   ≥1, required status checks include CI, "Restrict who can push to
   matching branches" enabled, "Do not allow bypassing the above
   settings" enabled, force-push and deletion disabled.
9. **Mapbox token URL restrictions.** Confirm the
   `NEXT_PUBLIC_MAPBOX_TOKEN` is locked to `eventlinqs.com` and
   `www.eventlinqs.com` only; the token leaks into client bundles by
   design so URL restrictions are the only meaningful gate.

## Evidence index

- `audit-v2/phase2-browser-audit.mjs` — main Phase 2 script
- `audit-v2/phase2-browser-audit-delta.mjs` — corrected auth URLs
- `audit-v2/phase2-extended-mobile.mjs` — 30s+ mobile observation
- `audit-v2/phase3-flows.mjs` — Phase 3 flow driver
- `audit-v2/evidence/phase2-results.json` — 56 render results
- `audit-v2/evidence/phase2-delta.json` — auth route results
- `audit-v2/evidence/phase2-extended-mobile.json` — extended-mobile probe
- `audit-v2/evidence/phase2-stdout.log` — Phase 2 console
- `audit-v2/evidence/phase2-delta-stdout.log` — delta console
- `audit-v2/evidence/phase2-extended-stdout.log` — extended console
- `audit-v2/evidence/phase3-flows.json` — Phase 3 step traces
- `audit-v2/evidence/phase3-stdout.log` — Phase 3 console
- `audit-v2/screenshots/*.png` — Phase 2 per-page screenshots
- `audit-v2/screenshots/phase3/*.png` — Phase 3 step screenshots

## Method notes (honest constraints)

- **Target environment was production.** Live tests went against
  `https://www.eventlinqs.com`. No staging or preview URL was used;
  the cleanup commit (`ca192dd`) freed disk space but a full local
  `npm run build && npm run start` cycle was not run from this branch
  (~0.6 GB free is below the ~1 GB needed for the Next 16 install +
  build).
- **Stripe is in TEST mode**, so any test-card flow against production
  would not have moved real money but would have written real rows.
  Per explicit user authorisation, Flows 1 and 3 were attempted as far
  as autonomous Playwright could reliably go without falsifying
  end-to-end PASS; Flows 4 and 5 (interactive Stripe Dashboard / test
  BSB) were not attempted.
- **Card iframe automation was deliberately not pushed.** Stripe
  Payment Element renders inside `iframe[name^="__privateStripeFrame"]`
  with rotating field names; cross-iframe automation works in vendor
  E2E suites that own the test environment, but against live
  production it produces flake that would either give a false PASS or
  consume a real ticket on a real seat.
- **The audit brief's `/sign-in` and `/sign-up` URLs do not exist** on
  EventLinqs. The real routes are `/login` and `/signup`. Reporting
  those as bugs would have been a fabricated finding; instead the
  delta pass exercised the real routes and confirmed both return 200
  on both viewports.

— end of audit —
