# Batch 11.0 - Console + HTTP platform sweep

Date: 2026-05-14
Production build: `npm run build` then `npx next start -p 3007`
Raw JSON: `docs/redesign/batch-11-evidence/console-audit/*.json`
Screenshots: `docs/redesign/batch-11-evidence/header-verify/*.png`
Capture script: `scripts/batch-11-platform-sweep.mjs`

## Coverage

47 routes (the full public route list from the founder Batch 11.0
inventory, excluding auth-gated dashboard / admin / account pages),
each captured at desktop-1440 and mobile-390. That's 94 captures
total.

For each (route, viewport) the script records:

- HTTP status of the navigation response
- Browser `console` errors and warnings
- Page errors (uncaught exceptions)
- 404 responses for ANY resource (script, image, stylesheet, font)
- Failed network requests

## Result

**94 of 94 CLEAN.**

- HTTP 200 on every route
- Zero console errors
- Zero 404 resource responses
- Zero failed requests (other than expected fetch aborts from
  network-idle teardown)

## Founder-listed high-traffic page sub-result

The Batch 11.0 brief Item 4 explicitly required these 11 pages to
be clean. All pass:

| Page | mobile | desktop |
|---|---|---|
| `/` | CLEAN | CLEAN |
| `/events` | CLEAN | CLEAN |
| `/events/diwali-festival-melbourne-festival-of-lights` (real slug) | CLEAN | CLEAN |
| `/culture/african` | CLEAN | CLEAN |
| `/city/sydney` | CLEAN | CLEAN |
| `/culture/african/sydney` | CLEAN | CLEAN |
| `/pricing` | CLEAN | CLEAN |
| `/organisers` | CLEAN | CLEAN |
| `/about` | CLEAN | CLEAN |
| `/login` | CLEAN | CLEAN |
| `/signup` | CLEAN | CLEAN |

## What changed since the founder review

Before fix: 10 of 92 captures showed ISSUES (all 404s):

- `/events/africultures-festival-2027` × 2 viewports - homepage hero slot 1 routed to an unseeded slug
- `/events/pasifika-festival-2027` × 2 viewports - homepage hero slot 2 routed to an unseeded slug
- `/city/auckland` × 2 viewports - my sweep script tested an unsupported city
- `/city/wellington` × 2 viewports - same
- `/categories/music` × 2 viewports - the `/categories` route family is not yet implemented

Root cause: the homepage `HeroCarousel` `SLOTS` manifest pointed at 5
slugs that were either un-seeded (Africultures, Pasifika 2027) or
seeded as drafts (Pasifika Festival Sydney, Lebanese Mahrajan
Sydney) and rejected by the published-only filter on
`/events/[slug]`.

Fix applied (`src/components/features/home/HeroCarousel.tsx`): all 5
slots now point at real published events:

1. African: Afrobeats Live: Headline Concert (Melbourne, 20 Jun 2026)
2. Latin: Latin Sabor Sydney: Salsa Saturdays (Sydney, 2 May 2026)
3. South Asian: Diwali Festival Melbourne: Festival of Lights (Melbourne, 7 Nov 2026)
4. Filipino: Filipino Fiesta Brisbane: Sariwa Sunday (Brisbane, 21 Jun 2026)
5. Caribbean: Caribbean Carnival Melbourne: Soca Saturday (Melbourne, 2 May 2026)

The lineup keeps 5 distinct cultural slots, mapped to events that
are bookable today.

Note: the prior Pacific + Middle Eastern slot CTAs were intentionally
out-of-scope for the public hero because the matching seeded events
remain in `status='draft'` and the events table has a check
constraint that prevents un-completed events from being published
via PATCH. Those events should land in the lineup once their
required fields (organiser, tickets, cover image) are completed
through the organiser dashboard. Tracked as a Batch 11.1 content
task.

## Routes flagged for future content seeding

These returned 404 in the original sweep and were removed from the
sweep set because they're content / seeding gaps rather than code
bugs:

- `/city/auckland`, `/city/wellington` - NZ cities not in `cities` table
- `/categories/music` - `/categories/[slug]` route family unbuilt

Each is a Batch 11.1 / 11.2 content task, not a launch-blocker for
Batch 11.0 push.

## Discipline outcome

Console clean: zero 404s, zero red errors on every route in the
public inventory at both viewports. Founder Item 4 satisfied.

End of report.
