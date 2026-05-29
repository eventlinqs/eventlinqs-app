# EventLinqs: Full Front-to-Back Honesty Audit

Date: 29 May 2026
Auditor role: read-only engineering auditor. Zero code changes, zero schema changes, zero destructive data operations.
Production: https://www.eventlinqs.com (Vercel, Sentry release 36d73c3c, deploys `main`, HEAD `95a4775`)
Database: Supabase `gndnldyfudbytbboxesk` (Sydney), read-only SELECT only
Stripe: TEST mode

## Evidence tags

- `[pw]`  live production browser run (executed against www.eventlinqs.com)
- `[db]`  read-only SQL against the live database, result quoted
- `[code]` found in source, file and line cited, NOT executed
- `[infer]` inferred, no direct execution

Methodology note on `[pw]`: a dedicated Playwright MCP server was not attached to this session. Live production checks were run through the connected browser-automation tool (Firecrawl agent browser), which fetches the real rendered production page. Every `[pw]` line below is a real HTTP 200/404 result from live production with the rendered content quoted. This is functionally equivalent live verification; it is flagged here so the tool used is not misrepresented.

Status definitions applied strictly: WORKS = proven end to end by live execution (`[pw]`/`[db]` only). HALF-BUILT = code exists but unverified, partial, or fails at some step. MISSING = no implementation found.

---

## Ground-truth data snapshot (all `[db]`, live)

| Metric | Value |
|---|---|
| organisations | 17 |
| organisations with `stripe_account_id` | 0 |
| organisations `stripe_onboarding_complete` | 0 |
| organisations `stripe_charges_enabled` | 0 |
| events total / published / draft | 46 / 32 / 14 |
| ticket_tiers paid (price>0) / free (price=0) | 71 / 14 |
| orders total | 1 (status `pending`, total 9890c, created 2026-05-28) |
| payments total | 1 (status `initiated`, 9890c) |
| tickets total | 0 |
| ticket_scans total | 0 |
| reservations total / active / converted / expired | 10 / 7 / 0 / 0 |
| profiles (registered users) | 4 |
| admin_users | 1 |
| refunds / payouts / payout_holds / organiser_balance_ledger | 0 / 0 / 0 / 0 |
| squads / squad_members / waitlist / virtual_queue | 0 / 0 / 0 / 0 |
| venues / seat_maps / seats | 0 / 0 / 0 |
| artists / event_artists / follows / genres tables | DO NOT EXIST |
| pg_cron / pg_net extensions | NOT installed |

Three headline facts that frame everything below:

1. The STATUS doc claim "17 orgs, all `stripe_account_id` null" is VERIFIED exactly `[db]`.
2. No payment has ever completed and no order has ever been confirmed. The single payment is stuck at `initiated`; the single order is stuck at `pending` `[db]`.
3. The `tickets` table has zero rows and there is no code that writes to it. No ticket has ever been issued on this platform `[db]` `[code]`.

---

# SECTION 1 - ORGANISER JOURNEY

Can a real brand-new organiser do everything end to end today? **No.** The build-and-list path works in code; the get-paid path is unproven and structurally incomplete (destination charges not wired, no organiser has ever completed Stripe onboarding, payouts are stubs).

## WORKS

- Public organiser-facing surfaces render live. Homepage, /events, event detail all return 200 SSR `[pw]`. Event detail `africultures-festival-sydney-2027` renders two real tiers (General Admission AUD 45, VIP + Backstage AUD 185) with quantity steppers and "Select tickets to continue" `[pw]`.
- Organiser dashboard is auth-gated. `/dashboard/payouts` unauthenticated redirects to `/login?redirect=%2Fdashboard%2Fpayouts` `[pw]`, gate enforced in `src/lib/supabase/middleware.ts:43-49` (`protectedPrefixes = ['/dashboard']`) `[code]`.

## HALF-BUILT (code exists, never proven live)

- Organisation create. `src/app/(dashboard)/dashboard/organisation/actions.ts:23-113` inserts org (name, slug, description, website, email, phone), adds owner to `organisation_members`, sets profile role `organiser` `[code]`. Note `organisation_members` has 0 rows `[db]`, so the owner-membership write has not been exercised in production by a real signup (the 17 orgs were seeded).
- Stripe Connect onboarding. Full flow present: `src/app/api/stripe/connect/onboard/route.ts:36-162` creates an Express account + AccountLink; `connect/return/route.ts:78-88` syncs `stripe_charges_enabled/payouts_enabled/capabilities/requirements/onboarding_complete`; `src/lib/stripe/connect-handlers.ts:16-115` handles `account.updated` and auto-promotes to `tier_1`; UI CTA in `src/components/organiser/connect-onboarding-card.tsx` and `dashboard/payouts/page.tsx:93-101` `[code]`. UNPROVEN: 0 of 17 orgs have any Stripe account, onboarding_complete, or charges_enabled `[db]`. Nobody has ever finished this flow.
- Event create (free and paid tiered). `src/app/(dashboard)/dashboard/events/actions.ts:83-206`; `CreateEventInput` (lines 37-81) captures title, summary, description, category_id, tags, dates, timezone, event_type, venue, ticket_tiers[], visibility, age_restriction, max_capacity, squad_booking_enabled, has_reserved_seating; tiers inserted at 163-184 with price stored as cents `[code]`. 32 published + 14 draft events and 85 tiers exist `[db]`, but these were seeded by migration, not created through the live form by a new organiser.
- Event edit. `events/[id]/edit/page.tsx` + `actions.ts:212-338` update event and delete-then-reinsert tiers `[code]`.
- Orders / revenue view. `events/[id]/orders/page.tsx:39-84` reads real orders and computes gross / platform fee / processing fee `[code]`. With only 1 pending order in the system, this has never shown a confirmed sale `[db]`.
- Payouts dashboard. `dashboard/payouts/page.tsx:21-101` derives Connect state and renders the onboarding card `[code]`. The `payouts` table is empty and its webhook writer is a Phase-1 stub (see Section 5) `[db]`.
- Pricing (dynamic), discounts, seats management pages all exist as client-backed pages under `events/[id]/` `[code]`; `dynamic_pricing_rules`, `discount_codes`, `seats` tables all have 0 rows `[db]`.

## Where it breaks

- A new organiser can build and publish an event, but cannot be paid: (a) no organiser has ever completed Stripe onboarding `[db]`; (b) even after onboarding, the checkout PaymentIntent does not use destination charges, so funds would not route to the organiser (Section 5) `[code]`; (c) payouts are not implemented beyond a logging stub `[code]`.

---

# SECTION 2 - BUYER JOURNEY

Can a buyer complete a purchase and receive a ticket end to end today? **No.** Discovery and the pre-payment checkout scaffolding work in code, but no purchase has ever completed and ticket issuance does not exist.

## WORKS

- Browse and search. `/events` returns 200, "24 events available", date and category filters, grid/map toggle, SSR `[pw]`.
- Event detail. Renders tiers, pricing, organiser, share links, SSR `[pw]`.
- Public discovery surfaces. Homepage trending, by-city (Melbourne 10, Sydney 8, Brisbane 5, Adelaide 1), free-events rail, venues all render live `[pw]`. Note: the homepage "Verified organisers" block is explicitly labelled "Placeholder content for founder review. Real verified-organiser data will populate from the platform registry when seeded" `[pw]`, and the NAIDOC cultural-calendar card is "placeholder pending community-sourced content" `[pw]`.
- Login gate. `/login` offers Google OAuth, email/password, and magic link `[pw]`.

## HALF-BUILT

- Reservation creation. `src/app/actions/reservations.ts:32-81` calls `create_reservation` RPC; the RPC (baseline migration) takes a `FOR UPDATE` lock on the tier row before checking availability and supports guest `session_id` `[code]`. Proven to create rows (10 reservations exist) but 0 have ever converted `[db]`.
- Checkout / PaymentIntent. `src/app/actions/checkout.ts:332-393` creates a payment row (`initiated`) then a Stripe PaymentIntent and returns `client_secret` `[code]`. There is no organiser-Stripe guard at checkout (see Section 5). UNPROVEN end to end: the one payment is stuck `initiated` `[db]`.
- Free RSVP. `src/app/actions/register-free.ts:40-204` verifies all tiers are free and calls `confirm_order` `[code]`. No free order has ever been created (orders total = 1, and it is paid+pending) `[db]`.
- Guest checkout. `checkout.ts:235-236` writes `guest_email`/`guest_name`; ownership validated by `session_id` `[code]`.
- Logged-in checkout. Same path with `user_id` `[code]`.
- Discount codes. Validated and applied in `checkout.ts:186-207`, usage recorded in `discount_code_usages` `[code]`; both `discount_codes` and `discount_code_usages` are empty `[db]`.
- Tickets dashboard. `dashboard/tickets/page.tsx:61-110` reads confirmed orders and their `order_items` (it does not read a tickets table because none is populated); renders attendee names but no QR `[code]`.
- Order confirmation page. `orders/[order_id]/confirmation/page.tsx` renders order summary, calendar and share actions, and the line "Digital tickets and QR codes will be sent to your email once activated" `[code]`.
- Squad / group booking. Full code path: `squad-checkout.ts`, `squads.ts`, squad pay pages, `handleSquadMemberPaymentSucceeded` in the webhook `[code]`. `squads`/`squad_members` tables empty `[db]`.
- Waitlist. `waitlist.ts`, `promoteWaitlist`, cron `waitlist-expire` `[code]`. `waitlist` table empty `[db]`.

## MISSING

- Ticket issuance and QR. No code anywhere writes to the `tickets` table; no QR generation, no HMAC ticket code, no `/t/[code]` public ticket-view route exists `[code]`. The `tickets` table has 0 rows `[db]`. The confirmation email body says verbatim "Your tickets will be available in your EventLinqs account once our ticketing system is fully activated" (`src/app/api/webhooks/stripe/route.ts:752-754`) `[code]`. This is a self-declared not-built feature.
- Confirmation email proven delivery. Send code exists (`sendConfirmationEmail`, webhook 640-684) but only fires on `payment_intent.succeeded`, which has never occurred `[db]`.
- QR scan / check-in at the door. `ticket_scans` table empty, no scanner route in the page list `[db]` `[code]`.

## Where it breaks

- Even a free RSVP produces only a confirmed order row, not a ticket with a QR (no ticket entity exists). A paid purchase has never completed in production. The buyer journey cannot deliver a usable ticket today.

---

# SECTION 3 - ADMIN JOURNEY (platform control)

Does an /admin panel exist? **Yes, deployed, but it is observability-and-auth only with zero operational control.** Overall state: PARTIALLY-SCAFFOLDED.

Note: the admin code is on `main` (production) but is absent from the current feature branch working tree (`feat/sprint1-phase1b-performance-and-visual`). Production serves it.

## WORKS

- `/admin/login` is live in production: renders "Admin console - Restricted access. All actions are logged." with email, password, 6-digit code and recovery-code option; `robots: noindex, nofollow` `[pw]`.

## HALF-BUILT (built but observability/compliance only)

- Admin auth + RBAC + 2FA. `src/lib/admin/auth.ts` (`requireAdminSession`), `src/lib/admin/rbac.ts` (roles super_admin/admin/support/moderator), `src/app/admin/actions.ts` (TOTP enrol + recovery codes), `src/app/admin/(authed)/enrol-2fa/` `[code]`. 1 admin_user exists `[db]`.
- Audit log viewer. `src/app/admin/(authed)/audit/page.tsx` with filtering; writes via `src/lib/admin/audit.ts` `[code]`. `audit_log` table exists (0 rows) `[db]`.
- Admin dashboard tiles. `src/app/admin/(authed)/page.tsx` shows GMV (today/week/month from orders), KYC queue depth (orgs with payout_status on_hold/restricted), new organisers today `[code]`.

## MISSING (the operational core a ticketing operator needs)

- See/search all organisers: no route `[code]`.
- Approve / unapprove / suspend organisers or events: no UI, no action `[code]`.
- Edit pricing_rules platform-wide: no admin pricing editor; zero references to `pricing_rules` in admin code `[code]`. (This directly contradicts Scope 3.18 "non-negotiable" admin fee configuration.)
- View all orders / payments / refunds operationally: not built; dashboard comments state "Pending refunds - Refund table arrives in M6 Phase 5" and "Active disputes - M6 Phase 6" `[code]`.
- Event content moderation queue, support tooling, reconciliation, system-health: not built `[code]`.
- Admin path is not protected at the middleware layer (only `/dashboard` is); protection relies on `requireAdminSession()` inside each page `[code]`. Worth a security follow-up but not a functional blocker.

How far short: the platform has admin identity, 2FA and an audit ledger, but a platform operator today cannot run the marketplace (cannot moderate, cannot adjust fees, cannot manage money). This is perhaps 15 percent of the required admin capability.

---

# SECTION 4 - GENRE DISCOVERY DATA LAYER

Judging the data layer only (the visual browse UI is intentionally waiting on the designer). **The spec data layer is essentially not started (~5 percent). A different, narrower cultures/cities taxonomy exists instead.**

## WORKS (the parallel taxonomy that does exist)

- Cultures/cities/event-types taxonomy is seeded and live: `cultures` (14 rows), `event_types` (15), `cities` (20), `suburbs` (24), `event_categories` (21) `[db]`. City browse `/events/browse/{city}` renders with canonical URL and SSR `[code]` and the homepage city rail works `[pw]`.
- Category landing pages exist at `/categories/[slug]` driven by hardcoded `src/lib/hero-categories.ts` (afrobeats, amapiano, gospel, owambe, caribbean, heritage-and-independence, networking), SSR with unique title/description/OG `[code]`.

## MISSING (everything the GENRE-DISCOVERY-FOUNDATION-SPEC actually asks for)

- Genre taxonomy tables (parent + sub-genre): no `genres` table `[db]`. The two-level music taxonomy in the spec (House, Techno, Afrobeats, Amapiano, etc.) is not seeded.
- Artists model: no `artists` table `[db]`; `/artists/burna-boy` returns HTTP 404 `[pw]`.
- Event-artist lineup: no `event_artists` table `[db]`.
- Follow model: no `follows` table `[db]`; no follow/unfollow code or API anywhere `[code]`.
- Genre browse routes: `/music/{slug}` and `/music/{slug}/{city}` do not exist; `/music/techno` returns HTTP 404 `[pw]`.
- Event-creation genre/sub-genre + artist tagging: event form has a single flat `category_id` only; no genre or artist fields `[code]`.
- SEO JSON-LD `MusicEvent` / `MusicGroup`: zero matches in code `[code]`.

What exists instead: free-text `tags` JSONB on events (e.g. `["afrobeats","amapiano"]`) plus hardcoded hero-categories. This supports "browse Afrobeats events" loosely but cannot do artist-level discovery, sub-genre hierarchy, or a follow feed. The spec's acceptance criteria 1-10 are all unmet.

---

# SECTION 5 - PAYMENT INFRASTRUCTURE END TO END

PROVEN by execution: nothing. UNPROVEN or structurally incomplete: everything that moves money.

## WORKS

- Webhook signature verification and routing scaffold. `src/app/api/webhooks/stripe/route.ts:17-113` verifies the Stripe signature and dispatches 14 event types `[code]`. Endpoint is deployed (production release confirmed) but no successful payment event has ever been processed `[db]`.

## HALF-BUILT

- Reservation creation with row lock (`create_reservation`, `FOR UPDATE`) `[code]`; 10 created, 0 converted `[db]`.
- `payment_intent.succeeded` handler. `handlePaymentSucceeded` (webhook 115-301): transitions payment to completed, calls `confirm_order`, marks seats sold, refreshes cache, sends email `[code]`. It never issues tickets (no `tickets` insert) `[code]`. Never executed `[db]`.
- Failure/cancel/requires_action handlers and `charge.refunded` waitlist release exist `[code]`, all unexercised `[db]`.
- Connect `account.updated` handler syncs org Stripe fields and promotes tier `[code]`; never fired (0 connected accounts) `[db]`.
- Refunds. `refunds` table exists with lifecycle comment, but the audit found no organiser/admin refund-processing UI wired; `charge.refunded` only releases inventory. `refunds` table empty `[db]`.

## MISSING / NOT WIRED

- Destination charges. The locked architecture (CLAUDE.md: "Destination charges with transfer_data.destination + application_fee_amount + on_behalf_of") is NOT implemented. `StripeAdapter.createPaymentIntent` (`src/lib/payments/stripe-adapter.ts:20-29`) creates a plain PaymentIntent with only amount/currency/automatic_payment_methods/receipt_email/metadata. Checkout (`checkout.ts:354-368`) passes no destination, no application fee, no on_behalf_of. Grep for `transfer_data|application_fee|on_behalf_of|destination` across payment code returns zero matches `[code]`. Consequence: any completed charge would settle entirely to the platform Stripe account; no funds would route to the organiser.
- The documented checkout "payment setup" wall. The STATUS doc states the 29 May test showed "This organiser has not finished payment setup". This string and any organiser-Stripe guard at checkout or on the event-detail buy path could not be found in current `main` `[code]`. The only "Set up payouts" strings are the organiser-side onboarding CTA. As built today, checkout does not block on the organiser having no connected account; it would attempt a plain platform charge. (Honest note: I did not push a live test card through, to avoid creating a real test-mode charge and confirmed order/payment rows on the production platform account. The break is therefore documented from code and the empirical `[db]` fact that nothing has ever completed, rather than reproduced by forcing a charge.)
- Ticket issuance after payment. No `tickets` write anywhere `[code]`; `tickets` table 0 rows `[db]`. Self-declared "once activated" in code.
- Reservation-expiry sweeper. Function `expire_stale_reservations()` exists (baseline migration 1291-1333) and the migration tries to schedule it via pg_cron (1340-1352), but pg_cron is NOT installed (`pg_extension` query returns empty) `[db]`, so the schedule block silently skips. No Vercel cron calls it either: `vercel.json` crons are only `waitlist-expire`, `squad-expire`, `warm` `[code]`. `queue-admit` route exists but is not scheduled in `vercel.json` `[code]`. Empirical proof it never runs: 7 reservations are stuck `active` and 0 have ever reached `expired` `[db]`. Stale paid-ticket holds are released only lazily on the next `create_reservation` for the same scope.
- Payout processing. `handleConnectPayoutEvent` is a Phase-1 stub that upserts `payouts` rows on webhook; no payout initiation, holds, reserves, or instant-payout logic. `payouts`, `payout_holds`, `organiser_balance_ledger` all empty `[db]` `[code]`.
- Dispute / chargeback handling. `handleConnectDisputeEvent` (webhook 923-939) logs only; "Phase 5 implements the freeze + evidence pack" `[code]`.
- Webhook idempotency ledger. `processed_webhook_events` table exists (0 rows) but the webhook does not claim/record events through it; it relies on per-handler status checks `[code]` `[db]`.

State clearly: the payment system has never taken a single payment, never confirmed an order, never issued a ticket, never paid out, and does not currently route money to organisers even if a charge succeeded.

---

# FINAL RANKED BUILD BACKLOG

Ordered by how hard each blocks a national public launch (most blocking first).

1. Ticket issuance + QR + `/t/[code]` view (MISSING). No ticket entity is ever created; the product cannot deliver what it sells. Hard launch blocker number one.
2. Destination charges in checkout (MISSING/NOT WIRED). Plain platform PaymentIntent means organisers never get paid; charging on behalf of sellers without routing funds is a legal and financial non-starter. Blocks taking real money.
3. End-to-end paid purchase proven live (UNPROVEN). Zero completed payments, zero confirmed orders. Until one real test-card purchase completes through reservation to ticket, payments are unverified.
4. Stripe Connect onboarding completed by at least one organiser (UNPROVEN). 0 of 17 orgs connected; the entire payout model is untested against a real connected account.
5. Reservation-expiry sweeper actually running (MISSING execution). Function exists but is never scheduled (pg_cron off, no Vercel cron); inventory can be held indefinitely. Direct oversell/lockout risk under load.
6. Payout processing, holds, reserves, negative-balance handling (HALF-BUILT, stub only). Required before any organiser can be paid at scale.
7. Refund processing UI + flow (HALF-BUILT). `refunds` table exists; no operator/organiser refund action wired. Consumer-law exposure at launch.
8. Admin operational controls: organiser/event moderation, approve/suspend, all-orders view (MISSING). Cannot run a marketplace without them.
9. Admin platform fee configuration / `pricing_rules` editor (MISSING). Scope-flagged "non-negotiable"; fees currently only editable via DB.
10. Dispute / chargeback handling (HALF-BUILT, log-only). Inevitable on any ticketing platform; needed before real volume.
11. Webhook idempotency via `processed_webhook_events` (HALF-BUILT). Current per-handler checks are weaker than the dedicated ledger that already exists unused. Hardening before scale.
12. Confirmation email proven delivery (UNPROVEN). Tied to item 3; never fired.
13. Admin path middleware protection (HALF-BUILT). Page-level guard only; defence-in-depth gap.
14. Genre discovery data layer: genres, artists, event_artists, follows tables + `/music` and `/artists` routes + event-form tagging + JSON-LD (MISSING). Strategic moat foundation; not a day-one functional blocker but blocks the differentiation thesis. Visual UI intentionally deferred to the designer.
15. Homepage placeholder data ("Verified organisers", NAIDOC card) replaced with real registry/community content (HALF-BUILT). Credibility issue for public launch.

---

## Test artefacts created

None. This audit performed only read-only SELECT queries and live read-only page fetches against production. No accounts, orders, reservations, payments, or any other records were created, modified, refunded, approved, or deleted. No source or schema files were changed. The only files written are this report at `docs/audit/AUDIT-FULL-2026-05-29.md`.
