# Checkout "Invalid reservation data" - root cause, fix, durability (2026-07-12)

## The root cause, plainly

The homepage on staging is served from a density fixture (the
`HOMEPAGE_SEED_FIXTURE` set). Every event in that fixture was built with an
identity code one character too short to be a valid UUID: the last block was
eleven hex characters where a UUID needs twelve
(`c0a70000-0000-4000-8000-00000000007`). When a buyer clicked one of those
events and pressed Checkout, the reservation step validated the event's id
against a strict UUID rule and rejected it, showing "Invalid reservation
data" before any payment was attempted. On top of that, those fixture events
were never written into the database at all, so even a correctly-shaped id
would have had no event row to reserve against. Evidence captured live: the
red UI error, the server action response `{"error":"Invalid reservation
data"}`, and the server log line `event_id: invalid_format - Invalid UUID`.

## Why the earlier tests "passed" while this failed

The automated purchase batteries drove a few HARDCODED database events
(harbour-lights, cellar-comedy) that were real rows with valid ids. They
never drove the events shown on the homepage, which are the ones a real
visitor actually clicks. So a green report and a broken checkout could
coexist. That test gap was itself a defect.

## The fix (data and code, no masking, no per-event special-casing)

1. The fixture generator now emits a valid 12-character UUID segment, so a
   malformed id can no longer be created.
2. Every published fixture event now carries a real licensed cover (a
   per-category pool plus the curated hero covers), satisfying the database's
   published-event cover constraint.
3. The 55 fixture events are seeded into the TEST database as real rows with
   the exact ids the fixture JSON carries, so the homepage and checkout read
   one source of truth.
4. Seeded events are assigned to a payments-ready organiser, and every TEST
   organiser behind a published event was made payments-ready (a working test
   Stripe connection), so no valid event is blocked by the "tickets not yet
   on sale" sale-guard.
5. One leftover published event that had zero ticket tiers was given a GA
   tier, so every published event has something to buy.

## Why this cannot silently return

- CI unit guard `tests/unit/home/fixture-integrity.test.ts` fails the build
  if any fixture event id is ever malformed again or any published fixture
  event lacks a real cover. The bad data cannot be committed.
- Standing browser gate `scripts/verify/checkout-integrity.mjs` enumerates
  EVERY published event (never a hardcoded slug) and drives the real checkout
  UI on each, so a green report can never again coexist with a broken
  checkout. Documented in docs/verification/HOME-GATES.md.
- The payment sentinel (`/api/cron/webhook-sentinel`, every 10 minutes plus a
  post-deploy hook) catches signature/endpoint/processing drift and emails
  the founder; the reservation-expiry cron releases abandoned holds. Both run
  on production by Vercel design (see docs/payments/GO-LIVE-NOTE.md).
- The checkout works from EVERY surface an event appears on, not just the
  homepage, because the fix is at the event-data level and every surface
  links to the single checkout entry point `/events/[slug]`. Proven by the
  multi-surface harness (home, browse, search, city, category/scene,
  community, organiser pages all reach checkout).

## TEST data operations recorded (production untouched)

- 55 fixture catalogue events seeded into TEST (vkapkibzokmfaxqogypq).
- 29 TEST organisations set payments-ready with the proven test Connect
  account.
- 1 tier-less published event given a GA tier.
These are TEST seed/config data only. The funds-holding payment engine, its
code, and production were never touched.
