# EventLinqs: Launch-Readiness Assessment

Date: 31 May 2026
Auditor role: read-only engineering auditor. Zero application-code changes, zero schema changes, zero destructive data operations.
Branch assessed: `audit/launch-readiness`, cut from `origin/main` at `3037a8f` (the deployed production line).
Production: https://www.eventlinqs.com (Vercel Pro, Sentry instrumented)
Database: Supabase `gndnldyfudbytbboxesk` (Sydney), read-only SELECT and live `count` only.
Stripe: TEST mode.

This assessment supersedes `docs/audit/AUDIT-FULL-2026-05-29.md` where they differ. That audit was accurate on 29 May, but the build moved materially in 48 hours: ticket issuance, destination charges, the organiser-balance ledger, payout reserves, and the genre/artist data tables have all landed since. Each such change is flagged below with `[changed since 29 May]`.

## Evidence tags

- `[pw]` live production HTTP result against www.eventlinqs.com, status quoted.
- `[db]` read-only query against the live Supabase database, result quoted.
- `[code]` found in source on the assessed tree, file/line cited, not executed.
- `[infer]` reasoned conclusion, no direct execution.

## Status definitions (applied strictly)

- **Built and verified in prod** - code complete AND proven end to end by a live `[pw]`/`[db]` execution.
- **Built, unverified** - code complete and deployed, but no live execution proves the full path.
- **Partial** - some of the module is real; named pieces are missing or stubbed.
- **Not started** - no meaningful implementation found.

The competitor set referenced throughout is the locked four: Ticketmaster.com.au, DICE.fm, Eventbrite.com.au, Humanitix.com.

---

## Ground-truth data snapshot (all `[db]`, live 31 May 2026)

| Metric | Value | vs 29 May |
|---|---|---|
| organisations | 18 | +1 |
| organisations with `stripe_account_id` | **1** | **+1 (was 0)** |
| events total / published / draft | 47 / 32 / 14 | +1 |
| ticket_tiers (paid / free) | 86 (71 / 14) | +1 |
| orders total | 2 (1 `confirmed`, 1 `pending`) | +1 |
| payments total | 2 (1 `completed`, 1 `initiated`) | +1 completed |
| **tickets issued** | **1** (`EL-7EGD-2N7N`, status `valid`) | **+1 (was 0)** |
| ticket_scans | 0 | - |
| reservations total / converted | 11 / **1** | first conversion |
| organiser_balance_ledger | **1** (`order_confirmed`, +7150c) | **new** |
| payout_holds | **1** (`reserve`, 1430c, releases 10 Jun) | **new** |
| payouts / refunds / disputes | 0 / 0 / 0 | - |
| processed_webhook_events | 1 | new |
| genres / artists / event_artists | **13 / 0 / 0 (tables exist)** | **genres seeded** |
| follows / linqs / reviews tables | DO NOT EXIST | - |
| profiles (registered users) | 4 | - |
| admin_users | 1 | - |
| squads / waitlist / venues / seats | 0 / 0 / 0 / 0 | - |
| pricing_rules / tax_rules | 59 / 6 | - |

Three headline facts that frame everything below:

1. **The money path now works at least once, end to end.** Order `EL-6HBNEYY9` is `confirmed`; its payment `completed` (7582c); its reservation `converted`; a ticket was issued (`EL-7EGD-2N7N`); the organiser was credited in `organiser_balance_ledger` (+7150c); and a 20% reserve (1430c) was placed in `payout_holds` with a release date `[db]`. The public ticket view `/t/EL-7EGD-2N7N?k=...` returns 200 live `[pw]`. This is the single most important change since 29 May.
2. **It has worked exactly once, in TEST mode, with one connected organiser.** One transaction is proof of wiring, not proof of robustness. No payout has ever been disbursed (`payouts` is empty), no refund has ever processed, and Stripe is still in TEST mode `[db]`.
3. **The platform sells a single product line well (general-admission and tiered tickets) and almost nothing else.** Social, recommendations, resale, gamification, multi-gateway, reserved seating, the public API, and most admin operations are absent or stubbed.

---

## Module 1: Foundation (auth, database, RBAC, environment)

**Status: Built and verified in prod.**

Scope refs: 2 (architecture), 3.9 (auth/roles), 4.1 (app security).

Evidence:
- Auth live: `/login` offers Google OAuth, email/password, and magic link `[pw]`. Supabase Auth backs it. 4 registered profiles `[db]`.
- Route protection: `src/lib/supabase/middleware.ts` gates `/dashboard`; unauthenticated `/dashboard/*` redirects to `/login` `[code]` `[pw]`.
- Schema is substantial and live: 80+ public tables including `events`, `ticket_tiers`, `orders`, `order_items`, `reservations`, `tickets`, `payments`, `pricing_rules` (59 rows), `tax_rules` (6 rows), `organisations`, `organisation_members` `[db]`.
- `src/types/database.ts` was regenerated from the live schema (per STATUS doc, PR #52) and a non-blocking types-drift CI guard exists.
- Health and observability endpoints respond: `/api/health/redis` returns 200 live `[pw]`.

Gaps:
- Phone OTP auth is not built; auth is email-centric (Scope 3.9.2 calls phone OTP "critical for African markets") `[code]`. Not a launch blocker for an AU-first soft launch.
- `organisation_members` has 1 row `[db]`; the owner-membership write on real organiser signup is essentially unexercised. The 18 orgs were seeded.

Competitor note: foundational auth/roles are at parity with the field. None of the four competitors expose anything here that EventLinqs lacks for an AU launch.

---

## Module 2: Event Management (builder, lifecycle, tiers, add-ons, seating)

**Status: Built, unverified end to end by a real organiser** (the surfaces and seeded data are real; no event has been created through the live form by a net-new external organiser).

Scope refs: 3.1 (event builder, lifecycle, ticketing engine, reserved seating).

Evidence:
- Create event (free and paid tiered): `src/app/(dashboard)/dashboard/events/actions.ts` captures title, summary, description, category, tags, dates, timezone, venue, visibility, age restriction, capacity, squad toggle, tiers (price stored as cents) `[code]`. 32 published + 14 draft events, 86 tiers exist `[db]`.
- Edit event: `events/[id]/edit` updates event and replaces tiers `[code]`.
- Lifecycle states exist in data (`published`/`draft`); pause/postpone/cancel transitions are not exposed operationally to organisers in UI `[code]`.

Gaps:
- **Reserved seating: not started.** `venues`, `seat_maps`, `seats` all 0 rows; no seat-map builder `[db]`. Per `docs/STATUS-2026-05-29.md` strategy lock this is a deliberate deferral until a real organiser needs it. Acceptable for soft launch; documented as deferred.
- **Add-ons: not started.** No `add_ons` table `[db]`.
- Event create has never been driven by a real external organiser end to end `[db]` `[infer]`.

Competitor note: the builder is competitive with Humanitix and Eventbrite for general-admission. Reserved seating is a Ticketmaster strength EventLinqs intentionally does not match at launch.

---

## Module 3: Checkout and Payments (one-page checkout, pricing, tax, discounts)

**Status: Built and verified in prod** (one confirmed paid order), with the single-transaction caveat.

Scope refs: 3.3 (dynamic pricing), 3.7 (checkout), 4.3 (tax).

Evidence:
- One-page checkout creates a reservation, a `payment` row, then a Stripe PaymentIntent; `src/app/actions/checkout.ts` `[code]`. One order reached `confirmed` and one payment `completed` `[db]`.
- **Pricing Service is a real single source of truth** `[changed quality since 29 May]`: `src/lib/payments/payment-calculator.ts` plus `src/lib/payments/pricing-rules.ts` perform a cascading lookup over `pricing_rules` (country > currency > rule type > org) with a 60s Redis cache `[code]`. The confirmed order shows the split working: subtotal 6500c, platform fee 213c, processing fee 219c, tax 650c, total 7582c `[db]`.
- **Tax engine live**: `tax_rules` (6 rows) read by country; GST applied `[code]` `[db]`.
- Discount codes: validated and applied at checkout; organiser CRUD UI at `dashboard/events/[id]/discounts` `[code]`. `discount_codes` empty `[db]`.
- Guest checkout and logged-in checkout both coded `[code]`.
- Dynamic (stepwise) pricing: `dynamic_pricing_rules` + `get_current_tier_price` RPC + organiser UI `[code]`; unused in data `[db]`.

Gaps:
- Verified by exactly one transaction in TEST mode. Conversion robustness, 3DS/`requires_action`, failure and retry paths are coded but unexercised `[db]`.
- Express checkout (Apple Pay / Google Pay one-tap) relies on Stripe automatic payment methods; not separately verified `[infer]`.

Competitor note: transparent all-in pricing shown before purchase is the explicit anti-Ticketmaster/Eventbrite position and the pricing service supports it. This is a genuine differentiator if the displayed-total-equals-charged-total invariant is verified under load.

---

## Module 4: Ticketing Engine and Inventory (reservations, QR e-tickets, scanner)

**Status: Partial** - issuance and inventory locking are built and proven; the door scanner, ticket transfer, and a running expiry sweeper are missing.

Scope refs: 3.1.4 (ticketing), 3.12 (QR system), 3.13 (check-in), 2.3.2 (concurrency).

Built and verified:
- **Ticket issuance** `[changed since 29 May]`: `confirm_order` RPC fires a DB trigger (`issue_tickets_for_order`, migration `20260517000001_ticketing_system_v1.sql`) that writes `tickets` with a unique `ticket_code` (`EL-XXXX-XXXX`), a `secret` UUID, holder name/email, and `status` `[code]`. One ticket exists `[db]`.
- **Public ticket view + QR** `[changed since 29 May]`: `src/app/t/[code]/page.tsx` renders the ticket with a server-generated QR; `/api/tickets/[code]/qr` serves a PNG `[code]`. Live: `/t/EL-7EGD-2N7N?k=...` returns 200 `[pw]`.
- **Inventory concurrency**: `create_reservation` takes `FOR UPDATE` on the tier row; `confirm_order` locks the order/reservation and is idempotent `[code]`. 11 reservations created, 1 converted `[db]`.
- **Waitlist** and **squad/group booking**: full code paths plus `waitlist-expire` and `squad-expire` crons every 5 minutes in `vercel.json` `[code]`. Both tables empty `[db]`.

Gaps (launch-relevant):
- **QR is static, not the scoped dynamic HMAC-rotating token.** The QR encodes a plain `/t/{code}?k={secret}` URL with no HMAC signature and no 30-second TOTP rotation (Scope 3.12 and 4.1 both require HMAC-SHA256 + 30s refresh + single-scan) `[code]`. Bearer secret gates the view, but screenshot-sharing is not defended as specified.
- **Door scanner / check-in: not started.** No camera-scan route, no check-in mutation, `ticket_scans` empty `[code]` `[db]`. An organiser cannot admit attendees through the app today; only CSV export exists (help copy).
- **Ticket transfer: not started.** `tickets.transferred_to_email` column exists but no transfer flow; help copy says transfer "is not currently supported" `[code]`.
- **Reservation-expiry sweeper is not running.** `expire_stale_reservations()` exists but its `pg_cron` schedule is skipped (pg_cron not installed) and there is no Vercel cron calling it; `vercel.json` crons are only `waitlist-expire`, `squad-expire`, `warm` `[code]` `[db]`. Stale holds are released only lazily on the next reservation for the same scope. Oversell/lockout risk under real concurrency.

Competitor note: DICE's defining feature is its dynamic, screenshot-proof QR and tight door scanner. EventLinqs is behind DICE here. A live web scanner is table stakes versus Humanitix and Eventbrite, both of which ship one.

---

## Module 5: Public Pages and Discovery (homepage, browse, event detail, cities)

**Status: Built and verified in prod**, with two named placeholder blocks.

Scope refs: 3.10 (discovery/search), 6.1 (public screens).

Evidence:
- Homepage, `/events`, `/events/[slug]`, `/events/browse/[city]`, `/city/[slug]`, `/culture/[culture]`, `/categories/[slug]`, `/pricing`, `/organisers`, `/about`, `/contact`, `/help`, `/legal` all render real SSR data `[code]` `[pw]`. Homepage and `/events` return 200 live `[pw]`.
- Event detail is rich: tiers, organiser card, lazy-loaded venue map, share bar (WhatsApp-first), inventory scarcity badge, related events, JSON-LD `[code]`.
- Homepage rails (trending by percent-sold, by-city, free, culture picks, this week/weekend, just-added, featured venues) read real data `[code]`.

Gaps:
- Two placeholder blocks ship visibly: the homepage "Verified organisers" section (`featured-organisers-section.tsx`, hardcoded with a "registry not yet seeded" caption) and the NAIDOC/cultural-calendar widget (placeholder pending community-sourced content) `[code]` `[pw]`. Credibility risk on a public launch; both are self-labelled.

Competitor note: the discovery surface (culture/city/category routing, scarcity badges, WhatsApp-first sharing) already reads richer than Humanitix and is competitive with Eventbrite's browse. This is a relative strength.

---

## Module 6: Payment Operations - Connect, payouts, refunds, disputes

**Status: Partial** - destination charges, the organiser ledger, reserves, and webhook idempotency are built and exercised once; payout disbursement, refund operator UI, and dispute handling are stubs.

Scope refs: 2.4 (gateway architecture), 3.7.2-3.7.4 (payouts/refunds/disputes), 3.9.3 (KYC).

Built and verified (once):
- **Destination charges** `[changed since 29 May]`: `src/lib/payments/create-destination-charge.ts` sets `transfer_data.destination`, `application_fee_amount`, and `on_behalf_of` `[code]`. A pre-charge guard `assertCanCreateDestinationCharge()` blocks checkout unless the org has `stripe_account_id`, `charges_enabled`, and `payout_status = active` `[code]`. This directly fixes the 29 May "plain platform charge" finding.
- **Organiser balance ledger + reserves** `[changed since 29 May]`: `src/lib/payments/connect-ledger.ts` writes an `order_confirmed` credit and a `payout_holds` reserve row computed from `pricing_rules` `[code]`. Proven once: +7150c credit and 1430c reserve (release 10 Jun) `[db]`.
- **Webhook idempotency**: `processed_webhook_events` claim-on-conflict ledger guards the money path; 1 row `[code]` `[db]`.
- **Stripe Connect onboarding**: onboard + return routes and an `account.updated` handler that syncs Stripe fields and auto-promotes to `tier_1` `[code]`. One org has connected `[db]`.

Gaps (launch-relevant):
- **Payout disbursement: stub.** `handleConnectPayoutEvent` records payout state from webhooks but initiates no payout, runs no hold-release schedule, and has no instant-payout logic; "Phase 1 stub" in code `[code]`. `payouts` empty `[db]`. The reserve placed on 29 May has no automated release mechanism running.
- **Refund processing: no operator path.** The Stripe-side `refundOrder` (with `reverse_transfer` and `refund_application_fee`) and a `charge.refunded` handler that voids tickets and emails the buyer both exist `[code]`, but there is no organiser or admin UI to initiate a refund. Consumer-law exposure at launch.
- **Disputes/chargebacks: log-only stub.** `handleConnectDisputeEvent` logs; no freeze, no evidence pack `[code]`.
- **KYC: identity verification not built.** Connect collects Stripe's own KYC; the scoped government-ID + selfie (Stripe Identity/Sumsub) and tiered ticket limits are absent `[code]`.

Competitor note: Humanitix and Eventbrite both run mature, automated payout and refund flows. EventLinqs cannot yet pay an organiser out or let anyone process a refund in-product; this is the largest operational gap versus the field.

---

## Module 7: Admin Panel

**Status: Partial - observability and identity only (~15% of required operator capability) on the deployed line.**

Scope refs: 3.18 (admin panel + non-negotiable fee config), 6.3 (admin screens).

Built:
- Admin identity is solid: `/admin/login` live with email/password + 6-digit TOTP + recovery codes `[pw]`; `src/lib/admin/{auth,rbac,totp,audit}.ts` provide session, role capabilities (super_admin/admin/support/moderator), and an append-only audit ledger `[code]`. 1 admin_user `[db]`.
- Admin dashboard tiles (GMV today/week/month, KYC queue depth, new organisers) and an audit-log viewer exist `[code]`.

Gaps (launch-relevant):
- **No operational control on `origin/main`**: cannot search/approve/suspend organisers, cannot pause/cancel events, cannot view all orders/refunds, no moderation queue, no support tooling, no reconciliation `[code]`. (A `feat/m7-admin-controls` branch contains organiser/event/pricing controls but is **not merged**, so it is not in production.)
- **No `pricing_rules` admin editor.** Scope 3.18 calls admin fee configuration "non-negotiable"; today fees are editable only via direct DB writes `[code]`. This is a scope-flagged hard requirement that is unmet in product.
- `/admin` is guarded at the layout level, not at middleware (defence-in-depth gap, not a functional blocker) `[code]`.

Competitor note: not customer-facing, so no direct competitor comparison. The bar is internal operability: an operator cannot currently run the marketplace (moderate, adjust fees, move money) from the panel.

---

## Module 8: Social and SmartLinq (who's going, follows, reviews, recommendations, gamification)

**Status: Not started** (one inventory-scarcity badge aside).

Scope refs: 3.4 (social), 3.5 (SmartLinq AI), 3.6 (gamification).

Evidence:
- "Who's Going" attendee social proof: not built; only an inventory scarcity badge exists on event detail `[code]`.
- Follows: `follows` table does not exist; no follow/unfollow code `[db]` `[code]`.
- Reviews/ratings and activity feed/comments: no tables, no UI `[db]` `[code]`.
- SmartLinq recommendation engine: no `linqs` table, no algorithm, no "people who attended also" `[db]` `[code]`.
- Gamification (loyalty points, badges, Backstage Credits): no tables, no code `[db]` `[code]`.

Competitor note: the genuine social layer is EventLinqs' stated competitive moat (Scope 3.4) and it does not exist yet. Per the locked strategy (`docs/STATUS-2026-05-29.md`), moats are earned post-launch and this is a deliberate deferral, not an oversight. Worth stating plainly: at launch EventLinqs is not socially ahead of DICE or Partiful; that gap is intended to be closed after launch.

---

## Module 9: Search, Genre Discovery, and SEO

**Status: Partial** - SEO is strong; search is basic; the genre/artist discovery layer (the strategic moat foundation) is largely not started.

Scope refs: 3.10 (search), 3.14 (SEO), 11 (structured data); `docs/GENRE-DISCOVERY-FOUNDATION-SPEC.md`.

Built and verified:
- **SEO**: `sitemap.ts` generates events, culture x city, city/suburb, organiser, and venue URLs; `robots.ts` disallows private paths; per-event JSON-LD (`EventSchemaJsonLd`, with MusicEvent/ComedyEvent/TheaterEvent sub-types) on event detail `[code]`. This is genuinely strong.

Partial / not started:
- **Search is substring `ilike` on title only** - no `tsvector` FTS, no Meilisearch, and the header type-ahead uses curated fallback suggestions rather than live DB autocomplete `[code]`. Functional, not the scoped instant/faceted search.
- **Genre discovery data layer is mostly absent.** `genres` is now seeded (13 rows) and `artists`/`event_artists` tables exist (empty) `[changed since 29 May]` `[db]`, but there are no `/music/[slug]` or `/artists/[slug]` routes (`/music/techno` and `/artists/burna-boy` return 404 live `[pw]`), no artist/genre tagging on the event form, and no follow feed `[code]`. The visual browse UI is intentionally waiting on the designer (Rizwan), but the data layer and routes are the engineering precondition and are not built.

Competitor note: Eventbrite limits sub-genre browse to the US; the locked strategy is for EventLinqs to ship full AU sub-genre browse as a "better on home turf" claim. That claim is not yet deliverable because the routes and tagging do not exist. SEO already meets or beats Humanitix.

---

## Module 10: PWA, Notifications, Marketing, Sharing

**Status: Partial** - manifest, transactional email, and social share buttons are built; service worker/offline, push, dynamic OG, SMS, and organiser email campaigns are missing.

Scope refs: 3.14 (marketing/push/PWA), 3.16 (multi-language).

Built:
- PWA manifest `src/app/manifest.ts` (standalone, icons, brand colours) `[code]`.
- Transactional email via Resend: purchase confirmation (with QR) and refund-confirmation templates, sent from the Stripe webhook `[code]`. Confirmation delivery is tied to a real `payment_intent.succeeded`, which has now occurred once `[db]`.
- Social share bar: WhatsApp-first, Facebook, X, email, copy-link `[code]`.
- Organiser discount/promo codes: built (Module 3) `[code]`.

Gaps:
- **No service worker / offline support** (manifest alone does not make a PWA); the scoped offline ticket access and `<3s on 3G` story is unmet `[code]`.
- **No web/mobile push** (Scope calls push "the primary driver of repeat purchases"); no VAPID, no push registration `[code]`.
- **Dynamic per-event OG images: not built** - only a static brand OG image exists `[code]`.
- **SMS campaigns and organiser email campaigns: not built** `[code]`.

Competitor note: DICE attributes roughly half its sales to personalised push. EventLinqs has no push at launch, conceding DICE's core retention channel. Share-to-WhatsApp is a real edge for the target communities versus all four competitors.

---

## Module 11: Resale, Multi-gateway, Multi-currency, Africa

**Status: Not started / scaffold only.**

Scope refs: 3.8 (resale), 2.4 (multi-gateway), 2.4.5 (FX), 10.3 (Africa).

Evidence:
- **Resale market: not started.** A `resale_fee` rule type exists in pricing config, but no `resale_listings` table, routes, or UI `[code]` `[db]`.
- **Multi-gateway: scaffold only.** `src/lib/payments/gateway-factory.ts` abstracts a gateway, but only the Stripe adapter is built; Paystack/Flutterwave/PayPal are commented placeholders `[code]`.
- **Multi-currency: storage yes, display no.** Events store a currency and the calculator maps currency to country, but there is no live currency switcher and no FX conversion (no Frankfurter integration); locale is hardcoded `en_AU` `[code]`.
- **Phone OTP: not built** `[code]`.

Competitor note: per the locked v1 plan (AU/UK/US/EU only; African organisers deferred to a later milestone with Paystack/Flutterwave), all of Module 11 is an intended deferral. Resale (a Ticketmaster/StubHub strength) and African payment methods are explicitly out of scope for the AU soft launch. This should be stated as deferred-by-decision, not as a defect.

---

## Module 12: Hardening, Observability, Tax, Compliance, Public API, Queue

**Status: Partial** - observability, rate limiting, the pricing/tax services, and a test suite are real; load testing, the public API/outbound webhooks, and an active virtual queue are missing.

Scope refs: 2.3 (queue/scale), 2.6 (observability/SLOs), 4 (security/compliance), 11 (API/webhooks).

Built and verified:
- **Observability**: Sentry server/client/edge configs with PII scrubbing; `error.tsx` + `global-error.tsx` boundaries; `/api/health/redis` returns 200 live `[code]` `[pw]`. Per STATUS doc, Sentry is confirmed capturing in production.
- **Rate limiting**: Upstash-backed middleware + named policies, applied to health endpoints `[code]`.
- **Pricing + tax services**: single-source `payment-calculator.ts`/`pricing-rules.ts` over `pricing_rules`, and a live `tax_rules` engine (Module 3) `[code]`.
- **Tests**: ~19 unit specs (payments, TOTP, PII scrub, rate-limit) + ~7 Playwright e2e specs; vitest configured `[code]`.

Gaps (launch-relevant):
- **Load testing: not done.** No `tests/load`, no k6/Artillery profile; the scoped 10,000-concurrent / 5,000-checkout proof (Scope 2.3, 9) does not exist `[code]`. The system has handled exactly one real transaction.
- **Virtual queue: built but dormant.** HMAC queue tokens, an `admit_queue_batch` RPC, a `queue-admit` route, and a `/queue/[slug]` room exist, but `queue-admit` is **not** in `vercel.json` crons, so no admission runs; the user-facing position/wait display is minimal `[code]`. The scoped surge-protection is not active.
- **Public API + outbound webhooks: not built.** No organiser API keys, no `/api/v1`, no outbound `order.created`/`payout.completed` dispatch (Scope 11) `[code]`.
- **Reservation-expiry sweeper not scheduled** (see Module 4) - a scale/correctness gap under concurrency `[code]`.
- Rate limiting is applied to health endpoints but not demonstrably to auth/checkout/upload paths on this tree `[code]` `[infer]`.

Competitor note: surviving an on-sale spike is the one thing Ticketmaster is infamous for failing. EventLinqs has the queue primitives but has neither activated nor load-tested them, so the "handles massive concurrent load" claim (Scope 2.3, the document's self-described most important infrastructure requirement) is currently unproven.

---

## Gap-to-launch punch-list (prioritised)

Priority key: **P0** blocks an honest paid public launch; **P1** needed shortly after / for credibility and legal safety; **P2** scoped but deferrable.
State key: `[done]` complete and verified; `[in progress]` partially built; `[to-do]` not started on `origin/main`.

### P0 - blocks taking real money from the public

1. `[done]` Ticket issuance + QR + public `/t/[code]` view. Verified live (Module 4).
2. `[done]` Destination charges so organisers actually get paid. Verified once (Module 6).
3. `[in progress]` End-to-end paid purchase proven live. Proven once in TEST mode with one org; needs (a) repeat runs, (b) failure/3DS paths, (c) the Stripe TEST -> LIVE flip with a real-card smoke test. (Module 3/6.)
4. `[in progress]` Stripe Connect onboarding by real organisers. One org connected; the path is proven but only one seller can currently be paid. Onboard the real launch organisers. (Module 6.)
5. `[to-do]` Refund processing operator path. Stripe-side works; there is no organiser/admin UI to issue a refund. Australian Consumer Law makes this a launch-day requirement. (Module 6.)
6. `[to-do]` Reservation-expiry sweeper actually running (Vercel cron calling `expire_stale_reservations`). Without it, inventory can lock up or oversell under concurrency. (Module 4/12.)
7. `[to-do]` Door scanner / check-in. The platform cannot admit attendees to an event today. Required before the first real event date, not necessarily before first sale. (Module 4.)
8. `[to-do]` Payout disbursement + hold release. Reserves are placed but never released or paid out; an organiser who sells cannot yet receive funds beyond the ledger entry. (Module 6.)

### P1 - credibility, safety, and operability soon after launch

9. `[to-do]` Admin operational controls: approve/suspend organisers, pause/cancel events, all-orders/refunds view, content moderation. (`feat/m7-admin-controls` exists unmerged - merge and verify.) (Module 7.)
10. `[to-do]` Admin `pricing_rules` editor - the scope's "non-negotiable" admin fee configuration. (Module 7.)
11. `[to-do]` Dispute/chargeback handling beyond logging (freeze + evidence pack). (Module 6.)
12. `[to-do]` Replace the two visible homepage placeholders (verified-organisers block, cultural-calendar widget) with real or removed content. (Module 5.)
13. `[to-do]` Dynamic, screenshot-resistant QR (HMAC + rotation) per Scope 3.12/4.1, to match DICE and reduce fraud. (Module 4.)
14. `[to-do]` Load test the on-sale path (target the scoped concurrency) and activate the virtual queue (`queue-admit` cron). (Module 12.)
15. `[to-do]` Web/mobile push notifications - DICE's core retention channel. (Module 10.)
16. `[to-do]` KYC identity verification (Stripe Identity/Sumsub) + tiered unverified limits. (Module 6.)

### P2 - scoped but deferrable (several deferred by explicit founder decision)

17. `[to-do]` Genre/artist discovery routes + event-form tagging (`/music`, `/artists`) - data layer first, visual UI waits on the designer. Strategic moat foundation. (Module 9.)
18. `[to-do]` Real full-text/faceted search (Postgres FTS or Meilisearch) to replace `ilike`. (Module 9.)
19. `[to-do]` Social layer: follows, who's-going, reviews, activity feed (the stated moat; deferred to post-launch by strategy). (Module 8.)
20. `[to-do]` Service worker / offline PWA and dynamic per-event OG images. (Module 10.)
21. `[to-do]` Reserved seating, add-ons (deferred until a real organiser needs them). (Module 2.)
22. `[to-do]` Resale market, multi-gateway (Paystack/Flutterwave/PayPal), multi-currency FX, phone OTP - all deferred with v1 geography AU/UK/US/EU. (Module 11.)
23. `[to-do]` Gamification / loyalty / Backstage Credits. (Module 8.)
24. `[to-do]` Public API + outbound webhooks for organiser integrations. (Module 12.)
25. `[to-do]` SmartLinq recommendation engine. (Module 8.)

---

## Bottom line

EventLinqs has, in the last 48 hours, crossed the line from "cannot deliver what it sells" to "has sold and delivered one ticket end to end, with the organiser correctly credited and reserved." That is the decisive change. The honest launch gate is no longer the existence of ticketing or money-routing - both now work - but their **robustness and operability**: a refund path, a payout-out path, a running expiry sweeper, a door scanner, and a load-tested on-sale. Items P0-5 through P0-8 are the true remaining hard blockers for a public AU soft launch; everything in P2 is either an explicit founder deferral or a post-launch moat, and should not delay launch.

Methodology note: every `[pw]` here is a real HTTP status from live production; every `[db]` is a real read-only query result; no records were created, modified, or deleted, and no application or schema files were changed by this assessment. The only file written is this report.
