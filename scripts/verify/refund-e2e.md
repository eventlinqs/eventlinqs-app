# Refund operator path - end-to-end verification evidence

Date: 2026-05-31
Branch: `feat/m6-refund-operator-path`
Script: `scripts/verify/refund-e2e.mjs`

## Method

The verification runs the real `create_refund_request` and `reconcile_refund`
RPCs against the live Sydney database, on a fresh fixture, inside a single
`BEGIN ... ROLLBACK` transaction. Nothing persists - the rollback is the
cleanest possible "restore". The Stripe success is simulated by setting
`refunds.stripe_refund_id` exactly as the refund service does after a
successful Stripe call; the Stripe API call and webhook HTTP delivery + email
are the external boundary (unit-tested in `tests/unit/payments/refund.test.ts`
and confirmed on the Vercel preview).

To run: `npm install pg --no-save` then `node scripts/verify/refund-e2e.mjs`
(uses `SUPABASE_DB_PASSWORD_SYDNEY` from `.env.local`, direct Postgres).

## Bug found and fixed before merge

The first run caught a real defect: `reconcile_refund` set the order status from
a `CASE` over string literals (type `text`), which Postgres will not implicitly
assign to the `order_status` enum column - the UPDATE raised
"column status is of type order_status but expression is of type text".
Fixed in migration `20260531000002_fix_reconcile_refund_status_cast.sql` (the
`CASE` is cast to `public.order_status`). The fix is validated inside the
verification transaction.

## Results (all assertions passed)

Fixture: one organisation, one draft event, one tier (capacity 100, sold 8),
two confirmed orders of $100.00 each (share $92.00, reserve $18.40), real sale
ledger (`order_confirmed` +9200, `reserve_hold` -1840, `payout_holds` 1840).

Full refund (order 1, all 3 tickets, admin):
- amount = order total ($100.00); refund row `processing`; 3 active ticket claims
- reconcile returned `reconciled`
- all 3 tickets `refunded`; zero admitting tickets remain (QR rejected at the door)
- inventory returned: tier `sold_count` 8 -> 5
- ledger reversal exact: `reserve_release` +1840, `refund_from_reserve` -1840,
  `refund_from_balance` -7360
- reserve hold released (amount 0, `released_at` set)
- order `refunded`, refund `completed`
- ledger inverse exact: order 1's contribution zeroed (org ledger sum 14720 -> 7360)
- `hold_amount_cents` 3680 -> 1840

Idempotent webhook replay:
- second `reconcile_refund` returned `already_done`
- no new ledger rows (no double-reversal); `sold_count` unchanged

Partial refund (order 2, 2 of 5 tickets):
- amount proportional: 2/5 of $100.00 = $40.00
- exactly 2 tickets refunded, 3 still valid
- inventory returned for 2: `sold_count` 5 -> 3
- order `partially_refunded`

Unauthorised actor:
- a stranger (not admin, not owner, not org member) calling `create_refund_request`
  is rejected by the RPC ("not authorised"); no refund row created

## Remaining live confirmation (Vercel preview)

The Stripe test-mode refund API round-trip and the live `charge.refunded`
webhook delivery (including the Resend email and the operator-action audit row)
exercise code that is unit-tested here but should be confirmed once on the
Vercel preview, where the Stripe test webhook endpoint is configured:
issue a refund from the admin order view, confirm Stripe shows the refund,
the webhook reconciles, and the buyer receives the email.
