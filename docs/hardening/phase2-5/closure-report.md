# Phase 2.5 closure - Vercel Sydney + Preview Supabase

**Date:** 2026-05-04
**Branch:** `feat/hardening-phase2-5-vercel-sydney-preview-supabase`
**Phase 2 findings resolved:** P2-1 (Vercel region), P2-3 (Preview
Supabase). P2-4 (observability) and Phase 2 D-failure (Upstash Sydney
latency confirmation) staged for post-merge close.

## Deliverables

| ID | Deliverable | State | Doc |
| --- | --- | --- | --- |
| A | Vercel function region -> syd1 | code merged, verification post-deploy | [vercel-region-migration.md](./vercel-region-migration.md) |
| B | Preview Supabase resolver + founder plan | code + tests merged | [preview-supabase-setup.md](./preview-supabase-setup.md) |
| C | Sentry observability validation | gap report; SDK install queued [SHARED] | [sentry-observability-report.md](./sentry-observability-report.md) |
| D | Upstash Sydney verification under load | baseline captured; protocol staged | [upstash-sydney-verification.md](./upstash-sydney-verification.md) |

## Commits

| SHA | Subject |
| --- | --- |
| `54c90fb` | feat(infra): pin Vercel function region to syd1 |
| `c3d6bbe` | feat(supabase): preview-env resolver with presence-based discriminator |
| `805a507` | docs(phase2-5): observability gap report + Upstash Sydney verification plan |
| `adf4e95` | docs(sessions/hardening): log phase 2.5 batch + [GATE] OPEN |

Four commits, no [SHARED] file changes, no scope creep into Sessions
1 or 3 file ownership.

## Gates

| Gate | Result |
| --- | --- |
| `npm run lint -- --max-warnings=0` | clean (0 errors, 0 warnings) |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 110/110 passing (5 new env-resolver tests) |
| Build | verified against `.env.local` earlier in session |

## What changed

### Code (3 files)

- `vercel.json`: top-level `"regions": ["syd1"]` added. All Vercel
  Functions (including middleware) deploy to ap-southeast-2.
- `src/lib/supabase/env.ts` (new, 32 LOC): resolver functions
  `getSupabaseUrl`, `getSupabaseAnonKey`, `getSupabaseServiceRoleKey`,
  `isUsingPreviewSupabase`. Picks `*_PREVIEW` env vars when present,
  falls back to base.
- `src/lib/supabase/{client,server,public-client,admin,middleware}.ts`:
  every call site now imports from `./env` instead of reading
  `process.env` directly.

### Tests (1 file, 5 tests added)

- `tests/unit/supabase/env.test.ts`: covers the four-cell base/preview
  matrix plus the partial-preview edge case and the service-role-only
  override case. Uses `vi.stubEnv` so tests are isolated.

### Docs (5 files)

- `docs/hardening/phase2-5/vercel-region-migration.md` - rationale,
  verification V1-V5, rollback plan.
- `docs/hardening/phase2-5/preview-supabase-setup.md` - founder
  actions F1-F4 (provision, migrate, set Vercel env, verify) plus
  operational guardrails.
- `docs/hardening/phase2-5/sentry-observability-report.md` - gap
  report on Phase 2 window plus full proposed
  instrumentation/sentry.{server,edge,client}.config to apply when
  the SDK lands.
- `docs/hardening/phase2-5/upstash-sydney-verification.md` -
  pre-merge baseline (p50 ~203 ms) and post-merge protocol D.1-D.3.
- `docs/hardening/phase2-5/closure-report.md` - this file.
- `.env.example`: preview Supabase env block added.

## What remains open

| Item | Owner | Type |
| --- | --- | --- |
| Founder F1-F4: provision preview Supabase project, set Vercel env vars | Lawal | founder action |
| [SHARED] commit installing `@sentry/nextjs` and replacing the shim | PM coordination | shared change |
| Post-merge browse-profile re-run from syd1 to confirm D.1-D.3 | Hardening session | post-merge action |
| Phase 3 cron at `/api/cron/redis-slo` for ongoing latency monitoring | Hardening session | phase 3 |

## Why this PR is small on purpose

The brief asked for verification-grade work, not exploratory work.
Each deliverable maps to one of two outcomes:

1. **Code that takes effect on merge** (A, B). These are minimal,
   reviewable, fail-safe diffs. A is one config line plus its
   migration doc. B is a 32-LOC resolver plus call-site updates plus
   tests; the resolver fails safe if the founder skips F1-F4.

2. **Verification artefacts that document what to check**
   post-merge or post-action (C, D). These are docs, not code, because
   the verification cannot be performed inside this PR - C blocks on
   a [SHARED] install, D blocks on this PR deploying to syd1.

This split keeps the PR auditable and keeps the post-merge protocol
explicit. The next hardening session resumes by executing the
post-merge actions documented here.

## [GATE] PHASE 2.5 OPEN

PR ready for partner Claude review. No further work in this session
until project-manager approval lands.
