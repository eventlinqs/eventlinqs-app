# Stripe webhook subscriptions

Last updated: 24 May 2026.

## Source of truth

The endpoint URL is hard-wired to production:

```
https://www.eventlinqs.com/api/webhooks/stripe
```

The list of subscribed events lives in the Stripe Dashboard (Developers
-> Webhooks -> Endpoints). The handler lives at
`src/app/api/webhooks/stripe/route.ts`. **Both must agree.** When they
diverge, the discrepancy is a finding (see audit-v2 MEDIUM-A).

## Currently subscribed (18 events) — 24 May 2026

| Event | Handler branch | Action |
|---|---|---|
| `payment_intent.succeeded` | dedicated atomic path before the `switch` (route.ts:58-110) | Authoritative confirm-order gate. Retryable on processing failure. |
| `payment_intent.payment_failed` | `handlePaymentFailed` | Marks payment failed, cancels reservation, promotes waitlist. |
| `payment_intent.requires_action` | `handleRequiresAction` | Transitions payment status. |
| `payment_intent.canceled` | `handlePaymentCancelled` | Cancels reservation, releases seats, promotes waitlist. |
| `charge.refunded` | `handleChargeRefunded` | Voids tickets, promotes waitlist, sends refund confirmation email (MEDIUM-1 closure). |
| `account.updated` | `handleConnectAccountUpdated` | Connect Phase 2: capability + requirement sync. |
| `account.application.deauthorized` | `handleConnectAccountDeauthorized` | Clears Connect fields, logs tier demotion. |
| `payout.created` | `handleConnectPayoutEvent` | Upserts payouts row, status `pending`. |
| `payout.paid` | `handleConnectPayoutEvent` | Upserts payouts row, status `paid`. |
| `payout.failed` | `handleConnectPayoutEvent` | Upserts payouts row, status `failed`. |
| `payout.canceled` | `handleConnectPayoutEvent` | Upserts payouts row, status `canceled`. |
| `transfer.created` | `handleConnectTransferCreated` | Phase 1 stub: log only. Destination charges make this informational. |
| `charge.dispute.created` | `handleConnectDisputeEvent` | Phase 1 stub: log only. Phase 5 wires freeze + evidence pack. |
| `charge.dispute.closed` | `handleConnectDisputeEvent` | Phase 1 stub: log only. |
| `charge.succeeded` | **explicit no-op** (route.ts ~169) | Duplicative of `payment_intent.succeeded`. |
| `charge.updated` | **explicit no-op** | Charge-level metadata edits we do not act on. |
| `checkout.session.completed` | **explicit no-op** | We do not use Stripe Checkout Sessions; we use Stripe Elements. |
| `checkout.session.expired` | **explicit no-op** | Same as above. |

## No-op rationale

Four of the eighteen subscribed events have no business action on our
side. We acknowledge them in code with explicit `case` branches (rather
than letting them fall into the `default` branch) so that:

1. They appear as known-handled in any future audit or `grep` over the
   handler file.
2. The Stripe endpoint config can remain unchanged (we cannot modify the
   Stripe Dashboard from this repo; the no-op branches are the lowest-
   code-change resolution).
3. A future "why isn't this event doing anything" investigation lands on
   a deliberate decision with a comment rather than a silent skip.

Per-event rationale:

- **`charge.succeeded`**: `payment_intent.succeeded` is already the
  authoritative money path (event-level dedupe via `claimWebhookEvent`,
  atomic `confirm_order` gate, retry-on-failure semantics). Stripe also
  delivers `charge.succeeded` on the same flow; acting on it would risk
  a double-confirm race with the intent handler.
- **`charge.updated`**: fires for metadata edits, captures, and refund-
  amount updates on the underlying charge. We do not store charge
  metadata; refunds are handled via the dedicated `charge.refunded`
  branch.
- **`checkout.session.completed`** and **`checkout.session.expired`**:
  these only fire for Stripe-hosted Checkout Sessions. EventLinqs uses
  Stripe Elements (PaymentElement) directly inside our own checkout
  page, so these events never originate from our flows. The
  subscription is retained as a future-proofing hedge in case we ever
  add a hosted-checkout path (e.g. for an alternative low-friction
  buyer journey).

## Unhandled events fall back to a log line

The `default` branch was previously a silent `break`. As of this
commit it emits a `console.info` so any new event type that lands on
the endpoint without a matching handler shows up in Vercel logs the
first time it fires. Format:

```
[stripe-webhook] unhandled event type: <type> (event <event_id>)
```

This is the trip-wire that catches a Stripe Dashboard change made
without a corresponding code update.

## Reconciliation runbook

When the subscribed-event list changes (Stripe Dashboard edit):

1. Update this document under "Currently subscribed (N events)" with
   the new total and the new row.
2. Add (or re-flag as no-op) the corresponding `case` in
   `src/app/api/webhooks/stripe/route.ts`.
3. Run `npm run lint && npm run typecheck && npm test` before commit.

When the handler changes (code edit):

1. If a new `case` is added, ensure the matching event is **also**
   subscribed in the Stripe Dashboard, or the case is dead code.
2. Update this document.
3. Same gates as above.

## Verification

The wire-level list of subscribed events is retrievable via:

```bash
curl https://api.stripe.com/v1/webhook_endpoints \
  -H "Authorization: Bearer ${STRIPE_SECRET_KEY}"
```

The handler list is retrievable via `grep "case '" src/app/api/webhooks/stripe/route.ts`.
The two should match (taking the explicit no-op branches into account).
