# Upstash and store isolation: the runbook

Ready to run. Everything below is a founder action on your machine and in the
Upstash console. Nothing here touches production Supabase, RLS, or a migration.

**Success criterion for the whole runbook:**

```powershell
node scripts/verify/env-store-isolation.mjs
```

goes from `===== 6 SHARED =====` to `===== ALL GREEN =====`. Leave it red until
it genuinely is; never suppress it.

---

## Step 1. Provision a TEST Upstash database (5 minutes)

The one that matters most. Today a TEST-pointed local process holds write access
to the store that caches **the fee production charges**.

1. Open <https://console.upstash.com/redis>, signed in as the account that owns
   the existing production database.
2. **Create Database.**
   - Name: `eventlinqs-test`
   - Primary region: **ap-southeast-2 (Sydney)**, matching production so latency
     behaviour is comparable.
   - Type: Regional. The free tier is ample: this store holds cache entries with
     a 30 to 60 second TTL, not durable data.
3. On the new database page open the **REST API** tab and copy
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

**Success criterion:** the new URL is a different hostname from the one in
`.env.local`. If they match you have copied the production database's details.

---

## Step 2. Generate a distinct TEST admin TOTP key

Never reuse production's. It decrypts real admin second factors.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Success criterion:** a 44-character base64 string, and it is NOT the value in
`.env.local`.

---

## Step 3. Append the isolation block to `.env.test`

Open `.env.test` and add, using the values from steps 1 and 2:

```
# ---------------------------------------------------------------------------
# STORE ISOLATION (added 8 August 2026).
# These MUST be present, even when empty. .env.test is an OVERLAY on .env.local,
# and .env.local is PRODUCTION, so any variable absent here falls through to the
# production value. An absent variable resolves TOWARDS production.
# ---------------------------------------------------------------------------
UPSTASH_REDIS_REST_URL=<the eventlinqs-test REST URL from step 1>
UPSTASH_REDIS_REST_TOKEN=<the eventlinqs-test REST token from step 1>
ADMIN_TOTP_ENC_KEY=<the key generated in step 2>

# Deliberately EMPTY. Empty is the correct value, not a placeholder:
#   RESEND_API_KEY      empty means a TEST run CANNOT send real email to a real
#                       person from the real domain. That is the behaviour we
#                       want; there is no TEST Resend domain to point at.
#   SERVICE_ROLE        a dead alias nothing reads. Defined empty so production's
#                       service-role key stops being loaded into every local
#                       process. Better still: delete it from .env.local too.
#   SUPABASE_DB_PASSWORD_SYDNEY
#                       production's direct Postgres password. TEST reaches its
#                       database through SUPABASE_DB_URL, so this is not needed.
RESEND_API_KEY=
SERVICE_ROLE=
SUPABASE_DB_PASSWORD_SYDNEY=
```

**Do not delete anything from `.env.local`** as part of this step except
optionally `SERVICE_ROLE` and `ANON_PUBLIC`, which nothing reads (verified: no
`process.env.SERVICE_ROLE` or `process.env.ANON_PUBLIC` anywhere in `src/` or
`scripts/`).

---

## Step 4. Prove it

```powershell
node scripts/verify/env-store-isolation.mjs
```

**Success criterion, exactly:**

```
===== ALL GREEN =====
No store-reaching variable is inherited from the production overlay.
```

Then prove the app still works on TEST with the new store:

```powershell
$env:NODE_ENV=""
set-content -Path env-check.tmp -Value ""   # no-op, keeps the shell honest
npx next dev -p 3000
```

In a second window:

```powershell
node scripts/verify/share-beacon-e2e.mjs http://localhost:3000
```

**Success criterion:** `13 pass, 0 FAIL`. This exercises the Redis path end to
end (rate limiting, the share cookie, the view beacon), so it is the cheapest
proof that the new store is wired and reachable.

---

## Step 5. Confirm the two environments can no longer collide

```powershell
node -e "process.env.NEXT_PUBLIC_SUPABASE_URL='https://vkapkibzokmfaxqogypq.supabase.co'; import('./src/lib/redis/client.ts').then(m => console.log('TEST  ->', m.namespacedKey('pr:v2:platform_fee:AU:AUD:null')))"
node -e "process.env.NEXT_PUBLIC_SUPABASE_URL='https://gndnldyfudbytbboxesk.supabase.co'; import('./src/lib/redis/client.ts').then(m => console.log('PROD  ->', m.namespacedKey('pr:v2:platform_fee:AU:AUD:null')))"
```

**Success criterion:** two different keys. This is belt and braces: after step 1
the two environments are on different Upstash databases entirely, and the
namespace means that even if they were ever pointed at the same one again, the
fee cache could not be shared.

---

## What this does NOT cover, deliberately

**The stale production keys.** The old unnamespaced `ff:v1:*` keys were deleted
during the investigation and the rest carry a 30 to 60 second TTL, so they have
long expired. Nothing needs cleaning.

**`CRON_SECRET`.** `node scripts/check-env-stores.mjs` reports that the Vercel
Production copy and the other store's copy are **the same secret**, and that
`.env.test` holds a 4-character value that fails its declared 32-character
shape. Both are pre-existing, neither is caused by this work, and the first is a
production config change. Flagged here so it is not lost; not actioned, because
you are holding production writes for the security fix.

**Rotating the credentials that were exposed.** Every production credential
listed in the audit has been sitting in local process environments for as long
as `.env.local` has existed, which predates this session. Whether that warrants
rotation is your call and belongs with the security session that owns
`docs/security/CREDENTIAL-ROTATION.md`, not with this branch.
