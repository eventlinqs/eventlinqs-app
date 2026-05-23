# CI inventory (2026-05-24)

Branch: `chore/ci-green-pass` (base: `main`).

## Workflows

Three workflow files in `.github/workflows/`:

| File | Workflow name | Trigger | Required gate? |
|---|---|---|---|
| `ci.yml` | CI | push to main, PR to main | yes (jobs: `verify`, `test`) |
| `lighthouse.yml` | Lighthouse CI | PR to main, workflow_dispatch | yes (job: `lighthouse`) |
| `post-deploy-smoke.yml` | post-deploy smoke | workflow_run after CI on main, workflow_dispatch | post-merge only |

## Jobs and steps

### CI (`ci.yml`)
- `verify` (ubuntu-latest, timeout 15m)
  steps: Checkout, Setup Node 20 (npm cache), `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build`
- `test` (ubuntu-latest, timeout 15m)
  steps: Checkout, Setup Node 20 (npm cache), `npm ci`, `npm test`

Both jobs receive placeholder `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` in env (sufficient for client-bundle validation during build and for vitest).

### Lighthouse CI (`lighthouse.yml`)
- `lighthouse` (ubuntu-latest, timeout 20m)
  steps: Checkout, Setup Node 20, `npm ci`, Setup Supabase CLI, `supabase start` (applies every file in `supabase/migrations/`; warns on missing `supabase/seed.sql`), Export Supabase env (`API_URL`, `ANON_KEY` from `supabase status -o env` -> `$GITHUB_ENV`), `npm run build`, `treosh/lighthouse-ci-action@v12` with `lighthouserc.json`.

Audits 11 URLs (configured in `lighthouserc.json`): `/`, `/events`, `/events/browse/melbourne`, `/categories/afrobeats`, `/events/afrobeats-melbourne-summer-sessions`, `/organisers`, `/pricing`, `/help`, `/legal/terms`, `/login`, `/signup`. Mobile form factor, single run per URL, headless Chrome with `--no-sandbox --disable-gpu --disable-dev-shm-usage`. Asserts: performance >= 0.80, a11y / best-practices / SEO = 1.00, CLS <= 0.1 (LCP / TBT / FCP / Speed-Index demoted to `warn`). Hard gate, no `continue-on-error`.

### post-deploy smoke (`post-deploy-smoke.yml`)
- `smoke` (ubuntu-latest, timeout 15m), runs only after `CI` workflow concludes `success` on main.
  steps: best-effort wait (~90s) for the Vercel deployment id to advance, curl anonymous against `PROD_URL` (HTTP 200 + body does not contain `"We hit a snag loading this page"` or `"Minified React error"`), curl with `el_city=Melbourne` cookie set (replays the 2026-05-24 React #185 trigger), email-on-failure via Resend (`secrets.RESEND_API_KEY`).

## Branch protection

`GET /repos/eventlinqs/eventlinqs-app/branches/main/protection` returns `404 Branch not protected`. Main has no required-status-checks gate, no required reviewers, no required-up-to-date-with-base, no admin-override restriction. Any merge of any PR is currently possible regardless of CI state. This is the dominant enabling condition for `gh pr merge --admin` becoming routine. Phase 5 (`docs/development/pr-process.md`) documents the exact settings that close this.

## Last-30-runs pass / fail tally (sampled from `gh run list --limit 50`)

| Workflow | success | failure | cancelled | other |
|---|---|---|---|---|
| CI | 47 | 0 | 2 | 0 |
| Lighthouse CI | 0 | 47 | 2 | 1 in-progress |
| post-deploy smoke | green on every main push observed | - | - | - |

`CI` and `post-deploy smoke` are healthy. **`Lighthouse CI` is 0% pass over the last 50 runs.** Cancellations come from the `concurrency: cancel-in-progress: true` group when a newer push or PR head supersedes an in-flight run; they are not real failures.

## Tab A coordination (PR #37)

Open PR `#37 chore/comprehensive-audit-v2` ("AUDIT-V2 live-execution audit + disk cleanup") touches only `audit-v2/*` (new) and `research/snapshots/*` (deletions). No overlap with the file scope for this PR (`.github/workflows/lighthouse.yml`, `audit-v2/ci-inventory.md`, `audit-v2/ci-failures-by-root-cause.md`, `docs/development/pr-process.md`). Filenames inside `audit-v2/` do not collide.
