# Merge to main with gates - verification (2026-07-10 / 11)

Production database never touched (TEST `vkapkibzokmfaxqogypq` only). Payment
engine unmodified. All evidence below is real: live staging, real orders, real
emails.

## Merge

- `feat/launch-kit` squash-merged onto `main` as **PR #100** -> `main` tip
  `17ffc3f`. `main` was a strict ancestor of `feat/launch-kit`, so the merge is
  a clean superset that regresses nothing.
- Reconciliation: every outstanding `release/launch-line` fix is content-present
  on the merged line. The one launch-line-only piece (the client-side
  `tierSaleWindowState` helper + `TICKET_SALES_CLOSED_ERROR`, a UI mirror of the
  authoritative `create_reservation` gate) and its 8-test suite were restored
  additively. The sale-window migration `20260704000005` that `main` lacked is
  now on the line.
- Merge commits and rebase are disallowed by the repo ruleset, so squash was the
  only path. Granular history is preserved on `feat/launch-kit` and in PR #100.

## Gates on the merged tree

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint .` | 0 errors (37 pre-existing warnings) |
| `vitest` | 698 / 698 passing (84 files) |
| `next build` | clean |
| CI required check: lint / typecheck / build | pass |
| CI required check: test (vitest) | pass |
| CI required check: Lighthouse mobile gate | pass (after a11y fix) |

One a11y regression was caught by the Lighthouse gate and fixed before merge:
the new **Know before you go** card nested each `<dt>`/`<dd>` inside wrapper
`<div>`s with an icon, so the `<dl>` grouping divs did not directly contain
`dt`/`dd` (axe `definition-list` + `dlitem`, serious), dropping the event page
accessibility to 0.93. Fixed by making each row a grouping `<div>` that directly
contains only `<dt>` and `<dd>`, icon moved inside the `<dt>`; event page a11y
back to 1.0. Commit `b18a4e8`.

Note: the non-required `types-drift guard` CI job is red because its
`SUPABASE_ACCESS_TOKEN` repo secret is no longer authorised for schema read
(`Unauthorized` from `supabase gen types`). This is an expired-token infra item,
not schema drift, and the job is not a required check. Founder action: rotate the
`SUPABASE_ACCESS_TOKEN` repo secret.

## Staging deployed from the merged line

- `eventlinqs-staging.vercel.app` -> deployment `eventlinqs-61t510e1j` (commit
  `b18a4e8`, `feat/launch-kit` tip). Its git tree is **byte-identical to `main`
  `17ffc3f`** (verified `git diff origin/main origin/feat/launch-kit` = empty).
  This deployment carries the correct branch-scoped Preview env (TEST Supabase,
  TEST Stripe, verified `hello@eventlinqs.com` sender, matching webhook
  endpoint); a raw `main` preview lacks `STRIPE_SECRET_KEY` (sensitive, cannot be
  copied), so the tree-identical launch-kit build is the working staging of the
  merged line. It is also the exact deployment that passed the Lighthouse gate.
- Staging serves TEST (national-seed events are TEST-only) and the a11y fix is
  live.

## Feature flag states on the merged line (queried against TEST `feature_flags`)

| Flag | Intent | Actual |
|---|---|---|
| launch_kit | ON | true (DB) |
| magic_start | ON | true (code default, no DB row) |
| seated_events | ON | true (DB) |
| broadcast_share | ON | true (DB) |
| waitlist | ON | folded into launch_kit (ON); `/waitlist` resolves 200 |
| digest (broadcast_digest) | OFF | false (DB) |
| follow (broadcast_follow) | OFF | false (DB) |
| artists (broadcast_artists) | OFF | false (DB) |
| community_giving | OFF | false (DB) |

(`surpass_edges` is ON, an extra testing flag not in the launch list.)

## Post-merge smoke (real evidence on staging)

1. **Home + organiser at 1440x900 and 390x844, zero console errors** - PASS.
   Both surfaces 200 at both viewports, 0 console errors each.
   `surface-*.png`.
2. **Standard paid purchase (card 4242) to the cent** - PASS. Order
   **EL-5UQWWDU9**, confirmed, General Admission x1: subtotal AUD 25.00 + service
   fee AUD 1.87 (3.5% + 0.99) + processing AUD 0.63 (2.5%) = **AUD 27.50**, 1
   valid ticket minted. `purchase-ga-*.png`.
3. **Seated purchase carrying the seat through ticket and email** - PASS. Order
   **EL-PDQNWV4N**, confirmed, AUD 27.50, 1 valid ticket. Confirmation page:
   "Tickets Purchased: Row A Seat 3". Ticket email (from noreply@eventlinqs.com):
   "YOUR TICKETS - Smoke Tester - **Main room, Row A, Seat 3**".
   `purchase-seat-*.png`, `ticket-email-mailinator.png`.
4. **Waitlist join with confirmation email arriving** - PASS. Join success state
   shown; Mailinator inbox received "you are on the geelong waitlist".
   `waitlist-*.png`.
5. **Magic Start -> publish -> Launch Kit journey green** - CARRIED (not re-run
   this session). Proven **10/10 green** earlier today on this exact branch
   (`docs/verification/publish-bulletproof-2026-07-10/`, 11-13s each, throttled
   3/3, ordinary 2/2). The only commits added since (the a11y `<dl>` fix and the
   sale-window helper restore) touch none of the event wizard, Magic Start, or
   publish path, so that proof holds for the merged line.

## Test rig provisioned in TEST (for this smoke)

- Buyer `elqs-smoke-2607@mailinator.com` (Mailinator, so ticket email is
  readable). Orders EL-5UQWWDU9 (GA) and EL-PDQNWV4N (seated Row A Seat 3).
- Paid GA event: `harbour-lights-live-geelong-waterfront-sessions-4muhm2`.
  Seated event: `cellar-comedy-night-seated-season-opener`.

Observation (not launch-blocking): the seated order recorded `user_id = null`
(guest) even though the buyer was logged in; the purchase completed and the
ticket + seat + email are correct. Worth a follow-up look at whether the seated
checkout attaches the authenticated user to the order.
