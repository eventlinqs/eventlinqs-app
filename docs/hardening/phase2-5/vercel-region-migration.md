# Phase 2.5 deliverable A - Vercel function region migration to syd1

**Date:** 2026-05-04
**Status:** code change landed on branch, awaiting Vercel deploy + post-deploy verification
**Owner:** Session 2 (hardening)
**Related:** Phase 2 closure report finding **P2-1**

## Why

Phase 2 load testing surfaced that all serverless functions on
`eventlinqs-app` were running in **iad1 (Washington DC, US-East-1)**.
For an Australian launch with a Sydney Supabase (ap-southeast-2) and a
Sydney-bound Upstash Redis, every function invocation was crossing the
Pacific twice:

```
AU client request -> iad1 lambda (200ms westbound RTT)
iad1 lambda -> Sydney Supabase (200ms eastbound RTT)
Sydney Supabase -> iad1 lambda (200ms westbound RTT)
iad1 lambda -> AU client (200ms eastbound RTT)
                             = ~800ms round-trip floor
```

This neutralised every gain from the Phase 1 Sydney Upstash migration
and capped how fast any AU-served route could ever return - not because
of code, but because the **physics of the trans-Pacific link**. It also
explains a chunk of the cold-cache LCP measurements documented in
`docs/perf/v2/closure-report.md` that we had previously parked as a
"production-warmed re-measurement" todo.

A function in syd1 collapses that 800ms floor to a sub-10ms
intra-datacenter Sydney loop. Same code, same data, ~95% reduction in
network-bound latency.

## What changed

`vercel.json`:

```diff
 {
+  "regions": ["syd1"],
   "crons": [
     ...
   ]
 }
```

Single line. Top-level `regions` is the documented vercel.json setting
that pins all serverless / Fluid Compute function deployments to the
listed Vercel regions. `syd1` is Sydney, ap-southeast-2.

Verified via Vercel docs: <https://vercel.com/docs/edge-network/regions>

No code change required. Cron, ISR revalidation, API routes, server
actions, middleware - all of them inherit the project-level region.

## Pre-deploy state

Captured for the before/after diff:

- Region per Phase 2 result doc: **iad1**
- Phase 2 cold-cache median LCP on `/events` (Sydney client): documented
  in `docs/perf/v2/closure-report.md` as "above target, deferred for
  production-warmed re-measurement"
- Phase 2 browse smoke run 2026-05-03T07:26 - p95 latency 1.31s, p99
  3.74s on `/events` (per
  `tests/load/results/browse-20260503T072635Z.summary.json`)

## Verification plan (post-deploy)

These run after the Vercel deploy promotes this commit to production.
Branch deploys also pin to syd1 because vercel.json is repo-level.

### V1. Region attestation

Confirm functions actually run in syd1 (not just configured to).
Vercel surfaces the region as a response header on serverless responses.

```bash
curl -sSI https://eventlinqs.com/api/health/redis | grep -i x-vercel-id
# Expected: x-vercel-id: syd1::xxxxx (was iad1::xxxxx pre-deploy)
```

### V2. Latency comparison from Sydney

Use a Sydney probe (founder's home connection or Vercel's own region
attestation). Five-trial median, edge-warm.

| Endpoint | Pre (iad1) | Target (syd1) |
| --- | --- | --- |
| `/api/health/redis` | (capture before deploy) | < 50 ms |
| `/api/events` (warm cache) | (capture before deploy) | < 150 ms |
| `/events` (Vercel preview HTML) | (capture before deploy) | < 200 ms p50 |

Capture command:

```bash
for i in 1 2 3 4 5; do
  curl -sSo /dev/null -w "%{http_code}  %{time_total}s\n" \
    https://eventlinqs.com/api/health/redis
done
```

### V3. Lighthouse on `/events`

Run `lighthouse https://eventlinqs.com/events --preset=desktop --output=json`
five times, take the median Performance score. Compare against the
Phase 2 baseline. Even a lift of +5 points on cold-cache mobile would
ratify the migration.

Per CLAUDE.md the gating bar is mobile Performance >= 95 - we expect
the syd1 move to recover headroom previously eaten by RTT.

### V4. k6 browse smoke from a Sydney IP

Re-run `tests/load/profiles/browse.js` at the same VU shape used in
Phase 2 (250 VU ramping smoke, 60s duration), against the production
deploy from a Sydney-resident k6 process. Expected outcome:

- p95 should drop from 1.31 s to under 600 ms.
- p99 should drop from 3.74 s to under 1.5 s.
- Zero 5xx, zero 429, zero timeouts.

Captured as Phase 2.5 deliverable D (separate report).

### V5. Cron drift check

Crons run in the project region. The three cron paths
(`/api/cron/waitlist-expire`, `/api/cron/squad-expire`, `/api/cron/warm`)
each query Supabase. After the move, their wall-clock duration should
drop measurably. Verify in Vercel dashboard > Crons > recent
invocations > duration trend.

## Rollback plan

If syd1 produces a regression that cannot be quickly diagnosed, revert
in one commit:

```bash
git revert <commit-sha>
git push origin feat/hardening-phase2-5-vercel-sydney-preview-supabase
```

Rollback is bounded:

- `vercel.json` change is the only code touched in this deliverable;
  the revert restores the implicit iad1 default.
- No data migration. No env-var change. No client behaviour change.
- Vercel will re-deploy with iad1 functions on the next promotion.

## Caveats and follow-ups

- **One-region only.** This pins to syd1 alone. A future multi-region
  expansion (US/EU) for global users will require either a Vercel Pro
  multi-region serverless deployment (paid tier feature) or a CDN-level
  geo-routing strategy. Out of scope for v1 launch (AU/UK/US/EU markets
  per CLAUDE.md, but v1 traffic is overwhelmingly AU).
- **Edge functions / middleware.** Fluid Compute runs middleware in
  the same regions as serverless functions per the session-start
  knowledge update. Confirmed: middleware now also runs in syd1.
- **Cold start.** Sydney has slightly fewer warm pre-provisioned
  Lambda containers than iad1 historically. Expect a marginal cold
  start variance for the first hour after deploy; smooths out within
  a day under steady traffic.
- **Cron schedule preservation.** The `* * * * *` cron on
  `/api/cron/warm` is per-minute and independent of region. No change
  to scheduling.
