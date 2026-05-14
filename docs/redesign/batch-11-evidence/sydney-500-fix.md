# Batch 11.0 Round 3 Item B - /city/sydney 500 on Vercel preview

Date: 2026-05-14
**Status: RESOLVED (environmental fix, no code change).**

## Reported behaviour

Founder reported on Vercel preview deployment: clicking "Sydney" in
the header location picker routes to `/city/sydney`, which rendered
the platform error boundary "We hit a snag loading this page. Our
team has been notified."

## Root cause

Vercel env var `SUPABASE_SERVICE_ROLE_KEY` was stale - an older JWT
than the current Supabase Dashboard `service_role` key. Diagnosed
via Vercel runtime logs (Sentry SDK not yet installed; on pre-launch
hardening checklist).

Every Vercel-hosted server-side render that used
`fetchPublicEventsCached` threw `Invalid API key` against the
Supabase REST endpoint. Per-route impact:

- `/city/sydney`: no fallback path, exception bubbled to the platform
  error boundary -> "We hit a snag" page.
- `/events/browse/[city]`: had a defensive try/catch fallback, so the
  route rendered as an empty state instead of crashing.
- Cron endpoints `/api/cron/squad-expire` and `/api/cron/waitlist-expire`:
  same Invalid API key error, returned 500s.

Local production build did not reproduce the issue because local
`.env.local` had the current key. The platform sweep
(`scripts/batch-11-platform-sweep.mjs`) returned 94/94 CLEAN with
every city page including `/city/sydney` at HTTP 200 - the local key
was good, so the local DB queries resolved cleanly.

## Resolution

Founder updated the Vercel env var `SUPABASE_SERVICE_ROLE_KEY` to
match the current Supabase Dashboard `service_role` value, scoped
to Production + Preview + Development, then forced a fresh redeploy
with no build cache.

Confirmed working post-redeploy:
- `www.eventlinqs.com/events/browse/sydney` loads cleanly with all events
- `/city/sydney` no longer hits the error boundary
- Cron endpoints return 200

No code change required. The diagnostic playbook (likely candidates
list) below remains useful for future similar incidents.

## Future hardening (carry-over to pre-launch checklist)

1. **Sentry SDK install**: surface this class of failure in real
   time instead of having to dig through Vercel runtime logs. Already
   on the pre-launch hardening list.
2. **Env var drift detection**: lightweight startup script
   (`src/lib/env-check.ts`) that pings Supabase with the configured
   key on every cold start and logs `[env-check] Supabase key
   accepted` or `[env-check] FAIL`. Surfaces drift the moment a
   deployment lands rather than at first user impression.
3. **Defensive fallback on critical city / culture routes**: match
   the `/events/browse/[city]` pattern - try / catch the data fetch
   and render a graceful "no events to show yet" state rather than
   throwing. Considered for `/city/[slug]`, `/culture/[slug]`,
   `/culture/[slug]/[city]`.

## Diagnostic playbook (kept for future incidents)

When a Vercel route 500s and reproduces in production only:

### 1. Stale deployment SHA

Compare `git log --oneline -1 HEAD` to the SHA at the bottom of the
failing Vercel preview URL. If the preview SHA is older, the fix
already lives in `main` but isn't deployed - force a fresh deploy.

### 2. Env var drift

Verify env vars match local `.env.local` on the failing environment:

```
vercel env ls --environment=preview
vercel env ls --environment=production
```

Specifically check:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`     <-- THIS WAS THE ROOT CAUSE on this incident
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_STORAGE_DOMAIN`

A stale or missing token here causes Supabase queries to return
`Invalid API key` which throws on first request.

### 3. `/cdn/*` rewrite failure

Track 2 in Batch 10 shipped `next.config.ts` rewrites that proxy
`/cdn/*` to Supabase storage. If a specific seed image triggers a
rewrite mismatch, the route handler may crash. Check Vercel function
logs for `/cdn/*` 404s or 500s in the trace.

### 4. Supabase region cold start

Sydney Supabase project occasionally takes 3-5s to wake from idle.
If the preview test missed the warm-up window, the route handler
may have aborted on a fetch timeout. Subsequent reloads succeed.

### 5. RLS policy regression

Check the trace for "permission denied" on any `.from(...)` call.
Recent migrations rarely touch RLS; this is a low-probability
candidate but worth ruling out.

End of report (Item B RESOLVED).
