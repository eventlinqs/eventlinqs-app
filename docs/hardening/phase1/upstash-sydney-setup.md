# Upstash Redis Sydney migration - founder action

Status: AWAITING FOUNDER ACTION
Owner: Lawal Adams
Estimated time: 20 minutes
Cost: from USD $10/month (Fixed 250 MB, Sydney region)
Blocks: rate-limit wiring (deliverable G), Phase 2 load tests

## Why this matters

EventLinqs cache traffic currently hops the Pacific. Each Redis read from a Sydney-deployed Vercel function to a N. Virginia Upstash instance pays roughly 200-300ms of trans-Pacific RTT. At nationwide-AU launch scale (10k concurrent ticket buyers, 1k organiser sessions, hundreds of webhooks per second), that latency stacks visibly on every checkout page, every inventory check, every rate-limit decision.

Sydney-region Redis collapses that to under 20ms from Vercel SYD compute.

## What you need to do

### 1. Create a new Upstash Redis instance

1. Sign in to the Upstash console: https://console.upstash.com/
2. Click "Create Database" (or "+ New Database").
3. Set:
   - Name: `eventlinqs-prod-syd`
   - Type: Regional
   - Region: `ap-southeast-2` (Sydney). If unavailable, pick the closest available AU region.
   - TLS: enabled (default)
   - Eviction: noeviction (default for cache + rate-limit usage)
4. Plan: select Fixed 250 MB at minimum. Pay-as-you-go is acceptable, but Fixed gives a predictable monthly cost. Upgrade to Fixed 1 GB or Pro if needed; 250 MB is the launch floor.
5. Click "Create".

### 2. Copy the credentials

Once created, open the database overview page. Copy:

- REST URL (`UPSTASH_REDIS_REST_URL`) - the HTTPS endpoint, looks like `https://xxx-xxx-xxx-xxx.upstash.io`
- REST token (`UPSTASH_REDIS_REST_TOKEN`) - long random string

You also see TCP credentials. We do not use TCP from Vercel - REST only.

### 3. Set the new credentials in Vercel

In a separate terminal in the project root:

```powershell
# Production environment
vercel env add UPSTASH_REDIS_REST_URL production
# paste the new Sydney URL when prompted

vercel env add UPSTASH_REDIS_REST_TOKEN production
# paste the new Sydney token when prompted

# Preview environment (so PR deployments use Sydney too)
vercel env add UPSTASH_REDIS_REST_URL preview
vercel env add UPSTASH_REDIS_REST_TOKEN preview

# Development - point at the same Sydney instance for now (we will provision a
# separate dev instance when staging environment lands in Phase 3)
vercel env add UPSTASH_REDIS_REST_URL development
vercel env add UPSTASH_REDIS_REST_TOKEN development
```

If you do not have the Vercel CLI yet: `npm i -g vercel` then `vercel login` and `vercel link` from this directory.

### 4. Pull the new env down locally

```powershell
vercel env pull .env.local
```

Verify `.env.local` now contains the new Sydney URL and token. Restart any local dev server.

### 5. Tell me you are done

Reply in chat: "Upstash Sydney provisioned, env updated."

I will:
1. Trigger a fresh Vercel preview deployment.
2. Hit `/api/health/redis` and verify `latencyMs < 20`.
3. Run the inventory cache smoke test (read/write/invalidate cycle).
4. Push the runbook closure entry to `docs/sessions/hardening/progress.log`.

## What happens to the old N. Virginia instance

Do NOT delete it yet. Keep it for at least 7 days after Sydney goes green. If anything breaks, we have an instant rollback by reverting the two env vars in Vercel.

After 7 days of clean Sydney operation, delete the N. Virginia database from the Upstash console. Document the deletion date in the progress log entry.

## Cost expectation

| Plan | Monthly | When to pick |
| --- | --- | --- |
| Fixed 250 MB | USD $10 | Launch floor. Sufficient for inventory cache + rate limits at 10k concurrent users for short bursts. |
| Fixed 1 GB | USD $35 | If memory pressure visible after first month |
| Pro | from USD $280 | Only if we need >50k commands/sec sustained |

We start at Fixed 250 MB. Watch memory and command rate. Upgrade if needed.

## Rollback plan

If post-migration smoke test fails for any reason:

1. In Vercel CLI, revert the env vars to the old N. Virginia values:
   ```powershell
   vercel env rm UPSTASH_REDIS_REST_URL production
   vercel env add UPSTASH_REDIS_REST_URL production
   # paste old N. Virginia URL
   vercel env rm UPSTASH_REDIS_REST_TOKEN production
   vercel env add UPSTASH_REDIS_REST_TOKEN production
   # paste old N. Virginia token
   ```
2. Trigger redeployment (push any commit, or `vercel --prod`).
3. Tell me what failed; we triage before retrying.

## Reference

- Upstash regions: https://upstash.com/docs/redis/overall/regions
- Vercel env CLI: https://vercel.com/docs/cli/env
- Upstash REST API: https://upstash.com/docs/redis/features/restapi
