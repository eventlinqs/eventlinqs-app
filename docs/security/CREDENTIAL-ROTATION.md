# EventLinqs Credential Rotation Runbook

Pre-launch security hardening. This is the go-live source of truth for every
credential the platform uses: where it lives, which environments hold it,
whether it has ever been exposed, and the exact steps to revoke and reissue it.

Audit date: 2026-07-24. Method: repository sweep, full git-history sweep,
client-bundle inspection, runtime-logging review, and Vercel scope inventory via
the authenticated CLI. Secret values are never printed in this document.

---

## 0. Immediate actions (do these first)

1. **ROTATE THE VERCEL CLI TOKEN NOW - treat it as compromised.** Its full value
   was surfaced in an assistant terminal session (see section 2). Steps in
   section 4.1.
2. **Set the four variables missing from Production** (section 3), above all
   `CRON_SECRET` - without it every scheduled job (payment sentinel, reservation
   expiry, payout holds, event disbursement, health heartbeat) is rejected 401
   and never runs.
3. **Mark the high-value server secrets as "Sensitive" in Vercel** (section 5):
   several currently decrypt on `vercel env pull`, meaning they are readable, not
   write-only.

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

Confirmed via `vercel env ls production` (scope membership is reliable). These
are genuinely absent from Production:

| Variable | Impact if left unset | Fix |
|---|---|---|
| **`CRON_SECRET`** | **Every cron 401s and never runs** (proven: `/api/cron/webhook-sentinel` etc. return 401 on production). | Add to Production: a strong random value (`openssl rand -hex 24`). Also add the identical value as a GitHub Actions secret so the post-deploy probe can call the crons. |
| `PAYMENT_ALERT_EMAIL` | Sentinel alerts fall back to the hardcoded default `lawaladams9@gmail.com` (harmless, but set it explicitly). | Add to Production: the founder inbox. |
| `WEBHOOK_CANONICAL_HOST` | The payment sentinel's endpoint-config check defaults to the deployment host; set it to the canonical production host to detect duplicate Stripe endpoints. | Add to Production: `www.eventlinqs.com`. |
| `QUEUE_SECRET` | High-demand event queue token signing is unconfigured (only matters if the queue is used at launch). | Add to Production if the queue is in use: `openssl rand -hex 24`. |

Note: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY`, and the three
`VAPID_*` vars are now present in Production (set during earlier work / by the
founder). `NEXT_PUBLIC_*` values are baked at build, so any change to them
requires a rebuild, not just a redeploy.

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

## 5. "Sensitive" flag - hardening gap

Vercel "Sensitive" env vars are write-only (never returned on read). Evidence:
several high-value server secrets **decrypted on `vercel env pull --environment=production`**,
which means they are stored as normal (readable) encrypted vars, not Sensitive:

- **`STRIPE_SECRET_KEY`** - readable
- **`SUPABASE_SERVICE_ROLE_KEY`** - readable
- `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GOOGLE_MAPS_API_KEY`, `PEXELS_API_KEY` - readable

**Action:** in Vercel -> Project -> Settings -> Environment Variables, edit each
server secret and enable **Sensitive** (this re-creates it write-only). Do this
for every secret in section 4 except the `NEXT_PUBLIC_*` ones (which are
client-visible by design and cannot be Sensitive). I could not confirm the flag
programmatically because the stored CLI token is rejected by the REST API; verify
in the dashboard.

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
