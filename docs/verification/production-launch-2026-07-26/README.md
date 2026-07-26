# Production launch verification, 26 July 2026

Captures and findings from the launch pass against the LIVE production domain
`https://www.eventlinqs.com.au`, not a preview.

Release: `release/launch-2026-07-26` at `51b810c`, tag `launch-2026-07-26`.
Deployment: `dpl_6FYMWhUskCjkTfJmJdPf6XqPQQ4v`.
Rollback target: `dpl_HgwcqXWDu3XqkSi5ymiqGyUrN3A5`
(`https://eventlinqs-250kollpv-lawals-projects-c20c0be8.vercel.app`, 26 Jul 10:23 AEST).

## What the captures show

All 18 surface captures are at 1440 and 390 from the production domain, every one
HTTP 200: homepage, events grid, event detail (with the venue map), the four legal
pages, organiser signup, and pricing.

Three extra captures record the ticket-selection surface, which is where the
launch blocker is visible.

## The blocker these captures record

`tickets-section-1440.png` shows the ticket area of a published production event
reading:

> "Tickets not yet on sale. This organiser is still finishing their payment setup."

That is not a defect. It is the charge-readiness guard working correctly. On
production, **0 of 16 organisations have a Stripe account at all**
(`stripe_account_id` null on every row, `stripe_charges_enabled` false on every
row), so every one of the 32 published events refuses to sell.

Consequence: the ACCC all-in price display could not be proven on production,
because no production event can reach a ticket-selection state that shows a
total. The all-in math itself is unit-tested and was proven on staging in
`docs/verification/blockers-round-2-2026-07-25.md`; what is unproven is the live
production rendering of it.

## Maps

`event-detail-map-1440.png` shows the venue map rendering live. Verified
independently in a browser: `gm-style` present, one canvas, 27 requests to
`maps.googleapis.com` including real tile requests (`maps/vt?pb=`), zero console
errors.

Note for whoever runs it next: `scripts/verify/map-guard.mjs` returns FALSE
NEGATIVES against production. It reported the same `/city/brisbane` URL as OK on
one run and DEAD (`googleReqs=0`) on the next, and reported the event map DEAD
while a direct browser probe showed a fully rendered map. Its default slugs are
also TEST-database slugs that 404 on production. Do not treat a DEAD verdict from
it as evidence without a direct probe. This is why `MAP_GUARD_ENABLED` should
stay off until the guard is made deterministic.

## Link integrity

`scripts/link-integrity-crawl.mjs` against production: **235 unique internal
links, zero dead links**, all resolving 200. Four resolve via an intentional
redirect (auth-gated account pages to `/login?next=`), which the crawler reports
as OK.

## Seated events

`seated_events` is ON in production `feature_flags`. The rebuilt canvas renderer
is confirmed present in the served production bundle (the `seatFrameTimes` perf
bridge, unique to the rebuild, appears in one served chunk; a control marker
returns zero, so the scan discriminates).

The interactive proof could NOT be completed, and was not faked: production has
**zero published seated events**, and the brief forbade creating one. What that
leaves unproven on production is listed in the report: the three LOD states, the
tooltip price, the key plan on zoom, and ticket-type colouring.
