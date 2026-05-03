# Hardening Phase 2 - Load Testing & Performance Validation

Date opened: 2026-05-03
Branch: `feat/hardening-phase2-load-testing`
Session: hardening (worktree: `eventlinqs-app-hardening`)
Phase status: ACTIVE
Phase 1: closed (commit `0d0f5c4` on main, all founder actions complete except A.5 Resend reset-flow finishing in Session 3)

## Mission

Validate that the Phase-1 infrastructure choices hold up under launch traffic shapes. Specifically: prove Sydney Upstash holds rate-limit + inventory cache miss latency below the published target, prove Sentry captures errors and traces under load without dropping, prove the Vercel edge handles browse-class concurrency without cold-start storms, and prove the Postgres connection pool + RLS policies do not become the bottleneck in the checkout path.

Success criteria are numerical and per-endpoint, recorded in `docs/hardening/phase2/load-test-results.md`. No green-by-vibes.

## Tool choice: k6, not Artillery

Decision: **k6** (Grafana Labs).

Why:
- **Single binary, deterministic.** Installs via winget on the Windows dev box, runs the same script across CI, ad-hoc, and k6 Cloud. Artillery is npm-installable but pulls a Node toolchain into the load loop; the loop becomes a confound when measuring a Node target.
- **Native HTTP/1.1 + HTTP/2.** Vercel serves HTTP/2; Artillery's stock HTTP engine is HTTP/1.1 only.
- **VU model maps cleanly to launch traffic shape.** k6's `executor: 'ramping-vus'` and `'constant-arrival-rate'` map directly to the three profiles in this scope (browse uses constant VUs, checkout uses constant arrival rate to drive RPS, organiser uses ramping VUs).
- **Metric output is structured by default.** JSON summary + per-request samples export into `tests/load/results/*.json`, then a small Node post-processor renders into the results doc. Artillery's reporter is HTML-only by default and a pain to script.
- **Industry standard for the targets we measure.** Sentry, Upstash, Vercel docs all use k6 examples; troubleshooting against vendor docs is faster.
- **Scaling path is clear.** If the dev box can't drive 10K concurrent VUs, k6 Cloud or self-hosted distributed runners take the same scripts unchanged. Artillery distributed mode (`artillery-pro`) is not free.

Trade-off accepted: k6 scripts are JS-with-restrictions (no `require`, no NPM modules) - the Goja runtime is intentionally constrained. Acceptable given the load-test code does not need NPM. State sharing between VUs is via `SharedArray` from `k6/data`; we use it for the events fixture.

## Owned file paths (this phase)

- `tests/load/**` (new)
- `docs/hardening/phase2/**` (new)
- `docs/sessions/hardening/progress.log` (M)

## Forbidden file paths (unchanged from Phase 1)

- `src/lib/stripe/**`, `src/lib/payments/**`, `src/app/api/checkout/**`, `src/app/checkout/**`
- `src/components/admin/**`, `src/app/admin/**`
- `src/app/page.tsx` (homepage), `src/components/marketing/**`

## Target environment

**Vercel preview deployment of this branch.** Production traffic is real organisers and (eventually) real attendees; load-testing production would risk Stripe Connect test-mode webhooks, Sentry quota burn, and Upstash command count anomalies that are indistinguishable from real abuse.

The preview URL is captured in the results doc at run time. CRON jobs are not triggered on preview deployments by default; webhook receipts are simulated locally per the Stripe webhook-simulator pattern, not pointed at preview.

## Three traffic profiles

### Profile 1 - Browse (anonymous, public surface)

Models the launch-day discovery surge: TV ad spot, social share, a name-brand organiser teaser. Anonymous, GET-heavy, mix of mobile and desktop user agents.

| Spec | Value |
| --- | --- |
| Tool executor | `constant-vus` followed by a 30s ramp-down |
| Concurrent VUs | 10,000 |
| Duration | 10 min steady + 30s ramp |
| Routes hit (weighted) | `/` (15%), `/events` (35%), `/events?city=*` (10%), `/events/[slug]` (30%), `/pricing` (5%), `/organisers` (5%) |
| Think time | `sleep(rand(2,8))` per VU iteration |
| User-agent split | 70% mobile (iOS Safari, Chrome Android), 30% desktop |
| Pass criteria | P95 latency &lt; 800ms per route, error rate &lt; 0.5%, no Vercel cold-start storm visible (no &gt; 5x median latency outliers from a fresh worker) |

### Profile 2 - Checkout (authenticated, transactional)

Models a popular event going on-sale: announcement timer, queue-buster behavior, then sustained checkout burst. Read-then-write flow, stresses inventory cache + Postgres advisory locks + Stripe PaymentIntent creation.

| Spec | Value |
| --- | --- |
| Tool executor | `constant-arrival-rate` |
| Target rate | 1,000 orders / minute (~17 RPS sustained on the checkout chain) |
| Duration | 5 min |
| Per-iteration flow | view event slug → reserve ticket → confirm reservation → simulate webhook receipt locally |
| Auth | session token from a pre-seeded test-user pool (50 users, round-robin) |
| Pass criteria | P95 reservation latency &lt; 1500ms, P95 confirm latency &lt; 2000ms, zero double-reserves (inventory invariant), Stripe PaymentIntent creation does not bottleneck (verified via Sentry trace inspection) |

### Profile 3 - Organiser dashboard (authenticated, read-heavy)

Models an organiser-only "morning of event day" rush: 100 organisers refreshing their dashboards every 30s. Heavier per-page payload, multi-query aggregations, RLS scope checks.

| Spec | Value |
| --- | --- |
| Tool executor | `ramping-vus` (0 → 100 over 60s, hold 8 min, ramp down 60s) |
| Concurrent VUs | 100 |
| Duration | 10 min total |
| Routes hit | `/dashboard` (25%), `/dashboard/events` (25%), `/dashboard/payouts` (25%), `/dashboard/insights` (25%) |
| Auth | session token from a pre-seeded organiser pool (5 organisers, each with a non-trivial event count) |
| Pass criteria | P95 latency &lt; 2000ms per route (organiser pages are heavier than public), error rate &lt; 0.1%, no N+1 patterns visible in Sentry traces, Postgres connection pool watermark below 50% saturation |

## Observability windows to capture per run

For each of the three profiles, capture during the run window:

1. **k6 stdout summary + JSON export** to `tests/load/results/<profile>-<UTC-stamp>.json`
2. **Sentry events** filtered by `tags: env=preview` for the run window (errors + perf traces)
3. **Upstash dashboard** command/sec graph for the run window (commands volume, error rate, latency p50/p99)
4. **Vercel analytics** for the run window (RPS, edge-region distribution, function execution time, cache hit ratio)
5. **Supabase project metrics** for the run window (connection pool peak, slow query log)

Screenshots from the three vendor dashboards (Sentry, Upstash, Vercel, Supabase) require founder-side access. The results doc lists the exact filter URLs and timestamps so the founder can pull the screenshots in <5 minutes per dashboard. We attach them at GATE review.

## Quality gates

- All k6 scripts in `tests/load/profiles/*.js`
- A small Node post-processor (`tests/load/process-results.mjs`) renders k6 JSON summaries into the results markdown
- All scripts reproducible via documented `npm run` aliases (or `k6 run` direct commands) - documented in `tests/load/README.md`
- Scope doc, results doc, README all in `docs/hardening/phase2/` or `tests/load/`
- TypeScript clean (no TS code added; k6 scripts are JS-with-Goja, parsed by k6 not tsc)
- Lint baseline preserved (k6 scripts not in eslint glob; verified)
- `next build` clean (no app-side changes in Phase 2 unless 2.5 quick wins land)
- vitest still green (existing tests untouched)

## Out of scope for Phase 2

- Production load testing. Preview only.
- Distributed k6 (k6 Cloud, k6 Operator). Single-runner from the Windows dev box. If full 10K-VU profile-1 saturates the runner before saturating the target, we degrade gracefully: reduce VU count, document, recommend k6 Cloud for the next pass.
- Modifying production data. The pre-seeded test users + organisers live in the preview env's database (or in the production Supabase project under a `loadtest_*` namespace - decided at run time based on what the preview env points at). All writes are scoped so they can be deleted with a single `delete from events where slug like 'loadtest-%'` style query.
- Webhook-receipt verification end-to-end with real Stripe. Stripe test mode rate-limits `Stripe.PaymentIntent.create` at 100 RPS by default; the load test uses Stripe-mocked PaymentIntents above that ceiling and points the local webhook simulator at a deterministic JSON payload.

## Phase 2.5 (optional, only if quick wins surface)

If the load test surfaces a clear quick win (a missing index, an N+1 query, a cache TTL miscalibration), implement it inline. Each fix is a separate commit with `perf(loadtest-<id>):` prefix and references the results-doc finding number. Phase 2.5 closes when no quick wins remain or 90 min has been spent on optimisation, whichever first.

## Hard rules carried forward

- No em-dashes
- No "diaspora" in user copy
- AU English
- No co-authorship attribution in commits
- No scope creep into Session 1 / Session 3 owned files
- All commits granular, conventional
