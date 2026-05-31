# Refund Operator Path: Design Spec

Date: 2026-05-31
Status: Approved (founder, 2026-05-31)
Module: M6 payments, refund operator path (launch-gate item 3)
Branch: `feat/m6-refund-operator-path`

## Mission

An authorised operator (platform admin, or an organiser for their own events) can
refund a buyer, full or partial, with the money, the ledger, the tickets, and the
inventory all reconciled atomically and idempotently, verified end to end against
real rows. Money correctness is the hard invariant: no double refunds, no ledger
drift, no orphaned reserve holds, no refunded ticket that still admits at the door.

## Principle: integrate, do not rebuild

A refund subsystem already exists and is reused, not replaced:

- `refunds` table (migration `20260503000001_refunds_extension.sql`): lifecycle,
  enums (`refund_reason`, `refund_status`, `refund_initiator`), RLS, `stripe_refund_id`,
  `refund_reverse_transfer`.
- `src/lib/payments/refund.ts`: `refundOrder()` issues the Stripe refund with
  `reverse_transfer: true` + `refund_application_fee: true` + an idempotency key.
  Stripe moves the money (pulls the organiser share back from the connected account).
- `src/app/api/webhooks/stripe/route.ts`: `charge.refunded` handler (currently voids
  tickets, promotes waitlist, sends the refund email).
- `src/lib/email/templates/refund-confirmation.ts` + `sendRefundConfirmationEmail()`.
- Audit (`src/lib/admin/audit.ts`), admin auth/RBAC (`src/lib/admin/auth.ts`, `rbac.ts`).

There is NO synchronous `refund_order` RPC that reverses the ledger. Building one would
double-move money against `reverse_transfer`. The webhook is the sole money source of
truth.

## Lifecycle (two phases)

`refunds.status`: `processing` -> `completed` | `failed`.

- Phase A (operator action): atomically create the refund intent and fire Stripe.
  No ledger write, no ticket void, no inventory change.
- Phase B (webhook reconcile): Stripe confirms -> one atomic RPC does all
  money/ticket/inventory/hold reconciliation, idempotent on `stripe_refund_id`.

On Stripe failure the row is marked `failed`; no ledger/ticket/inventory/hold change
occurs (the invariant "on Stripe failure nothing in the database changes" holds for
money state). Bounded admission-risk window: between Phase A and the webhook (seconds)
the selected tickets' QRs remain valid; tickets void only at reconcile, because voiding
at action time then hitting a Stripe failure would violate the invariant.

## Refund model: by-ticket

- Partial refunds are by-ticket: the operator selects which tickets (or how many) to
  refund. A full refund is all remaining tickets.
- Refund amount = order total allocated proportionally to the selected tickets' face
  value, so fees and inclusive GST are captured proportionally.
- Goodwill by-amount is OUT of scope; it will be added later as a separate adjustment
  action, never folded into the ticket-refund path.

## Locked decisions

1. Refundable when order status is `confirmed` or `partially_refunded` and cumulative
   refunded is below total. Admins and organisers may refund after the event for
   disputes. Free orders (`total_cents = 0`) are not refundable.
2. GST refunded proportionally and inclusively; no separate tax line movement.
3. If the reserve was already released or paid out, claw the whole amount from balance
   and let it go negative via the existing `negative_balance` hold type; never un-pay a
   completed payout.
4. Partial reserve and balance portions clawed proportionally to the refunded share,
   mirroring the sale split.

## Sale inverse (what reconcile mirrors)

The sale (`recordOrderConfirmedLedger`, `src/lib/payments/connect-ledger.ts`) writes:

- `order_confirmed` ledger row: `+share`, where `share = total_cents - platform_fee_cents - processing_fee_cents`.
- `payout_holds` reserve row (`hold_type='reserve'`, `amount_cents=reserve`, `release_at`).
- `reserve_hold` ledger row: `-reserve` (parks the reserve out of available balance).
- `organisations.hold_amount_cents += reserve`, `total_volume_cents += gross - processing`.

Full-refund inverse (share S, reserve R, hold still live):
`refund_from_balance -(S-R)` + `refund_from_reserve -R` + `reserve_release +R`, then mark
the hold released and `hold_amount_cents -= R`. Net available ledger -> 0, hold -> 0,
organiser claim -> 0. Partial: proportional to the refunded share. No live hold
(already released/paid): whole claw-back via `refund_from_balance`, may go negative.

NOTE: no hold-release/`reserve_release` writer exists yet anywhere in the codebase, so
refund-first sets the convention the payout build inherits. Keep the reversal a clean,
books-to-zero inverse and document it.

## Migration (delta only): `20260531000001_refund_reconcile.sql`

On top of the existing `refunds` table:

1. `refund_tickets` join table: `(refund_id UUID, ticket_id UUID, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at)`, `PRIMARY KEY (refund_id, ticket_id)`, index on `ticket_id`.
2. Partial unique index (DB-enforced single active claim, refinement 1):
   `CREATE UNIQUE INDEX uq_refund_tickets_active_ticket ON public.refund_tickets(ticket_id) WHERE is_active;`
   A ticket can be in at most one active refund under true concurrency. Active =
   `pending`/`processing`/`completed`; a trigger sets `is_active=FALSE` when the parent
   refund goes `failed`/`cancelled`, freeing the ticket for retry. `completed` keeps the
   claim permanently (a ticket is never refunded twice).
3. `UNIQUE` on `refunds.stripe_refund_id` (currently only a partial index) - hard
   idempotency anchor for reconcile.
4. RLS additions: admin SELECT policy on `refunds`; extend organiser read to
   `organisation_members` (mirror the orders policy), not just `owner_id`. Same read
   policies on `refund_tickets`. Writes stay service-role-only.
5. `create_refund_request(...)` and `reconcile_refund(...)` SECURITY DEFINER RPCs.

## `create_refund_request` RPC (Phase A, atomic intent)

`create_refund_request(p_order_id, p_ticket_ids[], p_reason, p_initiator, p_actor_id, p_buyer_message)`:

- `SELECT ... FROM orders WHERE id = p_order_id FOR UPDATE` - serialises all refunds for
  one order; two concurrent initiations serialise on the order row (refinement 1).
- Re-checks authorisation inside with `p_actor_id` (defence in depth).
- Validates: order status in (`confirmed`,`partially_refunded`), `total_cents > 0`; each
  ticket belongs to the order, is `valid`/`scanned`, and is not already claimed by an
  active refund (`refund_tickets.is_active`). The partial unique index is the hard
  backstop if two transactions race.
- Computes `amount_cents` proportionally to selected tickets' face value.
- Inserts `refunds` (`status='processing'`) + `refund_tickets` (`is_active=TRUE`).
- Returns `{ refund_id, amount_cents, currency, payment_intent_id }`.

## Initiation service + Stripe (Phase A)

`src/lib/payments/refund-service.ts` (pure, testable):

1. `resolveRefundScope` -> throw if unauthorised.
2. call `create_refund_request`.
3. call `refundOrder(...)` (extended to accept explicit `idempotencyKey = "refund:{refundId}"`
   and to put `refund_id` in Stripe metadata for webhook correlation). One refund row =
   one idempotency key; retries reuse it.
4. success -> write `stripe_refund_id`, `stripe_application_fee_refund_id`, `processed_by`;
   row stays `processing`.
5. failure -> row `failed` + `failure_reason` (trigger frees the tickets); surface to UI.
6. `recordAuditEvent('admin.refund.request', { order, tickets, amount, reason, actor })`.

Thin `'use server'` actions in the admin route and the organiser dashboard route both
call this one service.

## Authorisation: `resolveRefundScope`

`src/lib/payments/refund-scope.ts`:

- platform admin (`admin_users` role in super_admin/admin/support with new
  `admin.refunds.process` capability) -> any order.
- organiser (order's organisation `owner_id = actor` OR `organisation_members` role
  owner/admin/manager) -> only their own events' orders.
- else -> reject.

Enforced in the service action, inside both RPCs (re-check with `p_actor_id`), and RLS.

## `reconcile_refund` RPC (Phase B, atomic heart)

The TS webhook iterates `charge.refunds.data[]` and calls
`reconcile_refund(p_stripe_refund_id, p_charge_id, p_refund_amount_cents)` per refund id.
In ONE transaction:

1. Find `refunds` row by `stripe_refund_id`, `FOR UPDATE`. Missing -> safety-net
   order-level ticket void only (orphan path, no ledger). Found & `status='completed'` ->
   no-op return (idempotent).
2. Lock order `FOR UPDATE`.
3. Void this refund's tickets (`refund_tickets`) not already void/refunded ->
   `status='refunded'`, `refunded_at`. The admission check rejects `refunded`/`void`.
4. Return inventory: group voided tickets by tier, decrement `ticket_tiers.sold_count`
   (never below 0).
5. Ledger reversal split (proportional for partials): `refund_from_balance`,
   `refund_from_reserve`, `reserve_release`; reduce/release the `payout_holds` row;
   `organisations.hold_amount_cents -= reservePortion`; decrement `total_volume_cents` by
   refunded gross-minus-processing. No live hold -> whole claw-back via
   `refund_from_balance`, may go negative.
6. Order status -> `refunded` (all tickets gone) or `partially_refunded`.
7. `refunds` row -> `completed`, `processed_at`. Idempotency guaranteed by `FOR UPDATE` +
   `status != 'completed'` flipped in the same transaction.

## Operator UI

- Admin: new `src/app/admin/(authed)/orders/[orderId]/page.tsx` order/attendee detail
  (admin has none today) + a minimal orders/attendee list to reach it, styled to the
  merged M7 panel (commit 7ef1485). Refund action: ticket checkboxes or "refund all
  remaining," reason dropdown (`refund_reason` enum), optional buyer message, confirm
  modal, loading/error/empty states, 44px targets, no em/en dashes.
- Organiser: a refund button in the existing
  `dashboard/events/[id]/orders/[orderId]/page.tsx`, scoped via `resolveRefundScope` +
  the existing `getOrganiserEvent` gate.
- Shared component: `src/components/refunds/refund-dialog.tsx` consumed by both.

## Email + audit

- Reuse the refund template; thread the per-refund amount and this refund's ticket count
  (not cumulative `amount_refunded`), correlating per refund id. Minor additive change to
  `sendRefundConfirmationEmail`.
- Audit at action (`admin.refund.request`) and reconcile (`payment.refund.reconciled`).
  New RBAC capability `admin.refunds.process`.

## Idempotency and concurrency

- Double-refund prevented: order `FOR UPDATE` serialises; `refund_tickets` partial unique
  index blocks a ticket in two active refunds (DB-enforced); Stripe
  `idempotencyKey=refund:{refundId}` blocks a duplicate Stripe charge on retry.
- Webhook replay = no-op: reconcile gated by `FOR UPDATE` + `status != 'completed'`,
  per-refund-id correlation, status-filtered ticket void.

## Hard operating rule (refinement 2)

Refunds are ALWAYS initiated in the app, NEVER in the Stripe dashboard. The orphan
reconcile path (a refund created directly in Stripe with no `refunds` row voids tickets
but does NOT reverse the ledger) is a safety net only and is valid solely under this
rule. Stated here and in the PR.

## Testing and verification

- Unit (vitest, TDD-first): amount allocation; `resolveRefundScope`
  (admin/organiser/stranger); ledger-reversal math (full + partial, reserve-held vs
  released vs negative); reconcile replay no-op.
- E2E in test mode against the test organiser rows, then restore: real paid order via the
  actual purchase flow -> full refund -> assert Stripe refunded, the three ledger rows
  exist and sum to the correct inverse, hold released, `sold_count` returned, ticket QR
  rejected by the admission path, email sent, audit row present -> replay webhook, assert
  no double-reversal -> partial (2 of 5) proportional -> unauthorised actor rejected.
- Gates: typecheck 0, lint 0, vitest green, prod build green, Lighthouse 95+ on the admin
  route, Playwright 1440/768/375, axe 0. PR, no admin merge.

## Migration apply + coordination (refinement 3)

- Apply with the `supabase` CLI directly, NEVER `npx` (npx is broken on this machine):
  `supabase migration list --linked` then `supabase db push --linked`. Stop for the
  founder to run them before verification.
- The payout migration is already applied to the DB. Apply the refund migration second;
  it adds different objects, so there is no schema conflict, and the refund PR still
  merges before payout.
- `[COORDINATION]`: refund and payout both touch `organiser_balance_ledger` and
  `payout_holds`. Merge refund first; keep the reversal mirror-symmetric so the payout
  build layers cleanly; log in the progress file.

## Shared / cross-session files touched (per CLAUDE.md)

- `src/types/database.ts` is `[SHARED]`/Session-2; hand-add new interfaces
  (`Refund`, `RefundTicket`) per its convention, refresh `database.generated.ts` via
  `npm run db:types`. Migrations and `src/lib/payments/**`, `src/app/api/webhooks/stripe/**`
  are Session-1 owned; this work consolidates the refund path here by founder decision.
