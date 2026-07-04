# Staging Verification Report: 2026-07-04

Full-journey verification of https://eventlinqs-staging.vercel.app executed with
Playwright at desktop 1440x900 and mobile 390x844, with real TEST-database row
proof (vkapkibzokmfaxqogypq) for every write. Production (gndnldyfudbytbboxesk)
was never written to; the only production references found on staging are
read-only public stock-image URLs.

Verified deployment lineage (branch `feat/event-media-standard`, all fixes
committed and pushed): starting deployment `dpl_EPbEwSGtxi2t9qvFdbfyww9FZkz8`
(2026-06-28, stale) was replaced through five fix-and-redeploy cycles; the final
staging alias points at `eventlinqs-gag0w3sjm-lawals-projects-c20c0be8.vercel.app`
(commit `f6f2e27`).

Evidence: 148 screenshots + per-journey JSON results in
`docs/verification/2026-07-04/` (local, not committed; screenshots referenced
below by filename in `docs/verification/2026-07-04/screenshots/`).

## Verdict summary

| Journey | Verdict |
|---|---|
| A. Organiser (signup, onboarding, event + image upload) | PASS after 3 fixes |
| B. Buyer (free + paid, minting proof, email) | PASS after 2 fixes |
| C. General visitor (home, browse, search, public pages) | PASS |
| D. Link and asset sweep | PASS: zero dead links, zero broken images |
| E. Regression checks (reservations export, organiser guard, free minting) | PASS |
| Feature-claim audit | 4 of 6 fully real, 2 partial (see table) |

Seven defects were found; six are permanently fixed, committed, deployed, and
re-verified. One (server-side sale-window enforcement) is reported, not fixed,
because the claims audit was report-only and the fix requires a migration
(founder applies migrations by law).

---

## Journey A: organiser (PASS after fixes)

Steps executed for real, as a new user: `/signup?role=organiser` form ->
verify-email screen -> email confirm link -> signed in on `/dashboard` ->
organisation created ("Harbour Lights Collective") -> 7-step event wizard ->
image uploads (normal, ultra-wide 3999x1000, ultra-tall 1000x3500, large 8.7MB;
plus rejection tests 43MB and 4500px) -> three ticket tiers (paid $25, free $0,
Early Bird $15 with sale-end) -> published -> event live at
`/events/harbour-lights-live-geelong-waterfront-sessions-4muhm2`.

DB proof: auth user `73e72297...` email_confirmed_at set, `profiles.role =
organiser`, organisation row active, event row `f19df808...` status published,
cover in TEST storage bucket `event-images`.

Screenshots: `A1-*` (signup -> dashboard), `A2-*` (wizard steps, uploads,
rejections, review, publish), `A3-*` (card + detail rendering, both viewports).

**How the uploaded image looks (eyes-on):** the cover renders correctly cropped
and sharp on the browse card (object-fit cover in a 4:5-ish card frame, no
stretching, no letterboxing) and on the detail hero (full-bleed 16:9 band,
1920x1080 source rendered 1440x432 under the navy scrim, crisp). The ultra-wide,
ultra-tall, and large images render as clean uniform gallery crops: centre-crop
behaviour, uniform tile sizes, zero broken images on desktop and mobile. The
wizard shows a professional dual-crop preview (Hero 16:9 + Card 4:5). Rejections
are clean and specific: "Each image must be under 10MB." and "Image is too large
in pixels: 4500 x 2000. The maximum is 4000 x 4000."

### Defect A-1 (launch-blocking, FIXED): signup email link dead-ended, organiser role never set
- Symptom: every email-confirm click landed on `/login?error=auth_callback_failed`,
  signed out, role stayed `attendee`.
- Root cause: `/api/auth/signup` emailed the raw GoTrue `action_link`, which runs
  the implicit flow and returns the session in the URL FRAGMENT; the server route
  `/auth/callback` can only read `?code=` and can never see a fragment. The
  correct `/auth/confirm` (verifyOtp + token_hash) route already existed but was
  never linked.
- Fix: commit `a64ed36` - the email now links to
  `/auth/confirm?token_hash=...&type=signup&role=organiser&next=/dashboard`.
- Re-test proof: fresh signup -> confirm link -> landed signed-in on `/dashboard`,
  `email_confirmed_at` set, `profiles.role = organiser` (`A1-desktop-*`).
- Related environment fix: the TEST Supabase project's auth `uri_allow_list` was
  EMPTY, so redirects were forced to `http://localhost:3000`. Added the staging
  alias + Vercel preview URL patterns (Management API; also recorded in
  `supabase/config.toml` for reference).

### Defect A-2 (launch-blocking, FIXED): images between 4.5MB and 10MB never upload; tile stuck on "Uploading..." forever
- Symptom: 8.7MB upload spun forever, publish silently blocked; no error shown.
- Root cause (two layers): Vercel caps serverless request bodies at ~4.5MB, so
  any original above that dies at the platform edge despite the app's 10MB
  promise (phones routinely produce 5-8MB photos); and the uploader had no
  try/catch around the thrown action error, stranding the tile in uploading
  state.
- Fix: commit `2766ebf` - `src/lib/media/client-compress.ts` implements the
  media-standard SPEC 1.5 client-side downscale (files over 4MB re-encoded in
  the browser, quality first, resolution second) and `uploadOne` now drops a
  failed tile with a plain notice.
- Re-test proof: the same 8.7MB file uploads and renders (`A2-10`), publish
  enabled, event published.

### Defect A-3 (minor, FIXED): review step called a paid event "Free event"
- Root cause: `min(price) === 0` free-ness in the review summary; free means
  EVERY tier is $0 (fee-system definition).
- Fix: commit `5d1abb5`.

Note: publishing a PAID event correctly requires Stripe payout onboarding first;
the block is presented with a clear message. That gate is by design and worked.

### Stripe Connect onboarding (completed, with one substitution noted)
The real surface was driven: `/dashboard/payouts` -> "Set up payouts" -> Express
account created (`acct_1TpLTf...` persisted to the organisation) -> redirect to
Stripe-hosted onboarding. Stripe's hosted TEST form then presented a CAPTCHA
(bot protection triggered by repeated automation), which is not something a
verification harness should bypass. Substitution: a fully-enabled Stripe TEST
connected account was created via Stripe's sanctioned API path (the same method
used by the nine prior verification accounts on this Stripe account) and
attached to the organisation in TEST. EventLinqs's own code (account creation,
link minting, publish gate, checkout gating on Stripe status) was fully
exercised; only Stripe's third-party identity form was API-substituted.
Screenshots: `A25-*`, `A26-*`, `A27-*`.

---

## Journey B: buyer (PASS after fixes)

Free path (mobile 390x844, guest): discovered via `/events?q=Harbour Lights`,
opened the event, selected the free tier, guest checkout, "Register for free".
- Confirmation screen: "You're in" (`B-mobile-06`, `B3-mobile-*`).
- DB minting proof (the re-proof of the sprint's minting fix): order
  `EL-SQWSG6RF` status confirmed, total 0; ticket `EL-8ZDD-4Y45` status valid
  with QR secret, holder recorded.
- Email proof: Resend shows "Your tickets for Harbour Lights Live..." DELIVERED
  to the free buyer address at 05:34:53Z.

Paid path (desktop 1440x900, guest, Stripe test card 4242): ticket selection
showed the ACCC all-in total early ("Checkout - AUD 27.50"); checkout showed
itemised Service fee AUD 1.87 + Payment processing fee AUD 0.63 on the $25
ticket; Stripe PaymentElement (embedded, tabs layout).
- DB proof: order `EL-86RWJB48` confirmed via the Stripe webhook;
  platform_fee_cents 187 (= 3.5% + $0.99), processing_fee_cents 63 (= 2.5%),
  total 2750 - the displayed total equals the charged total to the cent. Ticket
  `EL-UM9Z-G2CZ` valid, holder "Paola Buyer".
- Confirmation screen "You're in" (`B3-desktop-confirmation-confirmed`).
- Email proof: Resend DELIVERED at 05:47:58Z.
- Single-click re-verification after Defect B-2 fix: order `EL-Z488D879`
  confirmed on ONE Pay click (`B4-single-click-confirmation`).

### Defect B-1 (launch-blocking for staging, FIXED): webhook signature failure left paid orders pending
- Symptom: payment succeeded at Stripe but the order stayed `pending`, no ticket
  minted; runtime log: "Stripe webhook signature verification failed".
- Root cause: environment, not code. The branch-scoped `STRIPE_WEBHOOK_SECRET`
  had been stored EMPTY (piping values into `vercel env add` silently stores ""
  on this Windows setup, and "sensitive"-type vars cannot be read back to catch
  it). A fresh Stripe TEST webhook endpoint for the staging URL was created this
  session; its secret is now stored as a verifiable encrypted var (read-back
  matches exactly).
- Re-test proof: next purchase confirmed by webhook end to end (EL-86RWJB48).
  The one orphaned charge from the broken window (EL-BV36W6NY, $27.50) was
  refunded (`re_3TpMHo...`) to keep TEST money-state clean.

### Defect B-2 (minor, FIXED): first Pay click silently ignored
- Root cause: the submit handler bails on `!elements`, but the button only
  disabled on `!stripe`, so a click during PaymentElement initialisation was a
  silent no-op.
- Fix: commit `f6f2e27` (disable until Elements is mounted).
- Re-test proof: one click -> confirmation (`B4-*`, order EL-Z488D879).

---

## Journey C: general visitor (PASS)

22 public surfaces visited at both viewports with full-page screenshots
(`C-desktop-*`, `C-mobile-*`): home, browse, search ("music"), first event card
through to detail, organisers, pricing, about, careers, press, cities,
communities, city landings (Sydney, Melbourne), community landing (Aboriginal &
Torres Strait Islander), community-city (African Sydney), suburb (Inner West),
legal, login, signup, feed.

- All real pages: HTTP 200. Zero broken images on every page. Zero console
  errors on every real page.
- The only non-200s were four paths in my own test list that are not product
  routes on this branch (`/music`, `/artists` belong to the unmerged Genre
  Phase 2; `/blog` does not exist; my invented slug `/community/first-nations` -
  the real route is `/community/aboriginal-torres-strait-islander`, verified 200
  both viewports). Nothing on the platform links to any of them (see Journey D),
  so none is a defect.

## Journey D: link and asset sweep (PASS)

`scripts/link-integrity-crawl.mjs` against staging: 17 seed surfaces harvested,
**314 unique internal links, ALL resolve HTTP 200. Zero dead links, zero 404s,
zero 500s.** Four links resolve via legitimate redirects (auth gates
`/account -> /login?next=...`, `/organisers/signup -> /signup?role=organiser`).
Broken-image and console checks ran in Journey C: zero broken images, zero
console errors on primary pages.

## Journey E: sprint regression checks (PASS)

1. **reservations.ts use-server export** - PASS. `createReservation` executed
   repeatedly on built deploys this session (every checkout above); the previous
   deploy's 500 (digest 240934949) is gone. The fix is commit `46932d4`
   (merged here).
2. **Organiser null guard on event detail** - PASS. With the organisation
   flipped to `pending` in TEST, the event page returned HTTP 200 (no crash);
   restored to `active` afterwards.
3. **Free ticket minting** - PASS with DB rows (order EL-SQWSG6RF + ticket
   EL-8ZDD-4Y45, minted by `confirm_order` via the issuance trigger; fix commit
   `d77608b` merged here).

---

## Feature-claim audit (report-only, as instructed)

| Claim | Status | Evidence |
|---|---|---|
| QR code check-in | REAL | Scanner at `/scan/[eventId]`, linked as "Door check-in" from the event dashboard (verified 200, screenshot `CL-scanner-page`). Atomic admit-once via `scan_ticket` RPC (single compare-and-set UPDATE, audit rows); buyer QR issued on `/t/[code]` and in the ticket email. Live scan proven in the 2026-06-28 run. |
| Multiple ticket types per event | REAL | Three tiers created and sold in this session (GA $25, free pass $0, Early Bird $15); nine tier types available in the wizard. Screenshot `A2-14`. |
| Early bird / time-based pricing | PARTIAL | Tier type "Early Bird" + per-tier Sale Starts / Sale Ends exist and drive the UI (tier hidden after sale_end, "Sale opens..." before sale_start). GAP: the sale window is NOT enforced server-side; `create_reservation` never checks `sale_start`/`sale_end`, so a crafted request could buy outside the window. Marketing can say "early bird pricing"; the server gate should be added before it is a hardened claim. |
| Recurring events and session capacities | MOSTLY NOT REAL | The wizard checkbox and `recurrence_rule` are stored on the event row and nothing more: no sessions/occurrences table, no per-session capacity, no per-session tickets, the rule is never consumed. Do not claim recurring events or session capacities. |
| Attendee list export by organisers | REAL | `/dashboard/events/[id]/attendees` with CSV / Excel / PDF door-list export, server-side ownership gate (fails closed), Spam-Act "Opted in" consent column flowing into exports. Verified live on staging (export controls + opt-in column present; screenshot `CL-dashboard-events-...`). |
| Capacity limits on free registrations | REAL | Oversell guard in `create_reservation` (row-locked `total_capacity - sold_count - reserved_count` check) is price-agnostic and both the free and paid paths funnel through it; free tier capacity (50) set in this session's event. |

---

## Defect register (this session)

| # | Severity | Defect | Root cause | Fix | Re-test |
|---|---|---|---|---|---|
| 1 | Launch-blocking | Signup email link dead-ends; organiser role never set | Implicit-flow `action_link` emailed instead of `/auth/confirm` token_hash link | `a64ed36` | Full signup A-Z green |
| 2 | Launch-blocking | Images 4.5-10MB never upload; tile stuck "Uploading..." | Platform 4.5MB body cap + uncaught action error | `2766ebf` (SPEC 1.5 client compress + honest failure) | 8.7MB upload green |
| 3 | Launch-blocking (staging env) | Paid orders stayed pending; no ticket | Empty branch-scoped STRIPE_WEBHOOK_SECRET (silent empty store) | New endpoint + verifiable env var | Webhook-confirmed order green |
| 4 | Major (consistency) | Card said "Free", hero said "From AUD $15", related cards priced from first tier | Five local copies of a min-price rule | `fca010a` (single source `price-label.ts`) | Card shows "From AUD $15" |
| 5 | Minor | Review step: paid event labelled "Free event" | Same min-price rule | `5d1abb5` | Review correct |
| 6 | Minor | First Pay click silently ignored | Button enabled before Stripe Elements mounted | `f6f2e27` | One-click purchase green |
| 7 | Reported, not fixed | Sale windows not enforced server-side | `create_reservation` ignores `sale_start`/`sale_end` | Needs a migration (founder-applied by law) | n/a |

Environment fixes (staging plumbing, this session): TEST auth `uri_allow_list`
populated; branch-scoped Vercel env vars for `feat/event-media-standard`
(STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET,
CRON_SECRET, EMAIL_FROM) set against the `.env.test` Stripe account
`acct_1T8WBzGqHIQtgS8t`; new Stripe TEST webhook endpoint
`we_1TpKq2GqHIQtgS8tIND6Iy23` -> staging.

Test data created on TEST (cleanup candidates, all marked by the verification
account emails `delivered+elq-*@resend.dev`): 4 auth users, 1 organisation, 1
published event, 4 orders (2 confirmed paid, 1 confirmed free, 1 pending
refunded), 3 tickets, 2 Stripe test connected accounts (1 abandoned Express, 1
enabled custom).

## Observations (non-blocking)

- The venue map on the event detail page renders the pin card but the map tiles
  appear blank on staging; likely the Google Maps key's referrer restrictions do
  not include the staging domain. Environment configuration, not code.
- An old webhook endpoint on the TEST Stripe account posts to
  `https://www.eventlinqs.com/api/webhooks/stripe` and PRODUCTION returned 200
  for a TEST-mode event during this session. Production should not accept
  TEST-account webhooks; worth deleting that endpoint or scoping prod's secret.
- Files at exactly 9.5-10MB may still exceed the 10mb server-action budget after
  multipart overhead; the client compressor now makes this unreachable in
  practice.
- Stripe hosted onboarding CAPTCHAs automated attempts; human founder onboarding
  is unaffected (one manual pass through the real form on staging would close
  the last gap in A's Stripe leg).

---

# PLATFORM VERIFIED

All five journeys are green on https://eventlinqs-staging.vercel.app
(deployment `eventlinqs-gag0w3sjm`, branch `feat/event-media-standard` at
`f6f2e27`, pushed). Zero dead links (314/314), zero broken images, zero console
errors on real pages; organiser signup-to-published-event proven A to Z with
real image uploads including edge cases; free and paid purchases proven with
TEST-database rows, exact fee math, minted QR tickets, and delivered emails.

Decisions the founder still needs to make:

1. **Server-side sale-window enforcement (defect 7).** Approve adding
   `sale_start`/`sale_end` checks to `create_reservation` (migration, written on
   request, you apply with `supabase db push --linked`). Until then, early-bird
   windows are honest UI but not a hardened guarantee.
2. **Recurring events claim.** The checkbox stores a rule but no occurrence or
   session model exists. Either strip recurring/session-capacity language from
   marketing copy, or commission the sessions build.
3. **Production webhook hygiene.** The TEST Stripe account still has an endpoint
   pointed at www.eventlinqs.com and production answered it with 200. Decide:
   delete that endpoint, or rotate production's webhook secret so cross-account
   events can never verify.
4. **Signup fix reaches other branches.** The auth email fix (`a64ed36`) lives
   on `feat/event-media-standard` (and the sprint fixes on their fix/* branches).
   Decide when to land these on `release/launch-line` - signup is broken the
   same way on any deployment without `a64ed36`.
5. **One human pass through Stripe Express onboarding on staging** to eyeball
   the hosted form leg that automation could not complete (CAPTCHA).
6. **Maps key referrer allowlist** for the staging domain if you want live map
   tiles on preview deployments.
