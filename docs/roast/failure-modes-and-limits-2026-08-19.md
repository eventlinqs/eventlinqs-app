# Failure modes, webhook idempotency, and the rate-limit posture

Date: 2026-08-19. Branch `integration/launch`.

Every row is marked **PROVEN** (driven and measured this session) or **READ**
(established from the source and the live configuration, not executed). The
distinction is the point: a reasoned answer about a money path is a hypothesis.

## 1. Failure modes

The two unacceptable outcomes, in the founder's words, are *money taken and no
ticket exists* and *a ticket exists and no money was taken*. Everything else is a
quality issue.

| Failure | What the user sees | Money or seat lost? | Evidence |
|---|---|---|---|
| **Stripe times out mid-payment** | The card sheet errors or hangs. The order stays `pending`. No ticket. | **No.** If the intent never succeeded, no money moved. If it DID succeed and the response was lost, this becomes "webhook never arrives" below. | READ |
| **Webhook never arrives** | Buyer paid, sees the confirmation page (it polls the order), but no ticket email. Order stays `pending`. | **Money captured, no ticket.** This is the unacceptable case, and it is DETECTED but not self-healed: `driftWatchdog` (`src/lib/health/payment-checks.ts:165`) finds orders `pending` beyond a grace window, cross-references Stripe's recent `payment_intent.succeeded` events, and emails the founder. A human then confirms or refunds. | READ. The alert path itself is drilled via `?simulate=missign` |
| **Webhook arrives twice** | Nothing. One ticket, one charge. | **No.** `claimWebhookEvent` dedupes by event id and returns `{duplicate:true}`; `confirm_order` early-returns on `status='confirmed'`. **Proven:** the same order confirmed 20 times concurrently moved inventory exactly once (`sold_count` 0 → 2, not 2 × 20). | **PROVEN** |
| **Refund webhook arrives twice** | Nothing. | **No.** Redelivering the identical `charge.refunded` produced no second refunds row, no second seat returned, no status change. | **PROVEN** (`refund-orphan-repair-proof.mjs`, no-change scenario) |
| **Webhooks out of order: refund before charge** | The refund reconciles against an order that is not yet confirmed. | **Needs the ordering test below.** `reconcile_refund` locks the refunds row and the order; with no refunds row it now ADOPTS the orphan. The adoption resolves the order from `payments.gateway_payment_id`, which is written by the charge path, so a refund arriving genuinely first finds no payment row and returns false, falling through to the door-safety void. | READ. **NOT PROVEN**, named in Unfinished below |
| **Email provider fails after a successful payment** | Buyer paid, order `confirmed`, ticket EXISTS and is valid, but no email arrives. | **No.** The ticket is real; only delivery failed. `sendConfirmationEmail` is wrapped so a Resend outage cannot break webhook idempotency, and the buyer can reach the ticket from My tickets. The refund email is equally non-fatal (the money and ticket state persisted atomically in the RPC first). | READ |
| **Database slow enough to time out mid-checkout** | The reserve or the checkout action errors. | **No, and the seat is not lost either.** A reservation that was created but never paid for expires and the sweeper returns the seat: **proven**, an abandoned hold returned `reserved_count` 1 → 0 and the seat became purchasable by somebody else. | **PROVEN** (case A of the expiry drill) |
| **Payment lands exactly as the hold expires** | Before this session: two buyers each held a ticket for one seat. Now: the late buyer gets the seat if the room still has room, and if it does not, the order stays `pending` for refund and no ticket is minted. | **Was an oversell. Fixed and proven.** 2 tickets for 1 seat → 1 ticket for 1 seat. | **PROVEN** both before and after |

### The one that was actually broken

Only one of these was a real defect, and it was the one nobody had tested: a
payment landing after its 10 minute hold expired produced **2 admitting tickets for
a tier with capacity 1, both buyers charged**. Fixed in
`20260819000003_confirm_order_reacquires_lapsed_hold.sql`. Details in that file and
in the commit.

## 2. Webhook idempotency

Proven by actual redelivery, not by reading:

- **`charge.refunded` redelivered:** refunds rows 2 → 2, `sold_count` unchanged,
  order status unchanged, ticket statuses unchanged, initiators unchanged. The
  unique index `uq_refunds_stripe_refund` and the `completed` latch in
  `reconcile_refund` both hold.
- **`confirm_order` × 20 concurrently:** `sold_count` moved once (0 → 2), the
  reservation released once.
- **Adoption of an out-of-app refund, redelivered:** no duplicate refunds row, no
  double seat return.

Not proven: a redelivered `payment_intent.succeeded` through the real HTTP route.
The dedupe mechanism (`claimWebhookEvent` on `event.id`) is exercised by unit tests,
and `confirm_order`'s latch is proven concurrently, but the two have not been
driven together over HTTP. Named in Unfinished.

## 3. Rate limiting and abuse

Established by `scripts/verify/rate-limit-audit.mjs`, which reads the policy table
and the call sites out of the source so it cannot drift from what ships. 28
policies defined.

### The surfaces you named

| Surface | Limit | Without Upstash | Verdict |
|---|---|---|---|
| Checkout (reserve) | 20 / 60s | REFUSES | wired, fail closed |
| Signup | 5 / 600s | REFUSES | wired, fail closed |
| Login | 10 / 600s | REFUSES | wired, fail closed |
| Password reset | 5 / 900s | REFUSES | wired, fail closed |
| Magic link, verification resend | 5 / 900s each | REFUSES | wired, fail closed |
| AI chat | 10 / 60s and 120 / day | REFUSES | wired, fail closed |
| **Launch Kit composer (AI)** | 20 / hour and 250 / day | **ALLOWS** | wired but **fail OPEN** |
| **Event creation** | none | ALLOWS | **NOT RATE LIMITED** |
| **Media upload** (`media-upload`) | 60 / 60s | ALLOWS | **policy exists, never called** |
| Launch Kit upload | 10 / hour | REFUSES | wired, fail closed |
| Launch Kit outbound email | 3 / hour | REFUSES | wired, fail closed |

### Three findings worth your ruling

1. **`launch-compose` and `launch-compose-daily` are fail OPEN, and they cost real
   money per request.** `ai-chat` beside them is fail closed. That looks like an
   oversight rather than a decision: it means an Upstash outage, a credential
   rotation, or a deploy with the variable unset leaves the AI composer unthrottled
   and billable. The change is one line per policy (`failClosed: true`). Not made
   unilaterally because it flips the composer from degraded-but-working to refusing
   during an outage, and that is your call.
2. **Event creation has no limiter at all.** It is authenticated, so the abuse
   ceiling is one free account, but a free account can create events in a loop and
   each one writes rows and share links.
3. **Three policies are defined and never called:** `media-upload`,
   `location-set`, `newsletter-subscribe`. A policy that is never called is a
   limit somebody believes exists. `media-upload` is the one that matters: uploads
   put user bytes through an image decoder.

Fifteen of the 28 policies are fail OPEN. That is defensible for browse-shaped
things (`share-track`, `waitlist-join`, `health-*`) and is the reason the list is
printed in full rather than summarised.

### What you must configure in production

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Both are already declared in `src/lib/env/manifest.mjs`, so the env guards know
about them. **Declaring is not setting.**

If they are unset in production, the outcome is not "no rate limiting". It is
worse and split two ways:

- the **13 fail-closed** policies REFUSE every request, so checkout, signup, login
  and password reset all return 429 to everybody. The platform is loudly down.
- the **15 fail-open** policies become unlimited, including the two AI composer
  policies that cost money.

So this is a launch blocker, not a hardening task. After setting them, verify by
confirming a limiter actually returns 429 on the (limit + 1)th request against the
preview, rather than trusting that the variables are present.

### One limit on the drift watchdog, recorded

`driftWatchdog` fetches Stripe events with `limit=50`. If more than 50
`payment_intent.succeeded` events occur between the drift starting and the sentinel
running, the older stuck order falls outside the window and is not reported. At
current volume that is not reachable; at launch volume it is. The fix is
pagination or a `created` filter rather than a fixed page.

## 4. Unfinished, named

1. **`refund.updated` is unsubscribed.** Recorded in
   `docs/roast/dashboard-access-divergence-2026-08-19.md` with its exposure and
   trigger.
2. **Out-of-order webhooks (refund before charge) not driven.** Reasoned from the
   source only. To prove it: create a Stripe refund on an intent whose
   `payment_intent.succeeded` has not yet been delivered, and deliver
   `charge.refunded` first.
3. **Redelivered `payment_intent.succeeded` over HTTP not driven.** The pieces are
   individually proven; the two together are not.
4. **The "paid, but the seat was gone" operator surface.** The oversell is now
   impossible, but the resulting state (order `pending`, money captured) has no
   one-click resolution and no dedicated alert beyond the drift watchdog.
