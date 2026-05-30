# Door check-in scanner: staging proof scripts

These scripts prove the hard invariant - a ticket admits exactly once, and only
if valid for the event - against a REAL Postgres with real ticket rows. They are
deferred from the PR's local gates and run on the staging rig only.

## Why they are not vitest unit tests

`scan_ticket` derives the scanner identity from `auth.uid()` inside a SECURITY
DEFINER function. A service-role call has a NULL `auth.uid()` and is rejected as
`not_authenticated`. Proving admit-exactly-once therefore needs real
authenticated users and a real database transaction/row-lock - not mocks. The
pure parsing and result-mapping logic is unit-tested separately
(`tests/unit/scanner/`).

## HARD SAFETY RULES

- NEVER run these against the live/production database. Each script refuses to
  start if `SUPABASE_URL` points at the production project ref
  (`gndnldyfudbytbboxesk`).
- They create their own throwaway org, event, tier, order, tickets, and auth
  users, and delete everything in teardown.
- The real ticket is minted through the actual purchase path: a `confirmed`
  order fires `issue_tickets_for_order`, exactly as a Stripe purchase does.

## Environment

Set these to a STAGING project before running:

```
SUPABASE_URL=https://<staging-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<staging service role key>
SUPABASE_ANON_KEY=<staging anon key>
```

The migration `supabase/migrations/20260531000001_checkin_scanner.sql` must be
applied to staging first (`supabase db push --linked`).

## Run

```
node tests/staging/concurrency-proof.mjs
node tests/staging/scenario-e2e.mjs
```

Each exits non-zero on any failed assertion and prints a clear PASS/FAIL summary.

## What they prove

`concurrency-proof.mjs`
- Two scanners hit the same valid ticket at the same instant.
- Exactly one returns `admitted`; the other returns `already_scanned`.
- `tickets.scan_count = 1` and exactly one `first_scanned_at` is set.

`scenario-e2e.mjs`
- valid ticket -> `admitted`, `first_scanned_at` set.
- same ticket again -> `already_scanned`.
- refunded ticket -> `refunded`.
- void ticket -> `void`.
- ticket for a different event -> `wrong_event`.
- a user with no role on the org -> RPC raises `not_authorised`.
