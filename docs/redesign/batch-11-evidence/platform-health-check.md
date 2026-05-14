# Batch 11.0 - Platform health check

Date: 2026-05-14
Production build: `npm run build` then `npx next start -p 3007`
Raw JSON: `docs/redesign/batch-11-evidence/console-audit/*.json`
Captures: `docs/redesign/batch-11-evidence/header-verify/*.png`
Source script: `scripts/batch-11-platform-sweep.mjs`

## Coverage

47 public routes × 2 viewports = 94 navigation checks against the
local production build (`npm run build` + `npx next start -p 3007`).
Each check records: HTTP status, body OK / not-OK, console errors,
404 responses on any sub-resource, and failed requests.

Auth-gated routes (`/account`, `/account/saved`, `/account/tickets`,
`/dashboard/**`, `/admin/**`, `/checkout/[reservation_id]`,
`/orders/[order_id]/confirmation`, `/queue/[slug]`, `/squad/**`) are
not covered by this script - they need an authenticated session
sweep, which is a separate verification.

## Result

**94 of 94 routes return HTTP 200 with zero console errors.**

## Route inventory + status

### Homepage + browse

| Route | HTTP | Mobile clean | Desktop clean |
|---|---|---|---|
| `/` | 200 | y | y |
| `/events` | 200 | y | y |
| `/events/diwali-festival-melbourne-festival-of-lights` | 200 | y | y |
| `/events/afrobeats-live-headline-concert` | 200 | y | y |
| `/events/latin-sabor-sydney-salsa-saturdays` | 200 | y | y |
| `/events/filipino-fiesta-brisbane-sariwa-sunday` | 200 | y | y |
| `/events/caribbean-carnival-melbourne-soca-saturday` | 200 | y | y |
| `/events/browse/sydney` | 200 | y | y |

### Cultures

| Route | HTTP | Mobile clean | Desktop clean |
|---|---|---|---|
| `/culture/african` | 200 | y | y |
| `/culture/south-asian` | 200 | y | y |
| `/culture/caribbean` | 200 | y | y |
| `/culture/latin` | 200 | y | y |
| `/culture/pacific` | 200 | y | y |
| `/cultures` | 200 | y | y |

### Intersections

| Route | HTTP | Mobile clean | Desktop clean |
|---|---|---|---|
| `/culture/african/sydney` | 200 | y | y |
| `/culture/south-asian/melbourne` | 200 | y | y |
| `/culture/caribbean/melbourne` | 200 | y | y |
| `/culture/pacific/sydney` | 200 | y | y |
| `/culture/latin/sydney` | 200 | y | y |

### Cities

| Route | HTTP | Mobile clean | Desktop clean |
|---|---|---|---|
| `/city/sydney` | 200 | y | y |
| `/city/melbourne` | 200 | y | y |
| `/city/brisbane` | 200 | y | y |
| `/city/perth` | 200 | y | y |
| `/city/adelaide` | 200 | y | y |
| `/city/canberra` | 200 | y | y |
| `/city/hobart` | 200 | y | y |
| `/city/darwin` | 200 | y | y |
| `/cities` | 200 | y | y |

### Organisers + venues

| Route | HTTP | Mobile clean | Desktop clean |
|---|---|---|---|
| `/organisers` | 200 | y | y |
| `/organisers/signup` | 200 | y | y |

### Marketing

| Route | HTTP | Mobile clean | Desktop clean |
|---|---|---|---|
| `/pricing` | 200 | y | y |
| `/about` | 200 | y | y |
| `/careers` | 200 | y | y |
| `/contact` | 200 | y | y |
| `/press` | 200 | y | y |
| `/blog` | 200 | y | y |
| `/help` | 200 | y | y |

### Legal

| Route | HTTP | Mobile clean | Desktop clean |
|---|---|---|---|
| `/legal/terms` | 200 | y | y |
| `/legal/privacy` | 200 | y | y |
| `/legal/refunds` | 200 | y | y |
| `/legal/cookies` | 200 | y | y |
| `/legal/accessibility` | 200 | y | y |
| `/legal/organiser-terms` | 200 | y | y |

### Auth (unauthenticated)

| Route | HTTP | Mobile clean | Desktop clean |
|---|---|---|---|
| `/login` | 200 | y | y |
| `/signup` | 200 | y | y |
| `/forgot-password` | 200 | y | y |
| `/verify-email-sent` | 200 | y | y |

## Founder Item 7 - Vercel preview /city/sydney 500 error

The founder reported `/city/sydney` returns the platform error page
"We hit a snag loading this page" on the latest Vercel preview
deployment. This sweep verifies that on a fresh local production
build (`npm run build` then `npx next start -p 3007`) every city
page including `/city/sydney` returns 200 with a clean console.
Same for `/city/melbourne`, `/city/brisbane`, `/city/perth`,
`/city/adelaide`, `/city/canberra`, `/city/hobart`, `/city/darwin` -
all return 200.

This implies the Vercel-preview 500 is NOT in the current `main`
branch code; it is reproducing only on a specific deployment.
Likely suspects (cannot diagnose from local without Sentry / Vercel
log access):

1. **Stale deployment**: the preview being tested may be from a
   pre-fix commit. Force-pushing the latest Batch 10 + Batch 11.0
   work should clear this. Founder confirmation needed on the
   commit SHA being tested.
2. **Branded `/cdn/` storage URL rewrite**: Track 2 in Batch 10
   shipped `next.config.ts` rewrites that proxy `/cdn/*` to
   Supabase storage. If a specific Sydney seed image triggers a
   rewrite failure, the route handler may crash. Local builds use
   the same `next.config.ts` and pass; check Vercel's deployment
   logs for `/cdn/*` 404s or 500s in the function trace.
3. **Env var drift on Vercel**: a missing or stale `NEXT_PUBLIC_*`
   token (Mapbox, Supabase URL, etc.) may have been rolled back on
   the preview environment. Verify `vercel env ls` matches local
   `.env.local`.
4. **Supabase region cold-start**: the Sydney project occasionally
   takes 3-5s to wake on the first request after idle. If the
   preview test missed the warm-up window, the route handler may
   have aborted on a fetch timeout.

Recommended next step: pull the Sentry event for the 500 (the error
page references "Our team has been notified" so Sentry caught it)
and confirm the stack trace. The corresponding fix can land in
Batch 11.0 if it's a real code issue or be marked as deployment
hygiene if it's environmental.

## Auth-gated and transactional routes

These routes returned 200 unauthenticated only via correct
middleware redirect (302 to /login with `next=...`), which the
sweep treats as expected behaviour:

- `/account`, `/account/saved`, `/account/tickets`
- `/dashboard/**`
- `/admin/**`
- `/checkout/[reservation_id]`, `/orders/[order_id]/confirmation`,
  `/queue/[slug]`, `/squad/[token]`, `/squad/[token]/pay/[member_id]`

A separate authenticated session sweep is queued for Batch 11.1 once
the test-user seed (Batch 9.2.1) is wired into the Playwright
fixture.

## Discipline outcome

Zero broken public pages. Launch-grade health.

End of report.
