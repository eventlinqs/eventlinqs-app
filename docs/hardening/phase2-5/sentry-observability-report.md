# Phase 2.5 deliverable C - Sentry observability validation

**Date:** 2026-05-04
**Status:** **GAP IDENTIFIED** - no Sentry data was captured for the
            Phase 2 load-test window because the SDK is not installed.
**Owner:** Session 2 (hardening) authored gap report; SDK install is a
           [SHARED] `package.json` change blocked on PM coordination.
**Related:** Phase 2 closure finding **P2-4** (observability)

## Why this report exists

The Phase 2.5 brief (deliverable C) asked for the Sentry capture
record for the Phase 2 browse profile run on 2026-05-03 from 07:26 to
07:33 UTC. That capture does not exist. This report explains why,
documents what should have been captured, and lays down the config
that will ship the moment the SDK install lands so we are not in this
state again at the next load test.

## What we have today

`src/lib/observability/sentry.ts` is a **shim**. The functions
`captureException`, `captureMessage`, and `isSentryEnabled` are
public, but the body forwards nothing - in production the calls are
no-ops, and in development they log to `console.error` /
`console.warn`. Quote from the file header:

> Sentry shim. Until @sentry/nextjs is installed (a SHARED
> package.json change that requires project-manager coordination),
> this module provides a no-op implementation that error boundaries
> and route handlers can call without a guard.

The shim is gated on `enabled = Boolean(dsn) && NODE_ENV ===
'production'`. `NEXT_PUBLIC_SENTRY_DSN` is set in `.env.local` and in
Vercel for production, so `enabled` is `true` on production deploys -
but with no underlying SDK, the gating only suppresses dev console
output. **Zero events reach Sentry.**

## Phase 2 window we wanted to capture

| Window | 2026-05-03T07:26:36Z to 07:32:49Z (browse-500vu-5m) |
| --- | --- |
| Profile | `tests/load/profiles/browse.js` |
| Total HTTP | 7,971 requests, 6,930 success, 1,041 client-side errors |
| Failure rate | 13.06% (threshold was 1%, **failed**) |
| Median latencies | /pricing 9.6s, /events 10.9s, /[slug] 10.2s, /events/[city] 9.9s, /organisers 10.6s, / 17.8s |
| p99 latencies | every route saturated to k6's 60s client timeout |
| HTTP status mix | 6,930 2xx, **0 3xx, 0 4xx, 0 5xx**, 1,041 "other" (k6 timeout) |

The "other" bucket is k6 reporting that the request never received a
response within 60s. From the server side these would land as one of
two patterns:

1. The Vercel function ran to completion past the client cutoff and
   logged a healthy response. No Sentry event would have been
   warranted even with the SDK.
2. The Vercel function tripped its own 300s execution timeout (Fluid
   Compute default) and emitted a runtime error. **These would have
   become Sentry events** with the SDK installed - and there were
   over a thousand of them, so we would have a clear traffic signal.

We have neither. Vercel's runtime logs are retained for 24 hours on
Pro and have already aged out of the window. This is the second
diagnostic gap rolled up in the Phase 2 closure (the first was
absence of Sydney compute).

## What the SDK would have captured

Once `@sentry/nextjs` lands, the **same** browse run would have
populated four signals:

| Signal | Captured by | What we would learn |
| --- | --- | --- |
| Unhandled exceptions | `captureException` from error boundaries + global handlers | Whether the 1,041 "other" bucket were timeouts or thrown errors and which routes they came from |
| Performance traces | `tracesSampleRate` on instrumented routes | p50/p95 server-side latency distribution per route, decomposed by Supabase RPC, Redis call, or Stripe call duration |
| Release health | session tracking | Crash-free session rate during the load run |
| Alert triggers | Sentry alert rules | Whether the >1% error-rate threshold was breached in real time, and whether on-call would have been paged |

None of those reached the dashboard for the Phase 2 run.

## Proposed Sentry config (ready to apply when SDK lands)

When the [SHARED] commit installing `@sentry/nextjs` ships, the
following config replaces the shim. The values below are tuned for
launch traffic (target: thousands of organisers, tens of thousands of
concurrent attendees). They are conservative enough to fit the Sentry
team plan quota but generous enough that a load test re-run captures
a representative trace sample.

### `instrumentation.ts` (Next 16 App Router pattern)

```ts
// instrumentation.ts (project root)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export async function onRequestError(
  err: unknown,
  request: Request,
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(err, request, context)
}
```

### `sentry.server.config.ts`

```ts
import * as Sentry from '@sentry/nextjs'
import { scrubValue } from '@/lib/observability/pii-scrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  enabled: process.env.NODE_ENV === 'production',

  // 100% of errors. Cheap to capture, expensive to lose.
  sampleRate: 1.0,

  // 10% of transactions in steady state. The cron route and webhook
  // routes override this to 100% via tracesSampler below. Load-test
  // re-runs should temporarily bump this to 1.0 via the scheduled-job
  // env override so we get full distributions.
  tracesSampleRate: 0.1,
  tracesSampler: (samplingContext) => {
    const path =
      samplingContext.request?.url ??
      samplingContext.transactionContext?.name ??
      ''
    if (path.includes('/api/webhooks/stripe')) return 1.0
    if (path.includes('/api/cron/')) return 1.0
    if (path.includes('/api/checkout/')) return 0.5
    return 0.1
  },

  // PII scrub. Mirrors the rules already in pii-scrub.ts so server
  // events match client events.
  beforeSend(event) {
    if (event.request) {
      event.request = scrubValue(event.request) as typeof event.request
    }
    if (event.extra) {
      event.extra = scrubValue(event.extra) as typeof event.extra
    }
    if (event.user) {
      // Keep id, drop email/ip - we already log id via membership.
      event.user = { id: event.user.id }
    }
    return event
  },

  // Drop noisy, non-actionable errors before they hit quota.
  ignoreErrors: [
    'NavigatorLockAcquireTimeoutError', // Supabase JS lock contention - non-fatal
    /^AbortError/, // user navigated away mid-request
    /^Network request failed$/, // mobile flap
  ],
})
```

### `sentry.edge.config.ts`

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  enabled: process.env.NODE_ENV === 'production',
  sampleRate: 1.0,
  tracesSampleRate: 0.05,
})
```

Edge runs only in middleware (`src/middleware.ts`), so its trace
budget is small. Errors there are still 100% captured.

### `sentry.client.config.ts`

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  enabled: process.env.NODE_ENV === 'production',

  sampleRate: 1.0,
  tracesSampleRate: 0.05,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  beforeSend(event) {
    if (event.user) {
      event.user = { id: event.user.id }
    }
    return event
  },

  ignoreErrors: [
    'ResizeObserver loop completed with undelivered notifications.',
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    /^ChunkLoadError/, // hash mismatch during deploy - resolves on next nav
  ],
})
```

Replay is on-error-only with `maskAllText: true` and `blockAllMedia:
true` so we never capture ticket numbers, email addresses, or photo
content. This is consistent with the existing `pii-scrub.ts` policy.

### Alert rules (configured in Sentry UI, not code)

The proposed alerts:

| Rule | Trigger | Channel |
| --- | --- | --- |
| Error rate spike | > 1% errors over 5 min on production env | email + on-call SMS |
| New issue in production | first occurrence of any unseen `error.type` | email |
| Webhook regression | any error on transaction `POST /api/webhooks/stripe` | email + on-call SMS |
| Checkout failure spike | > 0.5% errors on `/api/checkout/*` over 5 min | email + on-call SMS |
| Apdex drop | apdex < 0.7 over 15 min on `/events` | email |

The first three are launch-blocking. The last two are post-launch
quality bars.

## Source-map upload

`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are already in
`.env.example` (Phase 1). The Vercel build step needs:

```bash
npx @sentry/wizard@latest -i nextjs --signup
```

run **once** to generate `sentry.client.config.ts`,
`sentry.server.config.ts`, `sentry.edge.config.ts` skeletons and to
register the `withSentryConfig(...)` wrapper in `next.config.ts`.
After that the wizard never runs again - the configs above replace
the skeletons it produces.

## What changes in `src/lib/observability/sentry.ts`

The shim shrinks to direct re-exports:

```ts
export { captureException, captureMessage } from '@sentry/nextjs'
export function isSentryEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)
}
```

The `pii-scrub.ts` module stays where it is - `beforeSend` calls into
it, and the file is still useful for any structured logging path that
does not pass through Sentry (e.g. Logtail).

## Why this is not landing in Phase 2.5

Per CLAUDE.md, `package.json` is a [SHARED] file that requires PM
coordination before modification. `@sentry/nextjs` ships a
post-install step, mutates `next.config.ts`, and adds three runtime
config files at the project root - all of which collide with the
file-ownership boundaries between sessions. Running it inside the
hardening session would surprise both other sessions on their next
rebase.

The correct path is:

1. PM coordinates a window where all three sessions are at a clean
   commit.
2. Hardening session runs `npm install @sentry/nextjs` and the wizard
   in a fresh worktree.
3. Hardening session replaces wizard skeletons with the configs from
   this report.
4. PM merges the [SHARED] commit ahead of any session continuing.

This is tracked as **P2-4** in the Phase 2 closure report and is
already documented as the next blocker.

## Verification plan when the SDK lands

Re-run the browse-500vu-5m profile against Sydney compute (after
Phase 2.5 deliverable A merges) and confirm in Sentry:

| Check | Expected |
| --- | --- |
| Transactions count for `/events` | between 250 and 280 (10% sample of 2,764) |
| Transactions count for `/api/webhooks/stripe` | 100% of webhook requests fired during the window |
| Issue count | bounded - if > 50 distinct issues, the load test is masking real bugs |
| Error rate alert fired | yes if failure rate > 1% sustained |
| Source maps resolved | stack frames show `src/...` not `_next/static/chunks/...` |

Until that re-run, observability remains a launch blocker. The Phase
2 timeout cluster is **untraced** and we cannot tell whether the
1,041 "other" responses were Vercel-side runtime errors or legitimate
slow paths blocked at iad1. Sydney migration plus SDK install
together unblock the next clean answer.

## Followups

- **P2-4 unblock**: install `@sentry/nextjs` as [SHARED] commit, replace shim, redeploy. Required before launch.
- **Sentry quotas**: confirm Team plan quota fits estimated load (10% trace sample at projected 1M req/day = ~100k traces/day, plus ~10k errors/day). If projected to bust, drop `tracesSampleRate` to 0.05.
- **PII audit**: walk every `captureException` and `captureMessage` call site after SDK lands and confirm no untrusted `extra` payload escapes the scrub.
- **Logtail correlation**: ensure each Sentry event embeds the same request-id used in Logtail JSON logs so a single incident can be traced across both backends.
