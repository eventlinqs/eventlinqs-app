# Phase 2.5 deliverable B - preview Supabase project setup

**Date:** 2026-05-04
**Status:** code change landed on branch (presence-based resolver),
            awaiting founder action to provision the preview project
**Owner:** Session 2 (hardening) wires code, founder provisions backend
**Related:** Phase 2 closure report finding **P2-3**

## Why

Phase 2 load testing skipped two of the three planned profiles
(`checkout` and `organiser`) because there is currently a single
Supabase project (`gndnldyfudbytbboxesk`, "EventLinqs production")
backing both production and Vercel preview deployments.

Running checkout writes against a production database is unacceptable:
load-test reservations would pollute real organiser dashboards, real
analytics, real payout reconciliation. Running organiser-profile load
against production would create thousands of synthetic
organisations / users / events visible in real admin queues.

Phase 2 therefore documented this as a hard gate and ran only the
read-only browse profile.

For Phase 2.5 onward, we want a separate **preview project** that:

1. Carries the same migration history as production (same schemas, same
   RLS, same seeds).
2. Is provisioned in **ap-southeast-2 (Sydney)** so latency
   characteristics match the production environment we are exercising.
3. Is wired to Vercel's `preview` env so PR deploys, branch deploys,
   and `vercel dev` against `--target preview` automatically resolve to
   it without code changes.
4. Falls back gracefully to production when preview is not provisioned
   yet (so half-configured deployments do not 500).

Phase 2 deliverables (Vercel region + preview Supabase) were tracked
as P2-1 and P2-3 respectively.

## What this PR ships (code-side)

### `src/lib/supabase/env.ts` (new)

A small dependency-free resolver that picks credentials from base or
preview env vars. All four Supabase client modules
(`client.ts`, `server.ts`, `public-client.ts`, `admin.ts`,
plus `middleware.ts`) now import from this resolver:

```ts
import { getSupabaseUrl, getSupabaseAnonKey } from './env'
```

Behaviour:

| `*_PREVIEW` set? | base set? | resolver returns |
| --- | --- | --- |
| no | yes | base |
| yes | yes | preview |
| yes | no | preview |
| no | no | empty string (existing failure mode preserved) |

The discriminator is the **presence** of the `*_PREVIEW` env var, not
`VERCEL_ENV`. Rationale:

- `NEXT_PUBLIC_*` values get inlined into the client bundle at *build*
  time. A presence check at build time is deterministic.
- It fails safe: if the founder forgets to provision the preview
  project, preview deploys keep working against production rather
  than break. We surface a deliberate `isUsingPreviewSupabase()`
  signal that ops can log to detect this regression.

Tests in `tests/unit/supabase/env.test.ts` cover all four matrix cells
plus the partial-preview "founder forgot the anon key" edge case.

### `.env.example` (updated)

Documents the new preview vars under the existing Supabase block.

## What founder must do

These are out-of-band actions in the Supabase + Vercel dashboards.

### F1. Provision the preview Supabase project

1. Sign in to <https://supabase.com/dashboard>.
2. **New Project** -> region **Sydney (ap-southeast-2)** ->
   name **eventlinqs-preview** -> generate strong DB password (store
   in 1Password / vault) -> create.
3. Wait ~2 minutes for provisioning.
4. From the new project's settings, capture:
   - Project URL: `https://<new-ref>.supabase.co`
   - anon (public) key
   - service_role (secret) key
   - DB connection string

Cost: same plan as production (Pro $25/mo) recommended so traffic
shape matches. Free tier suffices for a smoke run if budget pressure
exists, with the caveat that the free tier auto-pauses after 7 days
idle and PostgREST request caps differ.

### F2. Migrate schema + seed

From this repo, on a clean branch off `main`, link to the preview
project and push migrations:

```bash
# IMPORTANT: this opens a new linked project. Do not run from a
# session that has the production project still linked or migrations
# may target the wrong DB. The link state is local to ./supabase/.
npx supabase login
npx supabase link --project-ref <preview-ref>
npx supabase db push --linked
```

The `npx supabase db push --linked` invocation replays every
migration in `supabase/migrations/` against the preview project in
order. Existing seed migrations
(e.g. `20260426000001_cultural_breadth_seed.sql`) populate cultural
breadth events; that's fine for load tests because the slugs match
the production fixtures.

After push, verify:

```bash
npx supabase migration list --linked
```

Should show every migration as applied.

After verification, **unlink from preview before any other work**:

```bash
npx supabase unlink
```

Otherwise a stray `supabase db push` from another shell would
target preview, not production.

### F3. Set Vercel preview-only env vars

In <https://vercel.com/eventlinqs/eventlinqs-app/settings/environment-variables>:

For **Environment: Preview** ONLY (not Production, not Development):

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL_PREVIEW` | `https://<preview-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW` | (preview anon key) |
| `SUPABASE_SERVICE_ROLE_KEY_PREVIEW` | (preview service role key) |

Leave the existing base
(`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`)
in **Production + Preview** as today. Preview deploys end up with both
sets in scope and the resolver picks the preview ones.

The Production environment must NOT have `*_PREVIEW` vars set; if it
does, prod traffic will route to preview Supabase. Verify the env
inheritance scoping carefully.

### F4. Verify

After redeploying the latest preview branch:

1. Hit `https://<preview-deploy>.vercel.app/api/health/redis` -
   should return 200.
2. Hit `https://<preview-deploy>.vercel.app/events` - should render
   without 500. Event count may differ from production (preview
   project starts with whatever seeds the migrations include, not
   the cumulative organic data production has).
3. Confirm in Supabase dashboard that the preview project's
   `auth.users` table grew by ~1 row when a preview signup form
   submission landed.

If preview returns the production event slugs (i.e. preview is silently
aliased to production), the env vars are mis-scoped or the preview
project has been linked instead. Re-check the Vercel env scope.

## Operational guardrails

- **Never share a service role key between production and preview.**
  They must be different keys for different projects.
- **Branch deploys count as preview.** Every PR opens a preview
  deploy that picks up `*_PREVIEW`. This is intentional: load tests
  should never touch production.
- **Stripe keys are independent of this change.** Preview deploys
  should keep using `pk_test_*` Stripe keys (already the case in
  Phase 1). Confusion between Supabase preview and Stripe preview
  is a real foot-gun. Documented separately in the M6 audit.
- **Cron jobs run only on production.** The three crons in
  `vercel.json` are project-level and execute against the production
  deployment, so preview Supabase is never hit by cron writes. No
  action needed.
- **Schema drift will diverge.** Once preview exists, every
  `supabase db push --linked` to production must be mirrored to
  preview to keep the two in sync. Recommend wrapping in a
  `scripts/db-push-both.mjs` helper before the first divergence
  ships. Tracked as a Phase 2.6 followup, not a blocker for this
  deliverable.

## Verification matrix (run after F1-F4 complete)

| Check | Production | Preview |
| --- | --- | --- |
| `/api/health/redis` returns 200 | yes | yes |
| `auth.users` count diverges over a week | yes | yes (preview = synthetic only) |
| Migration list parity | n/a | identical to production |
| `pk_test_*` Stripe key in headers | no (`pk_live_*`) | yes |

## Rollback plan

If the preview project causes an outage on preview deploys, removing
the three Vercel preview env vars reverts the resolver to production
fallback within a single redeploy. Code change is no-op when the env
vars are absent - this is the **fail-safe** point of the
presence-based resolver.

## Followups

- Phase 2.6: schema-drift CI check that runs `db diff` between prod
  and preview on every push, alerts if non-zero.
- Phase 2.6: re-run `tests/load/profiles/checkout.js` and
  `organiser.js` against the preview project once it lands. These
  are the two profiles deferred at Phase 2 closure.
