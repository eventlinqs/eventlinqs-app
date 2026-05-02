# Sentry observability setup - founder action and codebase prep

Status: AWAITING FOUNDER ACTION (Sentry project + DSN) and SHARED package install
Owner: Lawal Adams (Sentry project), hardening session (codebase wiring)
Estimated time: 25 minutes (founder steps) + 1 SHARED commit (install)

## Why Sentry, why now

Phase 1 production cutover means real organisers, real money, real legal exposure. Without server-side error capture, regressions are invisible until a customer reports them. Sentry gives:

- Stack-trace level visibility on unhandled errors (server, client, edge)
- Per-release error rate trend
- Cohort grouping (by route, by user, by tag)
- Performance traces (off by default; we will enable later)

PII risk is real. Stack traces routinely contain emails, Stripe ids, JWTs, UUIDs. We mitigate via a `beforeSend` PII scrubber (already written - see `src/lib/observability/pii-scrub.ts`). A unit test suite verifies the scrubber against real-shape inputs (`tests/unit/observability/pii-scrub.test.ts`, 17 tests passing).

## What is already in the codebase (this session)

| File | Purpose |
| --- | --- |
| `src/lib/observability/pii-scrub.ts` | PII redaction patterns. Pure module, no Sentry dep. |
| `src/lib/observability/sentry.ts` | Stable shim - `captureException`, `captureMessage`. Console fallback until SDK installed. |
| `src/app/error.tsx` | App Router error boundary. Calls `captureException` on mount. |
| `src/app/global-error.tsx` | Root-layout error boundary (self-contained, inline styles). |
| `src/app/api/health/sentry-error/route.ts` | Token-gated synthetic error endpoint for end-to-end verification. |
| `tests/unit/observability/pii-scrub.test.ts` | Unit coverage for the PII scrubber. |
| `.env.example` | Sentry env var block (added in deliverable A). |

When `@sentry/nextjs` is installed (a SHARED commit), the shim's no-op branches will be replaced with real `Sentry.captureException` calls. The function signatures stay the same so downstream code does not move.

## Founder action 1: create the Sentry project

1. Go to https://sentry.io/signup/ if no account yet, or https://sentry.io/auth/login/
2. Create an organisation `eventlinqs` if not already present.
3. Create a project:
   - Platform: Next.js
   - Project name: `eventlinqs-web`
   - Alert frequency: "On every new issue"
4. Copy the DSN that Sentry shows. It looks like:
   ```
   https://abc123def456@o1234567.ingest.sentry.io/8901234
   ```

## Founder action 2: create an auth token (for source-map upload at build time)

1. https://sentry.io/settings/account/api/auth-tokens/
2. New token. Scopes: `project:releases`, `org:read`, `project:write`.
3. Copy the token. It starts with `sntrys_`.

## Founder action 3: set Vercel env vars

In Vercel dashboard > Project: eventlinqs-app > Settings > Environment Variables, add the following four vars to Production AND Preview AND Development:

| Name | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN from Action 1 | Browser-exposed by design - DSNs are public-by-design at Sentry. |
| `SENTRY_AUTH_TOKEN` | Token from Action 2 | Build-time only. Tick "Sensitive". |
| `SENTRY_ORG` | `eventlinqs` | The org slug. |
| `SENTRY_PROJECT` | `eventlinqs-web` | The project slug. |

Also add a fifth env var, used by the synthetic-error health endpoint:

| Name | Value | Notes |
| --- | --- | --- |
| `HEALTH_CHECK_TOKEN` | A 32+ char random hex string (e.g. `openssl rand -hex 32`) | Sensitive. Required for `/api/health/sentry-error` to fire. |

After saving, run from the worktree:

```powershell
npx vercel env pull .env.local
```

(or paste manually into `.env.local` if `vercel` CLI is not available - per top of session, it is not installed globally).

## Founder action 4: tell me you are done

Reply: "Sentry env set." I will then commit the SHARED package install:

```bash
npm install @sentry/nextjs
git add package.json package-lock.json
git commit -m "[SHARED] chore(deps): add @sentry/nextjs for hardening F"
```

After install I will:

1. Replace the `captureException` / `captureMessage` no-op branches in `src/lib/observability/sentry.ts` with `Sentry.captureException` / `Sentry.captureMessage`.
2. Add `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` with `beforeSend` wired to `scrubValue` from `pii-scrub.ts`.
3. Add `instrumentation.ts` registering `Sentry.init` per Next.js 16 conventions.
4. Wrap `next.config.ts` with `withSentryConfig` (SHARED change, separate commit).
5. Verify build: `npm run build` succeeds and source maps upload to Sentry.
6. Trigger the synthetic endpoint:
   ```bash
   curl "https://<preview-url>/api/health/sentry-error?token=<HEALTH_CHECK_TOKEN>"
   ```
   Expect 200 + Sentry event tagged `synthetic=true` within 30s.

## SHARED commit conventions (this deliverable touches them)

Two SHARED commits will be needed for full F closure:

1. `[SHARED] chore(deps): add @sentry/nextjs` - touches `package.json`, `package-lock.json`.
2. `[SHARED] feat(observability): wire Sentry into next.config.ts via withSentryConfig` - touches `next.config.ts`.

Both will be made as separate commits with `[SHARED]` prefix per CLAUDE.md, and pushed immediately. The session pauses on F until partner Claude (project manager) confirms no conflict with concurrent Session 1 / Session 3 work.

## PII scrub policy (what the scrubber catches)

| Pattern | Replacement |
| --- | --- |
| Email addresses (`*@*.*`) | `[scrubbed]` |
| Phone numbers (AU + E.164 + general) | `[scrubbed]` |
| Stripe ids (`cus_`, `pi_`, `ch_`, `sub_`, etc.) | `<prefix>_[scrubbed]` (prefix kept for triage) |
| JWT tokens (`eyJ*.*.* `) | `[scrubbed]` |
| Bearer tokens | `Bearer [scrubbed]` |
| Credit-card-shaped digit blocks | `[scrubbed]` |
| UUIDs | `<first-8-chars>-[scrubbed]` (8 chars retained for cross-event correlation) |
| Headers `authorization`, `cookie`, `set-cookie`, `x-supabase-auth`, `stripe-signature` | dropped entirely |

Pattern order is intentional: shape-specific patterns (JWT, Stripe id, UUID) run before greedy numeric patterns (PHONE, CARD) to prevent a UUID's digit-heavy tail being chewed by the phone-number heuristic. See unit tests for adversarial examples.

## Verification gates for closure

- `npm run lint` clean
- `npm run typecheck` clean
- `npm run build` clean (after SHARED install)
- `npx vitest run tests/unit/observability` 17/17 passing
- Synthetic error endpoint returns 200 with `sentryEnabled: true` (after SHARED install + DSN set)
- A Sentry event tagged `synthetic=true` appears in the project within 60s of hitting the endpoint
- Manual test: throw inside a server component, verify it is captured and PII-scrubbed in the Sentry event

## What this session does NOT touch in F

- Performance tracing (`tracesSampleRate`) - off for v1, evaluate post-launch
- Session replay - off for v1 (privacy + bandwidth cost)
- Source map upload to a non-Sentry CDN - not needed
- User feedback widget - not in v1
- Distributed tracing across Stripe / Supabase - cross-session boundary, defer to Phase 4

## References

- Next.js + Sentry: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- Sentry beforeSend: https://docs.sentry.io/platforms/javascript/configuration/filtering/
- DSN security model: https://docs.sentry.io/concepts/key-terms/dsn-explainer/
