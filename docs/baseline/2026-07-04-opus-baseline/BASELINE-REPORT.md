# Visual Baseline: 2026-07-04 (pre-Fable-5 record)

This folder is the permanent visual record of the deployed EventLinqs platform
as at 4 July 2026, captured before any Fable 5 work begins. It is the BEFORE
half of every before-and-after comparison against later work. Nothing in this
folder is ever edited or re-captured; a later baseline gets its own dated
folder.

## Source of the captures

- **Captured from:** `https://eventlinqs-staging.vercel.app` (the deployed
  staging alias). Staging was reachable throughout; localhost was NOT used.
- **Deployed git commit:** `1166a93593d0fa139214d48e77b0662d49017cf1`
  ("chore(staging): redeploy release/launch-line preview to inline TEST
  (_PREVIEW) env"), confirmed from the Vercel deployment record
  (`dpl_EPbEwSGtxi2t9qvFdbfyww9FZkz8`, READY, region syd1, built 28 June 2026
  11:48 pm AEST).
- **Deployment caveat:** the Vercel record shows `gitDirty: 1`, meaning the
  deploy was made from a working tree with uncommitted changes on top of
  `1166a93`. The deployed bundle may therefore include some of the WIP that was
  later split onto branches in the 2026-07-04 snapshot-and-split operation
  (snapshot ref: `snapshot-2026-07-04-pre-split`, commit `5676705`). The
  screenshots are the truth of what was deployed; the commit hash is the
  closest committed ancestor.
- **Database behind staging:** the TEST Supabase project
  (`vkapkibzokmfaxqogypq`) only. Proven during capture: the authenticated
  session cookie issued by staging is `sb-vkapkibzokmfaxqogypq-auth-token`, and
  the login used a user that exists only on TEST. The production database
  (`gndnldyfudbytbboxesk`) was never touched.

## Method

- Playwright 1.59.1 (repo-installed), headless Chromium, full-page screenshots.
- **Desktop viewport:** 1440x900. **Mobile viewport:** 390x844, iPhone 13
  device profile (touch, mobile UA, deviceScaleFactor 3, so mobile PNGs are
  ~1170 physical pixels wide).
- Every page was scrolled end to end before capture so lazy-loaded imagery is
  present, then captured from the top.
- Authenticated surfaces used the seeded TEST account
  `test-user@eventlinqs.com` (created via the repo's idempotent
  `scripts/seed-test-user.mjs` run against `.env.test`). The login was
  performed through the real staging login form.
- Files over 8 MB were re-encoded from PNG to JPEG quality 90 after capture
  (same pixels, committable size); each is flagged in the table. One capture
  (`events-browse-mobile.jpg`) was additionally scaled to fit the JPEG
  65,535-pixel height cap because the full events catalogue page renders
  ~281,000 physical pixels tall on mobile.

## What the capture proved (defects observed on the deployed code)

1. **Checkout is unreachable on staging: launch blocker, already known.**
   Selecting a ticket and pressing the CTA fails for every event. Evidence:
   the `createReservation` server-action POST returns HTTP 500 (Next.js error
   digest `240934949`) and the buyer sees "Something went wrong starting your
   checkout." This is the known `export type` re-export defect in
   `src/app/actions/reservations.ts` (a `'use server'` module re-exporting a
   type compiles to a runtime reference and throws ReferenceError on built
   deploys). The fix exists on branch `fix/reservation-action-export`. The
   `/checkout/[reservation_id]` page therefore could NOT be captured; the
   captured error states (`checkout-attempt-error-*.png`) are the honest
   baseline for that surface.
2. **Login rate limiter is live and strict.** Repeated automated logins from
   one IP tripped it during capture (expected behaviour from the 2026-06-25
   hardening; worked again after a backoff).
3. **/feed requires login.** Signed out, it 307-redirects to
   `/login?redirect=/feed`; the captures record the redirect target.

## Honest gaps in this baseline

- `/checkout/[reservation_id]` desktop and mobile: NOT captured, blocked by
  defect 1 above. Capture it in the AFTER set once
  `fix/reservation-action-export` is deployed.
- The organiser dashboard/account surfaces show a fresh test account (no
  orders, no payout history), so they record the near-empty state of those
  surfaces, not a data-rich state.
- The wizard walk stopped at step 7 (Review and Publish) WITHOUT clicking
  Publish; no event was published.

## Side effects left on the TEST database (never production)

- Test user `test-user@eventlinqs.com` (id `57101100-eec8-4e72-a464-97e11e66bea1`).
- One organisation and draft events named "Baseline Capture Draft ..." created
  by walking the real create flow. Drafts only, never published, clearly named.

## The captures (58 files)

Timestamps are UTC (capture day in Sydney: 4 July 2026 afternoon AEST).

| File | URL (path on staging) | Viewport | Timestamp (UTC) | Notes |
|---|---|---|---|---|
| about-desktop.png | /about | 1440x900 | 2026-07-04T04:07:51.671Z |  |
| about-mobile.png | /about | 390x844 | 2026-07-04T04:11:23.094Z |  |
| account-desktop.png | /account | 1440x900 | 2026-07-04T04:08:55.349Z |  |
| account-mobile.png | /account | 390x844 | 2026-07-04T04:18:13.435Z |  |
| account-tickets-desktop.png | /account/tickets | 1440x900 | 2026-07-04T04:08:58.992Z |  |
| account-tickets-mobile.png | /account/tickets | 390x844 | 2026-07-04T04:18:16.855Z |  |
| category-landing-desktop.png | /categories/music | 1440x900 | 2026-07-04T04:07:09.493Z |  |
| category-landing-mobile.png | /categories/music | 390x844 | 2026-07-04T04:10:32.351Z |  |
| checkout-attempt-error-desktop.png | /events/naming-ceremony-showcase-yoruba-traditions-night | 1440x900 | 2026-07-04T04:31:44.804Z | checkout unreachable on staging: createReservation server action returns HTTP 500 (digest 240934949); see defects above |
| checkout-attempt-error-mobile.png | /events/naming-ceremony-showcase-yoruba-traditions-night | 390x844 | 2026-07-04T04:36:19.518Z | checkout unreachable on staging: createReservation server action returns HTTP 500 (digest 240934949); see defects above |
| cities-index-desktop.png | /cities | 1440x900 | 2026-07-04T04:07:36.527Z |  |
| cities-index-mobile.png | /cities | 390x844 | 2026-07-04T04:11:06.683Z |  |
| city-landing-desktop.png | /city/melbourne | 1440x900 | 2026-07-04T04:07:19.297Z |  |
| city-landing-mobile.jpg | /city/melbourne | 390x844 | 2026-07-04T04:10:48.244Z | converted from PNG to JPEG q90 for committable size |
| communities-index-desktop.png | /communities | 1440x900 | 2026-07-04T04:07:30.104Z |  |
| communities-index-mobile.png | /communities | 390x844 | 2026-07-04T04:11:00.073Z |  |
| community-landing-desktop.png | /community/first-nations | 1440x900 | 2026-07-04T04:07:23.631Z |  |
| community-landing-mobile.png | /community/first-nations | 390x844 | 2026-07-04T04:10:51.779Z |  |
| event-create-step-1-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:08:34.746Z | organisation setup form (shown before the wizard for a fresh organiser account) |
| event-create-step-1-mobile.png | /dashboard/events/create | 390x844 | 2026-07-04T04:18:09.591Z | create-event entry state (wizard step 1; organisation already created by the desktop pass) |
| event-create-step-2-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:08:40.576Z | first walk: wizard step 1 of 7, Basic Details |
| event-create-step-3-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:08:46.680Z | first walk: wizard step 2 of 7, Date and Time |
| event-create-wizard-step-1-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:21:38.241Z | wizard step 1 of 7 |
| event-create-wizard-step-1-mobile.png | /dashboard/events/create | 390x844 | 2026-07-04T04:22:17.569Z | wizard step 1 of 7 |
| event-create-wizard-step-2-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:21:42.098Z | wizard step 2 of 7 |
| event-create-wizard-step-2-mobile.png | /dashboard/events/create | 390x844 | 2026-07-04T04:22:21.557Z | wizard step 2 of 7 |
| event-create-wizard-step-3-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:21:45.784Z | wizard step 3 of 7 |
| event-create-wizard-step-3-mobile.png | /dashboard/events/create | 390x844 | 2026-07-04T04:22:25.292Z | wizard step 3 of 7 |
| event-create-wizard-step-4-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:21:49.565Z | wizard step 4 of 7 |
| event-create-wizard-step-4-mobile.png | /dashboard/events/create | 390x844 | 2026-07-04T04:22:29.148Z | wizard step 4 of 7 |
| event-create-wizard-step-5-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:21:53.327Z | wizard step 5 of 7 |
| event-create-wizard-step-5-mobile.png | /dashboard/events/create | 390x844 | 2026-07-04T04:22:33.043Z | wizard step 5 of 7 |
| event-create-wizard-step-6-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:21:57.148Z | wizard step 6 of 7 |
| event-create-wizard-step-6-mobile.png | /dashboard/events/create | 390x844 | 2026-07-04T04:22:36.902Z | wizard step 6 of 7 |
| event-create-wizard-step-7-desktop.png | /dashboard/events/create | 1440x900 | 2026-07-04T04:22:00.909Z | wizard step 7 of 7 (Publish NOT clicked; draft only) |
| event-create-wizard-step-7-mobile.png | /dashboard/events/create | 390x844 | 2026-07-04T04:22:40.714Z | wizard step 7 of 7 (Publish NOT clicked; draft only) |
| event-detail-desktop.png | /events/naming-ceremony-showcase-yoruba-traditions-night | 1440x900 | 2026-07-04T04:07:05.872Z |  |
| event-detail-mobile.png | /events/naming-ceremony-showcase-yoruba-traditions-night | 390x844 | 2026-07-04T04:10:29.254Z |  |
| events-browse-desktop.jpg | /events | 1440x900 | 2026-07-04T04:06:53.588Z | converted from PNG to JPEG q90 for committable size |
| events-browse-mobile.jpg | /events | 390x844 | 2026-07-04T04:10:20.604Z | converted from PNG to JPEG q90; scaled x0.23 to fit the JPEG 65535px height cap (source was ~281,000px tall) |
| feed-desktop.png | /feed | 1440x900 | 2026-07-04T04:08:05.359Z | redirected to /login?redirect=/feed (signed out) |
| feed-mobile.png | /feed | 390x844 | 2026-07-04T04:11:36.114Z | redirected to /login?redirect=/feed (signed out) |
| help-desktop.png | /help | 1440x900 | 2026-07-04T04:07:55.156Z |  |
| help-mobile.png | /help | 390x844 | 2026-07-04T04:11:26.694Z |  |
| home-desktop.png | / | 1440x900 | 2026-07-04T04:06:33.367Z |  |
| home-mobile.jpg | / | 390x844 | 2026-07-04T04:09:14.676Z | converted from PNG to JPEG q90 for committable size |
| organiser-dashboard-desktop.png | /dashboard | 1440x900 | 2026-07-04T04:08:25.174Z |  |
| organiser-dashboard-mobile.png | /dashboard | 390x844 | 2026-07-04T04:18:02.511Z |  |
| organiser-events-desktop.png | /dashboard/events | 1440x900 | 2026-07-04T04:08:28.833Z |  |
| organiser-events-mobile.png | /dashboard/events | 390x844 | 2026-07-04T04:18:06.364Z |  |
| organisers-landing-desktop.png | /organisers | 1440x900 | 2026-07-04T04:07:48.112Z |  |
| organisers-landing-mobile.jpg | /organisers | 390x844 | 2026-07-04T04:11:18.945Z | converted from PNG to JPEG q90 for committable size |
| pricing-desktop.png | /pricing | 1440x900 | 2026-07-04T04:07:40.589Z |  |
| pricing-mobile.png | /pricing | 390x844 | 2026-07-04T04:11:10.501Z |  |
| signin-desktop.png | /login | 1440x900 | 2026-07-04T04:08:01.905Z |  |
| signin-mobile.png | /login | 390x844 | 2026-07-04T04:11:33.300Z |  |
| signup-desktop.png | /signup | 1440x900 | 2026-07-04T04:07:58.747Z |  |
| signup-mobile.png | /signup | 390x844 | 2026-07-04T04:11:30.690Z |  |

`manifest.json` in this folder carries the same record in machine-readable
form.
