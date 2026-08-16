# EventLinqs Credential Rotation Runbook

Pre-launch security hardening. This is the go-live source of truth for every
credential the platform uses: where it lives, which environments hold it,
whether it has ever been exposed, and the exact steps to revoke and reissue it.

Audit date: 2026-07-24. Method: repository sweep, full git-history sweep,
client-bundle inspection, runtime-logging review, and Vercel scope inventory via
the authenticated CLI. Secret values are never printed in this document.

---

## 0. Immediate actions - STATUS 2026-08-03

The three actions this runbook opened with are DONE. Recorded here rather than
deleted, because "the runbook still says do this" is how a resolved item gets
re-litigated every session.

1. ~~Rotate the Vercel CLI token.~~ **Done by expiry.** The stored `vca_` token
   expired 2026-07-04 and the `vcr_` refresh token is rejected
   (`invalid_grant`), so the exposed pair is dead. Section 4.1 still applies to
   any FUTURE token. Note the side effect: no Vercel REST API token is currently
   available, so the runtime sentinel's live-store half reports NOT CHECKED (see
   the matrix row for `VERCEL_API_TOKEN`).
2. ~~Set the four variables missing from Production.~~ **Done.** All four are
   set, and `CRON_SECRET` is proven byte-identical across Vercel Production and
   GitHub Actions on every CI run by the bearer handshake.
3. ~~Mark the high-value server secrets Sensitive.~~ **Done, and the original
   finding was partly wrong.** No Production secret was readable; the readable
   ones were Preview records pinned to git branches, which a scope-wide pull
   cannot see. See section 5.

**The standing replacement for this checklist** is executable and cannot go
stale:

```bash
node scripts/check-env-stores.mjs
```

---

## 1. Repository, history, bundle and logging sweep - results

| Check | Result |
|---|---|
| Secret in **git history** (all 635 commits, all branches) | **CLEAN.** Zero matches for `sk_live_`, `sk_test_`, `whsec_`, `re_`, `sk-ant-`, `vca_`, a service-role JWT, or `BEGIN ... PRIVATE KEY` in any commit diff. |
| Real secret in a **committed `.env` file** | **CLEAN.** Only `.env.example` and `.env.staging.example` are tracked, and both contain placeholders only. The real `.env.local` / `.env.test` / `.env.production` are gitignored (`.gitignore:34` `.env*`). |
| **Hardcoded secret in source** (`src/`, `scripts/`) | **CLEAN.** No `sk_`/`whsec_`/`re_`/`sk-ant-`/`vca_` literal in the working tree. |
| **Client bundle** exposure | **CLEAN.** No `'use client'` file reads any non-`NEXT_PUBLIC_` variable. Only intended `NEXT_PUBLIC_*` values reach the browser (Supabase URL + anon key, Stripe publishable key, Google Maps key, app URL/name, VAPID public key, Sentry DSN). |
| **Runtime logging** of secret values | **CLEAN.** No `console.*` prints a secret env value. The health guard reports variable NAMES + a present/empty/malformed STATE and a prefix/length rule, never the value (`src/lib/health/critical-env.mjs`). |

The only exposure found is the operational one below.

---

## 2. Exposure findings (this audit's transcripts and terminal)

| Credential | Exposed? | Detail |
|---|---|---|
| **Vercel CLI access token (`vca_...`) and refresh token (`vcr_...`)** | **YES - full value** | Read from `~/AppData/Roaming/com.vercel.cli/Data/auth.json` and printed in full during earlier env diagnostics. Treat as compromised. Rotate (4.1). |
| Stripe CLI **`stripe listen` webhook secret** (`whsec_...`) | Yes, but ephemeral/local | Printed while wiring local webhook forwarding. This is a Stripe CLI device secret for local forwarding, not a stored platform secret; it is regenerated on the next `stripe listen`. Low risk. Refresh with `stripe login`. |
| Google Maps key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_API_KEY`) | Prefix + length only | Only `AIzaSy...` prefix and length 39 were shown, never the full value. The `NEXT_PUBLIC` copy is client-visible by design and protected by HTTP referer restrictions, so this is not a meaningful exposure. |
| All other secrets (Stripe secret, Supabase service role, Anthropic, Resend, VAPID private, `CRON_SECRET`, Upstash token, `ADMIN_TOTP_ENC_KEY`) | No | Only presence, length, and non-secret prefixes were ever surfaced; full values were held in shell variables / temp files that were deleted. |

---

## 3. Variables MISSING from the Vercel PRODUCTION scope

> **SUPERSEDED as a live checklist, 2026-08-03. Kept as the historical record of
> what this audit found.** Every row below has since been resolved, and this is
> no longer the way to find out what is missing. The authority is now the
> manifest and the store checker, which answer the same question against the
> live stores and cannot go stale:
>
> ```bash
> node scripts/check-env-stores.mjs
> ```
>
> Resolutions: `CRON_SECRET` is set on Production and in GitHub Actions, and the
> two copies are proven byte-identical on every CI run by the bearer handshake.
> `PAYMENT_ALERT_EMAIL` and `SUPPORT_INBOX_EMAIL` were set on Production on
> 2026-08-03. `WEBHOOK_CANONICAL_HOST` is set, and the value named below was
> WRONG: the canonical host is `www.eventlinqs.com.au`, not `www.eventlinqs.com`,
> which 301s to it. `QUEUE_SECRET` is set on Production.

| Variable | Impact if left unset | Fix |
|---|---|---|
| **`CRON_SECRET`** | **Every cron 401s and never runs.** | Add to Production: `openssl rand -hex 24`. Also add the identical value as a GitHub Actions secret so the post-deploy probe can call the crons. |
| `PAYMENT_ALERT_EMAIL` | Payment and health alerts fall back to the in-code default. | Add to Production. Use an address PROVEN to receive (see 4.11). |
| `WEBHOOK_CANONICAL_HOST` | The payment sentinel's endpoint-config check defaults to the deployment host. | Add to Production: `www.eventlinqs.com.au`. |
| `QUEUE_SECRET` | High-demand event queue token signing is unconfigured. | Add to Production: `openssl rand -hex 24`. |

`NEXT_PUBLIC_*` values are baked into the bundle at BUILD time, so any change to
one requires a REBUILD, not just a redeploy.

---

## 4. Per-credential rotation steps

### 4.1 Vercel CLI token (COMPROMISED - rotate first)

- **Where it lives:** `~/AppData/Roaming/com.vercel.cli/Data/auth.json` on the
  founder's machine (`token` = `vca_...`, `refreshToken` = `vcr_...`). Not in the
  repo, not in Vercel env.
- **Scopes:** local machine only; grants full CLI access to the Vercel account
  and team `lawals-projects`.
- **Rotate / revoke:**
  1. `vercel logout` (invalidates the local session tokens).
  2. Vercel dashboard -> **Account Settings -> Tokens**: delete any personal
     access tokens you do not recognise or no longer need.
  3. `vercel login` to re-issue a fresh session (new `vca_`/`vcr_` pair).
  4. If any CI uses a `VERCEL_TOKEN`, reissue it in Account Settings -> Tokens
     and update the CI secret.

### 4.2 Supabase

- **Access / personal token** (`SUPABASE_ACCESS_TOKEN`, used by the CLI +
  the CI types-drift guard). Where: local shell / GitHub Actions secret. Rotate:
  Supabase dashboard -> **Account -> Access Tokens** -> revoke + generate; update
  the GitHub secret. (Repo note: this token has expired before - see the
  types-drift guard.)
- **Service role key** (`SUPABASE_SERVICE_ROLE_KEY`, + `_PREVIEW` for the TEST
  project). Where: Vercel (Prod/Preview/Dev), gitignored `.env.*`. This bypasses
  RLS - highest value. Rotate: Supabase -> **Project Settings -> API -> Service
  role -> Reset**. Then update every scope in Vercel and local `.env.*`. Mark
  **Sensitive** in Vercel (section 5).
- **Anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, + `_PREVIEW`). Client-visible by
  design (RLS-guarded). Rotate the same way (Reset anon key) then rebuild
  (NEXT_PUBLIC = build-time). Two projects: production `gndnldyfudbytbboxesk`,
  TEST/preview `vkapkibzokmfaxqogypq`.

### 4.3 Stripe

- **Secret key** (`STRIPE_SECRET_KEY`; live in Production, test in Preview).
  Rotate: Stripe dashboard -> **Developers -> API keys -> Roll** the secret key
  (live and test separately). Update Vercel per scope. Mark **Sensitive**.
- **Publishable key** (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). Client-visible by
  design. Roll alongside the secret key; rebuild.
- **Webhook signing secret** (`STRIPE_WEBHOOK_SECRET`, per environment; canonical
  staging endpoint history is in `docs/payments/WEBHOOK-CANON.md`). Rotate:
  Stripe -> **Developers -> Webhooks -> [endpoint] -> Roll secret**, or recreate
  the endpoint and disable the old one. Update the matching Vercel scope. Verify
  with the payment sentinel (`/api/cron/webhook-sentinel`) after rotating.

### 4.4 Anthropic (AI layer)

- `ANTHROPIC_API_KEY`. Where: Vercel (Preview + Production). Rotate: Anthropic
  Console -> **Settings -> API Keys** -> create new, delete old; update Vercel.
  Mark **Sensitive**. AI is a soft feature; checkout/browsing are unaffected if
  it is briefly unset.

### 4.5 Resend (email)

- `RESEND_API_KEY` (+ `EMAIL_FROM`, which must be a verified sending domain -
  `eventlinqs.com` is verified). Where: Vercel (all scopes). Rotate: Resend
  dashboard -> **API Keys** -> create new, revoke old; update Vercel. Mark
  **Sensitive**. Confirmation emails AND the health alerts both depend on it.

### 4.6 VAPID (web push)

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client), `VAPID_PRIVATE_KEY` (server),
  `VAPID_SUBJECT`. Where: Vercel (Preview + Production). Rotate: generate a fresh
  pair with `npx web-push generate-vapid-keys`, set all three, rebuild
  (public key is `NEXT_PUBLIC`). Note: rotating the keypair invalidates every
  existing push subscription - subscribers re-subscribe on next visit. Mark the
  private key **Sensitive**.

### 4.7 `CRON_SECRET`

- Where: Vercel (currently Preview only - **missing from Production**) + the
  GitHub Actions secret used by the post-deploy probe. Rotate/set:
  `openssl rand -hex 24`, add to Vercel Production (and Preview), and update the
  GitHub secret to the same value. Mark **Sensitive**. Fail-closed: the crons
  refuse to run without it.

### 4.8 Google Maps

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser, referer-restricted) and
  `GOOGLE_MAPS_API_KEY` (server; currently the same value). Where: Vercel
  (Prod/Preview). Rotate: Google Cloud Console -> **APIs & Services ->
  Credentials** -> create a new API key, apply the referer allow-list
  (`https://*.vercel.app/*`, `https://eventlinqs.com/*`,
  `https://*.eventlinqs.com/*`, `https://eventlinqs.com.au/*`,
  `https://*.eventlinqs.com.au/*`), restrict it to Maps JavaScript + Places (+
  Geocoding), update Vercel, rebuild, then delete the old key. Recommended split:
  keep the browser key referer-restricted, and create a SEPARATE **IP-restricted**
  key for any server-side geocoding (a referer-restricted key returns
  `REQUEST_DENIED` on server calls).

### 4.9 Upstash Redis

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Where: Vercel
  (Production + Preview). Rotate: Upstash console -> the database -> **Details ->
  Rotate token** (or recreate the database for a full URL+token change); update
  both vars in Vercel. Mark the token **Sensitive**. Fail-open in most paths;
  fail-closed for auth/checkout rate limiting in production.

### 4.10 Other secrets (rotate on the same go-live pass)

| Variable | Provider / purpose | Rotate |
|---|---|---|
| `ADMIN_TOTP_ENC_KEY` | Encrypts admin 2FA secrets at rest | Generate a new 32-byte key; note that rotating it invalidates stored admin TOTP enrolments (admins re-enrol). Mark **Sensitive**. |
| `SENTRY_AUTH_TOKEN` | Build-time source-map upload | Sentry -> Settings -> Auth Tokens -> rotate; CI/Vercel build env. |
| `HEALTH_CHECK_TOKEN` | Gates `/api/health/sentry-error` | `openssl rand -hex 24`; update Vercel. Mark **Sensitive**. |
| `QUEUE_SECRET` | Queue token signing (missing from Prod) | `openssl rand -hex 24`; add to Vercel if the queue is used. |
| `PEXELS_API_KEY` | Stock imagery API | Pexels dashboard -> rotate; low sensitivity. |
| `PAYMENT_ALERT_EMAIL`, `WEBHOOK_CANONICAL_HOST`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL/NAME`, `SENTRY_DSN` | Configuration, not secrets | No rotation; set correctly per environment. |

---

## 5. "Sensitive" flag - RESOLVED 2026-08-03

**The finding recorded here has been fixed, and part of it was wrong.**

What was true: Vercel "Sensitive" variables are write-only and never returned on
read, and several high-value secrets were readable.

What was WRONG: this section named `STRIPE_SECRET_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` on **Production** as readable. Re-measured on
2026-08-03 with a scoped `vercel env pull` per scope AND per pinned git branch,
every Production secret is withheld. The readable records were on **Preview**,
pinned to git branches, which the earlier scope-wide pull could not see at all.

Measured state, 2026-08-03, after remediation:

| Scope | Secrets readable back |
|---|---|
| Production | none |
| Preview (scope-wide) | none |
| Preview (all 22 branch-pinned records) | none |
| Development | **no secrets stored at all** (founder ruling R3) |

Four Preview branch-pinned records WERE readable and were removed and re-added
with `--sensitive`, value preserved: `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` on `release/launch-line`, `STRIPE_WEBHOOK_SECRET` on
`feat/event-media-standard`, and `STRIPE_WEBHOOK_SECRETS` on
`feat/walkthrough-defects`.

**`--force` does NOT change an existing record's sensitivity.** Removing and
re-adding is the only way:

```bash
npx vercel@55 env rm  NAME preview <git-branch> --yes
printf '%s' "$VALUE" | npx vercel@55 env add NAME preview <git-branch> --sensitive
```

**Do not use `vercel env ls` to judge this.** It prints `Encrypted` for a
genuinely sensitive record AND for a merely encrypted one that `env pull` hands
back in plain text. Only the read-back distinguishes them. See
`docs/ENV-DOCTRINE.md` section 3.4.

The standing check is `node scripts/check-env-stores.mjs`, which now measures
every scope and every pinned branch, and FAILS on any record it could not
measure rather than passing it over in silence.

---

## 6. Go-live checklist

- [ ] Rotate the Vercel CLI token (4.1) and any CI `VERCEL_TOKEN`.
- [ ] Set `CRON_SECRET` in Production + GitHub secret; confirm crons return 200.
- [ ] Set `PAYMENT_ALERT_EMAIL`, `WEBHOOK_CANONICAL_HOST` in Production; set
      `QUEUE_SECRET` if the queue is used.
- [ ] Mark every server secret **Sensitive** (section 5).
- [ ] Confirm the Google Maps key referer allow-list; add a separate IP-restricted
      key if server-side geocoding is enabled.
- [ ] Rotate Stripe (live), Supabase service role, Resend, Anthropic, Upstash,
      VAPID, `ADMIN_TOTP_ENC_KEY`, `SENTRY_AUTH_TOKEN` on the launch pass.
- [ ] Re-run the health sentinel (`/api/cron/health-sentinel`) and confirm green.
- [ ] Keep `.gitignore` `.env*` rule; never commit a real `.env` file.

---

## 7. The complete rotation matrix (authority, 2026-08-03)

Every credential the manifest declares, plus the two that live outside the
running application and were invisible to it for exactly that reason. For each:
where it is issued, every store it must land in, and the exact verification
command.

**The order that avoids downtime, in one line:** for anything with more than one
valid credential at a time (Stripe webhooks, Supabase keys, Resend, Anthropic),
ADD the new one everywhere first, verify, then revoke the old one. For anything
single-valued (`CRON_SECRET`, `QUEUE_SECRET`, `ADMIN_TOTP_ENC_KEY`), write BOTH
stores before redeploying, because the window between the two writes is the
outage.

Legend for stores: **P** Vercel Production, **V** Vercel Preview, **G** GitHub
Actions, **L** local `.env.local`. The Development scope holds no secrets at all
(ruling R3), so it never appears.

| Credential | Issued at | Stores | Order that avoids downtime | Verify with |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe dashboard, Developers, API keys | P, V, L | Create the new restricted/secret key, write P and V, redeploy, confirm a live payment intent, THEN revoke the old key. | `node scripts/check-env-stores.mjs` then a real checkout; sentinel `payment` check green |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same page, same account | P, V, L | Must come from the SAME account as the secret key. Write, then REBUILD (it is baked at build time). | `STRIPE_ACCOUNT_PAIR` cross rule; the payment element renders |
| `STRIPE_WEBHOOK_SECRETS` | Stripe, Developers, Webhooks, per endpoint | P, V | Append the new `whsec_` to the comma list, deploy, confirm deliveries verify, THEN remove the old entry. Never replace in one step. | `docs/payments/WEBHOOK-CANON.md`; sentinel `payment` check |
| `STRIPE_WEBHOOK_SECRET` | as above (legacy single value) | P, V | As above. Kept only as the appended fallback. | as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, Project Settings, API | P, V (TEST project), L | Supabase rotation invalidates the old key immediately, so write every store, then redeploy at once. Expect a brief window. | `refFromJwt` matches the intended project; sentinel `database` check |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | P, V, L | Write, then REBUILD (baked at build time). | homepage renders data |
| `NEXT_PUBLIC_SUPABASE_URL` | same page | P, V, L | Configuration, not a secret. REBUILD after change. | `SUPABASE_PRODUCTION_REF_ISOLATION` cross rule |
| `CRON_SECRET` | generated: `openssl rand -hex 24` | P, **G** | Write P and G BOTH before redeploying. Writing one and not the other is the exact failure that silenced the smoke gate for eighteen days. **SINGLE POINT OF FAILURE, see the note below.** | `node scripts/check-env-stores.mjs --mode=handshake` must print HTTP 200 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console, the database's REST API tab | P, V, L | **PAYMENT-CRITICAL: this store caches the resolved FEE.** Rotate the token in the Upstash console, write P and V, redeploy. The cache is regenerable, so a brief gap only means fee resolution falls through to the database. Never point production at a non-production database. | `node scripts/verify/payment-critical-doctrine.mjs` green, then sentinel `env` check green; confirm a fee renders on an event page |
| `UPSTASH_REDIS_REST_URL` | Upstash console, same tab | P, V, L | Configuration, not a secret, but it decides WHICH store. Changing it points the fee cache at a different database, so treat a change as a rotation of the pair. | `node scripts/verify/env-store-isolation.mjs` must not report it shared with another environment |
| `QUEUE_SECRET` | generated: `openssl rand -hex 24` | P, V | Single-valued: write, redeploy. In-flight queue tokens are invalidated. | sentinel `pages` check; queue admission returns 200 |
| `HEALTH_CHECK_TOKEN` | generated: `openssl rand -hex 24` | P, V | Write, redeploy. | `GET /api/health/sentry-error?token=...` returns 200 |
| `RESEND_API_KEY` | Resend dashboard, API Keys | P, V, **G**, L | Create the new key, write all three stores, send one test, THEN delete the old key. **No test mode exists**, so treat every copy as live. | `GET https://api.resend.com/domains` returns 200; sentinel `email` check |
| `EMAIL_FROM` | configuration, not a secret | P, V, L | Must be `@eventlinqs.com` (ruling R4). Anything else is rejected by the shape. | build guard; a delivered test send |
| `ANTHROPIC_API_KEY` | console.anthropic.com, API keys | P, V, L | Add the new key, write, deploy, confirm, then revoke the old. | sentinel `ai` check green |
| `UPSTASH_REDIS_REST_TOKEN` / `_URL` | Upstash console, database, REST API | P, V, L | Rotate token, write, redeploy. Rate limits fail CLOSED, so a wrong value locks users out of login: verify immediately. | `GET /api/health/redis` returns 200 |
| `ADMIN_TOTP_ENC_KEY` | generated, 32 bytes | P | **Rotating it invalidates every stored admin TOTP enrolment**; admins must re-enrol. Schedule it, do not surprise yourself. | admin 2FA login succeeds |
| `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | `npx web-push generate-vapid-keys` | P, V | The pair must rotate together, and **every existing push subscription is invalidated**. REBUILD for the public half. | a test push delivers |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud console, Credentials | P, V | Referer-restricted, browser-visible by design. REBUILD after change. | `scripts/verify/map-guard.mjs`; sentinel `maps` check |
| `GOOGLE_MAPS_API_KEY` | same console, separate key | P, V, L | Server-side, IP restricted. **No test mode and it is billable**: treat as live everywhere. | geocoding returns a result |
| `SENTRY_AUTH_TOKEN` | Sentry, Settings, Auth Tokens | P, V | Build-time source-map upload only. Write, next build proves it. | build log shows a source-map upload |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry project settings | P, V | Not secret. REBUILD for the public half. | `GET /api/health/sentry-error` |
| `PEXELS_API_KEY` | Pexels dashboard | P, V, L | Low value. Write, redeploy. | image ingest script runs |
| **`SUPABASE_ACCESS_TOKEN`** | supabase.com, Account, Access Tokens | **G only** | Lives in GitHub Actions and NOWHERE else: nothing in the running application uses it, and it is forbidden on every Vercel scope. **It has expired twice unnoticed.** | `gh workflow run ci.yml`; the `types-drift guard` job must not report `Unauthorized` |
| **`VERCEL_API_TOKEN`** | vercel.com, Account Settings, Tokens | P (optional), local operator | Read-only is enough. Without it the runtime sentinel's live-store half reports NOT CHECKED, which is honest but blind to a dashboard edit made after deploy. | `GET https://api.vercel.com/v2/user` returns 200 |

### 7.1 Why `SUPABASE_ACCESS_TOKEN` gets its own warning

It is the credential most likely to be silently dead, because nothing user-facing
breaks when it expires. When it did, the `types-drift guard` job failed, the CI
run concluded `failure`, and the post-deploy smoke gate's
`workflow_run.conclusion == 'success'` condition went false. **Production had no
smoke gate for two weeks because an unrelated schema-introspection job could not
authenticate.** The coupling is now removed (the smoke gate keys off the deploy),
but the token still needs to be alive for the drift guard to mean anything.

### 7.2 After ANY rotation

```bash
node scripts/check-env-stores.mjs          # both stores, every scope, every pinned branch
node scripts/check-dead-branch-env.mjs     # no orphaned credential copies left behind
node scripts/generate-env-state.mjs        # refresh the snapshot
```

Then confirm the production sentinel is green. It runs every five minutes and
emails on any CRITICAL fault, so silence after a rotation is itself a signal, but
do not rely on silence when you can ask:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  'https://www.eventlinqs.com.au/api/cron/health-sentinel?dry=1' | jq '.status'
```

---

## 8. `CRON_SECRET` is deliberately ONE secret in two stores

**Founder ruling 2026-08-08.** `check-env-stores` asserts that the Vercel
Production copy and the GitHub Actions copy are the SAME secret, and that is
correct by design, not a defect. The handshake proves equality by
**authenticating** rather than by comparing: CI sends
`Authorization: Bearer $CRON_SECRET` to a production cron route and requires
HTTP 200. Two different secrets cannot both succeed, so a 200 is proof of
byte-equality without either store ever revealing its value.

**The consequence, recorded because it follows directly from the design:**

> `CRON_SECRET` is a SINGLE POINT OF FAILURE. There is exactly one valid value
> at any moment, so the two copies move together or neither moves. There is no
> add-then-revoke window as there is for Stripe webhook secrets or Supabase
> keys.

What that means in practice:

- **Rotation is a simultaneous two-store write followed by one redeploy.** The
  gap between writing the first store and the second IS the outage: every cron
  route 401s, and the post-deploy smoke gate goes red.
- **Losing one copy loses the pair.** A store wiped or a secret rotated in one
  place with no record of the value means both must be regenerated together;
  there is nothing to recover it from.
- **Compromise is total.** One leaked value authorises every cron route:
  disbursement, payout holds, the digest send, publish-scheduled, reservation
  expiry, the health sentinel. There is no per-route scoping.
- **Never rotate it during a deploy or while a cron window is open.** Vercel
  crons that fire mid-rotation fail closed and are not retried.

If per-route scoping or an add-then-revoke window is ever wanted, that is a
design change to `src/lib/cron/auth.ts` (accept a comma-separated list of valid
secrets, exactly as `STRIPE_WEBHOOK_SECRETS` already does) and it is not a
rotation-runbook change. It is not currently built.

### Two shape violations found 8 August 2026

The manifest declares `CRON_SECRET` as `^\S{32,}$`, "a single-token secret of at
least 32 characters". Measured:

| Store | Length | Conforms |
|---|---|---|
| `.env.test` | 4 | **NO** |
| `.env.local` (PRODUCTION) | 28 | **NO** |

- **`.env.test` is FIXED**: regenerated to a 43-character
  `randomBytes(32).toString('base64url')` value. Our own TEST environment was
  violating the manifest we enforce everywhere else.
- **Production's 28-character value is NOT fixed and is a real finding.** The
  live environment violates its own declared shape. It is single-valued, so
  correcting it is a full simultaneous rotation of P and G, which is a
  production write and is held while production writes are frozen. It is not
  urgent on entropy grounds (28 characters of `openssl` output is still strong)
  but the manifest and the reality must agree, and today they do not.

**Did any check pass BECAUSE of the short value?** No. Verified empirically by
running every `CRON_SECRET`-touching check before and after the change:
`check-public-env` 0 to 0, `env-locks-verify` 0 to 0, `env-store-isolation`
1 to 1 (its failure is the six shared stores, and it reported `CRON_SECRET`
isolated both times). No verdict changed; the only difference is that the shape
violation disappeared from the output.

`check-public-env` had been reporting it correctly all along, as a **non-blocking
warning** because local-scope shape violations warn rather than block. So it was
passing IN SPITE of the short value, not because of it, and the value had been
visible in the output and ignored rather than hidden. That is a different
failure mode from a silent one, and a milder one, but a warning nobody reads is
on the same road as no warning at all.
