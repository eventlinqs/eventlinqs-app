# M6 Payout Disbursement: app-layer build spec

Status: locked. Derived from the migration
`supabase/migrations/20260531000003_m6_payout_disbursement.sql` (renumbered
from `20260531000001` to resolve a version collision with the refund work that
landed on main first), which is the authoritative data model. The
connected-account payout schedule has been flipped to manual. This spec covers
only the application layer that the migration's header points to:
`src/lib/payments/payout.ts`.

## Model (locked, do not re-litigate)

Sales use Stripe destination charges, so the organiser's full share (including
the reserve) already lands in their CONNECTED account at sale time. The
platform never holds organiser funds. Therefore:

- Disbursement is a Stripe PAYOUT created ON the connected account
  (connected balance -> organiser bank), NOT a transfer to the connected
  account.
- The reserve is held by leaving it in the connected account's Stripe balance.
  Connected accounts are on a MANUAL payout schedule, so funds do not leave
  until the platform explicitly creates a payout.
- `organiser_balance_ledger` is the platform's authoritative accounting.
  `available(org, currency) = SUM(delta_cents)`. Reasons: `order_confirmed`
  (+share), `reserve_hold` (-reserve), `reserve_release` (+), `payout` (-),
  `refund_*` (-), `chargeback` (-), `adjustment` (+/-).

## Existing DB surface (from the migration, already applied)

- `organiser_available_balance(p_organisation_id uuid, p_currency text)
  returns bigint` -- SUM of ledger deltas. SECURITY DEFINER, service_role only.
- `disburse_payout(p_organisation_id uuid, p_currency text,
  p_amount_cents bigint default null, p_actor uuid default null) returns jsonb`
  -- locks the org row, refuses overpay, inserts the `payouts` row
  (`status='pending'`, `stripe_payout_id` NULL) AND the negative `payout`
  ledger entry atomically. Returns
  `{success, payout_id, amount_cents, available_before_cents, available_after_cents}`
  or `{success:false, error}` where error is one of
  `organisation_not_found | payouts_not_active | nothing_to_disburse |
  exceeds_available`.
- `void_payout(p_payout_id uuid, p_status text default 'failed',
  p_reason text default null) returns jsonb` -- idempotent compensation:
  marks the payout `failed`/`canceled`, writes the offsetting positive ledger
  entry, sets `reversed_at`. Refuses `cannot_void_paid`. Idempotent via
  `reversed_at`.
- `release_holds() returns integer` -- cron-driven. Releases matured reserve
  holds (past `release_at`, on payout-active orgs, no open chargeback hold on
  the same event), writing `reserve_release` credits. Returns count.
- `payouts` was extended: `stripe_payout_id` is now nullable but still UNIQUE
  (DB-first claim), plus `initiated_by uuid -> admin_users(id)` and
  `reversed_at timestamptz`.

All four RPCs are `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role`.
The app layer must call them with a service-role Supabase client only, behind
admin auth + capability checks at the route layer (route/admin-action layer is
out of scope for this PR and may be owned by another session).

## What this PR builds: `src/lib/payments/payout.ts`

Mirror the structure of `src/lib/payments/refund.ts` and
`src/lib/payments/connect-ledger.ts`:

- Lazy cached Stripe client via `getStripeClient()`; reuse
  `STRIPE_API_VERSION = '2026-03-25.dahlia'`.
- `__setStripeClientForTests(client)` seam for unit tests.
- Functions take a service-role `SupabaseClient` (admin client), like
  `connect-ledger.ts`, so RPC calls and back-fills are testable with a stub.

### `createPayout(adminClient, stripe, params)`

Orchestrates one operator-initiated disbursement. Steps, in order:

1. Validate input (`organisationId`, `currency`; optional `amountCents`
   positive integer if provided; optional `actor`).
2. Read the org's `stripe_account_id` and confirm it is set.
3. Read the connected account's REAL Stripe available balance for the
   currency (`stripe.balance.retrieve({ stripeAccount })`). This is the hard
   cap that protects against a refund that reversed a transfer but is not yet
   mirrored in the ledger (see migration HARD INVARIANT).
4. Call `disburse_payout` RPC to atomically claim. If `success=false`, return
   the structured error unchanged (no Stripe call made).
5. With the returned `payout_id` and claimed `amount_cents` (which the RPC has
   already capped at the ledger available), create the Stripe payout ON the
   connected account:
   `stripe.payouts.create({ amount, currency, metadata }, { stripeAccount,
   idempotencyKey: payout_id })`. The claimed amount must additionally be
   <= the Stripe available balance from step 3; if not, void and return
   `exceeds_stripe_balance` (claim is compensated, no money moves).
6. On Stripe success: back-fill `stripe_payout_id` and set
   `status='in_transit'` (final `paid`/`failed` arrives via the Connect
   webhook -- see below). Return `{ success:true, payoutId, stripePayoutId,
   amountCents }`.
7. On Stripe failure: `captureException` with payout context, then call
   `void_payout(payout_id, 'failed', reason)` to compensate the ledger, then
   rethrow (or return a structured failure -- match refund.ts's rethrow
   convention).

### `voidPayoutById(adminClient, payoutId, status, reason)`

Thin wrapper over the `void_payout` RPC for the failure/cancel path used by
the webhook handler and admin tooling. Returns the RPC result.

### Reserve release (`release_holds`) wiring

`release_holds()` is the SQL side; the cron route that calls it
(`/api/cron/payout-holds-release`, referenced in the migration comment) is
infrastructure-owned and may live in another session's scope. This PR exposes
a `runReserveRelease(adminClient)` helper that calls the RPC and returns the
count, so whichever session owns the cron route just invokes the helper. If
the cron route is in-scope at build time, add it; otherwise note it as the
single follow-up dependency.

## Webhook coupling (verify, do not duplicate)

`payout.paid` and `payout.failed` Connect webhook events finalise status.
`createPayout` only takes the row to `in_transit`. The webhook handler must:
- on `payout.paid`: set `status='paid'`, `paid_at`.
- on `payout.failed`: call `void_payout(...,'failed', failure_reason)`.
Confirm the existing Stripe webhook handler already routes these (it is in the
14 subscribed events per CLAUDE.md); extend only if missing.

## Tests (TDD, written first)

`src/lib/payments/payout.test.ts`, stubbing Stripe via
`__setStripeClientForTests` and the Supabase admin client via a typed fake:

1. Happy path: claim succeeds -> Stripe payout created with
   `idempotencyKey = payout_id` and `stripeAccount` set -> row back-filled to
   `in_transit`.
2. `disburse_payout` returns `exceeds_available` -> no Stripe call, error
   surfaced.
3. `disburse_payout` returns `payouts_not_active` -> no Stripe call.
4. `nothing_to_disburse` -> no Stripe call.
5. Claimed amount exceeds real Stripe balance -> void called, no payout, error.
6. Stripe `payouts.create` throws -> `captureException` + `void_payout` called
   + rethrow; ledger compensated.
7. Idempotency: the Stripe idempotency key equals the DB payout id.
8. `voidPayoutById` passes through RPC result, including the idempotent
   `already_reversed` case.
9. `runReserveRelease` returns the RPC count.

## End-to-end verification (manual-payout model, against real Oragniser rows)

Run in Stripe TEST mode against the real "Oragniser" test org rows in the live
Sydney DB, using the service-role key locally (never seed the live DB):

1. Confirm the org is payout-active and on a manual Stripe payout schedule.
2. Snapshot `organiser_available_balance` and the connected-account Stripe
   balance.
3. `createPayout` for a small amount -> assert: one `payouts` row
   `in_transit` with `stripe_payout_id`, one negative `payout` ledger entry,
   `available_after = available_before - amount`, and a matching Stripe payout
   on the connected account.
4. Force a failure (e.g. amount above Stripe balance) -> assert `void_payout`
   compensated the ledger to net zero and no Stripe payout exists.
5. Reserve release: a matured `payout_holds` reserve row -> `release_holds()`
   -> assert `reserve_release` credit, `released_at` set, org hold counter
   decremented.

## Gates and merge

- typecheck, lint, vitest, production build all green before commit.
- Backend-only change: no Playwright/Lighthouse/axe required.
- Open PR, NO admin merge. The refund PR merges first; then rebase this branch
  on it (refund and payout both touch `src/lib/payments`, so rebase after
  refund lands to avoid a dirty merge).
