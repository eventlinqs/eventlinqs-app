# Post-deploy smoke

Operator runbook for `.github/workflows/post-deploy-smoke.yml`.

## What it is

A GitHub Actions workflow that runs after every production deploy and probes `https://www.eventlinqs.com.au/` to catch production regressions before the founder or a user does. Born out of the 2026-05-24 React #185 incident (PR #34): a latent bug shipped silently because the build gates were all green and there was no live-environment check. This is the gate that closes that loop.

**The checks are not in the workflow file.** Since close-out H2 (8 September 2026) they live in `scripts/verify/post-deploy-smoke.mjs`, which you can run yourself before pushing:

```bash
node scripts/verify/post-deploy-smoke.mjs --url https://www.eventlinqs.com.au --expect-sha <commit> --report smoke-report.json
```

### Why it moved out of the YAML (read this before changing the smoke)

Run 34143506887 on `main` at `9ac4d885` emailed the founder to say production was down. It was not. The whole verdict came from one line of shell:

```
HTTP=$(curl -fsSL ... || echo "curl-failed")
if [ "$HTTP" != "200" ]; then exit 1; fi
```

A single TCP connection was reset, `curl` exited 35, and the gate reported `HTTP=000curl-failed, expected 200`. Four separate faults in one run, all now fixed:

| Fault | What it did | Fixed by |
| - | - | - |
| No retry | One dropped connection declared an outage | Up to four attempts with 5s / 15s / 30s backoff, transport faults only |
| Three faults, one string | A bad status, a dead connection and a timeout all printed the same | Five named outcomes, each with its own sentence |
| Judged the wrong build | The deployment id never changed across six polls, so the run smoked the PREVIOUS build and reported on it | The commit under test is pinned and the run REFUSES if a different one is live |
| The alert was lost | Resend answered 429, `curl -f` discarded the body, the step printed a warning and exited 0 | Two channels, retries that read the reason, and a loud failure if both are silent |

**An answer is never retried.** A 500, a 404 or an error boundary inside a 200 is the product's own reply, and asking again until it changes launders it into a pass. Only transport faults (a dead connection, a timeout) are retried.

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
- ~~Race conditions where the smoke runs before the new Vercel deploy is live.~~ **Closed by H2.3.** The smoke now waits for the commit under test, identified by the `sentry-release=<sha>` marker the build stamps into its own HTML, and REFUSES to judge anything else. If that commit never becomes live inside the budget the run fails saying so, naming the commit it wanted and the commit it saw. A run that could not read the site at all reports BLIND, which is a connection fault and explicitly not evidence the deploy failed.

## How to read a failure

1. Open the failing run in the Actions tab. The job is `smoke` under workflow `post-deploy smoke`.
2. **Read the outcome word, not just the red tick.** The summary block names each check and, for a failure, what that class of failure means:
   - `http-status`: the deployment answered with a status it should not. A real product fault.
   - `body`: it answered 200 with "We hit a snag loading this page" or "Minified React error" in the HTML. A real product fault.
   - `connection`: nothing was ever answered. A network or edge fault, and **not proof the site is down**. This is the class that produced the 7 September false alarm.
   - `timeout`: something was answering, too slowly, and the 30s deadline passed.
   - `wrong-build`: the site answered, and answered well, but from a different commit than the one this run is about. Wait for the deploy, or re-run pinned to the commit that is actually live.
   - `configuration`: the gate is missing an input (usually `CRON_SECRET`). This says nothing about production; it is our fault, and it is still a failure, never a skip.
3. The failing check name tells you which surface: `homepage anonymous`, `homepage with el_city` (cookie `{"city":"Melbourne","region":"Victoria","country":"AU","source":"picker"}`), `payment sentinel`, `platform health sentinel`, or `the deployment under test is live`.
4. Download the run artifact `post-deploy-smoke-<run id>`. It carries `smoke-report.json` (every check, every attempt, every timing) and, when the smoke failed, `transport-probe.json`.
5. **If the outcome was `connection`, read the transport probe.** It runs automatically on failure and asks the question that cannot be asked later: does it reproduce, is the smoke user agent the variable, or is the address. See `scripts/verify/transport-probe.mjs`.
6. You will have been told twice: an email to `hello@eventlinqs.com` and a GitHub issue on this repository. Both link to the run.
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

- `CRON_SECRET` (**required**): the payment sentinel and the platform health sentinel are probed with it. A missing one FAILS the gate, it does not skip. From 2026-07-12 to 2026-07-30 that step warned and exited 0, so production deployed with no sentinel probe at all and the gate reported green every time.
- `RESEND_API_KEY`: alert channel 1. Its absence is reported as a channel failure, not as a skip.

The `from` address in the alert email is `EventLinqs Smoke <noreply@eventlinqs.com>` which is the same verified sender used by transactional emails (refund confirmation). If you change the sender, ensure the domain is verified in Resend.

## The two alert channels (H2.4)

`scripts/ops/alert-dispatch.mjs` raises every alert on two channels that share no rate limit, no vendor and no domain:

1. **Email via Resend.** Resend's documented limit is 10 requests per second per team (<https://resend.com/docs/api-reference/introduction>), and it returns three different 429s: `rate_limit_exceeded` clears in a second and is retried with backoff, while `daily_quota_exceeded` and `monthly_quota_exceeded` do not clear and are reported rather than retried. The old step could not tell them apart because `curl -f` discarded the body.
2. **A GitHub issue on this repository**, opened with the workflow's own token (`issues: write`). Deduplicated by title, so three failing deploys produce one issue with three comments rather than three issues.

If **both** channels fail, the dispatcher exits non-zero and prints `::error::Every alert channel failed`. An alert channel that silently drops is worse than no channel, because it teaches you that silence means healthy.

### The class, and the drill marker (UX4.3, H2.6)

Every dispatch declares a `--class`, and the class writes the subject. A failed smoke reads `EventLinqs OUTAGE: the production homepage smoke FAILED`, which cannot be confused in an inbox with a branch gate doing its job. The full table of four classes is in `docs/observability/state-report.md`.

**A drill announces itself.** The 8 September drill fired correctly against `https://smoke-drill.invalid` and arrived reading "EventLinqs production homepage smoke FAILED", with nothing to say it was a test, and the owner reasonably read it as a real outage. The marker is now **derived from the target**, never from a flag someone has to remember: a host in the reserved `.invalid` domain cannot be a real production smoke (<https://www.rfc-editor.org/rfc/rfc2606.html>). So `force_failure` produces:

```
[DRILL] EventLinqs OUTAGE: the production homepage smoke FAILED
```

with a banner in the first line of the body saying it is a scheduled test, naming the target it used, and stating that no action is required. There is no flag that takes the marker off a `.invalid` target, and a real production URL can never acquire one. `scripts/guards/alert-routing.mjs` executes both of those judgements on every build.

## Machine callers and the network layer (H2.1)

The 7 September reset happened during the TLS handshake, before any header was sent, so nothing that reads an HTTP request can have caused it. This project has no firewall configuration at all, so what remains is Vercel's always-on system mitigation of a shared datacentre address.

That matters beyond the smoke: the same mechanism could in principle drop a Stripe webhook, and a dropped payment webhook is a paid order nobody is told about. Two things hold it:

- `scripts/guards/machine-callers-reachable.mjs` (blocking, on `prebuild`) keeps a reviewed record of every machine-to-machine entry point complete in both directions, refuses to let a signed webhook be rate limited by us, refuses a fail-closed limiter on a cron, and compares the project's live Vercel System Bypass rules against `scripts/guards/lib/firewall-bypass-expected.json`.
- `npm run firewall:bypass` prints the plan to exempt Stripe's 15 published webhook addresses from system mitigation, and changes nothing without `--apply`. Installing them is a production infrastructure change and is the founder's decision.

## Future hardening (not in this PR)

- ~~Replace the deployment-id poll~~ **Done differently by H2.3**: the smoke pins the commit under test from the trigger payload (`deployment.sha` or `workflow_run.head_sha`) and waits for the site to say it is serving that commit.
- Add an authenticated-session smoke (login + visit `/account`) once the friends-launch test user is durable.
- Promote the Playwright regression suite (`*.production.spec.ts`) into a separate scheduled workflow (nightly, say) for the cases curl cannot catch, paying the install cost on a slower cadence.
- Sentry alert rules covering the client-side error classes the curl smoke misses (the 2026-05-24 hardening pass PR 3 audits the existing Sentry integration; `docs/observability/sentry-alerts.md` covers the founder-side dashboard configuration).
