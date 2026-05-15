# Batch 11.1 D3.7 - Organiser dashboard smoke (option b)

Date: 2026-05-15
Source script: `scripts/batch-11.1-d3-4-to-9.mjs` (section 3.7)
Raw data: `docs/redesign/batch-11.1-evidence/d3-4-to-9-report.json`

## Scope (per founder Q2 answer)

Option (b): verify pages render and auth redirects work correctly.
Full organiser-authenticated flow (logged-in dashboard rendering,
create-event form submit, payout dashboard etc.) flagged as carry-
over until a confirmed organiser test user is available.

## Coverage

For each protected route:

- HTTP 200 (if auth-walled gracefully) OR
- HTTP 302/307 redirect to `/login?redirect=<original>`

## Result

**3 / 3 PASS.** Every protected route correctly 307-redirects an
unauthed visitor to `/login?redirect=<encoded path>`:

```
PASS [3.7-dashboard] /dashboard               | HTTP 307 -> /login?redirect=%2Fdashboard
PASS [3.7-dashboard] /dashboard/events        | HTTP 307 -> /login?redirect=%2Fdashboard%2Fevents
PASS [3.7-dashboard] /dashboard/events/create | HTTP 307 -> /login?redirect=%2Fdashboard%2Fevents%2Fcreate
```

The redirect-with-callback pattern is correct: the user logs in then
returns to the original URL.

## Carry-over to pre-launch hardening

A full authed organiser smoke test needs a confirmed organiser test
account. Existing test user from Batch 9.2.1 (`scripts/seed-test-user.mjs`)
seeded an account but its organiser membership isn't verified for
this batch. Tracked under PRE-LAUNCH-HARDENING item 10 ("Authed +
organiser E2E smoke test").

End.
