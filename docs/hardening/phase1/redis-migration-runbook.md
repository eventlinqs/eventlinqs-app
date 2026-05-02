# Redis Sydney migration runbook

Operator: hardening session (Claude Code)
Pre-req: founder has completed `docs/hardening/phase1/upstash-sydney-setup.md`
Estimated total time: 30 minutes once env vars are in Vercel

## Phase entry conditions

- New Sydney Upstash database exists.
- Vercel production, preview, and development env vars updated.
- Founder has confirmed in chat: "Upstash Sydney provisioned, env updated."

## Smoke test sequence

### T0: pull latest env

```powershell
vercel env pull .env.local
```

Verify `.env.local` contains the new Sydney URL by checking the hostname (should NOT include `us-east` or any N. Virginia regional indicator).

### T1: deploy fresh preview

```powershell
git push origin feat/launch-hardening-nationwide
# or
vercel
```

Wait for Vercel build to complete. Capture the preview URL.

### T2: health endpoint check

```powershell
curl -s https://{preview-url}/api/health/redis | jq
```

Expected output shape:

```json
{
  "ok": true,
  "latencyMs": 12,
  "region": "ap-southeast-2",
  "cmd": "ping",
  "ts": "2026-05-02T..."
}
```

Pass criteria:
- `ok === true`
- `latencyMs < 20` (preferred), `< 50` (acceptable)
- Run the curl 5 times back-to-back. Median latency under 20ms.

### T3: inventory cache smoke test

Visit any published event page on the preview deployment. Inspect Vercel function logs:

```powershell
vercel logs {preview-url} --since 1m | grep "inventory-cache"
```

Expected: zero error logs from `[inventory-cache]`. The cache reads should succeed without error.

Negative test: if you see `[inventory-cache] ... Redis read failed` errors, halt and roll back.

### T4: rate-limit smoke test (post-deliverable G)

Once deliverable G has wired the limiter into a route, run:

```powershell
for i in 1..10; do curl -s -o /dev/null -w "%{http_code}\n" https://{preview-url}/api/{rate-limited-route}; done
```

Expected: first N requests return 200, subsequent requests return 429 with a `Retry-After` header.

## Rollback decision tree

| Symptom | Action |
| --- | --- |
| `/api/health/redis` returns `ok: false` | Roll back env vars to N. Virginia, redeploy |
| Latency consistently > 50ms | Verify the new instance is actually in `ap-southeast-2` (Upstash console > Database > Region). If not, recreate. |
| Inventory cache logging errors | Roll back, capture errors, file follow-up |
| All green | Proceed to T5 |

## T5: production cutover

Production reads the same env vars from Vercel, so no separate cutover step. The next production deploy automatically uses Sydney.

To force production refresh without waiting for next merge:

```powershell
vercel --prod
```

Or wait for the next merge to `main` to trigger a production deploy.

## T6: verify production

```powershell
curl -s https://eventlinqs.com/api/health/redis | jq
```

Same pass criteria as T2.

## T7: 7-day soak

Leave both Sydney (active) and N. Virginia (idle, env-disconnected) running. Monitor:
- Sentry for any Redis-related errors
- Vercel function logs for `[inventory-cache]` errors
- Upstash console memory and command-rate panels

If clean for 7 days, proceed to T8.

## T8: decommission N. Virginia

In the Upstash console: select the N. Virginia database, click "Delete database", confirm.

Log the decommission date in `docs/sessions/hardening/progress.log` with prefix `[A] N.Virginia decommissioned`.

## Failure modes and recovery

### Mode 1: latency > 50ms persistently

Cause: instance not actually in Sydney; or Vercel functions running in non-Sydney region.

Fix:
- Verify Upstash database region in console
- Verify Vercel project region: `vercel.json` or project settings should pin to Sydney (`syd1`). For most projects on Vercel Pro, the default is `sfo1` (San Francisco). The deployment region must be Sydney for the Sydney Redis to actually win.

This dependency was not previously documented. If we discover Vercel functions run in `sfo1` despite the goal of Sydney compute, that is a separate Phase 2 / Phase 3 deliverable. File as a follow-up.

### Mode 2: inventory cache miss storm post-cutover

Cause: new instance is empty; first reads all fall through to Postgres.

Mitigation: this is expected. The Postgres fallback path is exercised regularly and is safe. Cache will warm naturally as traffic flows.

If load testing in Phase 2 shows a thundering herd against Postgres, we add a pre-warming script that walks active events and primes the inventory cache. Filed as Phase 2 dependency.

### Mode 3: rate-limit instability

Cause: rate-limit keys live on the new instance, fresh, no history.

Mitigation: rate-limit windows are short (60s typical). Within one minute, the new instance has correct counter state. Acceptable transient.
