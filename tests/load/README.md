# Load Testing - tests/load/

Phase 2 hardening. Three k6 profiles validate that the platform survives
nationwide-AU launch traffic without breaching latency, error, or
infrastructure budgets. Run only against Vercel preview, never
production.

## Prerequisites

1. **k6 binary** - already at `tools/k6.exe` (Windows). Linux/macOS
   users grab the matching binary from
   `https://github.com/grafana/k6/releases/tag/v0.55.2` and put it on
   PATH.
2. **Vercel preview URL** for the branch under test. Check
   `vercel.com/eventlinqs/eventlinqs-app/deployments`.
3. **Pre-seeded fixtures** for authenticated profiles (see Fixtures
   below). The browse profile runs without fixtures.
4. **Sweep script** for any writes the checkout profile produces. See
   "Cleanup" below.

## Running profiles

All three profiles read `BASE_URL` from env. No trailing slash.

```bash
# Profile 1 - Browse (anonymous, public surface)
./tools/k6.exe run \
  -e BASE_URL=https://<preview>.vercel.app \
  -e RUN_ENV=preview \
  --out json=tests/load/results/raw/browse-$(date -u +%Y%m%dT%H%M%SZ).json \
  tests/load/profiles/browse.js

# Profile 2 - Checkout (authenticated, transactional - WRITES)
./tools/k6.exe run \
  -e BASE_URL=https://<preview>.vercel.app \
  -e RUN_ENV=preview \
  --out json=tests/load/results/raw/checkout-$(date -u +%Y%m%dT%H%M%SZ).json \
  tests/load/profiles/checkout.js

# Profile 3 - Organiser dashboard (authenticated, read-heavy)
./tools/k6.exe run \
  -e BASE_URL=https://<preview>.vercel.app \
  -e RUN_ENV=preview \
  --out json=tests/load/results/raw/organiser-$(date -u +%Y%m%dT%H%M%SZ).json \
  tests/load/profiles/organiser.js
```

### Env knobs

| Var | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `BASE_URL` | `http://localhost:3000` | all | Target host, no trailing slash |
| `RUN_ENV` | `preview` | all | Tag every metric with the environment |
| `LOAD_TEST_TOKEN` | `` | reserved | Bypass token if a load-only route is wired in |
| `VUS` | profile-specific | browse, organiser | VU count override |
| `RATE` | `1000` | checkout | Constant arrival rate per minute |
| `DURATION` | profile-specific | checkout | Hold duration |
| `HOLD` | `8m` | organiser | Hold duration |
| `RAMPDOWN` | `30s` | browse | Final ramp-down |

## Fixtures

Located in `tests/load/fixtures/`. All are gitignored - regenerated per
preview deployment.

| File | Generator | Consumed by |
| --- | --- | --- |
| `event-slugs.json` | `tests/load/scripts/refresh-event-slugs.mjs` | browse, checkout |
| `test-users.json` | `tests/load/scripts/seed-test-users.mjs` | checkout |
| `test-organisers.json` | `tests/load/scripts/seed-test-organisers.mjs` | organiser |

Run the generators against the preview env once per Phase 2 run:

```bash
node tests/load/scripts/refresh-event-slugs.mjs --base https://<preview>.vercel.app
node tests/load/scripts/seed-test-users.mjs --base https://<preview>.vercel.app --count 200
node tests/load/scripts/seed-test-organisers.mjs --base https://<preview>.vercel.app --count 100
```

If a fixture file is missing the profile falls back to:
- browse: a hand-curated 10-slug list and 10 AU cities (live in `lib/fixtures.js`)
- checkout: anonymous requests (will 401 on /api/checkout/reserve)
- organiser: anonymous requests (will redirect to /login - profile is configured with `redirects: 0` so this surfaces as a failure)

## Post-processing results

```bash
node tests/load/process-results.mjs tests/load/results/raw/browse-<utc>.json
```

This streams the raw JSON (do not load it into memory; the browse run
at 10K VUs is hundreds of MB) and writes a `*.summary.json` alongside
with per-route P50/P95/P99, status-code histogram, ok-rate per profile,
counter totals, and threshold pass/fail.

The results doc at `docs/hardening/phase2/load-test-results.md`
consumes those summary JSONs verbatim.

## Cleanup

The checkout profile writes reservations tagged
`metadata.loadtest=true`. After every run, sweep them:

```sql
-- against the preview Supabase project
delete from reservations where (metadata->>'loadtest')::boolean = true;
delete from orders where (metadata->>'loadtest')::boolean = true;
```

Production must never see these rows. Confirm by running the sweep
once more against production with a row count assertion (expect 0).

## Pass criteria (Phase 2 gate)

| Profile | Metric | Threshold |
| --- | --- | --- |
| browse | per-route P95 | <= scope.md per-route caps |
| browse | `ok_browse` rate | > 0.995 |
| browse | `http_req_failed` rate | < 0.005 |
| checkout | reserve P95 | < 1500 ms |
| checkout | confirm P95 | < 2000 ms |
| checkout | `ok_checkout` rate | > 0.99 |
| organiser | per-route P95 | <= scope.md per-route caps |
| organiser | `ok_org` rate | > 0.999 |

Plus zero unexpected 5xx and zero Sentry alerts that aren't synthetic.

## Safety

- Never run against production. The profiles default to localhost; you
  must pass `BASE_URL` explicitly.
- Never run the checkout profile against an env with real Stripe keys.
  The preview must be on Stripe Test mode. Confirm with
  `STRIPE_PUBLISHABLE_KEY` starting `pk_test_` before launching.
- Stop the run if the preview Vercel project's bandwidth or function
  invocation budget is anywhere near its monthly cap. `gh` and the
  Vercel dashboard have these counters.
