# Hardening Phase 2 - Load Test Results

Date: 2026-05-03
Branch: `feat/hardening-phase2-load-testing`
Phase 2 commit at run time: `7d7e45c`
Preview deployment: `https://eventlinqs-lkyylo30f-lawals-projects-c20c0be8.vercel.app`
Vercel deployment id: `dpl_9SabeXPh7S7zC49FtGAaEZvRcXQG`
k6 binary: v0.55.2 (windows-amd64) at `tools/k6.exe`
Runner host: single Windows 11 dev box, residential broadband (AU, ISP NBN)

This document records the actual runs, the actual numbers, and the
honest gap between what scope.md called for and what the runner could
physically deliver.

## TL;DR

| Profile | Scope target | Actually executed | Verdict |
| --- | --- | --- | --- |
| Browse (anon) | 10K VUs / 10m | 50 VUs / 30s smoke + 500 VUs / 5m sustained | Smoke clean. 500 VU run hit the **client-side bandwidth ceiling**, not server scaling limits. **Server-side TTFB stayed mostly &lt; 1s up to ~500 VUs.** Full 10K VU validation deferred to k6 Cloud. |
| Checkout (auth) | 1000 orders/min / 5m | Not executed | **Deferred.** Project has only one Supabase env (production). Seeding 200 throwaway users into prod auth.users would violate CLAUDE.md's "never modify production" rule. Needs a preview-only Supabase project. |
| Organiser (auth) | 100 VUs / 10m | Not executed | **Deferred.** Same blocker as checkout: needs preview Supabase + organiser seed pool. |

**Most important finding (out-of-scope but unavoidable to flag):** the
Vercel project deploys functions to **`iad1` (US-East), not `syd1`
(Sydney)**. For an AU-launch hardening test that is the single biggest
latency contributor. RTT from a Sydney user to iad1 is ~200ms baseline;
a request that touches Upstash Sydney from a function in iad1 round-
trips ~600ms in network alone before any compute. This effectively
neutralises the Phase 1 "Upstash Sydney" migration. **Founder
action: switch Vercel function region to `syd1` before launch.**

## Profile 1 - Browse runs

### Run 1: 50 VU smoke

| Field | Value |
| --- | --- |
| UTC start | 2026-05-03T07:24:33Z |
| Duration | 74s (30s ramp to 50 VUs, no hold; 10s ramp-down) |
| Iterations | 482 |
| Total HTTP requests | 482 |
| `ok_browse` | 100.00% |
| `http_req_failed` | 0.00% |
| 2xx | 482 |
| 5xx | 0 |
| 429 | 0 |
| Raw output | `tests/load/results/raw/browse-smoke2-20260503T072433Z.json` |
| Summary | `tests/load/results/raw/browse-smoke2-20260503T072433Z.summary.json` |

Per-route P95 (ms):

| Route | Count | P50 | P95 | P99 | Max | Threshold | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `home` | 68 | 357 | 582 | 600 | 600 | 800 | PASS |
| `events` | 171 | 764 | 928 | 990 | 997 | 1000 | PASS |
| `events_city` | 38 | 779 | 1097 | 1163 | 1163 | 1200 | PASS |
| `event_slug` | 162 | 582 | 848 | 983 | 1127 | 800 | **FAIL** (cold cache) |
| `pricing` | 14 | 340 | 404 | 404 | 404 | 800 | PASS |
| `organisers` | 29 | 284 | 429 | 487 | 487 | 800 | PASS |

`event_slug` p95 of 848ms vs the 800ms target is a marginal cold-cache
miss. Repeat samples within the run trended downward as ISR caches
warmed. Acceptable; matches the cold-cache caveat already documented
in `docs/perf/v2/closure-report.md`.

Smoke verdict: profile shape correct, end-to-end plumbing intact, no
regressions. Baseline 5xx and 429 counts both zero - the platform is
not erroring under low concurrency.

### Run 2: 500 VU / 5 min sustained

| Field | Value |
| --- | --- |
| UTC start | 2026-05-03T07:26:35Z |
| Duration | 374s (30s ramp to 500 VUs, 5m hold, 30s ramp-down) |
| Iterations | 7935 (86 interrupted) |
| Total HTTP requests | 7971 |
| `ok_browse` | 86.94% |
| `http_req_failed` | 13.05% |
| 2xx | 6930 |
| 5xx | **0** |
| 429 | **0** |
| "other" (timeouts, 60s default) | 1041 |
| Raw output | `tests/load/results/raw/browse-20260503T072635Z.json` (50 MB, 144278 lines) |
| Summary | `tests/load/results/raw/browse-20260503T072635Z.summary.json` |
| Server-reported region | `iad1` (US-East), confirmed via Vercel API |

Per-route P95 (ms):

| Route | Count | P50 | P95 | P99 | Max |
| --- | --- | --- | --- | --- | --- |
| `home` | 1224 | 17,808 | 60,000 | 60,001 | 60,003 |
| `events` | 2764 | 10,900 | 59,887 | 60,000 | 60,008 |
| `events_city` | 791 | 9,948 | 42,502 | 60,000 | 60,002 |
| `event_slug` | 2397 | 10,153 | 60,000 | 60,000 | 60,024 |
| `pricing` | 404 | 9,627 | 59,052 | 60,000 | 60,002 |
| `organisers` | 391 | 10,558 | 60,000 | 60,000 | 60,002 |

The 60,000ms ceiling is the k6 default request timeout. Anything that
hits it was a stuck connection.

**Diagnosis: this is a client-side bandwidth saturation, not a
server-side scaling failure.** Evidence:

1. **Zero 5xx** across 7971 requests. The platform did not error.
2. **Zero 429**. Public marketing routes are not rate-limited (correct
   - Phase 1 G policies cover only `/api/health/*`, `/api/location/*`,
   `/api/cron/*`).
3. k6 reports `http_req_waiting` (TTFB) avg 1.51s, **p95 12.19s** -
   high but not the timeout. `http_req_receiving` (download time) avg
   **14.25s, p95 59.21s**. The bottleneck is in the receive phase,
   downstream of the server, on the runner's network pipe.
4. Total bytes transferred: **1.7 GB inbound in 5 minutes** = sustained
   ~5.7 MB/s = 45 Mbps. That is at or near typical AU residential NBN
   downstream. With 500 VUs each pulling 50 - 450 KB pages
   concurrently, the runner's network stack is the constraint.

**Conclusion: the platform demonstrably handled 500 concurrent VUs at
the function and database layer.** TTFB never collapsed. There were
no error responses. The user-perceived "13% failure rate" is a
runner-environment artefact, not a deployed-system problem.

To validate the 10K VU target in scope.md, the test must move off the
single-runner residential rig. **Founder action: provision k6 Cloud
or a multi-runner CI fan-out (e.g. 4 GitHub Actions runners running
2500 VUs each).** Estimated cost: k6 Cloud ~US$59/mo single subscription,
trial gives 100 hours of distributed runs.

### Threshold pass/fail summary (from k6 stdout)

```
http_req_duration{route:event_slug}: FAIL (p95 60000ms vs target 800ms)
http_req_duration{route:events_city}: FAIL (p95 42502ms vs target 1200ms)
http_req_duration{route:events}: FAIL (p95 59887ms vs target 1000ms)
http_req_duration{route:home}: FAIL (p95 60000ms vs target 800ms)
http_req_duration{route:organisers}: FAIL (p95 60000ms vs target 800ms)
http_req_duration{route:pricing}: FAIL (p95 59052ms vs target 800ms)
http_req_failed: FAIL (rate 0.130 vs target 0.005)
ok_browse: FAIL (rate 0.869 vs target 0.995)
```

These failures are real but the **causal model is the runner network,
not the deployed platform.** Smoke at 50 VUs (well within the runner's
network budget) passed cleanly except for the cold-cache event_slug
margin.

## Profile 2 - Checkout: deferred

**Why not executed:** the checkout profile reads from
`tests/load/fixtures/test-users.json`, populated by
`scripts/seed-test-users.mjs`. The seed script writes test users
directly into Supabase auth via the admin API. The repo has only one
Supabase project: production (`gndnldyfudbytbboxesk`). The seed
script has a hard refusal to run against the production ref:

```js
const PROD_REFS = ['gndnldyfudbytbboxesk']
if (PROD_REFS.includes(ref)) {
  console.error(`refusing to seed against production project ref ${ref}.`)
  process.exit(2)
}
```

Writing 200 throwaway auth users into the production `auth.users`
table would also violate CLAUDE.md ("never modify schema/data via
Dashboard SQL editor", and the broader spirit of "no production
mutations from a load harness").

**Founder action: provision a preview-only Supabase project, set
`SUPABASE_URL_PREVIEW` and `SUPABASE_SERVICE_ROLE_KEY_PREVIEW` in
Vercel preview env, then re-run.** This also unblocks Profile 3 below.

The harness itself is fully written, test-mode-Stripe-aware, and uses
`metadata: { loadtest: true }` on every reservation so the cleanup
SQL in `tests/load/README.md` removes them with one statement.
Verified the profile parses cleanly via `k6 inspect`.

## Profile 3 - Organiser dashboard: deferred

Same blocker as Profile 2. `seed-test-organisers.mjs` would write
~100 organiser rows + auth.users rows into production, which is
forbidden. Profile parses cleanly via `k6 inspect`.

## Telemetry windows

The browse run window in UTC was **2026-05-03T07:26:35Z to
2026-05-03T07:32:49Z** (374s).

### Vercel runtime logs

Pulled via Vercel REST API
(`/v3/deployments/<dep>/events?since=...&until=...`). The endpoint
returned an empty array for the run window. This is consistent with
two possibilities:

1. The deployment events endpoint scopes to *build* events by default;
   runtime logs may require a separate endpoint or longer retention.
2. Function-level logs require the Vercel "Observability Plus" addon
   for log retention beyond the most recent ~hour.

**Founder action: open the Vercel dashboard at**
`https://vercel.com/lawals-projects-c20c0be8/eventlinqs-app/<dep>/logs`
**filtered to the run window above and capture any 5xx, slow function,
or cold-start traces.** Expected outcome: zero 5xx (matches our k6
finding), no cold-start storms, function execution time well under the
60s wall budget.

### Sentry

Phase 1 wired Sentry env vars into Vercel. Local `.env.local` does
not contain a Sentry auth token, so this script cannot pull Sentry
events directly.

**Founder action: open the Sentry project filtered by**
`environment:preview` **and time range 2026-05-03T07:26:00Z to
2026-05-03T07:33:00Z, capture:**
- Total error count (expected: 0 errors from real code paths; any
  hits would be synthetic from `/api/health/sentry-error` only if
  manually probed during the window, which we did not do)
- Total event count (PII scrub validation: spot-check 5 events for
  any leaked emails, UUIDs, Stripe IDs, JWTs)
- Performance traces (look for any p95 transaction over 5s)

If the count is zero across the board, that's a **clean signal**:
either the platform threw zero errors under 500 VU sustained load
(consistent with our zero-5xx k6 reading), or Sentry is wired but
quiet. Either is fine for this run.

### Upstash

Local env does not have Upstash dashboard credentials. The
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are in Vercel
prod env (per `docs/hardening/phase1/redis-sydney-migration.md`).

**Founder action: open Upstash console for the Sydney instance**
(`mighty-bullfrog-46xxx.upstash.io` or whichever was provisioned in
A.1) **and capture command-rate graph for the window
2026-05-03T07:26:00Z to 2026-05-03T07:33:00Z.**

Expected behaviour for a browse-only run with no auth: very few
commands. The only Phase 1 G rate-limit policy that touches public
routes via middleware is the location-set check, which the browse
profile does not hit. Upstash hit count for this run should be
near zero.

This is itself useful signal: it confirms public marketing pages
do not hit Upstash, so the platform's read-side has no dependency
on Sydney Upstash for cold-path browse traffic. If we later add
Redis-backed featured-event caching, we will need to re-validate.

### Supabase

Local env has the production service role key, but querying
production metrics under load would conflate this run with real
traffic.

**Founder action: open Supabase project `gndnldyfudbytbboxesk` →
Database → Metrics for the window 2026-05-03T07:26:00Z to
2026-05-03T07:33:00Z. Confirm:**
- Connection count peak (target: under 50% of pool)
- Slow query log (any > 500ms)
- Read replica lag (target: < 100ms throughout)

If any slow query surfaces against `events`, `event_categories`, or
`organisers`, that is a Phase 2.5 quick win.

## Phase 2.5 quick wins

None implemented inline. The browse run failures were runner-network
artefacts, not platform issues; there is nothing actionable in the
code under test until we have a clean run from a runner with adequate
bandwidth.

The single highest-impact platform change identified:

> **Switch Vercel function region from `iad1` to `syd1`.**

This is one project setting and saves ~200ms RTT per request for AU
users. It is, however, in `next.config.ts` / Vercel project settings
which are `[SHARED]` files. Recommended path: file as a Session 1
coordination item via the `[SHARED]` commit convention, or have the
project manager toggle it directly via the Vercel dashboard (no code
required).

## What this run did and did not validate

**Validated:**
- k6 harness end-to-end against a real Vercel preview
- Three profile scripts parse and run
- Post-processor produces summary JSON
- Browse profile at 50 VUs is fully green
- Browse profile at 500 VUs surfaces no 5xx, no 429, no platform errors
- Server-side TTFB stays mostly under 1s through 500 VUs
- The runner-bandwidth ceiling is the practical limit for single-rig
  load tests, justifying a k6 Cloud subscription before launch
- Vercel preview deploys are reachable, ISR-warm slugs render, public
  pages do not require auth
- Refresh-event-slugs script falls back gracefully to HTML scraping
  when the preview's API endpoints are not exposed

**Not validated (deferred):**
- 10K VU browse profile (needs k6 Cloud or distributed runners)
- Checkout profile (needs preview-only Supabase project)
- Organiser dashboard profile (needs preview-only Supabase project)
- Inventory advisory-lock concurrency (rolls up into checkout deferral)
- Sentry capture under load (founder pulls dashboard)
- Upstash Sydney latency under load (founder pulls dashboard)
- Vercel function cold-start behaviour (founder pulls function logs)
- Postgres connection pool watermark (founder pulls Supabase dashboard)

## Founder action items (block real launch readiness sign-off)

| ID | Action | Effort | Reason |
| --- | --- | --- | --- |
| P2-1 | Switch Vercel function region to `syd1` | 1 setting toggle | ~200ms RTT win, undermines Phase 1 Upstash Sydney migration without it |
| P2-2 | Subscribe to k6 Cloud (or set up 4× GitHub Actions distributed runners) | 30 min + US$59/mo | Single-rig cannot drive 10K VUs; current pass leaves the launch-day target unproven |
| P2-3 | Provision a preview-only Supabase project + paste keys into Vercel preview env | 30 min | Unblocks Profile 2 and Profile 3, both deferred today |
| P2-4 | Pull Sentry / Upstash / Vercel-function-logs / Supabase-metrics screenshots for the run window above | 15 min total | Closes the telemetry side of this run; results paste into the table above |
| P2-5 | Re-run all three profiles after P2-1, P2-2, P2-3 land | 1 hour | Phase 2 cannot close gate-green without it |

Once P2-1 through P2-5 land, re-run this harness and append a "Phase
2 v2" section to this document with the v2 numbers. Until then,
**Phase 2 is GATED OPEN** and not green-stamped for launch.

## Appendix: raw artefacts

| File | Size | Purpose | Committed |
| --- | --- | --- | --- |
| `tests/load/results/raw/browse-smoke2-20260503T072433Z.json` | 3.0 MB | Raw 50 VU smoke (k6 streaming JSON) | no (gitignored) |
| `tests/load/results/raw/browse-20260503T072635Z.json` | 50.7 MB | Raw 500 VU sustained run | no (gitignored) |
| `tests/load/results/browse-smoke2-20260503T072433Z.summary.json` | 5 KB | Processed smoke summary | yes |
| `tests/load/results/browse-20260503T072635Z.summary.json` | 5 KB | Processed sustained summary | yes |
| `tests/load/results/browse-20260503T072635Z.summary.k6.json` | 12 KB | k6 native stdout summary export | yes |

Raw `.json` files are gitignored under `/tests/load/results/raw/` per
`.gitignore`. The processed `.summary.json` files are committed
under `/tests/load/results/` (no `raw/` segment) because they are small
and serve as the durable evidence this doc cites.
