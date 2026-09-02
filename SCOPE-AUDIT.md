# EVENTLINQS SCOPE v5 SECTION 3 AUDIT, ALL EIGHTEEN

Audited 3 September 2026 against `integration/launch`, by reading the code and
the production schema and by driving what was cheap to drive. `docs/EventLinqs_Scope_v5.md`
line 337 says "Every feature below is included in the build scope. Nothing is
optional." This is what actually exists.

Nothing below was built as part of this audit. Where I could not prove something,
I say so rather than guessing.

## THE TABLE

| # | Section | Verdict | Launch |
|---|---|---|---|
| 3.1 | Event Creation & Management | **PARTIAL** | **BLOCKS** |
| 3.2 | Group & Social Ticketing | **BUILT** | ready |
| 3.3 | Dynamic Pricing | **BUILT** (core) | ready |
| 3.4 | Social & Community Features | **PARTIAL** | can follow |
| 3.5 | SmartLinq AI Engine | **NOT BUILT** | can follow |
| 3.6 | Gamification & Loyalty | **NOT BUILT** | can follow |
| 3.7 | Payment & Checkout | **BUILT** (largely) | ready |
| 3.8 | Built-In Resale Market | **NOT BUILT** | can follow |
| 3.9 | User Management & Authentication | **PARTIAL** | ready |
| 3.10 | Event Discovery & Search | **PARTIAL** | ready |
| 3.11 | Virtual & Hybrid Events | **PARTIAL, and broken in practice** | **BLOCKS if sold** |
| 3.12 | E-Ticketing & QR Code System | **PARTIAL** | ready |
| 3.13 | Event Day, Check-In & Door | **PARTIAL** | **RISK** |
| 3.14 | Marketing & Promotion Tools | **PARTIAL** | can follow |
| 3.15 | Sustainability | **NOT BUILT** | can follow |
| 3.16 | Accessibility & Inclusivity | **PARTIAL** | can follow |
| 3.17 | Analytics & Reporting | **PARTIAL** | can follow |
| 3.18 | Admin Panel | **BUILT** (largely) | ready |

**Tally: 4 BUILT, 10 PARTIAL, 4 NOT BUILT.**

Two things block or endanger launch and are not on anyone's list: **3.11 sells a
virtual event and never delivers the stream link**, and **3.13 has no offline
scanner**, on a platform whose own scope calls offline "critical for outdoor
events and venues with poor signal".

---

## THE DETAIL

### 3.1 Event Creation & Management, PARTIAL, BLOCKS LAUNCH

The builder is real and rich: `src/components/features/events/event-form.tsx`,
backed by 72 columns on `events` including recurrence, multi-day, age
restriction, four refund-policy columns, reserved seating, waitlist and queue.

**The gap is the one already known.** Scope 3.1.1 requires "physical venue with
Google Maps integration and embedded map preview". `events.venue_latitude`,
`venue_longitude` and `venue_place_id` all exist in the schema and are never
populated by the form. Every event a real organiser creates has null coordinates.

**A user today:** creates an event fine, and it never appears on a city map.
Blocked on the founder minting a Google server key (sweep Task 3).

### 3.2 Group & Social Ticketing, BUILT

`squads` and `squad_members` tables, `events.squad_booking_enabled` and
`squad_timeout_hours`, routes `/squad/[token]` and
`/squad/[token]/pay/[member_id]`, `src/app/actions/squad-checkout.ts`, and an
organiser view at `/dashboard/my-squads`.

**A user today:** starts a squad, shares the link, each member pays their own
share, and the leader watches status. This is the scope as written.

### 3.3 Dynamic Pricing, BUILT (core)

`dynamic_pricing_rules` table, organiser UI at
`/dashboard/events/[id]/pricing`, actions in `src/app/actions/dynamic-pricing.ts`,
and the price is resolved at reservation time through the `get_current_tier_price`
RPC called at `src/app/actions/checkout.ts:733`. That is exactly the scope's rule
that price is determined at reservation, not page load.

**Missing:** price history shown on the event page. Minor.

### 3.4 Social & Community Features, PARTIAL

**Built:** `follows`, `saved_events`, `saved_organisers`, `saved_categories`;
invite attribution via `share_links` and `share_link_events`; scarcity social
proof in `src/components/inventory/social-proof-badge.tsx`.

**NOT built, and these are the headline claims of the section:**
- **Who's Going feed. Nothing.** Zero matches in `src`.
- **Event activity feed, comments, pinned announcements. Nothing.** No table, no code.
- **Post-event photos, ratings, reviews. Nothing.** No reviews table.

Scope calls 3.4 "the core competitive advantage" and "the primary viral
acquisition engine". The invite half exists; the social layer does not.

**A user today:** can follow an organiser and save an event, and sees "only 12
left" style urgency. They cannot see who else is going, comment, or review.

### 3.5 SmartLinq AI Engine, NOT BUILT

The scope specifies a `linqs` graph with `source_entity_type`,
`target_entity_type`, `linq_type`, `weight`, weighted scoring, 60/40 blended
collaborative and content filtering, a 10% exploration cohort, precision@10
evaluation and a 200ms p95 SLA on Redis-cached recommendation sets.

**None of that exists.** No linq table. The data substrate is there (`artists`,
`event_artists`, `genres`, `subgenres`, `venues`) and `/admin/network` exists but
is a waitlist and founding-spot demand bridge, not the engine.

**A user today:** gets curated and category-driven browsing, not learned
recommendations. Honest position: this is the documented moat and it is not started.

### 3.6 Gamification & Loyalty, NOT BUILT

No loyalty points, no attendance badges, no referral rewards currency, no
organiser leaderboards, no Backstage Credits. Zero tables, zero code.

Note: `src/lib/events/badges.ts` is inventory scarcity badges ("selling fast"),
not the attendance badges of this section. Do not mistake one for the other.

### 3.7 Payment & Checkout, BUILT (largely)

**Built:** one-page checkout, cart hold via `reservations` and `seat_holds`,
discount codes (`discount_codes`, `discount_code_usages`, `discount_code_claims`
plus `reserved_uses`), guest checkout, the single-source fee system, all-in
pricing, organiser payouts (`payouts`, `payout_holds`,
`organiser_balance_ledger`), refunds (four tables plus
`create_refund_request`), and chargebacks and disputes (`/admin/disputes`,
`/dashboard/events/[id]/refunds`).

**Missing or unproven:** multi-currency display and settlement (the platform is
AUD only; `create-platform-charge.ts` is the only multi-currency mention),
instant payout for a premium fee, and the automated chargeback evidence pack.
Apple Pay and Google Pay express checkout not confirmed either way.

**PAYOUT TIER PROMOTION IS MANUAL, confirmed by audit.** The schema carries
everything a promotion engine would need: `organisations.payout_tier`
(tier_1 | tier_2 | tier_3), `total_event_count`, `total_volume_cents`, and a
`tier_progression_log` to record the move. The thresholds those columns exist to
serve, $50,000, $250,000 and five events, appear **nowhere in the repository**.

The only writer is the Stripe `account.updated` handler
(`src/lib/stripe/connect-handlers.ts:96-102`), and it only ever writes `tier_1`,
the ENTRY tier, when onboarding completes. It logs that with
`reason: 'auto_promotion'`, which reads like a promotion engine and is not one:
no code path in this repository can produce `tier_2` or `tier_3`.

So every organisation stays on tier_1 for ever unless a human edits the row, and
the tier selects the payout schedule and on-demand eligibility
(`src/lib/payouts/queries.ts`). Not implemented in this sweep on purpose:
automatic promotion changes when an organiser is paid and what reserve is held
against them, which is a founder decision about money, and inventing the
thresholds would be a guess. Recorded at the point of use so the next reader does
not assume the engine exists.

### 3.8 Built-In Resale Market, NOT BUILT

Zero tables, zero code, no resale columns on `events`.

**Checked deliberately for a false promise, and there is none.** The only
mentions of resale in the product are `src/app/legal/refunds/page.tsx:292` and
`src/app/legal/terms/page.tsx:229`, and both PROHIBIT resale above face value
under Australian law. Nothing promises a marketplace that does not exist.

### 3.9 User Management & Authentication, PARTIAL

**Built:** email and password, Google OAuth
(`src/components/auth/google-button.tsx`), magic link
(`src/app/api/auth/magic-link/route.ts`), admin roles and RBAC
(`src/lib/admin/rbac.ts`, `admin_users`, `admin_invites`), TOTP 2FA for admin
(`src/lib/admin/totp.ts`, `/admin/enrol-2fa`), audit log, and a KYC surface at
`/admin/kyc`.

**Missing:** phone OTP login (called "critical for African markets"), Apple and
Facebook login, and organiser-role 2FA mandatory for Owner.

### 3.10 Event Discovery & Search, PARTIAL

**Built:** browse and explore by city, category, community, suburb and date;
curated collections (`src/lib/categories/homepage-curation.ts`); a city map
(`src/components/features/city/city-map.tsx`); SEO structured data and sitemap.

**Missing:** Meilisearch. Search is Postgres `ilike` (`src/lib/admin/events.ts:119`
and siblings), so no typo tolerance and no faceted instant search. No global
map view of all events with clustering. Trending exists only as curation, not as
a ticket-velocity algorithm.

**A user today:** browses well; a misspelled search finds nothing.

### 3.11 Virtual & Hybrid Events, PARTIAL AND BROKEN IN PRACTICE

`events.virtual_url`, `video_url` and `video_provider` exist. The organiser form
captures `virtual_url` and saves it
(`src/components/features/events/event-form.tsx:546`,
`src/app/(dashboard)/dashboard/events/actions.ts:288`).

**It is never shown to a ticket holder.** Searching `src/app/tickets`,
`src/app/orders`, `src/app/events` and the ticket components for `virtual_url`
returns NOTHING. The stream link goes in and never comes out.

**A user today:** an organiser can sell a virtual ticket, and the buyer has no
way to reach the stream. Also missing: hybrid tiers, geo restriction, and
in-stream chat or Q&A.

**This blocks launch if a single virtual event is sold.** It is a small fix
(surface the link to a confirmed ticket holder) and it is not on any list.

### 3.12 E-Ticketing & QR Code System, PARTIAL

**Built:** a unique QR per ticket at `/t/[code]`, browser-based with no app,
`tickets.ticket_code` plus `tickets.secret`, single-scan enforcement through
`first_scanned_at`, `last_scanned_at` and `scan_count`, server-side validation via
the `scan_ticket` RPC (`src/app/scan/actions.ts:36`), and ticket transfers
(`ticket_transfers`, `transfer_ticket_for_order`).

**Missing against the written spec:** HMAC-SHA256 signing, the 30-second rotating
TOTP-style QR, per-event signing keys in a vault, the anti-screenshot animated
watermark, Apple and Google Wallet passes, and an attendee PDF ticket. `pdf-lib`
exists (`src/lib/reporting/exporters.ts:2`) but serves the organiser door list.

The model is a static per-ticket secret validated server-side, not the rotating
scheme the scope describes. It is defensible for launch, but it is not what the
document says, and screenshot sharing is only caught at the door by single-scan.

### 3.13 Event Day, Check-In & Door Management, PARTIAL, LAUNCH RISK

**Built:** the web scanner at `/scan/[eventId]`, `ticket_scans`, scan outcomes
and holder name feedback, guest list at `/dashboard/events/[id]/attendees`.

**Missing:**
- **Offline validation cache. NOTHING.** No IndexedDB, no cached validation set,
  no offline queue. The scope calls this "critical for outdoor events and venues
  with poor signal" and specifies a 50,000-ticket local cache.
- **Multi-scanner realtime sync.** No Supabase Realtime channel anywhere in `src`.
- **Door sales via Stripe Terminal.** Not built.

**A user today:** a door with no signal cannot admit anybody. That is a real
event-day failure mode on exactly the outdoor and community events being
recruited.

### 3.14 Marketing & Promotion Tools, PARTIAL

**Built:** the Launch Kit (posters, social cards, short links) under
`src/lib/broadcast/` and `/dashboard/events/[id]/launch-kit`; referral and invite
attribution (`share_links`, `share_link_events`); web push
(`/api/push/subscribe`, `push_subscriptions`, `public/push-sw.js`); discount
codes; SEO with structured data and sitemap; platform digests (`digest_sends`,
`weekly-digest` cron); **and the attendee export that the data-ownership promise
depends on** (`/dashboard/events/[id]/attendees/export`, CSV, Excel and PDF, with
the ownership statement on the page).

**Missing:** organiser-composed email campaigns to attendees, SMS campaigns,
the embeddable purchase widget, the affiliate and influencer programme with
commission and attribution, and the AI chatbot.

### 3.15 Sustainability, NOT BUILT

No paperless or carbon-neutral badge, no charity integration, no sustainability
category or filter. The scope marks charity as Phase 2; the badge and the
category are not.

### 3.16 Accessibility & Inclusivity, PARTIAL

**Built:** an accessibility posture that is better than most of this list.
`scripts/axe-*.mjs`, the `labelled-form-controls` and
`labels-name-the-right-control` guards, 44px touch targets, and genuine
**accessible seating with companion auto-selection**
(`src/lib/seating/best-available.ts:45`, `accessibleNeeded`).

**Missing:** multi-language. No i18n framework of any kind. The scope promises
English, French, Yoruba, Swahili and Zulu at launch. English only today.

**Caveat I will not paper over:** axe is not a CI gate (CLAUDE.md says so), so
WCAG 2.1 AA is asserted per surface by hand, not enforced.

### 3.17 Analytics & Reporting Dashboard, PARTIAL

**Built:** `/dashboard/insights`, `/dashboard/reports`, `/admin/analytics`, and
CSV, Excel and PDF export (`src/lib/reporting/exporters.ts`).

**Missing:** PostHog. The scope defines conversion as "unique checkout
initiations / unique event page views (both tracked via PostHog)". **PostHog does
not appear anywhere in `src`**, so that conversion metric cannot be computed as
defined. Also missing: attendee demographics (age, gender), marketing performance
(email open and click, push click-through), and the nightly BigQuery export.

### 3.18 Admin Panel, BUILT (largely)

Twenty admin surfaces: analytics, audit, disputes, enrol-2fa, events, flags,
health, kyc, marketplace, network, notifications, orders, organisers, payouts,
pricing, refunds, search, staff, users, venues. RBAC and an audit log behind
them.

**Missing:** the support ticket system, FAQ and knowledge-base editor, chatbot
configuration, and sponsored or featured listing management with ad revenue
tracking.

---

## WHAT I WOULD TELL THE FOUNDER

**The commerce spine is real.** Checkout, squads, seating, discount codes,
payouts, refunds, disputes, the fee system and the admin panel are built and
coherent. That is the hard part and it exists.

**The social and intelligence layer, which the scope calls the moat, is largely
not started.** 3.4 (Who's Going, activity feed, reviews), 3.5 (SmartLinq), 3.6
(loyalty) and 3.8 (resale) are four of the eighteen and they are the four the
document is proudest of. They can follow launch, but the pitch should not claim
them.

**Two unlisted items need attention before organisers arrive:**
1. **A virtual event sells a link the buyer can never see** (3.11). Small fix.
2. **The door scanner cannot work without signal** (3.13). Larger fix, and the
   exact failure mode that turns one bad night into a lost organiser.

**Three scope claims are quietly false today** and should be removed from any
pitch until built: Meilisearch instant search, multi-language UI, and PostHog
conversion analytics.
