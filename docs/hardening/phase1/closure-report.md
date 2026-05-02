# Hardening Phase 1 - Closure Report

Date opened: 2026-05-02
Date drafted: 2026-05-02
Branch: `feat/launch-hardening-nationwide`
Session: hardening (worktree: `eventlinqs-app-hardening`)
Phase status: **DRAFT-CLOSURE - awaiting [GATE] sign-off from project manager**

## Headline

All 7 deliverables (A-G) have landed code or scaffolding. Three of them carry coordination flags: A, B, E require founder action; D + F require [SHARED] follow-up commits after partner Claude reviews the package.json change and Sentry env vars are set respectively. The codebase is shippable as-is; the founder actions and SHARED follow-ups complete the production cutover.

Quality baseline preserved: lint baseline (1 pre-existing error in `site-header-client.tsx`, unchanged), tsc clean, `next build` clean, vitest 25/25.

## Per-deliverable status

### A - Upstash Redis Sydney migration

Status: **CODE LANDED, FOUNDER ACTION REQUIRED**

- `src/app/api/health/redis/route.ts` - PING-based health endpoint exposing latency, region, and status. Production target: `latencyMs < 20` once cut over to Sydney.
- `docs/hardening/phase1/upstash-sydney-setup.md` - founder action: provision Fixed 250MB Sydney instance, set Vercel env vars, pull to `.env.local`.
- `docs/hardening/phase1/redis-migration-runbook.md` - smoke test sequence T0-T8 + 7-day soak protocol + decommission plan.
- `.env.example` - Upstash block added.

Coordination: founder must provision the Sydney instance. Until then, the existing N. Virginia free-tier client continues to back rate-limit + inventory cache (fail-open semantics preserved).

### B - Resend SMTP for Supabase Auth

Status: **CODE LANDED, FOUNDER ACTION REQUIRED**

- `src/lib/email/templates/auth/{confirm-signup,magic-link,password-reset,email-change,reauthentication}.html` - 5 brand-compliant HTML templates. 560px max width, EVENTLINQS wordmark, brand palette, Supabase placeholders preserved (`{{ .ConfirmationURL }}`, `{{ .Token }}`), AU English, no em-dashes.
- `src/lib/email/templates/auth/README.md` - editor guide.
- `docs/hardening/phase1/resend-smtp-setup.md` - founder action: verify `eventlinqs.com` in Resend (SPF/DKIM/DMARC), generate SMTP credential, paste templates into Supabase Auth Dashboard, set `RESEND_API_KEY` in Vercel.

Coordination: founder must verify the domain in Resend and configure Supabase Dashboard. No code-side blocker.

### C - Google Maps API restrictions (revised from Mapbox)

Status: **AUDIT COMPLETE, FOUNDER ACTION REQUIRED**

Original C was Mapbox URL restrictions. Project manager directive 2026-05-02: Mapbox is fully decommissioned (verified zero hits across `src/`, `package.json`, `.env.example` for `mapbox`, `mapboxgl`, `mapbox-gl`). Task replaced with Google Maps API key audit.

- `docs/hardening/phase1/google-maps-api-restrictions.md` - audit + founder action.
- Active surfaces enumerated: `m5-events-map.tsx` and `google-maps-loader.ts`.
- Founder action: HTTP referrer restrictions (`eventlinqs.com/*`, `www.eventlinqs.com/*`, `*.vercel.app/*`, `http://localhost:*/*`) + API restrictions (Maps JS + Places only) + quota cap.

Coordination: founder action only. No health endpoint (key is browser-exposed by design; security is restriction-based).

### D - Database type generation automation

Status: **SCAFFOLD LANDED, [SHARED] COMMIT MADE, REFACTOR DEFERRED**

- `scripts/gen-db-types.mjs` - wraps `supabase gen types typescript --linked --schema public` with do-not-edit banner; outputs to `src/types/database.generated.ts`.
- `scripts/db-types-drift-check.mjs` - regenerates and diffs; exit 0 clean / 1 drift / 2 CLI fail. Designed for CI.
- `docs/hardening/phase1/db-types-automation.md` - end-state architecture, migration plan.
- `[SHARED]` commit `4afe68d` added `db:types` and `db:types:check` npm scripts.

Coordination: same `npx supabase link` founder action as deliverable E unblocks first-run type generation. The actual cutover from hand-written `src/types/database.ts` (~50 import sites) to re-exports of `database.generated.ts` is explicitly deferred to a later dedicated PR; Phase 1 ships only the rails.

### E - Schema drift reconciliation

Status: **PARTIAL - on-disk audit complete, remote audit blocked on founder action**

- `docs/hardening/phase1/migration-drift-audit.md` - 10 migrations enumerated.
- Memory item "20260419000001_add_saved_events.sql on disk but never applied" RESOLVED: file is not on disk; `saved_events` table ships via `20260421000001_m5_phase1_personalisation.sql` with `CREATE TABLE IF NOT EXISTS`.
- Memory item "13 events vs 8 expected" PENDING: most likely the seed migration ran cleanly (8 events) and `cultural_breadth_seed` added 5 more (total 13). Confirms in T2 after link.
- `.env.local` duplicate `NEXT_PUBLIC_SUPABASE_URL` flagged for founder cleanup (founder-managed file, not edited).

Coordination: founder must run `npx supabase login && npx supabase link --project-ref gndnldyfudbytbboxesk` (requires DB password). After link, this session runs `migration list --linked` and `db diff --linked` and updates the audit doc in-place.

### F - Sentry observability

Status: **SCAFFOLD LANDED, FOUNDER ACTION + [SHARED] COMMITS PENDING**

- `src/lib/observability/pii-scrub.ts` - PII redaction patterns. Order matters: shape-specific (UUID, JWT, Stripe id) runs before greedy numeric (phone, card) so digit-heavy UUID tails are not chewed by phone heuristic. Verified via adversarial test case.
- `src/lib/observability/sentry.ts` - stable shim with console fallback in dev, no-op in prod until SDK is wired.
- `src/app/error.tsx` - App Router error boundary using PageShell.
- `src/app/global-error.tsx` - root-layout error boundary, self-contained, inline styles.
- `src/app/api/health/sentry-error/route.ts` - token-gated synthetic error endpoint with rate limit (5/min/IP).
- `tests/unit/observability/pii-scrub.test.ts` - 17 tests covering each pattern + multi-PII stack-trace adversarial case.
- `docs/hardening/phase1/sentry-setup.md` - founder action doc.

Coordination: founder must create Sentry project, set DSN + auth token + slugs in Vercel. Then this session lands two `[SHARED]` commits (install `@sentry/nextjs`, wrap `next.config.ts` with `withSentryConfig`).

### G - Rate limiting on critical endpoints

Status: **CODE LANDED, RUNTIME VERIFICATION GATED ON A**

- `src/lib/rate-limit/policies.ts` - typed `POLICIES` table (4 named policies: `health-redis`, `health-sentry-error`, `location-set`, `cron-job`). Each entry carries `keyPrefix`, `limit`, `windowSec`, and a written rationale for cap reviews.
- `src/lib/rate-limit/middleware.ts` - `applyRateLimit` (returns 429 NextResponse on miss) and `rateLimitWithHeaders` (also exposes `RateLimit-*` headers on success path). Standard `Retry-After` + `RateLimit-Limit/Remaining/Reset` headers per draft-ietf-httpapi-ratelimit-headers.
- `src/app/api/health/redis` - wired with `health-redis` (60/min/IP).
- `src/app/api/health/sentry-error` - wired with `health-sentry-error` (5/min/IP) for defence in depth on top of token gate.
- `tests/unit/rate-limit/policies.test.ts` - 5 invariant tests on the policy table.
- `docs/hardening/phase1/rate-limit-handoff.md` - Session 1 handoff doc listing recommended caps for `/api/checkout/**` and `/api/stripe/**` routes (those paths are forbidden to this session).

Coordination: latency target verification requires the Sydney Upstash instance (deliverable A founder action). Policy layer itself is production-ready against the current free-tier client.

## Quality gates

| Gate | Result |
| --- | --- |
| `npm run lint` | 1 pre-existing error in `src/components/layout/site-header-client.tsx` (baseline-preserved); 16 warnings (all pre-existing). No new errors or warnings introduced by Phase 1. |
| `npx tsc --noEmit` | Clean. |
| `npm run build` | Clean. 121 routes generated. New routes `/api/health/redis` and `/api/health/sentry-error` appear in manifest. |
| `npm test` (vitest) | 25/25 passing across 3 test files (1 pre-existing webhook-handler suite + 17 PII scrub + 5 rate-limit + 2 webhook tests). |

## Commits in Phase 1 (post-base)

| Commit | Type | Subject |
| --- | --- | --- |
| `b8170ab` | docs | scope doc and progress log |
| `239319d` | feat (A) | redis health endpoint plus Sydney migration plan |
| `7730095` | feat (B) | Resend SMTP setup doc and brand-compliant auth templates |
| `1556fd6` | feat (C) | map token restrictions audit and founder action (superseded) |
| `85f8008` | feat (E) | on-disk migration audit and remote drift handoff |
| `00b2e6f` | feat (C-revised) | rename to google-maps-api-restrictions and absorb decommission |
| `0e326c9` | feat (F) | observability scaffold with PII-scrubbed Sentry shim |
| `0d8358b` | docs (F) | log F observability scaffold and SHARED-commit coordination |
| `66c2ae7` | feat (D) | db type generation scripts and migration plan |
| `4afe68d` | **[SHARED] chore** | add db:types and db:types:check npm scripts |
| `8a23d64` | docs (D) | log D scaffold + SHARED coordination flag |
| `71c191d` | feat (G) | central rate-limit policy layer and Session 1 handoff |

12 commits, branch pushed to `origin/feat/launch-hardening-nationwide`.

## Outstanding founder actions

1. **A** - Provision Upstash Sydney Fixed 250MB instance (`docs/hardening/phase1/upstash-sydney-setup.md`).
2. **B** - Verify `eventlinqs.com` in Resend, configure Supabase Auth SMTP, set `RESEND_API_KEY` in Vercel (`docs/hardening/phase1/resend-smtp-setup.md`).
3. **C** - Apply Google Maps API key restrictions in Google Cloud Console (`docs/hardening/phase1/google-maps-api-restrictions.md`).
4. **D + E** - `npx supabase login && npx supabase link --project-ref gndnldyfudbytbboxesk` (single action unblocks both).
5. **F** - Create Sentry project, set 4 env vars + `HEALTH_CHECK_TOKEN` in Vercel (`docs/hardening/phase1/sentry-setup.md`).

## Outstanding [SHARED] coordination

1. `4afe68d` - `db:types` npm scripts. PUSHED. Awaiting partner Claude confirmation of no conflict with Session 1/3 work.
2. PENDING - `chore(deps): add @sentry/nextjs` (after F founder action).
3. PENDING - `feat(observability): wire Sentry into next.config.ts via withSentryConfig` (after dep install).

## Outstanding cross-session handoffs

- **Session 1 (Backend):** wire `applyRateLimit` into `/api/checkout/**` and `/api/stripe/**` routes per `docs/hardening/phase1/rate-limit-handoff.md`. Suggested caps included.

## Risks and known gaps

| Risk | Mitigation |
| --- | --- |
| Free-tier Upstash in N. Virginia continues to back production until A founder action. | Existing client fails open. Inventory cache and rate-limit miss are non-fatal. Acceptable for soft-launch staging but blocks AU launch. |
| `src/types/database.ts` still hand-written. | Drift risk acknowledged. CI drift check (`db:types:check`) once linked will catch divergence; full re-export refactor explicitly out of Phase 1 scope. |
| `@sentry/nextjs` not yet installed; `captureException` is a console-fallback noop in production. | Error boundaries + scrubber are in place. Once SDK installed (small SHARED commit), all calls forward to Sentry with PII scrubbed. No call-site refactor needed. |
| `.env.local` has dead `NEXT_PUBLIC_SUPABASE_URL` line pointing to old project ref. | Founder-managed file, flagged in deliverable E audit. Recommended cleanup in a future founder commit. |

## What this phase explicitly did NOT do

- Did not provision external services (Upstash, Resend, Sentry, Google Cloud restrictions). Founder-only action.
- Did not link Supabase CLI. Requires DB password; founder-only action.
- Did not refactor 50+ import sites of `@/types/database` to consume generated types. Out of Phase 1 scope.
- Did not install `@sentry/nextjs`. SHARED package change pending coordination.
- Did not touch `src/app/api/checkout/**`, `src/app/api/stripe/**`, `src/components/admin/**`, or marketing copy. Off-limits per CLAUDE.md.
- Did not run a load test. That is Phase 2.

## Recommendation to project manager

Approve Phase 1 closure. Phase 2 should open after:

1. Founder completes the 5 actions above (estimated 60-90 minutes total wall-clock).
2. Partner Claude confirms no conflict on the `[SHARED]` `4afe68d` commit.
3. This session lands the post-action cleanup commits (Sentry SDK install, first-run db:types, remote migration audit doc fill-in).

Phase 2 scope is load testing infrastructure (`tests/load/**`), staging environment setup, and first nationwide-AU traffic-shape simulation. None of those should start until Phase 1's founder actions are clear.

## [GATE]

Phase 1 closure draft ready for review.
