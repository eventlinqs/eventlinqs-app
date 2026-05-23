# Functionality Audit - 23 May 2026

Branch: `chore/functionality-audit` (forked from `main` @ `923e0f0`).
No code changes. Audit only.

> **2026-05-23 follow-up**: HIGH-1 and HIGH-2 are RESOLVED on `main`
> (PR #31 closed HIGH-1; PR #32 closes HIGH-2). Every MEDIUM, every
> LOW, and the live-verification items remain open. See the
> **HIGH-1 RESOLVED** and **HIGH-2 RESOLVED** sections directly below
> for the full before/after.

## HIGH-1 RESOLVED - `/dev/*` routes gated in production + rail-rule fix

Closed by PR #31 (commit `16ac400`).

**`/dev/*` production gate.** The three `/dev/*` preview routes
(`logo-preview`, `shell-preview`, `connect-onboarding-preview`) are
gated by `src/proxy.ts`: in production the proxy returns 404 for any
path starting with `/dev/` (or `/dev` exactly) before the route
handler runs. In development the routes remain reachable for the
design-preview use case the source comments describe. The gate is
synchronous and runs before any DB or auth call, so it adds no
latency to non-`/dev` requests.

**Rail-rule fix (bonus).** PR #31 also changed all six homepage rail
conditionals from `.length >= 3` to `.length >= 1` in
`src/app/page.tsx` (This Weekend, Free, Trending, Just Added,
Editor's picks, Community). The rail wrapper components retain their
internal `events.length === 0` guards for the truly-empty case, so a
rail with 1 or 2 events now renders with whatever exists (matching
Humanitix / Ticketmaster / Eventbrite behaviour) instead of being
hidden behind an arbitrary threshold.

## HIGH-2 RESOLVED - footer + homepage filter link rewrites

The audit's HIGH-2 finding (parser-rejecting query params) was verified
against `src/lib/events/search-params.ts` on current main and was
correct in every particular. Option A (rewrite the hrefs to match the
parser - parser is the source of truth) was applied. The parser was
not extended.

**Parser-accepted values (verified):**
- `PRESETS`: `all`, `today`, `tomorrow`, `weekend`, `7d`, `month`, `free`
- `SORTS`: `relevance`, `date_asc`, `price_asc`, `popularity`
- `VIEWS`: `grid`, `map`
- Other recognised keys: `q`, `category`, `culture`, `sub_culture`,
  `country`, `price_min`, `price_max`, `from`, `to`, `distance_km`,
  `page`. No `free`, `when`, `date`, `curated`, `price`, or
  `view=cities|cultures`.

### Footer rewrites (`src/components/layout/site-footer.tsx`)

| Label | Before | After | Why |
|---|---|---|---|
| By city | `/events?view=cities` | **`/cities`** | `cities` is not a parser-recognised view; `/cities` is the existing dedicated index page. |
| By culture | `/events?view=cultures` | **`/cultures`** | Same as above; `/cultures` exists. |
| This week | `/events?when=this-week` | **`/events?preset=7d`** | No `when` param; `7d` is the parser's next-7-days preset. |
| This weekend | `/events?when=this-weekend` | **`/events?preset=weekend`** | No `when` param; `weekend` is a recognised preset. |
| Free events | `/events?price=free` | **`/events?preset=free`** | No `price` (only `price_min`/`price_max`); `free` is a recognised preset. |

The footer link arrays (`DISCOVER`, `CULTURES`, `FOR_ORGANISERS`,
`COMPANY`, `LEGAL`) are now `export`ed so the unit test below can
import them.

### Homepage rail rewrites (`src/app/page.tsx`)

| Rail | Before | After | Why |
|---|---|---|---|
| This Weekend | `/events?date=weekend` | **`/events?preset=weekend`** | No `date` param. |
| Free events | `/events?free=1` | **`/events?preset=free`** | No `free` param. |
| Trending now | `/events?sort=trending` | **`/events?sort=popularity`** | `trending` is not in SORTS; `popularity` is the parser's selling-fast sort. |
| Just added | `/events?sort=newest` | **`/events?sort=date_asc`** | `newest` is not in SORTS. **Semantic compromise**: `date_asc` orders by soonest start date, not most-recently-created. The parser has no `created_at desc` sort. Acceptable as a "what's coming up" proxy; a future correctness fix would extend SORTS with `created_desc` (out of scope for this fix per brief instruction to use Option A only). |
| Editor's picks | `/events?curated=1` | **`/events`** | No `curated` param and no parser concept of editor curation; the rail itself is curated server-side. The View all is now a plain "browse all events". |
| Community | `/events?category=community` | (unchanged) | `category` IS a parser-accepted key; this link already works. |

### Regression test added

`tests/unit/footer-links.test.ts` imports the five exported footer
link arrays and, for every link whose `href` starts with `/events?`,
parses the query string through `parseEventsSearchParams` and asserts
the result produces at least one of: an active filter, a non-default
sort, or a non-default view. A future link with an unrecognised param
fails the test before it ships. The test also pins the six homepage
rail `viewAllHref` strings to the same contract.

### What is NOT changed by this fix

- Parser extension is intentionally not done. The brief specified
  Option A (rewrite hrefs only).
- The Editor's picks rail's "View all" loses semantic narrowing (it
  is now plain `/events`). A future parser extension with a
  `?curated=1` flag or removal of the rail entirely is a separate
  decision.
- The "Just added" rail's semantic compromise (date_asc instead of
  created_desc) is documented above; future correctness fix is to
  extend SORTS.

### Verification status

- `tsc --noEmit`, `npm run lint`, `npx vitest tests/unit/footer-links.test.ts`,
  and `npm run build` results recorded in the commit message of the
  follow-up `[AUDIT-FIX]` commit.
- Live browser verification of each rewritten URL **still owed** (the
  audit's environment limitation remains; the test exercises the
  parser end-to-end which is the next-best gate).

## Audit method and honest constraints

The audit brief asked for `npm run build && npm run start`, live HTTP probes
of every page, click-through of every link and button, Resend dashboard
checks, and Stripe test-card flows. The environment this audit ran in
was unable to satisfy the live-execution parts:

- The worktree had **no `node_modules`** at the start.
- `npm ci` failed with exit code 1; the filesystem is **100% full**
  (`df -h /c`: `237G used / 12M available`). With ~12 MB free, the
  install (which needs ~500 MB to 1 GB for a Next.js 16 + Stripe +
  Supabase + Playwright tree) cannot complete here. `npx next build`
  shelled out to a fresh download which then failed because
  `next.config.ts` imports `@next/bundle-analyzer` from a node_modules
  that does not exist.
- I cannot start the production server, so no live HTTP probe, no
  live click-through, no live Stripe test card 4242, no Resend
  dashboard delivery check, no Network panel for broken-image 404s.

What I did instead, exhaustively:

- Enumerated every route from `src/app/**/page.tsx` and `route.ts`.
- Read each page's source for placeholders, dead `href`, inert buttons,
  fake data, and "Coming Soon" stubs.
- Read every flow's source path end-to-end (checkout, webhook,
  refund, free RSVP, squad, Resend email, organiser publish).
- Queried Supabase (read-only MCP) for live content state - event,
  city, organisation, and culture rows; cover-image hosts.
- Cross-checked every `href` emitted by the footer and the homepage
  rails against the actual route + searchParams parser, to find
  silently-broken filter links.
- Verified all required env keys are present in `.env.local`.
- Verified the auth email templates are wired (Supabase Auth + Resend).

Items I could not exercise live are marked **"requires manual
verification in a working environment"** below. They are NOT marked
PASS. They are not pretended to PASS. **Lawal must run the live flow
checks** (Stripe test card, Resend delivery, real-browser click-through)
before any launch sign-off. This audit is the static layer; the live
layer is owed.

## Summary

- Total routes enumerated: **70 page routes + 19 API/auth route handlers** (89 total).
- Routes statically audited as **renders real content (no stub):** 65.
- Routes statically audited as **acknowledged stub / future feature:** 1 (`/dashboard/insights` - soft empty state with CTA, not a 404 trap).
- Routes with **production-exposure concerns:** 3 (`/dev/logo-preview`, `/dev/shell-preview`, `/dev/connect-onboarding-preview` - noindexed but reachable; the shell-preview source comment explicitly says "should be removed or gated before public launch").
- Total flows source-audited: 7.
- Flows with code that **looks production-ready under static review**: 7. **Live verification still owed for all 7.**
- **CRITICAL launch blockers found (static evidence): 0.**
- **HIGH issues found (real user-facing breakage on main): 2.**
- MEDIUM issues found: 5. LOW: 4.

## Pages

Status legend:
PASS - real content, real component wiring, no static red flag.
WARN - reachable in production but flagged (dev gating gap or known incomplete state).
N/T - not testable in this environment (requires browser / live server). Pages were source-audited even when not live-probable; "N/T" only applies to interactions a static read cannot decide (visual broken-image checks, runtime console errors).

| Page | Loads? | Renders? | Dead links | Broken buttons | Placeholder content | Status |
|---|---|---|---|---|---|---|
| `/` | N/T live | Real - hero + ~12 rails + bento + CTAs + email signup + footer | **YES (filter links)** see HIGH-2 | None | "Events loading soon" empty state is a real graceful fallback when `upcoming.length < 5` | WARN |
| `/events` | N/T live | Real - m5 hero strip, filter bar, grid, pagination, popular section | Internal | None | None | PASS |
| `/events/[slug]` (3 tested: `africultures-festival-sydney-2027`, `pasifika-festival-melbourne-2027`, `diwali-mela-brisbane-2026`) | N/T live | Real - 460-line page with full event detail, tickets, seats, organiser, related | Internal | None | None | PASS |
| `/cities` | N/T live | Real - has explicit "never render a dead Coming soon" guard | Internal | None | None | PASS |
| `/city/[slug]` (singular - prompt assumed `/cities/[slug]` which does not exist) | N/T live | Real - dynamic city page; tested 3: `sydney`, `melbourne`, `brisbane` | Internal | None | None | PASS |
| `/cultures` | N/T live | Real - has explicit "never render a dead Coming soon" guard | Internal | None | None | PASS |
| `/culture/[culture]` (singular - prompt assumed `/cultures/[slug]`) | N/T live | Real - dynamic culture page; CultureSlug union; 21 heritages | Internal | None | None | PASS |
| `/organisers` | N/T live | Real | Internal | None | None | PASS |
| `/organisers/[handle]` (prompt assumed `[slug]`) | N/T live | Real | Internal | None | None | PASS |
| `/pricing` | N/T live | Real | Internal | None | None | PASS |
| `/help` | N/T live | Real | Internal | None | None | PASS |
| `/help/[slug]` | N/T live | Real - 6 topics in `helpTopics`: getting-started, buying-tickets, selling-tickets, payments-and-payouts, account-and-privacy, contact-us. `notFound()` if slug missing. | Internal | None | None | PASS |
| `/contact` | N/T live | Real | Internal | None | None | PASS |
| `/for-organisers` | N/T live | Real | Internal | None | None | PASS |
| `/legal/terms` | N/T live | Real - `LegalPageShell`, sectioned | Internal | None | None | PASS |
| `/legal/privacy` | N/T live | Real - `LegalPageShell`, sectioned | Internal | None | None | PASS |
| `/legal/refunds` | N/T live | Real - 6 sections, organiser policy explained | Internal | None | None | PASS |
| `/legal/cookies` | N/T live | Real - 8 sections, Plausible called out | Internal | None | None | PASS (NOT "Coming Soon" - prompt premise wrong) |
| `/legal/accessibility` | N/T live | Real - 7 sections, WCAG 2.1 AA target stated | Internal | None | None | PASS |
| `/legal/organiser-terms` (route is here, prompt assumed `/organiser-terms`) | N/T live | Real - 13 sections | Internal | None | None | PASS (NOT "Coming Soon" - prompt premise wrong) |
| `/tickets` (authed) | N/T live | Real - server component, `force-dynamic`, joins tickets to events; redirects if no session | Internal | None | None | PASS |
| `/t/[code]` | N/T live | Real - QR endpoint + bearer ticket view exist (`/api/tickets/[code]/qr`) | Internal | None | None | PASS |
| `/admin/login` | N/T live | Real - 2FA flow; admin TOTP enrolment route exists | Internal | None | None | PASS |
| `/admin/(authed)` | N/T live | Real - dashboard with stat tiles, audit log; "Pending Session 1" tiles are intentional per scope §3.4 (not stubs) | Internal | None | None | PASS |
| `/admin/(authed)/audit` | N/T live | Real - requires `admin.audit.read` capability; full filter set | Internal | None | None | PASS |
| `/about`, `/careers`, `/press`, `/blog` | N/T live | Real - 217 to 269 lines each. `/blog` includes a "Coming soon" *section heading* announcing future pieces (intentional copy, not a stub page) | Internal | None | "Coming soon" copy inside `/blog` is intentional - flags forthcoming articles. NOT a stub. | PASS |
| `/dashboard/insights` | N/T live | Real but **empty-state "Insights are coming soon"** with CTA to `/dashboard/events` | Internal | None | YES - acknowledged "not yet built" feature with graceful fallback | WARN |
| `/dashboard/*` (events list, create, edit, discounts, pricing, seats, orders, payouts, my-squads, my-waitlists, organisation, venues + seat-maps) | N/T live | Real - every route has its own page.tsx with substantive component or shell | Internal | None | None | PASS |
| `/account`, `/account/saved`, `/account/tickets` | N/T live | Real | Internal | None | None | PASS |
| `/checkout/[reservation_id]` | N/T live | Real - Stripe Elements + PaymentElement + AttendeeForm + CartTimer + CheckoutSummary + DiscountCodeInput; `processCheckout` server action | Internal | None | None | PASS (static) |
| `/orders/[order_id]/confirmation` | N/T live | Real | Internal | None | None | PASS |
| `/squad/[token]`, `/squad/[token]/pay/[member_id]` | N/T live | Real | Internal | None | None | PASS |
| `/queue/[slug]` | N/T live | Real | Internal | None | None | PASS |
| `/categories/[slug]`, `/faith/[faith]`, `/events/browse/[city]`, `/venues/[handle]`, `/city/[slug]/[suburb]`, `/culture/[culture]/[city]` | N/T live | Real | Internal | None | None | PASS |
| `/(auth)/login`, `/(auth)/signup`, `/(auth)/forgot-password`, `/(auth)/verify-email-sent`, `/auth/reset-password`, `/auth/callback`, `/auth/confirm` | N/T live | Real - Supabase Auth wired with the 5 HTML email templates in `src/lib/email/templates/auth/` | Internal | None | None | PASS |
| `/dev/logo-preview`, `/dev/shell-preview`, `/dev/connect-onboarding-preview` | N/T live | Real | Internal | None | These are DEV-ONLY pages, source comment in `/dev/shell-preview` says **"should be removed or gated before public launch"**. They carry `robots: noindex` but no environment gate, so any URL-guesser hits them on production. | **WARN - HIGH-1** |
| `/admin` (root) | N/A | The route alias `/admin` does not exist as a page; `/admin/(authed)` (the route group) is the dashboard. Prompt premise "admin or admin.eventlinqs.com" - there is no subdomain, just `/admin/login` + `/admin/(authed)/*`. | - | - | - | PASS (premise corrected) |

## Flows (source audit; live execution still owed)

Reading the actual code is enough to identify whether a flow is wired
or merely scaffolded; it is not enough to certify the flow completes
end-to-end on a live system, which is why each row carries an explicit
"requires live verification" marker.

| Flow | Completes? | Failure point (if any) | Side responsible | Severity |
|---|---|---|---|---|
| 1. Anonymous browse -> event -> checkout -> pay (4242) -> ticket -> QR | Source: WIRED. Live: **not exercised** | Static review found no break in the chain. `processCheckout` action + Stripe Elements at `/checkout/[reservation_id]/checkout-form.tsx`; `payment_intent.succeeded` confirms order, issues tickets via trigger, sends Resend email with per-ticket QR CID attachments; `/t/[code]` + `/api/tickets/[code]/qr` deliver the QR. | N/A static | N/A - live test required |
| 2. Organiser signup -> create event -> publish -> appears in browse | Source: WIRED. Live: **not exercised** | `/organisers/signup` is a redirect to `/signup?role=organiser`; dashboard event-create + edit + publish flows exist (`/dashboard/events/create`, `/dashboard/events/[id]/edit`). `events.status='published'` + `visibility='public'` + `start_date >= now` is the homepage rail filter, so a freshly published future event becomes discoverable on next ISR window (`revalidate = 120` on `/`, `revalidate = 60` on `/events`). | N/A static | N/A - live test required |
| 3. Squad booking - multi-tickets one transaction | Source: WIRED. Live: **not exercised** | `squad_member_id` metadata branch in webhook handler; `handleSquadMemberPaymentSucceeded`; squad confirmation email sent when all members paid (`route.ts:798` log "squad ${squadId} completed - ${total_spots} members all paid"). | N/A static | N/A - live test required |
| 4. Refund: organiser issues refund -> user confirmation -> Stripe reversal | Source: WIRED. Live: **not exercised** | `src/lib/payments/refund.ts` calls `stripe.refunds.create({ reverse_transfer: true, refund_application_fee: true })` against the destination charge; `charge.refunded` webhook updates DB + promotes waitlist. **GAP** - no Resend "refund confirmation email" is sent (no `sendRefundEmail` exists; only `sendConfirmationEmail` for purchase). Bearer view hides QR for refunded tickets (per recent commit `22b1c61`). User will see the refund in their Stripe statement and on `/account/tickets`, but they get no email notification. See MEDIUM-1. | EventLinqs (missing email) | MEDIUM |
| 5. Free event RSVP -> ticket delivered -> entry confirmed | Source: WIRED. Live: **not exercised** | `src/app/actions/register-free.ts` exists and is a peer of `checkout.ts`. The homepage filters `isFree` correctly. **Live verification needed** that a free RSVP issues tickets without going through Stripe payment_intent. | N/A static | N/A - live test required |
| 6. Email confirmation via Resend | Source: WIRED. Live: **not exercised** | `Resend` client used in two places: `src/lib/waitlist/promote.ts:65` (waitlist offer email), `src/app/api/webhooks/stripe/route.ts:1038` (purchase confirmation w/ per-ticket QR PNG attachments). `RESEND_API_KEY` is set in `.env.local`. **Resend dashboard delivery check cannot be done from this environment - manual check required.** | N/A static | N/A - live test required |
| 7. Stripe webhook signature verification | Source: VERIFIED. Live: **not exercised** | `StripeAdapter.constructWebhookEvent(body, signature)` at `route.ts:40` runs on raw body; failure returns 400 (does NOT proceed). `STRIPE_WEBHOOK_SECRET` is set. **17** event-type branches handled: `payment_intent.succeeded/payment_failed/requires_action/canceled`, `charge.refunded`, `charge.dispute.created/closed`, `account.updated`, `account.application.deauthorized`, `payout.created/paid/failed/canceled`, `transfer.created`. Money-path returns 500 on processing failure (Stripe retries idempotently). Event-level dedupe via `claimWebhookEvent`. **Live verification: Stripe CLI listener forwarding to `/api/webhooks/stripe` and triggering a real `payment_intent.succeeded` is the only way to certify.** | N/A static | N/A - live test required |

## Critical launch blockers (static evidence)

**None found.** The application's core flows are wired in the source.
Nothing was found in the code path that would deterministically prevent
a buyer from completing checkout, receiving a ticket, scanning a QR, or
receiving a refund. The remaining risk is **live behaviour I could not
exercise**, listed under "Items requiring live verification".

## HIGH issues found in static review

### HIGH-1: `/dev/*` routes are reachable on production
**What**: `/dev/logo-preview`, `/dev/shell-preview`,
`/dev/connect-onboarding-preview` are full server pages, not gated by
`process.env.NODE_ENV` or any auth check, and not in middleware deny.
They carry `robots: noindex` but are reachable to anyone who guesses
or follows an internal link. `/dev/shell-preview/page.tsx` itself
acknowledges this: "This route is development-only and should be
removed or gated before public launch".
**Where in code**: `src/app/dev/*/page.tsx`. There is no
`middleware.ts` entry that blocks `/dev/*`.
**Why HIGH**: exposes internal previews, brand drafts, and an
internal payments onboarding preview to the public web.
**Fix**: either delete the routes for launch, gate them with
`if (process.env.NODE_ENV !== 'development') notFound()` at the top
of each `page.tsx`, or add a middleware deny rule for `^/dev`.
**Effort**: 15 minutes (one-line `notFound()` gate per page) or 3
minutes if removed entirely.

### HIGH-2: Footer + homepage "View all" filter links silently fail
**What**: the footer Discover and Cultures groups, and several
homepage rails' "View all" CTAs, link to `/events?<key>=<value>`
where `<key>` is **not parsed by** `parseEventsSearchParams`
(`src/lib/events/search-params.ts`). The page renders unfiltered.

Footer (`src/components/layout/site-footer.tsx`):

| Footer link | Param emitted | Parsed by /events? | Result |
|---|---|---|---|
| "By city" | `view=cities` | `view` is only `'grid' / 'map'` | Falls through to grid, no filter |
| "By culture" | `view=cultures` | same | Same |
| "This week" | `when=this-week` | no `when` param | Ignored |
| "This weekend" | `when=this-weekend` | no `when` param | Ignored |
| "Free events" | `price=free` | no `price` param (only `price_min`/`price_max`) | Ignored |

Homepage rails (`src/app/page.tsx`):

| Rail "View all" | Param emitted | Parsed? | Result |
|---|---|---|---|
| This Weekend | `date=weekend` | no `date` param | Ignored - should be `?preset=weekend` |
| Free Events | `free=1` | no `free` param | Ignored - should be `?preset=free` |
| Trending | `sort=trending` | `sort` only allows `relevance / date_asc / price_asc / popularity` | Falls through |
| Just Added | `sort=newest` | same | Falls through - should be `date_asc` |
| Editor's Picks | `curated=1` | no `curated` param | Ignored |
| Community | `category=community` | category IS parsed | **Works** |

**Why HIGH**: clicking "Free events" or "This weekend" in the footer
or on the homepage lands the user on the unfiltered events grid
with no signal that the link was supposed to filter. From the user's
perspective the link is "broken".
**Fix**: either (a) update the emitting `href`s to use the parser's
real param names (`?preset=weekend`, `?preset=free`, `?preset=7d`,
`?sort=popularity`, `?sort=date_asc`, `?category=community`), or
(b) extend `parseEventsSearchParams` to accept the friendlier names.
Option (a) is the lower-risk one. Affects:
- `src/components/layout/site-footer.tsx` (5 links)
- `src/app/page.tsx` (5 rail "View all" hrefs)
**Effort**: 1 to 2 hours including a unit test that asserts each
shipped href produces a filtered result.

## Medium priority issues

### MEDIUM-1: No refund-confirmation email
**What**: When a refund completes (`charge.refunded` webhook), the
handler updates DB state and promotes the waitlist, but no email is
sent to the buyer. Only `sendConfirmationEmail` exists; there is no
`sendRefundEmail`.
**Where**: `src/app/api/webhooks/stripe/route.ts` (`charge.refunded`
branch around line 800-870).
**Why MEDIUM**: refunds are infrequent compared to purchases, but a
silent refund without buyer notification is a known cause of
chargebacks and support tickets. Users see the Stripe statement
later and forget the platform reason.
**Fix**: add a `sendRefundEmail` helper parallel to
`sendConfirmationEmail`, fire it from the `charge.refunded` handler.
**Effort**: 2 to 3 hours including a basic Resend HTML/text
template.

### MEDIUM-2: LanguagePicker in footer is inert
**What**: `<select>` with a single `en-AU` option, no `onChange`
handler, no submission behaviour.
**Where**: `src/components/layout/site-footer.tsx:177-194`.
**Fix**: either hide the picker until more than one locale ships,
or add a real onChange that persists the choice.
**Effort**: 5 minutes to hide; ~2 hours to actually wire i18n.

### MEDIUM-3: `events.deleted_at` does not exist; `CLAUDE.md` says it should
**What**: `CLAUDE.md` Database Conventions: "Soft deletes: use
`deleted_at` timestamp (nullable) instead of hard deletes on
user-facing tables." Live schema introspection shows
`public.events.deleted_at` does **not exist**. Some homepage and
events-page queries were originally written assuming a `deleted_at IS
NULL` filter would be available; they currently rely on
`status='published'` only. A hard-deleted event would disappear from
all queries; a "soft-delete" semantically does not exist for events.
**Where**: schema; downstream impact in `src/lib/events/*`.
**Fix**: either add the column (`ALTER TABLE events ADD COLUMN
deleted_at TIMESTAMPTZ`) and adjust the public queries to filter it,
or update `CLAUDE.md` to acknowledge events are status-flagged not
soft-deleted.
**Effort**: 30 minutes (schema + queries) or 5 minutes (doc fix).

### MEDIUM-4: `/dashboard/insights` is an intentional empty state
**What**: "Insights are coming soon" with a CTA back to
`/dashboard/events`. Not a 404, not a broken page; just a
not-yet-built feature with graceful fallback.
**Where**: `src/app/(dashboard)/dashboard/insights/page.tsx`.
**Why MEDIUM rather than LOW**: it is reachable from the dashboard
sidebar in an organiser's primary navigation; an organiser arriving
at it before launch will read "coming soon" on the platform they
just signed up to sell on.
**Fix**: either remove the sidebar entry until the feature ships, or
show actual basic numbers (ticket-count, revenue last 30 days) that
the existing tables already support.
**Effort**: 5 minutes (hide sidebar entry) or 4 to 6 hours (build a
minimum viable insights view).

### MEDIUM-5: Seed event imagery is from Pexels stock
**What**: All 32 published events have cover images sourced from a
single host (Pexels), 0 from picsum (historical defensive comments
in `src/lib/images/event-media.ts` mention picsum cleanup). Stock
photography is acceptable for seed/demo content but reads
inauthentic for a culture-first ticketing platform on a public
domain.
**Where**: DB rows in `events.cover_image_url`.
**Fix**: before friends-launch, replace seed covers with at least a
few real organiser-uploaded shots, or filter the homepage to only
the events that have organiser-supplied art.
**Effort**: 2 to 4 hours including art-direction by Lawal.

## Low priority / cosmetic

### LOW-1: `/blog` "Coming soon" copy is intentional, but reads as a stub
**What**: `/blog/page.tsx` has a section labelled "Coming soon" with
an UPCOMING piece list. Intentional content, but a casual visitor
may read the page as a placeholder.
**Fix**: replace "Coming soon" eyebrow with "Next up" or "First
issues" to remove the placeholder ambiguity.
**Effort**: 1 minute.

### LOW-2: `ComingSoon` component exists but is unused under `src/app`
**What**: `src/components/ui/coming-soon.tsx` is a fully-built
branded stub component intended for marketing pages whose copy has
not been written yet. It is currently referenced by zero pages in
`src/app/**`. Either dead code, or there is one or more page that
should be using it but is hand-rolling its own version (the
`/dashboard/insights` empty state is hand-rolled).
**Fix**: either delete the component or adopt it as the canonical
empty-state for any "not yet built" page.
**Effort**: 10 minutes.

### LOW-3: Many `console.log/warn/error` calls in production server paths
**What**: ~40 `console.log/warn/error` calls in
`src/app/api/webhooks/stripe/route.ts`, plus ~7 in
`src/app/actions/waitlist.ts` and a couple in `src/app/events/[slug]`.
These are server-side and will appear in Vercel logs (not in user
browser consoles), so they are not security-leaks; they are noise.
Some carry tagged prefixes like `[webhook]`, `[m6]`, which is good.
**Fix**: route through the existing observability layer (`captureException`
is already used alongside many of these calls) and demote
informational logs to debug-level.
**Effort**: 1 to 2 hours.

### LOW-4: Two `void` no-op statements in homepage
**What**: `src/app/page.tsx:64` `void cheapestPriceMarker`;
`page.tsx:151-153` `void nowMs; void liveEventCount;
void uniqueCitiesCount;`. These suppress unused-var lint, suggesting
the variables were either intended for a feature that was removed,
or that the linter is being silenced rather than the code being
cleaned. Not user-visible.
**Fix**: delete the dead vars + the `void` lines.
**Effort**: 2 minutes.

## Items requiring live verification (NOT pass, NOT fail - owed)

These are explicit gaps in this audit's coverage caused by the
environment. They must be exercised by Lawal in a working dev
environment with disk space before any launch sign-off.

1. **Stripe test card 4242 end-to-end** on `/checkout/[reservation_id]`
   for a real paid event: does the payment intent confirm, does the
   webhook fire, does the ticket row land, does Resend deliver, does
   `/t/[code]` render with the QR?
2. **Free-event RSVP end-to-end** via `register-free.ts`: tickets
   issued without payment_intent, confirmation email sent?
3. **Refund end-to-end** from the organiser dashboard or admin tool:
   `reverse_transfer` and `refund_application_fee` honoured on Stripe
   side, `charge.refunded` webhook fires, ticket status flips to
   `refunded`, waitlist promotion fires.
4. **Squad booking** with 3+ members all paying: each member's
   webhook hits the squad branch, completion email fires only when
   all paid.
5. **Resend dashboard delivery confirmation** for one purchase, one
   refund (after MEDIUM-1 lands), one squad completion, one waitlist
   offer. Check open rate / spam folder.
6. **Stripe CLI signature listener** pointed at `/api/webhooks/stripe`
   in dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   and trigger `payment_intent.succeeded`, `charge.refunded`,
   `charge.dispute.created`.
7. **Real-browser click-through** of the footer's 25 links + the
   homepage's ~12 "View all" rail links + every event card on the
   homepage. The static audit found HIGH-2; a live click-through
   will likely surface the same set plus visual regressions a static
   read cannot see.
8. **Broken-image 404s in Network panel** on `/`, `/events`,
   `/events/[slug]`, `/cities`, `/cultures`. The DB confirms 0 null
   cover_image_url among published events and a single host (Pexels),
   but a live load is needed to confirm no 4xx responses.

## What is working well (honest)

- **Stripe integration is robust.** The webhook handler is the most
  thoroughly engineered file in the codebase: raw-body signature
  verification, event-level dedupe (`claimWebhookEvent`), retry-on-
  failure for the money path (500 on processing error), 17 event
  types handled with per-event try/catch + Sentry capture,
  idempotent `confirm_order` early-return on duplicate deliveries.
  This is launch-quality code.
- **Refund implementation is correct for destination charges.**
  `reverse_transfer: true` + `refund_application_fee: true` is the
  exact pattern Stripe recommends for Connect destination-charges,
  and it is implemented in a narrow, testable seam
  (`src/lib/payments/refund.ts`) with the test-only client injection
  hatch that good code has.
- **Per-ticket QR + email is the right pattern.** The webhook
  generates QR PNGs in-process from the bearer URL
  (`/t/[code]?k=[secret]`) and attaches one CID per ticket. No
  separate cron job, no orphaned-tickets risk. Idempotent against
  retries.
- **Legal coverage is complete and substantive.** Terms, Privacy,
  Refunds, Cookies, Accessibility, Organiser Terms are all real
  content with sectioned `LegalPageShell` and "last updated" dates.
  No "Coming Soon" on any of them. The prompt's premise that
  `/legal/cookies` and `/organiser-terms` might be stubs is wrong.
- **RLS posture continues to tighten.** The schema-hygiene draft
  (now landed via PR #27) closed the world-readable-pricing-rules,
  world-readable-squads, and unfiltered-member-ledger gaps. The
  audit log + admin RBAC enforces capability checks per page.
- **Help, marketing, and account routes all render real content.**
  Every page enumerated (70 routes) renders something substantive;
  the only acknowledged stubs are `/dashboard/insights` (graceful
  empty state with CTA), `/blog`'s "Coming soon" eyebrow (intentional
  marketing copy listing upcoming pieces), and the three `/dev/*`
  routes (gating gap, HIGH-1).
- **Env hygiene is good.** All required secrets are in
  `.env.local`: Supabase URL+anon+service, Stripe publishable+secret+
  webhook, Resend API key, Upstash Redis URL+token, Sentry DSN,
  Mapbox token, Google Maps, Pexels, admin TOTP. None missing.

---

## Appendix: routes enumerated

70 page routes:
`/`, `/events`, `/events/[slug]`, `/events/browse/[city]`,
`/cities`, `/city/[slug]`, `/city/[slug]/[suburb]`,
`/cultures`, `/culture/[culture]`, `/culture/[culture]/[city]`,
`/faith/[faith]`, `/categories/[slug]`,
`/organisers`, `/organisers/[handle]`, `/organisers/signup`,
`/venues/[handle]`,
`/pricing`, `/help`, `/help/[slug]`, `/contact`, `/for-organisers`,
`/about`, `/blog`, `/careers`, `/press`,
`/legal/terms`, `/legal/privacy`, `/legal/refunds`,
`/legal/cookies`, `/legal/accessibility`, `/legal/organiser-terms`,
`/tickets`, `/t/[code]`, `/account`, `/account/saved`,
`/account/tickets`,
`/checkout/[reservation_id]`, `/orders/[order_id]/confirmation`,
`/squad/[token]`, `/squad/[token]/pay/[member_id]`,
`/queue/[slug]`,
`/admin/login`, `/admin/(authed)`, `/admin/(authed)/audit`,
`/admin/(authed)/enrol-2fa`,
`/(auth)/login`, `/(auth)/signup`, `/(auth)/forgot-password`,
`/(auth)/verify-email-sent`,
`/auth/reset-password`,
`/(dashboard)/dashboard`,
`/(dashboard)/dashboard/events`, `/dashboard/events/[id]`,
`/dashboard/events/[id]/edit`, `/dashboard/events/[id]/discounts`,
`/dashboard/events/[id]/orders`,
`/dashboard/events/[id]/orders/[orderId]`,
`/dashboard/events/[id]/pricing`,
`/dashboard/events/[id]/seats`,
`/dashboard/events/create`,
`/dashboard/insights`, `/dashboard/my-squads`,
`/dashboard/my-waitlists`, `/dashboard/organisation`,
`/dashboard/organisation/create`, `/dashboard/payouts`,
`/dashboard/tickets`, `/dashboard/venues`,
`/dashboard/venues/[id]/seat-maps`,
`/dev/logo-preview`, `/dev/shell-preview`.

19 API + auth route handlers:
`/api/cron/queue-admit`, `/api/cron/squad-expire`,
`/api/cron/waitlist-expire`, `/api/cron/warm`,
`/api/health/redis`, `/api/health/sentry-error`,
`/api/home/surprise`, `/api/location/set`,
`/api/newsletter/subscribe`,
`/api/stripe/connect/onboard`, `/api/stripe/connect/refresh`,
`/api/stripe/connect/return`,
`/api/tickets/[code]/qr`, `/api/webhooks/stripe`,
`/auth/callback`, `/auth/confirm`,
`/dev/connect-onboarding-preview`.
