# Open performance and observability items

Four items deferred by founder decision on 2026-08-05, during
`perf/sentry-client-surface`. All four were deliberately postponed to keep that
branch narrow while PR #110 was blocked. None is done. This file exists so they
are not lost.

Each carries what is known so far, so whoever picks it up does not start from
nothing.

---

## 1. The eleven-route Lighthouse sweep, before and after

**Status:** not started. Deferred to after launch.

The Sentry deferral is a platform-wide change: `instrumentation-client.ts` runs
on every route, so every route's boot path changed. Only the event detail route
was measured, because it is the one that was blocking PR #110.

What was measured, on deployed previews, three runs each:

| | before (`origin/main`) | after (`perf/sentry-client-surface`) |
|---|---|---|
| performance | 0.75, 0.84, 0.78 (median 0.78) | 0.83, 0.88, 0.76 (median 0.83) |
| LCP | 4383, 3577, 3519 ms | 4313, 2956, 4466 ms |
| TBT | 420, 277, 371 ms (median 371) | 135, 293, 249 ms (median 249) |
| script bytes | 442,970 | 443,389 |

The other ten gate routes are UNMEASURED on this change. Passing is not the same
as unchanged, and a smaller regression elsewhere would currently be invisible.

The harness exists and is reusable: `scripts/verify/sentry-replay-window.mjs`
for the Replay window, and the standard `@lhci/cli collect` against two preview
URLs for the scores. Budget roughly two hours of wall clock for eleven routes at
three runs on both sides.

---

## 2. A byte budget on total client JavaScript for the event detail route

**Status:** not added. Deferred to after launch.

The intent was to stop a barrel import silently reintroducing weight, in the
same spirit as the per-metric budgets PR #108 added. It was not added because
the number should be set from a stable measurement, and the only measurements
taken were on a single route with a per-run spread wide enough that a budget set
from them would either flake or be meaningless.

Two things to know before setting it:

- `resource-summary:script:size` on this route already has an error-level cap of
  491,520 bytes in `lighthouserc.json`, pinned to median aggregation. Measured
  values sit at roughly 443,000, so about 48KB of headroom already exists. A
  second budget may be redundant; check this first.
- Total script bytes barely moved across the deferral (442,970 to 443,389)
  because the Sentry chunk still loads, just later. A byte budget therefore does
  NOT protect the property this change actually won. What it won was boot-path
  weight, roughly 246KB across 17 chunks. A budget on the INITIAL chunk set
  would be the meaningful one, and Lighthouse does not report that directly.

`scripts/ci/critical-path-guard.mjs` RULE 4 already blocks the specific
regression that matters (a static import of the Sentry boot module).

---

## 3. Extend the exemption expiry guard to detect a lowered numeric floor

**Status:** not done. Deferred to after launch.

`scripts/ci/lighthouse-exemption-expiry.mjs` only detects a `categories:*`
assertion set to `warn` or `off`:

```js
if (value === 'off') return true
return Array.isArray(value) && value[0] === 'warn'
```

So an exemption taken by LOWERING an error-level floor, say `minScore` from 0.80
to 0.75, is completely invisible to it. It would carry no `_expiresOn`, trigger
no failure, and never be reprinted. That is a real hole: the cheapest way to
quietly relax this gate is the one route the expiry mechanism does not watch.

Surfaced while proposing a dated exemption for the event detail route. The
exemption was NOT taken (the best-of-three finding made it unnecessary), so the
hole is not currently being exploited. It should still be closed before anyone
reaches for that shape of exemption.

Suggested approach: record the intended floor per category per pattern in the
config, and fail when the live value sits below it without an `_expiresOn`.

---

## 4. Client `release` tag reads "local" instead of the commit SHA

**Status:** not fixed. Deferred to after launch. **Pre-existing, not caused by
the Sentry deferral.**

Both `src/lib/observability/sentry-client-boot.ts` and the server config set:

```ts
release: process.env.VERCEL_GIT_COMMIT_SHA || 'local'
```

`VERCEL_GIT_COMMIT_SHA` has no `NEXT_PUBLIC_` prefix, so Next.js does not inline
it into the browser bundle. In the client it is always `undefined`, and the
release falls through to `'local'`.

Proven on the deployed preview, identical on both branches:

```
release       local
environment   preview
```

Consequence: **a client-side error cannot be tied to the deploy that caused it.**
Every browser event in Sentry is stamped `local`, so release health, regression
windows and "which deploy broke this" are all unavailable for client errors.
Server events are unaffected.

Fix is small: expose the SHA to the browser under a `NEXT_PUBLIC_` name and read
that in the client config. Note that `src/lib/env/manifest.mjs` is the authority
for environment variables (`docs/ENV-DOCTRINE.md`), so the new variable must be
declared there rather than only used.

`scripts/verify/sentry-pre-init-capture-proof.mjs` reports the release on every
run and prints a NOTE when it reads `local`, so this stays visible until fixed.
It deliberately does not FAIL on it, because failing would block a proof that is
otherwise green for a defect it does not own.
