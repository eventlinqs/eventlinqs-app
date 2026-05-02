# Rate-limit handoff to Session 1 (Backend)

Status: HANDOFF READY - hardening session has landed the policy layer; Session 1 owns the wiring on payment-territory routes
Owner: Hardening session (this session) for the policy layer; Session 1 (Backend) for the call-site wiring
Date: 2026-05-02

## What this session built

A central rate-limit policy layer at `src/lib/rate-limit/`:

| File | Purpose |
| --- | --- |
| `src/lib/rate-limit/policies.ts` | Typed `POLICIES` table. Each entry is `{ keyPrefix, limit, windowSec, rationale }`. Single audit surface for cap reviews. |
| `src/lib/rate-limit/middleware.ts` | `applyRateLimit(policyName, request)` returns `null` on pass / `NextResponse(429)` on fail. `rateLimitWithHeaders(...)` returns both the block response and `RateLimit-*` headers for success-path attachment. |

Backed by the existing `src/lib/redis/rate-limit.ts` primitive. No primitive changes; just a typed policy facade.

## Wired on this branch (hardening-owned)

| Route | Policy | Notes |
| --- | --- | --- |
| `GET /api/health/redis` | `health-redis` (60/min) | `rateLimitWithHeaders` so monitoring agents get back-pressure headers. |
| `GET /api/health/sentry-error` | `health-sentry-error` (5/min) | Defence in depth: token gate + rate limit. Each call generates a Sentry event, capped to prevent quota burn even on token leak. |

`POST /api/location/set` already used `checkRateLimit` directly (10/min); not migrated to the new helper this PR (works fine, parity with new wrapping is cosmetic).

## Routes Session 1 should wire

These are payment-territory routes. Hardening cannot touch them per CLAUDE.md ownership; Session 1 owns `src/app/api/checkout/**`, `src/app/api/webhooks/stripe/**`, `src/app/api/stripe/**`, `src/app/checkout/**`.

Recommended policies to add to `src/lib/rate-limit/policies.ts` (Session 1 makes the PR):

| Route | Suggested policy name | Suggested cap | Rationale |
| --- | --- | --- | --- |
| `POST /api/checkout/reserve` | `checkout-reserve` | 30/min/IP | Reserves inventory; abuse vector is reservation hoarding to deny stock to legit buyers. Tighten if abuse seen. |
| `POST /api/checkout/confirm` | `checkout-confirm` | 20/min/IP | Stripe PaymentIntent confirm. Tighter than reserve because each call hits Stripe (cost). |
| `POST /api/checkout/squad/*` | `checkout-squad` | 30/min/IP | Squad checkout flows. Same vector as reserve. |
| `POST /api/stripe/connect/onboard` | `stripe-onboard` | 5/min/user | Already has `checkRateLimit` direct call; consider migrating to the policy table for visibility. |
| `POST /api/stripe/connect/refresh` | `stripe-refresh` | 5/min/user | Same. |
| `POST /api/stripe/connect/return` | `stripe-return` | 5/min/user | Same. |
| `POST /api/webhooks/stripe` | NONE | -- | Webhooks must NOT be rate-limited. They are signed by Stripe and cap-rejection would cause retry storms. Validate signature, reject unsigned, do NOT throttle. |

## Cron routes (not yet wired)

Cron routes (`src/app/api/cron/*`) are gated by a `CRON_SECRET` header check today. Adding a `cron-job` policy (12/min/IP) would harden against replay attacks if `CRON_SECRET` ever leaks. Cron-route ownership is ambiguous (orchestrate domain logic owned by other sessions, infrastructure for hardening). Suggest: project manager assigns to whichever session is most active in M5/M6 cron logic during Phase 2.

## How Session 1 wires a route

```ts
// inside src/app/api/checkout/reserve/route.ts
import { applyRateLimit } from '@/lib/rate-limit/middleware'

export async function POST(request: Request) {
  const blocked = await applyRateLimit('checkout-reserve', request)
  if (blocked) return blocked

  // ...existing handler logic unchanged...
}
```

Per-user vs per-IP: most public routes use `clientIp(request)`. For authenticated routes where one IP can carry many legitimate users (corporate NAT, mobile carriers), pass `identifierOverride: userId`:

```ts
const blocked = await applyRateLimit('stripe-onboard', request, userId)
```

## Verification

`npm run build` is green with the two new policies wired. `npm run test` 22/22 (existing 17 PII scrub + 1 webhook handler + 4 new policy table tests).

## What this session does NOT do for G

- Does not touch `src/app/api/checkout/**`, `src/app/api/stripe/**`, `src/app/api/webhooks/stripe/**` (Session 1 owned).
- Does not touch `src/app/api/cron/**` (ownership ambiguous; flagged for project manager).
- Does not migrate the existing direct `checkRateLimit` calls at `src/app/api/location/set/route.ts` and the three Stripe Connect routes; Session 1 can do that as part of their wiring PR if they want consistency.
- Does not add a global middleware-layer rate limit. Per-route is more flexible; if a global floor is needed later, Next.js Middleware in `src/middleware.ts` is the right place (and is currently used for proxy rewrites, not rate-limiting - check before stacking).
