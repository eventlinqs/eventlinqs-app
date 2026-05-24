# Sentry observability audit - 2026-05-24

Audit performed as part of the post-PR #34 hardening pass (PR 3 of three follow-ups closing the React #185 retrospective items).

> **STATUS: SDK INSTALLED (2026-05-24).** Closed by PR #41 (`feat/sentry-sdk-install`, merge commit `0ca9ab1`, deployed as `dpl_3i35hyR99cGzGnoiZDE3aL2rpcjU`). See the "SDK installation closure" section at the bottom of this doc for the verification trail and the deferred manual round-trip the founder runs at convenience. The original audit narrative below is kept verbatim for the change record.

## Executive summary (audit as written 2026-05-24, pre-PR #41)

**The Sentry SDK is not installed.** The error-boundary scaffold (`error.tsx`, `global-error.tsx`, the shim at `src/lib/observability/sentry.ts`) is wired correctly but every `captureException` call routes through a no-op shim in production. Events do not reach the Sentry ingest endpoint regardless of whether `NEXT_PUBLIC_SENTRY_DSN` is configured.

The shim's `isSentryEnabled()` returns `true` whenever DSN is set and `NODE_ENV === 'production'`, which can produce a false-positive read from `/api/health/sentry-error` (the response says `sentryEnabled: true` while no events are actually sent). Treat that endpoint's response as a configuration check, not a delivery check, until the SDK lands.

**Why this matters.** The bug class that produced PR #34 (client-side React errors that surface only after hydration) is exactly the class Sentry is meant to catch. Today, that signal is invisible in production until a user reports it. The 2026-05-24 incident reached the founder's browser before any monitoring fired.

## What this audit checked

| Asset | Expected | Actual | Status |
| - | - | - | - |
| `@sentry/nextjs` in `package.json` dependencies | present | absent | MISSING |
| `node_modules/@sentry/*` | includes `@sentry/nextjs` and `@sentry/react` | only transitive `core`, `node`, `node-core`, `opentelemetry` (pulled by Next.js telemetry, not by an EventLinqs install) | MISSING |
| `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` at repo root | present | absent | MISSING |
| `instrumentation.ts` registering `Sentry.init` | present | absent | MISSING |
| `next.config.ts` wrapped with `withSentryConfig` | present | absent (only `withBundleAnalyzer`) | MISSING |
| `src/lib/observability/sentry.ts` (shim) | present | present | PRESENT |
| `src/lib/observability/pii-scrub.ts` + tests | present | present, 17 tests passing | PRESENT |
| `src/app/error.tsx` calls `captureException` | yes | yes (line 25) | PRESENT |
| `src/app/global-error.tsx` calls `captureException` | yes | yes (line 19) | PRESENT |
| `src/app/api/health/sentry-error/route.ts` synthetic endpoint | present, token-gated | present, token-gated | PRESENT |
| `.env.example` declares Sentry env vars | yes | yes (lines 74-77) | PRESENT |
| Custom in-tree `ErrorBoundary` class components | none expected | none found via `grep -r 'class.*ErrorBoundary'` | n/a |

## Why the SDK is not installed

Session 2's `docs/hardening/phase1/sentry-setup.md` (the document that produced the scaffold above) explicitly defers the SDK install as a coordination boundary:

> Status: AWAITING FOUNDER ACTION (Sentry project + DSN) and SHARED package install
>
> Founder action 4: tell me you are done. Reply: "Sentry env set." I will then commit the SHARED package install:
> ```bash
> npm install @sentry/nextjs
> ```

`package.json`, `package-lock.json`, and `next.config.ts` are listed as SHARED files in `CLAUDE.md`. Modifying them requires the partner Claude (project manager) to coordinate across the three parallel sessions. The install was deliberately not made unilaterally.

## What the shim does today

`src/lib/observability/sentry.ts`:

```ts
const enabled = Boolean(dsn) && process.env.NODE_ENV === 'production'

export function captureException(error, context) {
  const scrubbedContext = context ? scrubValue(context) : undefined
  if (!enabled) {
    if (isDev) {
      console.error('[observability] captureException', error, scrubbedContext)
    }
    return
  }
  // Forward to @sentry/nextjs once installed. Until then this is a noop
  // in production so missing DSN never crashes the app.
}
```

- In development: prints to `console.error` (the developer sees errors locally).
- In production with DSN set: silent no-op (the `if (!enabled) return` is bypassed and there is no code in the success branch).
- In production without DSN: silent no-op.

The intent was that the shim's signature stays stable so error-boundary code does not need to change when the SDK lands. That part is sound. The gap is that "when the SDK lands" has not happened.

## What needs to change for Sentry to actually capture

Strictly limited to what is needed to make events flow. Aligned with the existing `docs/hardening/phase1/sentry-setup.md` plan so this audit's recommendations and Session 2's plan converge.

### A. SHARED commit 1: install the SDK

```bash
npm install @sentry/nextjs
```

Touches `package.json` + `package-lock.json`. SHARED per `CLAUDE.md`. Owner: partner Claude (project manager) coordinating across sessions.

### B. SHARED commit 2: wrap `next.config.ts` with `withSentryConfig`

Touches `next.config.ts` (already wrapped with `withBundleAnalyzer`; needs an outer `withSentryConfig` wrap). SHARED per `CLAUDE.md`. Owner: partner Claude.

### C. Replace the shim no-op with real `Sentry.captureException`

Touches `src/lib/observability/sentry.ts` only. Not SHARED. Can be done in the same SHARED PR or a follow-up.

### D. Add the three config files

`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`. New files at repo root. Not SHARED. Recommended settings beyond Session 2's defaults:

| Setting | Value | Rationale |
| - | - | - |
| `tracesSampleRate` | `0.1` | 10% transaction sampling. Cost discipline for v1; revisit post-launch. |
| `replaysSessionSampleRate` | `0` | Random session replay is disabled; cost + privacy. |
| `replaysOnErrorSampleRate` | `1.0` | Capture session replay on every error. This is the high-value debugging signal that would have made the 2026-05-24 incident a 30-second triage rather than a 2-hour forensic exercise. |
| `tunnelRoute` | `'/api/monitoring'` | Bypass ad-blockers that strip ingest requests to third-party domains. |
| `beforeSend` | wired to `scrubValue` from `src/lib/observability/pii-scrub.ts`, plus filters dropping `ResizeObserver loop limit exceeded`, `AbortError` from user navigation, and any error whose top stack frame originates from `chrome-extension://` or `moz-extension://` | The PII scrub is mandatory per the 17-test suite at `tests/unit/observability/pii-scrub.test.ts`. The extra filters cut noise. |

### E. Add `instrumentation.ts`

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
```

Per Next.js 16's instrumentation hook convention. Not SHARED.

## What this audit deliberately did NOT do

- Did not install `@sentry/nextjs`. The founder's PR 3 spec said "Do NOT reinstall Sentry from scratch", and CLAUDE.md flags `package.json` and `next.config.ts` as SHARED files requiring project-manager coordination. Both reasons converge: hold the install for the partner Claude.
- Did not write the three `sentry.*.config.ts` files. They would be dead weight without the SDK; shipping config without the runtime that consumes it adds noise.
- Did not write `instrumentation.ts`. Same rationale.
- Did not create a `/sentry-test` route. The existing `/api/health/sentry-error` already serves this role with token-gated access; duplicating it would add a second uncontrolled vector.
- Did not modify the existing `src/lib/observability/sentry.ts` shim. The TODO branch is correct shape; only the body needs filling in when the SDK lands.

## What this audit DID do

- Wrote this report (`docs/observability/sentry-audit-2026-05-24.md`).
- Wrote `docs/observability/sentry-alerts.md` documenting the dashboard alert rules the founder should configure in Sentry (independent of SDK install state; the founder does this in the Sentry UI, not the codebase).

## Verification commands (rerun later to confirm closure)

After the SHARED install lands:

```bash
# Confirm SDK is installed
npm ls @sentry/nextjs

# Confirm wrapper applied
grep -n withSentryConfig next.config.ts

# Confirm config files exist
ls sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts instrumentation.ts

# Confirm build passes (source maps upload here)
npm run build

# Confirm event reaches Sentry
curl "https://<preview-host>/api/health/sentry-error?token=<HEALTH_CHECK_TOKEN>"
# Expected: 200 with sentryEnabled: true
# Then within ~30s, an event tagged synthetic=true appears in the
# eventlinqs-web project in the Sentry dashboard.
```

The last command's "appears in Sentry dashboard" is the single verification gate that proves end-to-end capture works. Today that gate cannot be cleared regardless of DSN state, because the shim silently drops the event.

## Recommended next action

Route to partner Claude (project manager). The work has been scoped, documented, and is ready to execute as a SHARED PR. Estimated wall time once unblocked: 30 minutes (npm install, three config files, instrumentation.ts, swap shim, smoke via `/api/health/sentry-error`).

---

## SDK installation closure (2026-05-24, post-PR #41)

Status when this section was added: **SDK INSTALLED.**

PR #41 (`feat/sentry-sdk-install`, merge commit `0ca9ab1`, merged 2026-05-24 21:43 AEST) closes the gap surfaced above. Deployed as Vercel deployment `dpl_3i35hyR99cGzGnoiZDE3aL2rpcjU`.

### What landed

| Asset | New status (after PR #41) |
| - | - |
| `@sentry/nextjs` in `package.json` | PRESENT - version `^10.53.1` |
| `node_modules/@sentry/nextjs` | PRESENT, plus the SDK's full transitive tree |
| `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` | PRESENT at repo root, with `beforeSend` wired to `scrubValue` from `pii-scrub.ts` |
| `instrumentation.ts` registering `Sentry.init` via runtime-conditional dynamic imports | PRESENT |
| `instrumentation-client.ts` Next.js 15.3+ client init hook | PRESENT |
| `next.config.ts` wrapped with `withSentryConfig` | PRESENT, with the wrap gated behind DSN presence at build time so CI builds (which deliberately have no Sentry env) stay un-Sentry-wrapped |
| `src/lib/observability/sentry.ts` shim | UPDATED - forwards to `Sentry.captureException` / `Sentry.captureMessage` when `Sentry.isInitialized()` is true; dev-mode `console.error` fallback preserved |

### Sentry config defaults that landed

| Setting | Value | Where |
| - | - | - |
| `tracesSampleRate` | `0.1` | client + server + edge |
| `profilesSampleRate` | `0.1` | server only |
| `replaysSessionSampleRate` | `0` | client |
| `replaysOnErrorSampleRate` | `1.0` | client |
| `replayIntegration` with `maskAllText: false, blockAllMedia: false` | enabled | client |
| `tunnelRoute` | `/api/monitoring` | webpack plugin options |
| `beforeSend` filtering ResizeObserver loops, AbortError, browser-extension origins | enabled | client |
| `beforeSend` + `beforeSendTransaction` PII scrub via `scrubValue` | enabled | client + server + edge |

### Verification trail (indirect signals - direct round-trip deferred)

What was verified at merge time without the `HEALTH_CHECK_TOKEN` round-trip:

- New deployment `dpl_3i35hyR99cGzGnoiZDE3aL2rpcjU` live on Vercel within 60s of merge.
- `https://www.eventlinqs.com/` and other public routes serve normally (no regression from the SDK wrap).
- `/api/health/sentry-error` returns `HTTP 401 {"ok":false,"error":"unauthorized"}` to anonymous and wrong-token requests, confirming `HEALTH_CHECK_TOKEN` IS set in Vercel Production (the endpoint moved past the `if (!token)` 503 branch).
- `package.json` records `@sentry/nextjs ^10.53.1` and `package-lock.json` has the resolved tree.
- Local prod build with DSN-set successfully ran the Sentry webpack plugin (replayed at `0ca9ab1`).
- Pre-merge gates green: `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (192/192), `npm run build`, `npx playwright test tests/e2e/site-header-cookie-snapshot.spec.ts` (4/4).
- Pre-existing Lighthouse mobile CI failure tracked separately as issue #43; PR #41 merged under one-time founder-authorised admin override because the failure was verifiably pre-existing (38 of 40 recent Lighthouse runs failed before this PR existed). PR #40 is the active work-stream taking that gate green.

### Deferred manual founder verification

The single check that proves end-to-end event delivery is the synthetic-error round-trip. Token-gated so it cannot be run from this agent's session. Founder runs at convenience:

```bash
curl "https://www.eventlinqs.com/api/health/sentry-error?token=<HEALTH_CHECK_TOKEN>"
```

Expected response:

```json
{ "ok": true, "sentryEnabled": true, "note": "Synthetic error sent to Sentry. ..." }
```

Then within ~30 seconds, an event tagged `synthetic=true` appears in the Sentry `javascript-nextjs` project at https://sentry.io/organizations/eventlinqs/issues/?project=4511144328101888 .

If `sentryEnabled` reads `true` but no event lands, the most likely cause is `NEXT_PUBLIC_SENTRY_DSN` differing from what Sentry expects (key rotated, project moved). If `sentryEnabled` reads `false`, the SDK did not initialise at runtime - check the Vercel build log for the Sentry plugin's "Created release" line or "No auth token provided" warnings.

### Follow-up still open

- Configure the dashboard alert rules documented in `docs/observability/sentry-alerts.md`.
- Add `SENTRY_AUTH_TOKEN` to Vercel Production if not already set. Without it, source maps do not upload and Sentry stack traces will show minified function names (`rh`, `rp`, ...) instead of resolved frames. Token is created at `https://sentry.io/settings/account/api/auth-tokens/` with `project:releases` + `org:read` scopes.
- Issue #43 tracks the Lighthouse mobile gate regression that PR #41 merged around.
