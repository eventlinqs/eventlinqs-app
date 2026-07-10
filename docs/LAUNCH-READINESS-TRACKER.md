# Launch Readiness Tracker - checkout/payments hardening

Companion to `docs/benchmark/system-pass/LAUNCH-DEFECT-REGISTER.md` (the
evidence register, which carries the per-fix file:line + proof) and
`docs/LAUNCH-READINESS.md` (the broader pre-launch ledger). This tracker holds
(Part 1) the live status of the checkout/payments fix set and (Part 2) the
ten-order, three-stage purchase proof matrix.

Branch `feat/home-rebuild`. NO MERGE without approval. Stripe is in TEST mode
locally (`sk_test`/`pk_test`); production mode is a NEEDS-DASHBOARD-CHECK
(PAY-STRIPE-MODE).

## Part 1 - fix status

| ID | Item | Status | Proof |
|---|---|---|---|
| RES-01/02 | Server quantity cap aligned to `max_per_order`; invalid input logs the field | DONE | `tests/unit/reservations/validation.test.ts` 6/6; tsc clean; commit `6d69761` |
| FUN-04 | order_items insert fails closed with rollback (no paid order without tickets) | DONE | `tests/unit/payments/checkout-items-rollback.test.ts` 2/2; commit `d70887e` |
| FUN-01/03 | Checkout display total single-sourced to the charged total | DONE | `tests/unit/checkout/pricing.test.ts` 10/10; commit `1196b5d` |
| PAY-01 | Connected-account payout schedule (interim delay; M7 disbursement residual) | INTERIM DONE | unit 2/2 + Stripe test-mode round-trip (exit 0, account deleted); commit `8d8c2aa` |
| PAY-STRIPE-MODE | Switch prod to live keys + live webhook if prod is on test keys | BLOCKED | awaiting founder's production Stripe finding (Vercel env + Stripe dashboard) |

Full unit suite after the fix set: 43 files / 374 tests green; `tsc --noEmit`
exit 0.

## Part 2 - the ten-order, three-stage purchase proof matrix

The matrix below was DERIVED from the real buyer-journey variations in the code
(the referenced source doc did not exist in-repo). It exercises every fix above.
Each row is one "order" run through three stages.

### The ten variations

| # | Path | Price | Buyer | Notable | Exercises |
|---|---|---|---|---|---|
| 1 | GA | Free | Guest | RSVP, no Stripe | issuance, FUN-04 (free) |
| 2 | GA | Free | Authed | RSVP | issuance |
| 3 | GA | Paid | Guest | single tier | full money path, FUN-04, FUN-01 |
| 4 | GA | Paid | Authed | single tier | money path, auth |
| 5 | GA | Paid | Authed | multi-tier | multi-tier pricing |
| 6 | GA | Paid | Guest | with add-on | addon pricing |
| 7 | GA | Paid | Authed | active dynamic price | FUN-01 displayed == charged |
| 8 | GA | Paid | Authed | discount code | discount, FUN-02 surface |
| 9 | GA | Paid | Authed | quantity = `max_per_order` (> 20) | RES-01 (legit large selection) |
| 10 | Seated | Paid | Guest | reserved seat | FUN-03 seat displayed == charged |

### The three stages

- **Stage 1 - Playwright e2e, green in CI.** Per variation, drive the funnel
  (event -> reserve -> checkout). Free paths complete fully (ticket issued).
  Paid paths assert: the reservation succeeds, the checkout displayed total is
  computed, and `processCheckout` returns a `client_secret` whose Stripe test
  PaymentIntent `amount` equals the displayed total (FUN-01/03 proven without
  needing webhook delivery in CI). Runs against a production build.
- **Stage 2 - real test-mode purchase on a throwaway prod test event.** Per
  variation, on a test event created in prod Supabase (NEVER a real published
  event), complete the full money path with a Stripe test card: PaymentIntent ->
  webhook -> order confirmed -> inventory decrement -> QR ticket issued + emailed
  -> revenue recorded. Capture proof per variation. Then DELETE all test
  reservations/orders/payments/tickets and the test event, and prove the deletion
  by direct query.
- **Stage 3 - founder.** Live-mode round-trip (real keys, real card, refund),
  per `docs/LAUNCH-READINESS.md` founder actions.

### Prerequisites (must hold before Stage 1/2 can be green)

1. A throwaway test ORGANISER with a Stripe Connect test account that is
   `charges_enabled` (the paid-checkout sale guard blocks paid reservations for
   organisers without it). Stage 2 paid rows cannot run without this.
2. Stripe CLI `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   for Stage 2 webhook delivery to the local server (CI Stage 1 avoids this by
   asserting the intent amount via the Stripe API instead of awaiting the
   webhook).
3. Local dev/prod-build server against prod Supabase + test Stripe (approved:
   throwaway test event only; full cleanup with query proof after).

## Status

Part 1: 4/5 done (PAY-STRIPE-MODE blocked on the founder finding). Part 2:
matrix defined; Stage 1/2 execution pending the prerequisites above. Stage 3 is
the founder's.
