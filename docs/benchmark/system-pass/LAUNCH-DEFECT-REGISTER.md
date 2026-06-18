# Launch Defect Register - Hardening Pass

Branch: `fix/hardening-security`. Owner: platform hardening + QA.
Scope of this pass: the eight items below. Checkout/payment processing files are
out of scope (Tab B); this pass touches only auth, hardening, admin reporting,
infra config, and one migration apply.

**Proof rule:** an item is `FIXED` only with a proof artifact = `file:line` of
the change + a verification capture (test output, or a verify script + its
expected output). Items that need a console/DB credential this engineer does not
hold are marked `CODE+VERIFY READY - FOUNDER ACTION` with the exact one-command
runbook and the verify script that produces the proof.

Verification harness for the code items (run from repo root):

```
npx tsc --noEmit          # 0 errors
npx vitest run            # all suites green
npx eslint <changed>      # 0 errors
```

Last full run this pass: `tsc` 0 errors, `vitest` all green (see per-item
captures), `eslint` 0 errors on changed files.

---

## AUTH-01 - Route-protection entry + gate - VERIFIED (premise corrected)

**Audit premise (stale):** "no `middleware.ts` entry exists, so `updateSession`
is dead code and `/dashboard/*` is reachable unauthenticated."

**Verify-first finding (real environment):** the entry DOES exist and route
protection DOES run. Next.js 16 renamed the route-middleware entry from
`middleware.ts` to `proxy.ts`; the project's `src/proxy.ts` (committed in
`16ac400`) calls `updateSession(request)` at line 92 with a matcher that covers
`/dashboard`. The auditor searched for `middleware.ts`, did not find it, and
wrongly concluded the gate was dead - missing the Next 16 rename. A colliding
`src/middleware.ts` (added then removed this pass) would actually BREAK the
build ("Both middleware file and proxy file are detected"); the correct entry is
`proxy.ts` only.

**State:** no code change required for the gate itself; verified it works. The
HARD-01 host redirect was added to this same `proxy.ts` entry (see HARD-01).
- `src/proxy.ts:92` - `proxy()` calls `updateSession(request)`.
- `src/lib/supabase/middleware.ts:51` - the `/dashboard` redirect-if-no-user gate.

**Proof:** `tests/unit/security/middleware-protected-route.test.ts`
- `src/proxy.ts` exists + wires `updateSession` with a matcher, and NO stray
  `src/middleware.ts` coexists,
- unauthenticated `/dashboard` -> 307 redirect to `/login?redirect=%2Fdashboard`,
- unauthenticated nested `/dashboard/payouts` -> 307 to `/login`,
- public `/events` passes through (no redirect),
- authenticated user bounced off `/login` -> `/dashboard`.

```
vitest run tests/unit/security/middleware-protected-route.test.ts -> 6 passed
```

---

## AUTH-02 - Admin gate did not assert 2FA on the live session - FIXED

**Defect:** admin 2FA is a custom TOTP flow (`src/app/admin/actions.ts`), not
Supabase native MFA, so a Supabase session carries no 2FA signal. `getAdminSession`
trusted any authenticated session for a user with an `admin_users` row - a
session minted by the public buyer `/login` page would pass the admin gate
without ever completing 2FA.

**Fix:** a tamper-proof (AES-256-GCM), httpOnly 2FA proof cookie, issued only
after the admin flow verifies the second factor, and required by the gate.
- `src/lib/admin/two-factor.ts` - seal/validate/issue/clear proof (new module).
- `src/lib/admin/auth.ts:40` - gate rejects any session without a valid proof
  bound to the current user (`hasValidTwoFactorProof`).
- `src/app/admin/actions.ts:122` - issue proof after `verifySecondFactor` passes
  on login; `:283` re-issue after enrolment confirms a live TOTP code; `:191`
  clear on logout.

**Proof:** `tests/unit/admin/two-factor-gate.test.ts`
- pure: proof valid for its user only, rejected for another user, when expired,
  when missing/garbage/tampered (GCM auth fails),
- gate: valid user + admin row but **no proof cookie -> `getAdminSession()` is
  `null` (BLOCKED)**; proof for a different user -> `null`; valid proof -> session.

```
vitest run tests/unit/admin/two-factor-gate.test.ts -> 7 passed
```

---

## HARD-01 - Supabase apex vs www host mismatch - FIXED (code) + dashboard confirm

**Defect:** the Supabase Auth Site URL is `https://www.eventlinqs.com` (auth
cookies live on www) while in-code link/email defaults emitted the apex
`https://eventlinqs.com`. A user landing on the apex got cookies on a different
host than auth, so sessions could be dropped. Founder ruling: **www is
canonical.**

**Fix:**
- `src/lib/site-url.ts:32` - `PRODUCTION_FALLBACK = 'https://www.eventlinqs.com'`
  (drives both `getSiteUrl` and `getAppUrl`).
- `src/proxy.ts` (`canonicaliseHost`, called first in `proxy()`) - apex
  `eventlinqs.com` -> `308` redirect to `www.eventlinqs.com`, preserving path +
  query, before any cookie is touched. Exact-hostname match leaves localhost and
  `*.vercel.app` previews untouched; the Stripe webhook path is exempted.

**Proof:** `tests/unit/security/canonical-host-redirect.test.ts`
- apex `/events?city=sydney` -> 308 `https://www.eventlinqs.com/events?city=sydney`,
- www host not redirected, localhost not redirected, vercel preview not redirected.

```
vitest run tests/unit/security/canonical-host-redirect.test.ts -> 4 passed
```

**Founder action (dashboard, confirm only):** verify Supabase Dashboard ->
Authentication -> URL Configuration Site URL is `https://www.eventlinqs.com` and
that both apex and www are added as Redirect URLs. The Vercel domain config
should keep www as primary (the middleware redirect is belt-and-suspenders and
does not loop with a Vercel www-primary setup).

---

## HARD-03 - Restrict the Mapbox token to eventlinqs.com - CODE+VERIFY READY - FOUNDER ACTION

**Defect:** the public Mapbox token (`NEXT_PUBLIC_MAPBOX_TOKEN`, used by
`src/components/features/city/city-map.tsx`) ships in the client bundle and, if
unrestricted, is usable from any origin (quota theft).

**Status:** URL restriction is a Mapbox account-dashboard setting on the token;
this engineer holds no Mapbox console or token value (no `.env.local` present).
The verification is scripted and ready.

**Founder runbook:**
1. Mapbox dashboard -> Account -> Tokens -> the public token -> URL restrictions.
2. Add `eventlinqs.com` and `www.eventlinqs.com`. Save.
3. Verify:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxxx node scripts/verify-mapbox-restriction.mjs
   ```

**Proof (expected):** `scripts/verify-mapbox-restriction.mjs` requests a Mapbox
style with a foreign Referer (`evil.example.com`) and with the allowed origin.
PASS = foreign -> `403`, allowed -> `200`. Paste the script output here to close.

---

## HARD-07 - Remove the localhost fallback for NEXT_PUBLIC_APP_URL - FIXED

**Defect:** route handlers resolved
`process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'`. If the env var were
ever unset in a deployed environment, the app would emit a `localhost` link into
a Stripe redirect or an email.

**Fix:** a shared deploy-safe resolver, no localhost fallback.
- `src/lib/site-url.ts:67` - `getAppUrl()`: `NEXT_PUBLIC_APP_URL` ->
  `NEXT_PUBLIC_SITE_URL` -> Vercel domains -> `https://www.eventlinqs.com`
  (never localhost). Local dev still resolves to localhost via the env *value*,
  not a hardcoded fallback.
- `src/app/api/stripe/connect/onboard/route.ts`, `.../return/route.ts`,
  `.../refresh/route.ts` - `appUrl()` now returns `getAppUrl()` (URL resolution
  only; no payment logic touched).

**Proof:** `tests/unit/security/no-localhost-app-url-fallback.test.ts`
- guard: no file under `src/` contains a `NEXT_PUBLIC_APP_URL ?? 'http://localhost'`
  fallback,
- `getAppUrl()` with the env unset returns `https://www.eventlinqs.com` (never
  localhost) and honours an explicit prod value.

```
vitest run tests/unit/security/no-localhost-app-url-fallback.test.ts -> 3 passed
```

---

## INFRA-01 - Migrate Upstash Redis to Sydney - CODE+VERIFY READY - FOUNDER ACTION

**Defect:** Redis is on the N. Virginia free tier; every read from Sydney Vercel
compute pays ~200-300ms trans-Pacific RTT.

**Status:** provisioning is an Upstash console + Vercel env action; this engineer
holds neither console nor the Vercel env write path. Runbook +
verification are ready. The health endpoint already exposes region + latency
(`src/app/api/health/redis/route.ts`).

**Founder runbook:** `docs/hardening/phase1/upstash-sydney-setup.md` (provision
`ap-southeast-2` Fixed 250 MB, swap the two Vercel env vars across
prod/preview/dev, redeploy). Then verify:
```
node scripts/verify-upstash-sydney.mjs https://www.eventlinqs.com
```

**Proof (expected):** `scripts/verify-upstash-sydney.mjs` hits
`/api/health/redis`; PASS = region is the AU/Sydney code AND `latencyMs < 20`.
Paste the script output here to close.

---

## PAY-02 - Revenue cards counted refunded orders at full value - FIXED

**Defect:** the admin dashboard GMV tiles queried a non-existent
`total_amount_cents` column filtered to `status = 'confirmed'` and never read the
refunds table. The wrong column meant the tile silently failed; the logic, had
it worked, counted every confirmed order at full value and ignored refunds
entirely (`partially_refunded`/`refunded` mis-valued).

Two revenue surfaces were affected; both now route through the audited
`aggregateGmv` aggregator, net of completed refunds.

**Surface 1 - admin dashboard GMV tiles** (`src/app/admin/(authed)/page.tsx`):
- `:6` import `aggregateGmv`; `:113` select `total_cents, platform_fee_cents,
  status` for paid statuses (`confirmed`, `partially_refunded`, `refunded`);
  `:133` subtract completed refunds -> `netGmvCents`. The old query read a
  non-existent `total_amount_cents` column (tile silently failed).

**Surface 2 - organiser event "Revenue" card + Revenue Summary**
(`src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx`): the QA-flagged
`orders/page.tsx` summed `total_cents` over the paid statuses with NO refund
netting, so a fully refunded order showed at full value. Now the Revenue stat
card shows `aggregateGmv(...).netGmvCents` and `RevenueSummary` gains an explicit
Refunds line (`src/components/orders/revenue-summary.tsx`, new optional
`refundedCents` prop). The sibling edit-page card
(`events/[id]/edit/page.tsx`) filters `status='confirmed'` only - a confirmed
order has no completed refund by definition - so it already excludes refunded
orders and is left unchanged (no regression: it passes no `refundedCents`).

**Proof:** `tests/unit/admin/dashboard-gmv-refund.test.ts` (the exact net math
both surfaces now use) - confirmed 10000 + fully-refunded 3000 (refund 3000) +
partially-refunded 5000 (refund 2000) -> gross 18000, refunded 5000, **net
13000** (the old gross-only behaviour overstated by 5000). Plus existing
`tests/unit/admin/analytics.test.ts`. tsc + eslint clean on both surfaces.

```
vitest run tests/unit/admin/dashboard-gmv-refund.test.ts -> 3 passed
```

---

## MIG-01 - Migration 20260608000004 unapplied on remote - VERIFY READY - FOUNDER ACTION

**Defect:** `supabase migration list --linked` shows
`20260608000004_admin_user_capability_overrides` local-only (empty remote) - real
drift. The admin per-user capability override feature errors in prod until
applied. The migration file is present and correct
(`supabase/migrations/20260608000004_admin_user_capability_overrides.sql`,
idempotent `ADD COLUMN IF NOT EXISTS`).

**Status:** the constitution reserves `supabase db push --linked` for the founder
(PowerShell), and this engineer holds no Supabase access token / DB password and
the project is not linked here. Apply + verify is a founder one-liner.

**Founder runbook (PowerShell, from repo root):**
```powershell
supabase link --project-ref <sydney-project-ref>   # if not already linked
supabase db push --linked
```
Then verify with a DIRECT DB query (not the cached client - its schema cache
lags):
```powershell
psql "$env:SUPABASE_DB_URL" -f scripts/verify-mig-20260608000004.sql
# or: supabase migration list --linked   (20260608000004 now shows on Remote)
```

**Proof (expected):** `scripts/verify-mig-20260608000004.sql` returns the
`20260608000004` row from `supabase_migrations.schema_migrations` AND both
`capabilities_granted` / `capabilities_revoked` columns on `public.admin_users`.
Paste the psql output here to close.

---

## Summary

| Item | State | Proof artifact |
|---|---|---|
| AUTH-01 | VERIFIED (premise corrected) | `src/proxy.ts:92` + middleware-protected-route.test.ts (6) |
| AUTH-02 | FIXED | `src/lib/admin/two-factor.ts` + two-factor-gate.test.ts (7) |
| HARD-01 | FIXED (code) | `src/proxy.ts` canonicaliseHost + canonical-host-redirect.test.ts (5) |
| HARD-03 | FOUNDER ACTION | scripts/verify-mapbox-restriction.mjs |
| HARD-07 | FIXED | `src/lib/site-url.ts:67` + no-localhost-app-url-fallback.test.ts (3) |
| INFRA-01 | FOUNDER ACTION | scripts/verify-upstash-sydney.mjs |
| PAY-02 | FIXED | `src/app/admin/(authed)/page.tsx:133` + dashboard-gmv-refund.test.ts (3) |
| MIG-01 | FOUNDER ACTION | scripts/verify-mig-20260608000004.sql |
