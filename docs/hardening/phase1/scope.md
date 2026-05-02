# Hardening Phase 1 - Infrastructure Foundation

Date opened: 2026-05-02
Branch: feat/launch-hardening-nationwide
Session: hardening (worktree: eventlinqs-app-hardening)
Phase status: ACTIVE

## Mission

Take every infrastructure dependency to production-launch quality before nationwide soft launch. No free tiers in production paths. Sydney region wherever the service offers it. Observable. Documented. Idempotent. Rate-limited.

Phase boundary is a hard gate: nothing in Phase 2-4 starts until this phase has a closure report and explicit project manager approval.

## Inputs

- CLAUDE.md (shared session context, file ownership rules)
- docs/MASTER-PLAN-V1.md (build sequencing, Week 6 launch hardening targets)
- docs/BUILD-STANDARDS.md (quality gates, mobile-first rules)
- docs/PRODUCTION-READINESS-CHECKLIST.md (Section 1-9 checklist this phase contributes to)
- docs/audit/hygiene-2026-05-01.log (codebase hygiene baseline)
- docs/m6/audit/phase2/closure-report.md (Stripe Connect state)
- docs/perf/v2/closure-report.md (perf state, cold-cache caveat)
- next.config.ts (image config locked in iter 3 + iter 8)
- package.json (current dep set, no @sentry/nextjs yet)
- .env.example (current env contract - missing Upstash, Mapbox, Sentry, Resend keys)
- src/lib/redis/client.ts (Upstash client, fails open)
- src/lib/redis/rate-limit.ts (fixed-window limiter, fails open)
- src/types/database.ts (553 lines, hand-written)
- supabase/migrations/ (10 migrations on disk)

## Owned file paths (this session only)

- src/types/database.ts (auto-generation from Supabase schema) - SHARED file
- src/lib/redis/**
- src/lib/email/**
- src/lib/observability/** (new)
- src/lib/rate-limit/** (new, may end up under src/lib/redis/ - decision deferred to implementation)
- infrastructure/** (new)
- tests/load/** (new)
- next.config.ts (infra-related changes only) - SHARED file
- .env.example (additions only)
- supabase/migrations/** (NON-payment migrations only)
- scripts/** (infrastructure and ops scripts)
- docs/hardening/**
- docs/sessions/hardening/**

## Forbidden file paths

- src/lib/stripe/**, src/lib/payments/**, src/app/api/checkout/**, src/app/checkout/**
- src/components/admin/**, src/app/admin/**
- src/app/page.tsx (homepage), src/components/marketing/**

## Deliverables

### A - Upstash Redis Sydney migration

Current: free tier on N. Virginia (per memory; verified by inspecting `src/lib/redis/client.ts` which simply reads env). At nationwide-AU scale, every cache hit currently pays a trans-Pacific RTT (~200-300ms). Unacceptable.

Target: Fixed 250MB plan or larger, Sydney region (ap-southeast-2 or closest available), at minimum $10/month tier.

Actions:
- Document founder action: provision new Sydney instance in `docs/hardening/phase1/upstash-sydney-setup.md` (CC cannot create paid Upstash resources).
- Once founder confirms credentials available, update `.env.example` to document `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and the region expectation.
- Add health endpoint `src/app/api/_health/redis/route.ts` returning `{ ok, latencyMs, region }`. Latency from Vercel SYD compute to Sydney Redis should be <20ms post-migration.
- Document migration steps and rollback plan in `docs/hardening/phase1/redis-migration-runbook.md`.
- Coordination: this task BLOCKS deliverable G (rate limiting). If founder action delays, mark [COORDINATION] in progress.log and proceed with other items.

Success criteria:
- Founder action doc accepted (provisioned).
- Health endpoint returns 200 with `latencyMs < 20` from production deployment.
- Existing rate-limit and inventory-cache code paths exercise the new endpoint without code changes (env-only swap).
- Old N. Virginia instance decommissioned only after 7 days of clean Sydney operation.

### B - Resend SMTP for Supabase Auth

Current: Supabase Auth sends verification, magic-link, and password reset emails via Supabase's default sender (project-ref@supabase.co domain). Unacceptable for production - low deliverability, off-brand, no DMARC alignment.

Target: Resend SMTP from `noreply@eventlinqs.com` with verified SPF/DKIM/DMARC, with brand-voice templates that meet the no-em-dash, no-diaspora, Australian-English rules.

Actions:
- Document founder steps to: (1) create Resend SMTP credentials, (2) set them in Supabase Dashboard > Auth > SMTP, (3) verify DNS records on `eventlinqs.com`. Output to `docs/hardening/phase1/resend-smtp-setup.md`.
- Author brand-compliant template copy for: confirm signup, magic link, password reset, email change, reauthentication. Templates live in `src/lib/email/templates/auth/` as React Email components, ready to copy-paste into the Supabase Dashboard template editor.
- Smoke test: trigger password reset, verify email lands from `noreply@eventlinqs.com` via Resend (not from a `*.supabase.co` sender).

Success criteria:
- Founder action doc accepted (configured).
- Test password reset email delivers from `noreply@eventlinqs.com`.
- All 5 templates pass brand voice grep (no em-dashes, no en-dashes, no exclamation marks, no diaspora references, AU spelling).

### C - Mapbox URL restrictions

Current: per project memory, Mapbox public token (if used) is unrestricted. Unrestricted public tokens are a billing-abuse vector.

Note: this codebase currently uses `@googlemaps/js-api-loader` per package.json. Mapbox may not be in active use. First action is to audit whether Mapbox is referenced anywhere, then proceed accordingly.

Actions:
- Grep for Mapbox usage (`mapbox` in src/, env vars, package.json deps).
- If not used: document the decision in `docs/hardening/phase1/mapbox-url-restrictions.md` as N/A and pivot to Google Maps API key restrictions instead (same risk class, real surface).
- If used: document founder dashboard steps to restrict the public token to `eventlinqs.com`, `www.eventlinqs.com`, `*.vercel.app`.
- Either way: produce a token-scoping audit covering both Mapbox and Google Maps tokens.

Success criteria:
- Audit doc landed.
- For each public-side map token: documented restriction in place (or N/A with reason).

### D - Database type generation automation

Current: `src/types/database.ts` is 553 lines of hand-written TS interfaces. High schema drift risk - any column rename or new column requires manual editing or risks runtime/type mismatch.

Target: generated `src/types/database.ts` from `npx supabase gen types typescript --linked`, plus a thin extension file for any project-specific composed types that the generator does not produce.

Actions:
- Run `npx supabase gen types typescript --linked > /tmp/generated-database.ts` in a sandbox.
- Diff against current hand-written file to identify: (a) interfaces that are pure 1:1 with tables (will be replaced), (b) extension types like `UserRole`, `OrgStatus` enums that come from PG enum types and should also generate, (c) compound types unique to feature code that need to live in a sibling file.
- Replace `src/types/database.ts` with generated output.
- Move any retained extension types to `src/types/database-extensions.ts`.
- Add npm script: `"db:types": "supabase gen types typescript --linked > src/types/database.ts"`.
- Add CI check: a script that runs `db:types`, diffs against committed `src/types/database.ts`, fails CI if a mismatch exists. Lives in `scripts/db-types-drift-check.mjs`.

Coordination: SHARED FILE per CLAUDE.md. Must commit with `[SHARED]` prefix. STOP after this commit until project manager confirms no Session 1 conflict (Session 1 is mid-stream on M6 Phase 3 destination charges and may be adding tables).

Success criteria:
- `npm run db:types` produces zero diff against committed file (after the migration commit).
- All consuming code in src/ continues to typecheck (`npx tsc --noEmit` clean).
- CI drift script lands and runs as part of pre-build or pre-commit.

### E - Schema drift reconciliation

Current: per memory, migration `20260419000001_add_saved_events.sql` was on disk but never applied to prod. NOTE: that migration is not on disk now - either it was renamed or memory is stale. Treat as audit input, verify against ground truth.

Also per memory: seed migration `20260414000001` showed partial application (13 events in prod vs 8 expected).

Actions:
- Run `npx supabase migration list --linked` to enumerate remote applied migrations.
- Cross-reference against `supabase/migrations/` on disk.
- Investigate the 8-vs-13 events discrepancy in the seed migration.
- Document findings in `docs/hardening/phase1/migration-drift-audit.md`.
- Repair: apply any missing migrations (if any). Do NOT modify migrations that are already applied. If a discrepancy is data-only, write a corrective migration with a 2026-05-02 timestamp.
- Coordination: any migration that is in payment territory (organisations.* stripe columns, payment_intents, etc.) is OFF-LIMITS to this session per CLAUDE.md. Flag to Session 1 via [COORDINATION] in progress.log and stop the migration work for those rows specifically.

Success criteria:
- Audit doc shows local-vs-remote parity.
- Any data-state discrepancies either repaired or filed as a follow-up with explicit Session 1 / project manager handoff.

### F - Sentry observability setup

Current: no Sentry. No structured error tracking in the codebase except `console.error` in webhook handlers and a few critical paths.

Target: `@sentry/nextjs` wired across server (API routes, server components, server actions) and client (error boundaries, top-level layout). Stripe webhook errors, auth failures, payment errors all reach Sentry within 30s. Zero PII in error reports.

Actions:
- Document founder action to provision Sentry project, capture DSN, store as `SENTRY_DSN`. `docs/hardening/phase1/sentry-setup.md`.
- Install `@sentry/nextjs` as a dependency. SHARED `package.json` change - commit with `[SHARED]` prefix. STOP afterwards until project manager confirms no merge conflict with Session 1 / Session 3.
- Configure `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` in repo root per Next 16 + Sentry SDK conventions.
- Create `src/lib/observability/sentry.ts` wrapping init logic and PII scrubbing helpers.
- Add `beforeSend` PII scrubber that redacts: email addresses (regex), phone numbers (regex), Stripe customer IDs (regex), Stripe payment intent IDs (regex), JWT tokens, Authorization headers, cookies.
- Add Sentry release version (Vercel build commit SHA via `VERCEL_GIT_COMMIT_SHA`).
- Add environment tag (production / preview / development per `VERCEL_ENV`).
- Wire root error boundary (`src/app/error.tsx` and any nested error boundaries) to report to Sentry.
- Smoke test: synthetic `/api/_health/sentry-error` route that throws; verify it appears in Sentry within 30s with no PII.

Success criteria:
- Founder action doc accepted (provisioned).
- Synthetic error appears in Sentry within 30s, with PII scrubbed.
- All quality gates green (lint, tsc, build, test).

### G - Rate limiting on critical endpoints

Current: `src/lib/redis/rate-limit.ts` exists with a fixed-window limiter, fails open. Whether it is wired into any actual route is unverified - audit step required.

Target: every public mutating endpoint and every auth endpoint has appropriate rate limits, returns HTTP 429 with `Retry-After` header on overflow. Audit table documents every protected route and its limit.

Limits (per scope):
- `/api/auth/*` and any auth-related server actions: 5 attempts per IP per minute
- `/api/checkout/*` and reservation actions: 20 per IP per minute (account for legit retries)
- `/api/stripe/connect/*`: 5 per organiser per hour
- `/api/contact`: 3 per IP per hour
- Default fallback (any other public mutating route): 100 per IP per minute

Actions:
- Audit current consumer call sites of `checkRateLimit()` in src/.
- Build a thin `withRateLimit` helper in `src/lib/redis/rate-limit-middleware.ts` that wraps a route handler and applies the rule from a route-keyed config.
- Wire to all owned-or-shared routes within scope. Auth and checkout routes belong to other sessions - DO NOT EDIT them. Instead: produce a written handoff in `docs/hardening/phase1/rate-limit-handoff.md` listing every route that needs the wrapper, the chosen rule, and the exact diff to apply. Session 1 (auth/checkout) will apply.
- Document config in `docs/hardening/phase1/rate-limit-config.md`.
- Depends on A: rate limiting must hit the new Sydney Redis to avoid trans-Pacific RTT on every request.

Success criteria:
- Every owned route protected.
- Handoff doc lists every cross-session route with exact diff.
- HTTP 429 + `Retry-After` smoke-tested on at least one owned route.
- Config doc lists every route, its rule, and the rationale.

## Quality gates (every commit, no exceptions)

- npm run lint - zero new errors. The pre-existing site-header-client error is acknowledged out-of-scope.
- npx tsc --noEmit - clean.
- npm run build - success.
- npm test - 3/3 passing (the M6 Phase 2 vitest suite must keep passing).
- git status - no stray artifacts (per E rule in BUILD-STANDARDS.md).

## Documentation discipline

Every deliverable produces:
- Founder action doc (where applicable) at `docs/hardening/phase1/{deliverable}-setup.md`
- Audit/findings doc at `docs/hardening/phase1/{deliverable}-audit.md` or `-runbook.md`
- Progress log entry in `docs/sessions/hardening/progress.log` after every meaningful commit, prefixed with `[A]`, `[B]`, ..., `[G]` for tracebility

Phase closure produces:
- `docs/hardening/phase1/closure-report.md`
- `[GATE] Phase 1 complete, awaiting approval` in progress.log
- STOP

## Coordination flags

This session must STOP and post `[COORDINATION]` to progress.log when:
- A SHARED file is being committed (src/types/database.ts, package.json, next.config.ts, CLAUDE.md, docs/MEDIA-ARCHITECTURE.md, docs/DESIGN-SYSTEM.md)
- A founder action is required and there is no other unblocked work
- A migration touches payment-territory schema (off-limits per CLAUDE.md)
- A rate-limit handoff has been prepared for Session 1's owned routes

## Hard rules (per CLAUDE.md and methodology)

- NO em-dashes
- NO en-dashes
- NO exclamation marks in user-facing copy
- NO co-authorship attribution in commits
- NO scope creep into another session's owned files
- NO "deferred" without project manager sign-off
- Australian English (-ise, -our, -re)
- All schema changes via `npx supabase db push --linked` only
- Never use Supabase Dashboard SQL editor or MCP `apply_migration` for schema
- All payment-related code is OFF-LIMITS

## Risk register (Phase 1 specific)

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Founder unavailable to provision Upstash Sydney | Medium | High (blocks G, blocks Phase 2 load tests) | Document so a 30-min slot any time unblocks. Continue B/C/D/E/F in parallel. |
| Supabase generated types break feature code | Medium | Medium | Stage in /tmp first, diff, fix consumers in same commit |
| Migration 20260419000001 not on disk | High | Low | Treat memory as stale, audit ground truth via `supabase migration list --linked` |
| Sentry SDK conflicts with Next 16.2.2 | Low | Medium | Read official Sentry docs first; pin to compatible version |
| @sentry/nextjs adds bundle weight | Medium | Low | Verify production bundle size; tree-shake browser SDK init |
| Rate-limit handoff for cross-session routes is rejected by Session 1 | Low | Medium | Write the diff so it is mechanical; provide a rollback note |

## Open questions to surface before starting

None blocking. Phase begins.
