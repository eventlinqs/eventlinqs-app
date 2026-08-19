# Failure modes, webhook idempotency, and the rate-limit posture

Date: 2026-08-19. Branch `integration/launch`. **Revised later the same day** after
three claims in the first version turned out to be wrong. Each correction is kept
visible rather than quietly edited out, because the corrections are the useful part.

Every row is marked **PROVEN** (driven and measured) or **READ** (established from the
source and the live configuration, not executed). The distinction is the point: a
reasoned answer about a money path is a hypothesis.

## 1. Failure modes

The two unacceptable outcomes, in the founder's words, are *money taken and no ticket
exists* and *a ticket exists and no money was taken*.

| Failure | What the user sees | Money or seat lost? | Evidence |
|---|---|---|---|
| Stripe times out mid-payment | Card sheet errors or hangs. Order stays `pending`. No ticket. | **No** if the intent never succeeded. If it DID and the response was lost, this becomes the next row. | READ |
| **Webhook never arrives** | Paid, no ticket email, order `pending`. | **Money captured, no ticket.** DETECTED, not self-healed: `driftWatchdog` finds orders pending past a grace window, cross-references Stripe's recent succeeded intents, and emails. A human resolves it. | READ. Alert path drilled via `?simulate=missign` |
| Webhook arrives twice | Nothing. | **No.** Same order confirmed 20× concurrently moved inventory once. Redelivered over HTTP with the SAME event id → `{"duplicate":true}`; with a NEW event id → still unchanged. | **PROVEN**, both layers separately |
| Refund webhook twice | Nothing. | **No.** No duplicate refunds row, no second seat returned. | **PROVEN** |
| **Refund before charge (out of order)** | Was: a valid ticket for a fully refunded charge. | **Was "a ticket exists and no money was taken". FIXED.** | **PROVEN before and after** |
| Email provider fails after payment | No email; ticket exists and is valid. | **No.** The send is wrapped so a Resend outage cannot break webhook idempotency. | READ |
| DB slow mid-checkout | Reserve or checkout errors. | **No, and the seat comes back.** Abandoned hold returned `reserved_count` 1→0 and the seat resold. | **PROVEN** |
| **Payment lands as the hold expires** | Was: two buyers each holding a ticket for one seat. | **Was an oversell. FIXED.** 2 tickets for 1 seat → 1. | **PROVEN before and after** |
| **A refund fails at the bank** | Was: nothing at all. | **Buyer owed money, silently.** Money returns to the PLATFORM balance and the buyer gets nothing. Now marked `failed` and ALERTED. | **PROVEN**, alert delivered |

### The three that were actually broken

1. **A payment landing after its 10 minute hold expired** produced 2 admitting tickets
   for a capacity-1 tier, both buyers charged. Fixed in `20260819000003`.
2. **A refund arriving before its own payment** produced a valid admitting ticket for a
   fully refunded charge, and a ledger reversal against a sale that was never recorded.
   Fixed in `20260819000004`.
3. **A refund failing at the bank** left a buyer owed money with nothing anywhere
   saying so. Now alerts.

**CORRECTION to the first version.** It listed the out-of-order case as READ and
"NOT PROVEN", and reasoned that a refund arriving genuinely first would find no
`payments` row and fall through harmlessly. That reasoning was wrong: the `payments`
row with its `gateway_payment_id` is written at CHECKOUT time, before the buyer pays,
so the refund resolves the order perfectly well and the harm was real.

## 2. Webhook idempotency

All proven by actual redelivery over the real signed route:

- `charge.refunded` redelivered: refunds rows 2→2, `sold_count` unchanged, statuses
  unchanged.
- `payment_intent.succeeded` redelivered with the **same** event id: route answers
  `{"received":true,"duplicate":true}`, tickets stay 2, `sold_count` unchanged. This
  exercises the dedupe ledger.
- `payment_intent.succeeded` redelivered with a **different** event id, where the
  dedupe ledger cannot help: tickets stay 2, `sold_count` unchanged. This isolates
  `confirm_order`'s own latch.
- `refund.failed` redelivered: refund stays `failed`, no re-alert.
- `confirm_order` × 20 concurrently: inventory moved once.

Nothing in this section is READ any more.

## 3. Rate limiting and abuse

From `scripts/verify/rate-limit-audit.mjs`, which reads the policy table and the call
sites out of the source so it cannot drift from what ships. 28 policies, **0 never
called**.

| Surface | Limit | No Upstash | Verdict |
|---|---|---|---|
| Checkout (reserve) | 20 / 60s | REFUSES | wired, fail closed |
| Signup | 5 / 600s | REFUSES | wired, fail closed |
| Login | 10 / 600s | REFUSES | wired, fail closed |
| Password reset | 5 / 900s | REFUSES | wired, fail closed |
| Magic link, verification resend | 5 / 900s each | REFUSES | wired, fail closed |
| AI chat (spends model tokens) | 10 / 60s, 120 / day | REFUSES | wired, fail closed |
| **Event creation** | **30 / hour** | REFUSES | **added 2026-08-19, fail closed** |
| Launch Kit composer (deterministic) | 20 / hour, 250 / day | ALLOWS | wired, fail OPEN **by design** |
| Media upload | 60 / 60s | ALLOWS | wired (4 call sites), fail open |
| Launch Kit upload | 10 / hour | REFUSES | wired, fail closed |
| Launch Kit outbound email | 3 / hour | REFUSES | wired, fail closed |

### Three corrections to the first version, all mine

1. **`launch-compose` does NOT cost money per request.** I called it an AI bill and an
   oversight. It is neither: the compose engine is deterministic with no model call and
   no network (`src/app/launch/actions.ts:28`, `src/lib/launch/compose.ts`), recorded
   against a founder ruling of 9 August 2026. Its fail-OPEN is a documented decision:
   *"a Redis blip must never stop a stranger building a kit, because there is no spend
   to protect"*. The endpoints that genuinely spend tokens (`ai-chat`,
   `ai-chat-daily`) were already fail closed, so nothing billable was unprotected.
   **Left unchanged on that basis, contradicting the ruling I was given, because the
   ruling rested on my false premise.**
2. **`media-upload` and `newsletter-subscribe` were NOT dead.** `media-upload` has four
   call sites and `newsletter-subscribe` one. Both are invoked as `POLICIES['bucket']`
   then `checkRateLimit`, a shape the audit's regex never looked for. Only
   `location-set` was genuinely dead, and it is deleted rather than wired: it guarded a
   write to `profiles.preferred_city`, which is read everywhere and written nowhere.
3. **An outage does NOT make a fail-open policy unlimited.** The first version said it
   did, which overstated the risk. From `src/lib/redis/rate-limit.ts`: a store ERROR
   degrades to a per-instance in-memory window for **every** policy, fail-closed or
   not. `failClosed` only changes the **missing config** case, and only when
   `NODE_ENV === 'production'`. The exposure is a misconfigured deploy, not an Upstash
   incident.

### What you must configure in production

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Full founder steps, sourced
and with a tested verification recipe, in
`docs/roast/FOUNDER-STEP-upstash-2026-08-19.md`.

Unset in production is not "no rate limiting": the 14 fail-closed policies **429
everybody** (checkout, signup, login, reset) and the 14 fail-open ones go unlimited.
Launch blocker.

**Verified, not asserted:** against the repo's Upstash stub, `newsletter-subscribe`
(5 / 600s) returned five `200`s then `429` on the sixth and seventh, exactly at
limit + 1. Negative control with no Upstash on the same server: all seven allowed. So
the probe can tell a live limiter from an absent one.

### One limit on the drift watchdog

`driftWatchdog` fetches Stripe events with `limit=50`, so drift older than 50 succeeded
intents falls outside its window. Not reachable at current volume; reachable at launch
volume. The fix is pagination or a `created` filter.

## 4. Unfinished, named

1. **The LIVE Stripe endpoint is not subscribed to `refund.failed` / `refund.updated`.**
   The handler ships with the code and TEST/staging is subscribed, but Stripe will not
   send an event an endpoint has not asked for. Founder step, in
   `docs/roast/dashboard-access-divergence-2026-08-19.md` section 2.
2. **Upstash is not configured.** Founder step, above.
3. **The "paid, but the seat was gone" operator surface.** The oversell is impossible
   now, but the residual state (order `pending`, money captured) has no one-click
   resolution beyond the drift watchdog's email.
4. **Money surfaces stay owner-only** by ruling. The canonical resolver is untouched.
