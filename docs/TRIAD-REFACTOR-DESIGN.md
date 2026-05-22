# Triad Refactor Design

Status: DRAFT (autonomous batch, branch `autonomous/triad-refactor-draft`).
Author: autonomous Tab C session. Founder and project manager review required
before any merge or migration apply.

This document is the architectural foundation for the payment webhook
atomicity refactor. It closes the following payment-hardening backlog items
(these IDs belong to the project-manager-tracked payment backlog, not the
UI item list in `docs/M4.5-BLUEPRINT.md` which coincidentally reuses the same
identifiers):

| ID   | Title                                              | Status in this draft        |
|------|----------------------------------------------------|-----------------------------|
| P2-1 | Payment marked completed before order confirmed    | Refactored (code + tests)   |
| P2-2 | Webhook errors swallowed, 200 returned, no retry   | Refactored (code + tests)   |
| P2-6 | No webhook `event_id` dedupe                        | Table designed, migration drafted, code wired |
| P2-7 | Order confirmation not wrapped as one atomic gate  | Refactored around `confirm_order` |
| P2-8 | PaymentIntent idempotency key is bare `order_id`   | Composite key helper added  |
| P2-9 | `paymentIntents.cancel` has no idempotency key     | Idempotency key added       |
| P3-1 | No Sentry capture in payment catch paths            | `captureException` wired    |
| P3-5 | Refund ticket-void not provably retry-safe          | Hardened + documented       |

Where the prompt scope and the first cut of code diverge, the divergence is
called out in `SUMMARY.md` under "What still needs iteration".

---

## 1. Current broken flow (the defect chain)

File: `src/app/api/webhooks/stripe/route.ts`.

### 1.1 What happens today on `payment_intent.succeeded`

`POST` verifies the Stripe signature (returns 400 on failure, correct), then
dispatches into a `switch` that is wrapped in a single `try/catch`:

```ts
} catch (err) {
  console.error(`Error processing webhook ${event.type}:`, err)
  // Return 200 anyway so Stripe doesn't retry (we log for debugging)
}
return NextResponse.json({ received: true })
```

`handlePaymentSucceeded` then runs this ordering:

1. Read `order_id` from PaymentIntent metadata. Return if missing.
2. Load the `payments` row by `gateway_payment_id`.
   Guard: `if (!payment || payment.status === 'completed') return`.
3. Transition the payment to `completed` via `transition_payment_status`
   **before** the order is confirmed.
4. Call `confirm_order(order_id)`. On error: `console.error` and continue.
5. Best-effort side effects: Connect ledger, seat-sold marking, Redis cache
   refresh, confirmation email, Plausible conversion.

### 1.2 Why this is broken

**P2-1 ordering inversion.** `payments.status` becomes `completed` at step 3,
which is *before* the order is actually confirmed at step 4. The payment row
is the buyer-facing source of truth for "did my money go through"; the order
being `confirmed` is what issues tickets (an `AFTER UPDATE` trigger on
`orders` in `20260517000001_ticketing_system_v1.sql` issues one ticket row per
admittable unit when `orders.status` flips to `confirmed`). Marking the
payment complete first means the system can report success while no tickets
exist.

**P2-2 swallowed failure plus premature 200.** If `confirm_order` fails at
step 4, the code logs and continues. The outer `catch` (or the explicit
non-return) still produces `200 { received: true }`. Stripe reads 200 as
"handled" and never redelivers. The single best retry mechanism available
(Stripe's own webhook retry schedule) is discarded on every failure.

**P2-1 completed-guard blocks recovery.** Because step 3 already set the
payment to `completed`, a *manual* event replay short-circuits at the step 2
guard (`payment.status === 'completed'` returns immediately). The order can
never be confirmed by a replay. End state: the buyer has paid, Stripe shows
success, the payment row says `completed`, and there are zero tickets, zero
ledger entries, and no confirmation email. This is unrecoverable without
hand-written SQL.

**P2-7 no atomic gate.** Steps 3 and 4 are two independent round trips with
no shared transaction and no ordering guarantee tying "payment is complete"
to "order is confirmed". They can and do diverge.

### 1.3 The asset we already have

`public.confirm_order(p_order_id uuid) returns boolean`
(`20260101000001_baseline_schema.sql`):

```sql
SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
IF v_order.status = 'confirmed' THEN RETURN TRUE; END IF;   -- idempotent
-- else: status -> confirmed, reservation -> converted,
--       sold_count += qty, reserved_count -= qty, discount uses += 1
RETURN TRUE;
```

This function is already the correct atomic gate:

- `SELECT ... FOR UPDATE` row-locks the order, so concurrent webhook
  deliveries serialise on it.
- The already-confirmed early return makes it idempotent: a second call (a
  Stripe retry, a manual replay) returns `TRUE` without double-incrementing
  inventory or discount uses.
- The ticket-issuance trigger fires inside the same `UPDATE ... SET status =
  'confirmed'` statement, so tickets exist the instant the order is
  confirmed, in the same transaction.

The refactor does not rewrite `confirm_order`. It reorders the webhook so
`confirm_order` is the authority and the payment status follows it.

---

## 2. New flow: confirm_order first, payment status follows

### 2.1 Principle

`confirm_order` is the single authoritative gate. The payment row is only
marked `completed` *after* `confirm_order` has returned success. If
`confirm_order` fails, the webhook returns a non-2xx status so Stripe retries
the (idempotent) handler on its normal backoff schedule.

### 2.2 New ordering in `handlePaymentSucceeded`

1. Read `order_id` from metadata. Missing -> nothing to do, return a
   processed result (200, no retry: a malformed intent will never gain an
   order id on retry).
2. Load the `payments` row by `gateway_payment_id`.
   - No payment row found -> return non-2xx. The checkout action writes the
     payment row before the intent is confirmable; a missing row is a race we
     want Stripe to retry, not swallow.
   - Payment already `completed` -> still call `confirm_order` (idempotent)
     so a payment that was marked complete by the old buggy code can be
     repaired by a replay, then return processed. The completed-guard no
     longer short-circuits the order gate.
3. **Call `confirm_order(order_id)` FIRST.**
   - RPC error -> capture to Sentry with full context, throw a
     `WebhookProcessingError`. The `POST` handler maps this to HTTP 500 so
     Stripe retries. The payment row is left untouched (still `processing`),
     so the next delivery re-enters cleanly.
   - RPC success -> proceed.
4. Only now transition the payment to `completed` via
   `transition_payment_status`.
5. Post-confirm side effects (Connect ledger, seat-sold marking, Redis cache,
   confirmation email, Plausible). These run after the authoritative gate and
   each is independently idempotent or fire-and-forget. A side-effect failure
   is captured to Sentry but does NOT fail the webhook: re-running the whole
   webhook to retry, say, a Redis refresh would re-send the confirmation
   email. Side effects own their own idempotency; the gate owns correctness.
6. Record the `event_id` in `processed_webhook_events` (see section 4) and
   return processed (200).

### 2.3 POST-level result contract

The dispatcher returns a small discriminated result instead of relying on a
bare `try/catch` that always answers 200:

- `processed` -> `200 { received: true }`. Includes the "nothing to do"
  cases (no order id, unhandled event type) which must never be retried.
- `duplicate` -> `200 { received: true, duplicate: true }`. The event id was
  already processed; a no-op by design (P2-6).
- `retry` (thrown `WebhookProcessingError`) -> `500 { error: ... }`. Stripe
  retries on its schedule. Used for `confirm_order` failure and for
  transient infrastructure failures (missing payment row, DB unavailable).
- Signature failure -> `400` (unchanged, pre-dispatch).

This is the minimum change that makes Stripe's retry machinery work for us
instead of against us. It is deliberately conservative: only the
`confirm_order` gate and hard infrastructure faults trigger a retry. Business
no-ops (no order id, unknown event type, free order) never do.

### 2.4 Why returning 500 is safe

`confirm_order` is idempotent (already-confirmed early return under
`FOR UPDATE`). `transition_payment_status` is guarded. The Connect ledger
write has an existing-row idempotency check
(`organiser_balance_ledger` lookup on `reference_id` + `reason`). Seat
marking filters `.eq('status','reserved')` so a re-run updates zero rows.
The confirmation email is the only non-idempotent side effect, and it now
runs *after* the gate and only on the delivery that first confirms the order;
a retried delivery that finds the order already confirmed still proceeds
through side effects, so e-mail resend on retry is a known residual and is
listed as a follow-up (dedupe table makes the whole event a no-op on replay,
which closes most of this; the narrow window is concurrent first-delivery
plus retry, addressed by the claim-first dedupe in section 4).

---

## 3. Sentry observability wiring (P3-1)

`src/lib/observability/sentry.ts` already exposes a stable
`captureException(error, context?)` and `captureMessage`. It is a no-op shim
until `@sentry/nextjs` is installed (a SHARED `package.json` change requiring
project-manager coordination), but the call sites are stable and the PII
scrub (`pii-scrub.ts`) is already applied to context. Wiring the calls now
is free and means the day Sentry is installed every payment failure path is
already instrumented.

### 3.1 Where capture is added

- **`src/app/api/webhooks/stripe/route.ts`** - every `catch` and every hard
  error branch in the money path:
  - signature verification failure (with `event_type: 'signature'`)
  - the top-level dispatch catch (tagged with `event.type`, `event.id`)
  - `confirm_order` RPC error (the critical one: tags `order_id`,
    `payment_intent_id`, `stripe_event_id`)
  - Connect ledger throw
  - seat-sold update error
  - order-items load error for cache refresh
  - charge.refunded ticket-void error (P3-5)
  - squad order/member/completion errors
- **`src/lib/payments/refund.ts`** - the Stripe `refunds.create` call is
  wrapped so a Stripe-side failure is captured with `order_id`,
  `payment_intent_id`, `amount_cents`, `initiated_by` before being rethrown.
  The caller still sees the error; Sentry also sees it.
- **`src/lib/payments/connect-ledger.ts`** - the hard-failure branches that
  abort the ledger write (order not found, org not found, the
  `order_confirmed` credit insert failing) get `captureException` alongside
  the existing `console.error`. Soft branches that only `console.warn` and
  continue (skipped free event, unconfirmed order) stay as warnings.

### 3.2 Where capture is deliberately NOT added

- **`src/lib/payments/application-fee.ts`** - `ChargePreconditionError` is
  expected control flow. The checkout action catches it by type and maps
  `error.reason` to a user-facing message. These are validation outcomes,
  not faults; routing them to Sentry as exceptions would be alarm-fatigue
  noise. If we later want volume signal, that is a `captureMessage` at the
  *call site* once the precondition is known to be unexpected, not a capture
  inside a pure assertion helper.
- **`src/lib/payments/payment-calculator.ts`** - pure arithmetic over
  pricing-rules reads. It has no `try/catch`; a DB read failure in the
  pricing-rules service surfaces to the calling server action, which is the
  correct place to capture with request context. Adding capture inside the
  calculator would double-report and lose the caller's context.

This split (capture genuine faults, leave typed control-flow alone) is the
design intent of P3-1, not a partial implementation.

### 3.3 Context discipline

Every `captureException` passes a context object. The PII scrub already
redacts emails, Stripe ids, UUIDs (first 8 chars kept), JWTs, phone, and card
shapes recursively. We still pass ids (order id, payment intent id, event id)
because correlation is the whole point of an error report and the scrub keeps
a low-cardinality prefix. We never pass raw buyer email, raw card data, or
the Stripe signature header (the scrub drops the last by key, but we do not
hand it in anyway).

---

## 4. Webhook `event_id` dedupe (P2-6)

### 4.1 Problem

Stripe redelivers events on retry and, rarely, can deliver the same event
more than once concurrently. Today each handler relies on per-resource
idempotency (payment status guards, ledger existing-row checks). That is
defence in depth but there is no single chokepoint that says "this exact
Stripe event has already been fully processed, do nothing". With section 2
returning 500 on `confirm_order` failure, Stripe retries become routine, so a
clean event-level dedupe is now load-bearing.

### 4.2 Table design

Drafted in `supabase/migrations/20260520000002_webhook_dedupe.sql`
(DRAFT ONLY - founder applies via `supabase db push --linked`, never the
Dashboard, never MCP):

```sql
create table public.processed_webhook_events (
  event_id      text primary key,            -- Stripe event.id, globally unique
  event_type    text not null,               -- e.g. payment_intent.succeeded
  status        text not null default 'received'
                  check (status in ('received','processed','failed')),
  attempts      integer not null default 1,
  last_error    text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index idx_pwe_status_created
  on public.processed_webhook_events (status, created_at);

alter table public.processed_webhook_events enable row level security;
-- No policy: service_role bypasses RLS; the webhook is the only writer.
grant select, insert, update on public.processed_webhook_events to service_role;
```

`event_id` as the primary key is the hard dedupe guarantee: Stripe event ids
are globally unique and immutable across redeliveries of the same event.

### 4.3 Claim-first lifecycle

To be correct under concurrent redelivery (not just sequential retry), the
webhook *claims* the event before processing rather than recording it after:

1. On receipt (after signature verify), upsert the claim:
   `insert (event_id, event_type, status='received') on conflict (event_id)
   do nothing`, then read the row back.
   - Insert won the race (status `received`, attempts 1) -> we own
     processing.
   - Row already exists with status `processed` -> return `duplicate` (200
     no-op). This is the common Stripe-retry-after-success case.
   - Row already exists with status `received` or `failed` -> a prior
     delivery crashed or is in flight or failed. Bump `attempts`, re-process
     (all handlers are idempotent). This recovers a crashed first delivery.
2. Process the event (section 2).
3. Success -> `update status='processed', processed_at=now()`.
4. Failure -> `update status='failed', last_error=...`, then throw so POST
   returns 500. The `failed` row does not block the retry (step 1 re-processes
   a `failed` row); it is an audit breadcrumb and a metric source.

For the first cut the claim/read/update is implemented with supabase-js
(`upsert ... ignoreDuplicates`, then `select`). The `received` vs `processed`
distinction is what makes a Stripe retry after a *successful* run a true
no-op (closing the confirmation-email double-send identified in section 2.4),
while still allowing a retry after a *failed* run to recover.

### 4.4 Scope of dedupe in this draft

The dedupe wraps the `payment_intent.succeeded` path (the money path this
refactor targets). The Connect/payout/dispute stubs already upsert on natural
keys and are documented as Phase-1 idempotent; extending the event-level
dedupe to wrap every branch is a mechanical follow-up once this pattern is
reviewed. This is called out in `SUMMARY.md`.

---

## 5. PaymentIntent idempotency key composite (P2-8)

### 5.1 Problem

`src/app/actions/checkout.ts:343`:

```ts
const idempotency_key = order_id
```

The same value is used as `payments.idempotency_key` and as the Stripe
`createPaymentIntent` idempotency key (and again in the seat flow near line
631). A bare `order_id` is weak:

- If a retried server action ever reuses an order id with a different amount
  (corrected fee, changed cart), Stripe replays the *original* intent because
  the key matches, and the buyer is charged the stale amount. Stripe also
  rejects key reuse with different params with an error, so the failure mode
  is either a wrong-amount intent or a hard error, depending on timing.
- There is no attempt dimension, so a deliberate fresh attempt for the same
  order cannot get a fresh intent.

### 5.2 Design

A single helper, `src/lib/payments/idempotency.ts`:

```ts
export function buildPaymentIntentIdempotencyKey(input: {
  orderId: string
  amountCents: number
  attempt?: number   // default 1
}): string
// -> `pi:${orderId}:${amountCents}:a${attempt}`
```

Composite over `(orderId, amountCents, attempt)`:

- `amountCents` in the key means a different amount is structurally a
  different key, so a corrected amount produces a new intent instead of
  replaying a stale one.
- `attempt` (default 1) gives a deliberate retry dimension. The current code
  mints a fresh `order_id` per checkout call, so there is no persisted
  attempt counter yet; the parameter is wired and defaulted so a future
  retry path (persisting an attempt counter on the `payments` row) flows
  through without another signature change. Persisting that counter is a
  documented follow-up.

Both the standard checkout flow and the seat checkout flow are switched to
the helper so the two code paths cannot drift. `payments.idempotency_key`
stores the same composite for traceability.

---

## 6. `paymentIntents.cancel` idempotency (P2-9)

`src/lib/payments/stripe-adapter.ts`:

```ts
async cancelPaymentIntent(gateway_payment_id: string): Promise<void> {
  const stripe = getStripeClient()
  await stripe.paymentIntents.cancel(gateway_payment_id)   // no idempotency key
}
```

Cancelling an already-cancelled intent throws. Under the new retry-on-failure
regime a cancel can be re-attempted; without an idempotency key the
re-attempt errors instead of being a safe no-op. Fix: pass a deterministic
key derived from the intent id:

```ts
await stripe.paymentIntents.cancel(
  gateway_payment_id,
  undefined,
  { idempotencyKey: `cancel:${gateway_payment_id}` },
)
```

Stripe replays the original cancel response for the same key rather than
erroring on the second call, making cancel retry-safe and consistent with the
keyed `refunds.create` and `paymentIntents.create` calls already in the
codebase.

---

## 7. Atomic order confirmation transaction wrapper (P2-7)

The "wrapper" is `confirm_order` itself. The refactor's contribution is to
*treat* it as the wrapper instead of running it as one best-effort step among
several. Concretely:

- The webhook calls exactly one authoritative mutation for "this order is
  now real": `confirm_order(order_id)`. It is `SECURITY DEFINER`,
  `FOR UPDATE` on the order row, idempotent on re-entry, and fires ticket
  issuance inside the same `UPDATE`. That is a transaction wrapper by
  construction.
- Payment-status mutation moves to *after* the wrapper returns success.
- Everything else (ledger, seats, cache, email, analytics) is explicitly
  classified as a post-commit side effect with its own idempotency, never as
  part of the gate.

We deliberately do not introduce a second application-level transaction
spanning payment status plus `confirm_order` plus side effects. supabase-js
has no client-side multi-statement transaction primitive, and bolting one on
(an RPC that does both) would mean rewriting the audited money-path
`confirm_order` body. The ordering guarantee we actually need - "payment is
never reported complete unless the order is confirmed" - is achieved by
sequencing against the existing atomic gate, which is lower risk for a draft
than a new combined RPC. A future hardening item may introduce
`confirm_order_and_complete_payment(order_id, payment_id)` as a single RPC;
that is noted as a follow-up, explicitly out of scope for this draft.

---

## 8. Refund ticket-void retry safety (P3-5)

`handleChargeRefunded` in the webhook route already voids tickets with an
idempotent filter:

```ts
await adminClient.from('tickets')
  .update({ status: 'void', refunded_at: new Date().toISOString() })
  .eq('order_id', payment.order_id)
  .not('status', 'in', '("void","refunded")')
```

The `.not('status','in', ...)` exclusion is what makes a duplicate
`charge.refunded` delivery a no-op: rows already `void`/`refunded` are not
matched, so a redelivery updates zero rows and the operation is naturally
idempotent. This is correct today; P3-5 is about *proving and hardening* it:

1. **Observability.** The current code logs the void error and continues
   (best-effort, correct - refund money movement must not be blocked by a
   ticket-state write). It now also `captureException` with `order_id` and
   `payment_intent_id` so a silent void failure is visible, because a
   refunded buyer holding a still-valid QR is a real-world admission risk.
2. **Retry safety under the new regime.** `charge.refunded` is *not* wrapped
   in the section-2 retry-on-failure path: a ticket-void failure must not
   cause Stripe to retry the whole refund event (the refund itself already
   succeeded on Stripe's side; retrying re-runs waitlist promotion and is not
   the corrective action). Instead the void error is captured and surfaced
   for an operator to re-drive. The idempotent filter guarantees a manual
   replay or a scripted re-drive is safe.
3. **Tests** lock the idempotent-filter behaviour so a future refactor that
   removes the `.not('status','in', ...)` exclusion is caught.

The classification matters: the payment-success path retries on failure
because the corrective action *is* re-running it; the refund path does not,
because the corrective action is operator re-drive, and the idempotent filter
makes that safe. Documenting this split is the substance of P3-5.

---

## 9. Test coverage in this draft

- `tests/unit/webhook-handlers/payment-intent-succeeded.test.ts`
  - happy path: payment row present, `confirm_order` succeeds, payment
    transitions to `completed` only after the gate, POST returns 200
  - `confirm_order` failure -> POST returns non-2xx (500), payment row left
    `processing`, event not recorded `processed`
  - replay of an already-`processed` `event_id` -> no-op, 200 `duplicate`,
    `confirm_order` not called again
  - signature verification failure -> 400, no dispatch
- `tests/unit/payments/payment-calculator.test.ts`
  - rounding edge cases pinned to *current* behaviour so the P2-4 rounding
    fix (PR3, out of scope here) is a deliberate, reviewed change and any
    accidental drift before then is caught. Covers `Math.round` half cases
    for platform/processing/tax, per-ticket fixed-cents multiplication,
    discount clamping, absorb vs pass-to-buyer totals, and the free-order
    zero-fee short circuit.

## 10. Out of scope / follow-ups (do not silently defer)

- P2-4 rounding correctness fix is PR3, not this PR. Tests here pin current
  behaviour only.
- Single combined `confirm_order_and_complete_payment` RPC (section 7) is a
  future hardening item.
- Persisted per-payment attempt counter feeding the idempotency composite
  (section 5) is a follow-up; the helper is attempt-aware now.
- Extending event-level dedupe to wrap every webhook branch, not just the
  money path (section 4.4).
- Confirmation-email send-once ledger (fully closing the resend-on-retry
  window beyond what claim-first dedupe already covers).
- `@sentry/nextjs` install is a SHARED `package.json` change; capture calls
  are no-ops until the project manager coordinates that.

Every follow-up above requires explicit project-manager sign-off before it is
treated as deferred, per CLAUDE.md "Definition of Done".
