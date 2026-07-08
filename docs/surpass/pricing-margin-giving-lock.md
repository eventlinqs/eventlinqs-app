# Pricing, margin and community giving lock (2026-07-05)

The founder's four decisions, executed and verified on TEST
(vkapkibzokmfaxqogypq only; production untouched; the funds-holding
payment engine unmodified). Evidence:
`docs/surpass/evidence/pricing-lock-proofs.json` plus screenshots.

## Decision 1: pricing position (Path B), false claims swept

Rates unchanged: platform 3.5% + $0.99, processing 2.5%. The positioning
is the lower HEADLINE platform fee than Humanitix, far cheaper than
Eventbrite all-in, and radical fee transparency. Every all-in price claim
against Humanitix found and corrected:

| Location | Was | Now |
|---|---|---|
| CLAUDE.md, Locked fee structure (line ~673) | "cheaper than Humanitix, far cheaper than Eventbrite holds at every price point" | Path B positioning with the honest all-in maths and an explicit NEVER-claim rule |
| docs/EventLinqs-Fee-Structure-LOCKED.md (lines ~19 to 35) | Three passages asserting or protecting the "cheaper than Humanitix" claim, one internally contradictory comparison | Corrected reasoning, honest $30 and $80 comparisons, claim scoped to the headline fee |

No user-facing surface carried the false claim: /pricing and /organisers
ship the live calculator and the sourced disclosure table (no all-in win
implied), and the seat/hero copy references to Humanitix are design
comparisons, not price claims. docs/surpass/platform-surpass-audit.md and
pricing-decision.md already carried the honest maths.

## Decision 2: revenue share removed entirely

Every location found, and what was done:

| Location | What lived there | Action |
|---|---|---|
| pricing_rules rows venue_revenue_share_percentage (AU + GLOBAL, 20%, v1) | The single-source rate | Ended via effective_until (migration 20260705000005; append-only history kept; the schema forbids a 0% row, so end-dating is the lawful disable) |
| src/app/api/webhooks/stripe/route.ts (three sites) | Accrual on payment, squad-order accrual, refund clawback | Calls removed, decision recorded in comments |
| src/app/api/cron/event-disbursement/route.ts | Post-event venue payout leg | Removed; organiser disbursement is the only post-event payout |
| src/app/(dashboard)/dashboard/venue-revenue/ + sidebar entry | Venue-facing earnings dashboard and its nav | Route and entry removed |
| src/app/admin/(authed)/venues/ (list, [id] detail, actions) | Enrolment, rate editor, share figures | Replaced with an audit-visible decision record behind the same capability gate |
| venue_enrolments / venue_share_ledger tables | Enrolment state and the share ledger | Retained untouched as history (zero rows on TEST); defensive enrolment end in the migration |
| Dormant libraries: src/lib/payments/venue-share.ts, venue-transfer.ts, src/lib/venues/ | Computation and disbursement helpers | Left in place, no call sites remain (reported, not deleted, per reversibility) |
| CLAUDE.md venue programme section, constitution map row, launch-sequence parked item | The binding programme law | Rewritten as the removal record; the spec doc marked historical |

The organiser payout never included the share (it was carved from the
EventLinqs margin), so no organiser number changed; verification below
proves face value.

## Decision 3: community giving, STOPPED at the engine boundary

The stop clause triggered. A buyer contribution added to the charged
total flows to the ORGANISER unless the settlement split subtracts it:
`src/lib/payments/connect-ledger.ts` computes the organiser credit as
`total_cents - (platform_fee_cents + processing_fee_cents)` (the
`organiserShareCents` line, about line 144). That file is the
funds-holding spine, so the charging path was NOT built and the engine
was NOT touched. No non-engine single-charge alternative is sound: a
separate PaymentIntent doubles the charge UX and Stripe cost, misusing a
fee column corrupts fee audit and refund maths, and diverging the PI
amount from order totals breaks the displayed-equals-charged invariant.

CLEANEST APPROVED PATH (one line, needs explicit founder sign-off): add
`orders.donation_cents` (default 0) and subtract it in that one
`organiserShareCents` expression; everything else (checkout option,
recording, impact counter) lives outside the engine and is ready to build
against it. Groundwork shipped now (migration 20260705000006, applied):
the `community_contributions` capture table (append-only, one row per
order, amount, currency, city) and the `community_giving` flag seeded OFF
with the reason recorded in the flag description. The directed default-ON
was not honoured because enabling a giving option that cannot yet charge
or settle correctly would either mislead buyers or misroute their money;
the flag flips on with the approved engine line. No giving copy ships
until then, so nothing false is promised.

## Decision 4: the M5 placeholder tiles

"Page views" and "Conversion" (both reading "Wiring up in M5") could not
be wired honestly: no page-view tracking exists anywhere on the platform,
so there is no real data source. They were REPLACED with two honest tiles
computed from data already on the page: Capacity (with seats still
available) and Sell-through (confirmed tickets against capacity). No
placeholder remains on the surface.

## Verification (pricing-lock-proofs.json, ALL GREEN)

- FREE seated purchase, anonymous, end to end post-removal: order
  EL-FGD2VJCL confirmed; subtotal, fees and total all $0.00; no ledger
  entry (free orders skip the funds-holding ledger by design); zero
  venue_share_ledger rows.
- PAID purchase, card 4242, end to end via the forwarded webhook: order
  EL-DM458LK6 confirmed. Face value $25.00 + platform $1.87 + processing
  $0.63 = $27.50; the ticket CTA displayed AUD 27.50 and $27.50 was
  charged (displayed equals charged to the cent). Organiser ledger credit
  = $25.00 = EXACT FACE VALUE (no revenue-share deduction); platform +
  processing ($2.50) retained in full; zero venue_share_ledger rows.
- The giving-contribution purchase demanded by the directive was NOT run:
  it is the stopped path above and cannot be run honestly until the
  founder approves the engine line.
- /pricing, the payout calculator, event-page all-in, checkout,
  confirmation and ticket all read the same live pricing_rules source the
  charge uses (single-source law), re-proven by the purchases; the email
  builder's fee-free ticket rendering is unit-tested.
- Observation logged: buyer prefill for a signed-in user on checkout was
  empty during this run (intermittent; the flow completes with manual
  entry). Worth a look, not blocking.

Gates: tsc clean, eslint clean, vitest 630 of 630, both purchase flows
smoke-green above.
