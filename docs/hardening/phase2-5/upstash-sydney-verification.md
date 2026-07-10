# Phase 2.5 deliverable D - Upstash Sydney verification

**Date:** 2026-05-04
**Status:** Production baseline captured. Sydney verification gated on
            deliverable A (Vercel syd1) merge.
**Owner:** Session 2 (hardening)
**Related:** Phase 1 deliverable A (Upstash Sydney provision), Phase 2
             closure finding **P2-1** (Vercel region)

## Why this matters

Phase 1 stood up the migration plan for Upstash. Phase 2 ran the
browse profile from Vercel iad1 and saw cross-region latency that
masked any Sydney signal. Phase 2.5-A migrates the Vercel functions
to syd1. Once both halves are in Sydney, every Redis hit should drop
from ~200ms to < 20ms - a 10x improvement on the rate-limit and
inventory-cache paths.

This deliverable captures the **pre-A baseline** so the post-merge
delta is auditable, and lays down the verification protocol that runs
as soon as A lands.

## Current production state (pre-deliverable-A baseline)

Probed `https://eventlinqs.com/api/health/redis` from the founder
workstation on 2026-05-04. Five sequential pings:

| # | latencyMs | result | ts |
| --- | --- | --- | --- |
| 1 | 213 | PONG | 2026-05-03T15:04:30Z |
| 2 | 199 | PONG | 2026-05-03T15:04:32Z |
| 3 | 204 | PONG | 2026-05-03T15:04:34Z |
| 4 | 203 | PONG | 2026-05-03T15:04:36Z |
| 5 | 203 | PONG | 2026-05-03T15:04:38Z |

p50 = 203 ms, p95 = 213 ms, jitter < 15 ms. The result `PONG` confirms
Redis itself is reachable and answering, but the **latency floor of
~200 ms is one-way Pacific RTT from iad1 to ap-southeast-2**. This is
exactly the symptom the migration is meant to eliminate.

The endpoint returns `"region": "unknown"`. The parser in
`src/app/api/health/redis/route.ts` derives region from the first
hostname segment when it matches Upstash's `<region>-<name>-<id>`
convention (e.g. `apn1-cool-name-12345.upstash.io` -> `apn1`). The
configured URL does not match that shape, so region detection is
inconclusive. Two interpretations:

1. The Sydney project was provisioned under a hostname that omits the
   region prefix (some Upstash regional plans do this).
2. The credentials still point at the legacy N. Virginia free-tier
   instance.

**The 200 ms latency floor disambiguates between the two**. iad1
Vercel to iad1 Upstash is < 5 ms in measured practice. iad1 Vercel to
syd1 Upstash is ~200 ms (one-way Pacific RTT). The observed latency
is consistent only with the second pattern, which means the founder
action A.1 did complete - Upstash is in Sydney - and the only thing
left to remove the tax is the Vercel function side, which is exactly
what deliverable A ships.

## Verification protocol (run after deliverable A merges)

The verification consists of three checks. All three must pass for
deliverable D to close.

### D.1 - latency floor

After the deliverable-A commit deploys, hit
`/api/health/redis` ten times sequentially and confirm:

| Metric | Target | Reason |
| --- | --- | --- |
| p50 latencyMs | < 20 ms | Same-region Upstash REST baseline |
| p95 latencyMs | < 50 ms | Allows for occasional cold connection setup |
| `result` | `PONG` on all 10 | Connectivity sanity |
| `ok` | `true` on all 10 | No timeout or auth error |

A run script ready to drop into the post-merge protocol:

```bash
for i in $(seq 1 10); do
  curl -sSL https://eventlinqs.com/api/health/redis | jq '.latencyMs'
  sleep 1
done
```

### D.2 - rate-limit decision under steady-state load

The rate limit middleware (`src/lib/rate-limit/middleware.ts`) hits
Redis on every gated request. The browse profile in
`tests/load/profiles/browse.js` exercises gated routes under sustained
500 VU for 5 minutes. Re-run the **same profile** as Phase 2 and
compare two trends:

| Trend | Phase 2 (iad1) | Target post-A (syd1) |
| --- | --- | --- |
| /events p50 | 10,900 ms | < 1,000 ms |
| / (home) p50 | 17,808 ms | < 1,500 ms |
| http_req_failed rate | 13.06% (1,041 timeouts) | < 1% |
| http 2xx count / total | 6,930 / 7,971 | > 99% |

A drop in p50 by an order of magnitude is the headline. The failure-
rate threshold (1%) is a hard gate baked into the k6 profile - the
run passes or fails as a binary signal.

The Phase 2 saturation pattern (p99 = 60s timeout on every route) was
caused by serial cross-Pacific waits stacking inside each request -
Supabase RPC + Redis call + Stripe call all paying the tax in
sequence. Phase 2.5-A removes the tax for the Supabase and Redis
hops; Stripe stays in the US but is async on the checkout path.

### D.3 - rate-limit cold-start latency

The first Redis hit after a function cold-start is the slowest. Drive
a cold start by deploying a dummy commit, wait 5 minutes, then hit
`/api/health/redis` once and capture the latency. Target:

| Cold-start latency | Target |
| --- | --- |
| First hit after cold start | < 100 ms |
| Subsequent hits | < 20 ms |

`< 100 ms` is generous enough to absorb the TLS handshake to Upstash
on a fresh outbound socket and the Vercel Fluid Compute warmup. If
the cold-start hit is > 200 ms, that points at the Vercel function
still routing through iad1 (i.e. deliverable A did not actually take
effect) and we need to inspect the deploy region in the Vercel
dashboard.

## What to do if D.1 fails after A merges

If the post-A redis ping is still ~200 ms, the diagnostic order is:

1. **Confirm Vercel deploy region**. In Vercel dashboard ->
   project -> deployment -> "Regions" should show `syd1`. If it shows
   `iad1`, deliverable A did not deploy correctly. Re-check
   `vercel.json` and force a fresh deploy.

2. **Confirm Upstash region**. In Upstash dashboard -> the active
   database -> "Region" should show `ap-southeast-2`. If it shows
   `us-east-1`, founder action A.1 did not complete - the
   `UPSTASH_REDIS_REST_URL` env var still points at the legacy
   instance.

3. **Confirm env var scope**. Vercel env vars must be set on the
   `Production` environment (not just Preview). Run `vercel env ls
   production` and confirm `UPSTASH_REDIS_REST_URL` matches the
   Sydney instance URL.

4. **Confirm DNS resolution**. Run `nslookup <upstash-host>` from a
   Sydney AWS instance if available. The IP should resolve to an
   ap-southeast-2 prefix. If it resolves to a us-east-1 prefix,
   Upstash has not actually moved the database to Sydney even if the
   dashboard claims so.

The escalation path beyond step 4 is open a ticket with Upstash
support; their internal routing can lag dashboard state by a few
hours after a region change.

## Why we are NOT re-running the browse profile inside Phase 2.5

The brief asks for "verification under browse smoke profile". The
honest answer is that running the profile **before** deliverable A
merges produces no new signal - it would land on the same iad1
infrastructure as Phase 2 did and reproduce the same numbers. The
only useful re-run is post-merge, and the Phase 2.5 PR cannot block
on its own deploy verification.

The protocol is therefore:

1. This PR ships A + B + C + D-as-plan together with a passing build
   on the iad1 deploy (current state).
2. After merge to main, the production deploy lands on syd1.
3. The first commit on `main` post-merge re-runs the browse profile
   per D.2 above and posts the results to `tests/load/results/raw/`
   alongside Phase 2's outputs.
4. If any of D.1-D.3 fail, open a follow-up issue tagged P2.5-D-FAIL
   and treat as launch blocker.

## Followups

- **Schedule the post-merge re-run**: PM nominates a 30-minute window
  on the day of merge so D.2 lands during low-traffic (Australian
  early morning, UTC ~16:00).
- **Wire Sentry into the re-run**: deliverable C identified the SDK
  is not yet installed. The browse-profile re-run produces another
  observability blind spot if the SDK is still missing. Stagger the
  re-run after the [SHARED] Sentry install commit if PM coordination
  permits.
- **Add a Redis SLO**: once verified, add a Vercel cron at
  `/api/cron/redis-slo` that pings `/api/health/redis` every 5 min
  and pushes p95 to Logtail. Alert if p95 > 50 ms over 15 min. This
  catches a latent regression to iad1 (e.g. accidental env var
  flip) without waiting for a load test to surface it. Tracked as a
  Phase 3 deliverable, not a Phase 2.5 blocker.
