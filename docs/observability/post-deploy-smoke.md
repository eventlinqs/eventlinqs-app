# Post-deploy smoke

Operator runbook for `.github/workflows/post-deploy-smoke.yml`.

## What it is

A GitHub Actions workflow that runs after every successful CI build on `main` and probes `https://www.eventlinqs.com/` to catch production regressions before the founder or a user does. Born out of the 2026-05-24 React #185 incident (PR #34): a latent bug shipped silently because the build gates were all green and there was no live-environment check. This is the gate that closes that loop.

## What it catches (live, in CI)

| Layer | Technique | Bug class |
| - | - | - |
| HTTP status | curl, anonymous + cookie | 5xx from server-render exception, env var misconfig, broken edge config |
| SSR HTML | curl + grep for "We hit a snag loading this page" / "Minified React error" | Error boundary baked into server-rendered HTML (server-side throws, hydration mismatch errors that surface in error.tsx) |
| Cookie-state regression | curl with `el_city` Melbourne payload set | Anything that fails specifically when a user has previously picked a city via LocationPicker |

The CI gate is curl-only by design (a curl probe finishes inside 10s; a Playwright install plus browser launch adds 90s+ to every push). For a ~10-second smoke that runs after every deploy, curl is the right tool.

## What it does NOT catch (and where to go instead)

The big gap: **client-side React errors**. The 2026-05-24 React #185 incident only surfaced after hydration ran in a real browser; the SSR HTML curl sees was clean. Curl cannot catch that class.

For that, the Playwright regression suite at `tests/e2e/site-header-cookie-snapshot.production.spec.ts` (tagged `@smoke`) provides the browser-side check. Run it manually whenever you need a deeper probe:

```bash
npx playwright test --config=playwright.smoke.config.ts --grep @smoke
```

It runs against the production URL (override with `E2E_BASE_URL`) and asserts the same invariants as the curl smoke plus no React errors on `console.error` or `pageerror`. PR 3 in the post-#34 hardening pass wires Sentry to capture these in production - the smoke + Sentry combo is what makes the live environment observable.

## What it does NOT catch (other categories)

- **Bugs gated behind authenticated routes.** No login is performed.
- **Bugs gated behind specific user data.** The smoke uses anonymous + one cookie state.
- **Performance regressions.** Lighthouse runs in a separate workflow (`.github/workflows/lighthouse.yml`).
- **Visual regressions.** Pre-task 3 visual regression evidence lives under `docs/sprint1/phase-1b/`.
- **Race conditions where the smoke runs before the new Vercel deploy is live.** The workflow has a best-effort 90-second poll-for-new-deployment-id step, but if CI completes faster than Vercel and the deployment-id check is inconclusive, the smoke may run against the previous build. A green smoke in that case is *not* proof the new build is healthy. Manually re-run the workflow from the Actions UI to retest.

## How to read a failure

1. Open the failing run in the Actions tab. The job is `smoke` under workflow `post-deploy smoke`.
2. The failing step name tells you which gate broke:
   - `curl smoke - anonymous`: SSR-level regression visible to anonymous visitors.
   - `curl smoke - el_city cookie set`: regression visible only to users with a city selected via LocationPicker. The cookie payload used is `{"city":"Melbourne","region":"Victoria","country":"AU","source":"picker"}`.
3. Inspect the truncated body dumped to the step log for the offending phrase ("We hit a snag loading this page" or "Minified React error").
4. If you got an alert email at `hello@eventlinqs.com`: same diagnosis path, the email links to the run.
5. For a deeper browser-side probe (which catches client-only errors curl cannot see), run the Playwright regression suite locally: `npx playwright test --config=playwright.smoke.config.ts --grep @smoke`. The `E2E_BASE_URL` env var defaults to the production URL.

## How to fix a failure

The expected flow:

1. Roll back the offending deploy in the Vercel dashboard (Deployments > [...] > Promote to Production on the previous good build). Production is restored within ~30 seconds.
2. Reproduce locally. The Playwright spec file `tests/e2e/site-header-cookie-snapshot.spec.ts` runs against `http://localhost:3000` and uses the exact same assertions.
3. Open a hotfix PR with a regression test plus the fix, following the pattern PR #34 established.
4. After merge, the next CI completion triggers the smoke again automatically.

## How to disable temporarily

For emergency situations only (the smoke is itself misfiring and blocking a known-good deploy):

```bash
# From a local checkout
gh workflow disable post-deploy-smoke
# When ready to re-enable
gh workflow enable post-deploy-smoke
```

Document the disable in the founder's daily log and re-enable within 24 hours. A disabled smoke is a regression-monitoring gap.

## Required secret

Set in `Settings > Secrets and variables > Actions`:

- `RESEND_API_KEY` (optional): only needed for the failure-email step. Without it, the workflow still runs and still surfaces red in the Actions UI. The email step logs a `::warning::` and exits 0 if the secret is absent.

The `from` address in the alert email is `EventLinqs Smoke <noreply@eventlinqs.com>` which is the same verified sender used by transactional emails (refund confirmation). If you change the sender, ensure the domain is verified in Resend.

## Future hardening (not in this PR)

- Replace the deployment-id poll with `repository_dispatch` triggered by a Vercel Deployment Notification webhook. Cleanest signal that a specific deployment is live.
- Add an authenticated-session smoke (login + visit `/account`) once the friends-launch test user is durable.
- Promote the Playwright regression suite (`*.production.spec.ts`) into a separate scheduled workflow (nightly, say) for the cases curl cannot catch, paying the install cost on a slower cadence.
- Sentry alert rules covering the client-side error classes the curl smoke misses (the 2026-05-24 hardening pass PR 3 audits the existing Sentry integration; `docs/observability/sentry-alerts.md` covers the founder-side dashboard configuration).
