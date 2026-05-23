# CI failures by root cause (last 30 runs, 2026-05-24)

Branch: `chore/ci-green-pass`.

Root-cause families per the audit brief:
(a) lint warnings now treated as errors
(b) typescript strict regression
(c) Playwright test broken
(d) Lighthouse score below threshold
(e) axe-core a11y violation
(f) missing env var in CI
(g) flake (intermittent)
(h) genuine code bug

## Headline

Every single failing run in the visible window is the same workflow (`Lighthouse CI`) with the same root cause (category **f**, missing CI env var). The other gates have zero real failures over the same window.

## Run categorisation

### `CI` workflow - 47 success / 0 failure / 2 cancelled (50 sampled)
The two cancellations are concurrency-group cancellations (`concurrency: ci-${{ github.ref }}, cancel-in-progress: true`) when a newer push or PR head superseded the run. Not real failures. No action.

### `post-deploy smoke` workflow - green on every observed main push
No action.

### `Lighthouse CI` workflow - 0 success / 47 failure / 2 cancelled / 1 in-progress (50 sampled)

Sample failing runs (last 5, identical error across all):

| run id | branch | error |
|---|---|---|
| 26343766730 | refactor/site-header-cookie-pattern | `ERRORED_DOCUMENT_REQUEST` at `http://localhost:3000/events`, Status 500 |
| 26343609773 | chore/regression-test-and-smoke-gate | same |
| 26342909851 | hotfix/mobile-render-loop | same |
| 26341457237 | fix/medium-refund-email-and-insights-nav | same |
| 26325650144 | fix/footer-filter-links | same |

Excerpt from `gh run view 26343766730 --log-failed`:

```
Running Lighthouse 1 time(s) on http://localhost:3000/
Running Lighthouse 1 time(s) on http://localhost:3000/events
LH:NavigationRunner:error Lighthouse was unable to reliably load the page you requested.
  Make sure you are testing the correct URL and that the server is properly responding to all requests.
  (Status code: 500) http://localhost:3000/events
Runtime error encountered: ... (Status code: 500)
##[error]LHCI 'collect' has encountered a problem.
```

`/` (homepage) audits successfully. `/events` returns HTTP 500 from SSR. lhci stops on the first failed URL, so the other 9 URLs in `lighthouserc.json` are never reached.

## Root cause (category f, missing env var in CI)

`src/app/events/page.tsx` calls `fetchPublicEventsCached` and `fetchActiveCategoriesCached` from `src/lib/events/fetchers.ts`. Both internally call `createAdminClient()` (from `src/lib/supabase/admin.ts`), which requires `process.env.SUPABASE_SERVICE_ROLE_KEY`. The comment block on `fetchPublicEventsCached` documents the choice as deliberate (PSI cache-bust queries share a warm snapshot; same data scope as RLS because the SQL filters on `status='published' AND visibility='public'`).

`.github/workflows/lighthouse.yml` "Export Supabase env" step harvests `API_URL` and `ANON_KEY` from `supabase status -o env` and writes them to `$GITHUB_ENV`, but does NOT harvest `SERVICE_ROLE_KEY`. `supabase status -o env` does emit `SERVICE_ROLE_KEY=...`; the workflow simply never reads that line. Production (Vercel) has the key set as an env var, so `/events` works there; CI never had it, so `/events` SSR throws and Lighthouse fails on every PR.

This is not a Lighthouse threshold problem (no metric is being graded), not a code bug (production renders correctly), not flake (deterministic on every run), and does not require a new GitHub Actions secret (the local Supabase stack mints a fresh service-role key on `supabase start`).

The fix is a 5-line workflow edit:

```yaml
service_role_key=$(echo "$status" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
echo "::add-mask::$service_role_key"
echo "SUPABASE_SERVICE_ROLE_KEY=$service_role_key" >> $GITHUB_ENV
```

`::add-mask::` registers the value with GitHub Actions so it is replaced with `***` in subsequent log lines (defence in depth even though the key is a throwaway local-stack value, never a production secret). Applied in commit on this branch (PHASE 3).

## Categorisation by family

| family | count of unique root causes | runs affected | action |
|---|---|---|---|
| (a) lint warnings now errors | 0 | 0 | no action |
| (b) typescript strict regression | 0 | 0 | no action |
| (c) Playwright test broken | 0 | 0 (no Playwright job in CI workflows) | no action |
| (d) Lighthouse score below threshold | 0 | 0 | no action (no metric is being graded; runtime error stops audit before scoring) |
| (e) axe-core a11y violation | 0 | 0 | no action |
| **(f) missing env var in CI** | **1** | **47 / 47 failing runs** | **fix in PHASE 3: `lighthouse.yml` exports `SUPABASE_SERVICE_ROLE_KEY`** |
| (g) flake | 0 | 0 | no action |
| (h) genuine code bug | 0 | 0 | no action |

One root cause. One fix. PR #26 unblock.
