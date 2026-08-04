# Environment state

> **THIS FILE IS GENERATED. DO NOT EDIT IT.**
>
> It is written from two inputs and nothing else: the manifest in
> `src/lib/env/manifest.mjs`, and a live read of the Vercel scopes and the
> GitHub Actions secret list. Editing it changes nothing, and a hand-typed
> environment document is correct on the day it is written and silently wrong the
> moment somebody edits a dashboard, which is the exact failure this machinery
> exists to prevent.
>
> **The manifest and the guards are the authority, not this page.** This is a
> snapshot for a human to read. The enforcement lives in:
>
> | Lock | Where | What it does |
> |---|---|---|
> | 1 | `src/lib/env/manifest.mjs` | declares the contract for every variable |
> | 2 | `scripts/check-public-env.mjs` (prebuild) | FAILS THE BUILD on a violation |
> | 3 | `scripts/check-env-stores.mjs` | fails on cross-store disagreement |
> | 4 | `src/lib/health/checks.ts` (check `manifest`) | alerts at runtime, on the sentinel schedule |
>
> Regenerate with:
>
> ```
> node scripts/generate-env-state.mjs
> ```
>
> It needs an authenticated Vercel CLI (`npx vercel whoami`) and an
> authenticated `gh`. If either is unavailable the file is left untouched rather
> than rewritten from a partial read.

Manifest: **40 variables**, **5 cross-variable rules**.
Store records read: **121**.

- PRESENT AND CORRECT: **35**
- PRESENT BUT WRONG SCOPE: **0**
- PRESENT BUT READABLE (must be sensitive, is not): **5**
- MISSING: **0**

## Every variable

"Real payment" means production cannot take, or cannot complete, a genuine
purchase without it.

"Read-back" is the property that actually matters for a secret: can anyone with
project access pull the value out of the store in plain text. `withheld on read`
means the store refuses to return it. A withheld record is either sensitive
(correct) or empty (a defect), and Lock 2 and Lock 4 settle which, because a
build and a serving deployment can both see the real value.

| Variable | State | Required on | Forbidden on | Scopes present | Read-back | Fingerprint | Real payment | GitHub Actions |
|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | PRESENT AND CORRECT | production, preview, development | none | development, preview, preview (feat/design-elevation), preview (feat/design-elevation-r2), production | READABLE on preview, development, production | preview:eeb558cc development:eeb558cc production:db3ac258 | YES | not required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PRESENT AND CORRECT | production, preview, development | none | development, preview, preview (feat/design-elevation), preview (feat/design-elevation-r2), production | READABLE on preview, development, production | preview:ac96e992 development:ac96e992 production:c555ec59 | YES | not required |
| `SUPABASE_SERVICE_ROLE_KEY` | PRESENT BUT READABLE | production, preview, development | none | development, preview, preview (feat/design-elevation), preview (feat/design-elevation-r2), production | READABLE on preview, development | preview:f41f0bef development:f41f0bef | YES | not required |
| `NEXT_PUBLIC_SUPABASE_URL_PREVIEW` | PRESENT AND CORRECT | preview | production | preview, preview (feat/claude-api) | READABLE on preview | preview:eeb558cc | no | not required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW` | PRESENT AND CORRECT | preview | production | preview, preview (feat/claude-api) | READABLE on preview | preview:ac96e992 | no | not required |
| `SUPABASE_SERVICE_ROLE_KEY_PREVIEW` | PRESENT BUT READABLE | preview | production | preview, preview (feat/claude-api) | READABLE on preview | preview:f41f0bef | no | not required |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | PRESENT AND CORRECT | production, preview | none | preview, preview (feat/design-elevation), preview (feat/design-elevation-r2), preview (feat/event-media-standard), preview (feat/launch-kit), preview (release/launch-line), preview (staging/merged-main-final), production | READABLE on production | production:c87869cd | YES | not required |
| `STRIPE_SECRET_KEY` | PRESENT BUT READABLE | production, preview | none | development, preview, preview (feat/design-elevation), preview (feat/design-elevation-r2), preview (feat/event-media-standard), preview (feat/launch-kit), preview (release/launch-line), preview (staging/merged-main-final), production | READABLE on preview, development | preview:dbaa63a3 development:dbaa63a3 | YES | not required |
| `STRIPE_WEBHOOK_SECRETS` | PRESENT AND CORRECT | production, preview | none | preview, preview (feat/walkthrough-defects), production | withheld on read | - | YES | not required |
| `STRIPE_WEBHOOK_SECRET` | PRESENT BUT READABLE | none | none | development, preview, preview (feat/design-elevation), preview (feat/design-elevation-r2), preview (feat/event-media-standard), preview (feat/launch-kit), preview (release/launch-line), preview (staging/merged-main-final), production | READABLE on development | development:9a30e5dd | no | not required |
| `CRON_SECRET` | PRESENT AND CORRECT | production | none | preview, preview (feat/broadcast-layer), preview (feat/design-elevation), preview (feat/design-elevation-r2), preview (feat/event-media-standard), preview (feat/launch-kit), preview (release/launch-line), preview (staging/merged-main-final), production | withheld on read | - | YES | required, present |
| `QUEUE_SECRET` | PRESENT AND CORRECT | production | none | preview (release/launch-line), production | withheld on read | - | no | not required |
| `RESEND_API_KEY` | PRESENT BUT READABLE | production, preview | none | development, preview, production | READABLE on development | development:d0daa182 | YES | required, present |
| `EMAIL_FROM` | PRESENT AND CORRECT | production | none | development, preview, preview (feat/broadcast-layer), preview (feat/claude-api), preview (feat/design-elevation), preview (feat/design-elevation-r2), preview (feat/event-media-standard), preview (feat/launch-kit), preview (release/launch-line), production | READABLE on preview, development, production | preview:d6ba72dc development:d6ba72dc production:28217c69 | no | not required |
| `PAYMENT_ALERT_EMAIL` | PRESENT AND CORRECT | none | none | preview (feat/design-elevation-r2), preview (feat/launch-kit), preview (staging/merged-main-final) | unknown | - | no | not required |
| `SUPPORT_INBOX_EMAIL` | PRESENT AND CORRECT | none | none | none | unknown | - | no | not required |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | PRESENT AND CORRECT | production, preview | none | preview, production | withheld on read | - | no | not required |
| `GOOGLE_MAPS_API_KEY` | PRESENT AND CORRECT | production, preview | none | development, preview, production | READABLE on production, preview, development | production:3dcc7ad8 preview:3dcc7ad8 development:3dcc7ad8 | no | not required |
| `UPSTASH_REDIS_REST_URL` | PRESENT AND CORRECT | production | none | preview, production | withheld on read | - | no | not required |
| `UPSTASH_REDIS_REST_TOKEN` | PRESENT AND CORRECT | production | none | preview, production | withheld on read | - | no | not required |
| `ADMIN_TOTP_ENC_KEY` | PRESENT AND CORRECT | production | none | preview, production | withheld on read | - | no | not required |
| `NEXT_PUBLIC_SITE_URL` | PRESENT AND CORRECT | none | none | production | withheld on read | - | no | not required |
| `NEXT_PUBLIC_APP_URL` | PRESENT AND CORRECT | none | none | production | READABLE on production | production:9606bc2e | no | not required |
| `WEBHOOK_CANONICAL_HOST` | PRESENT AND CORRECT | none | none | preview (feat/design-elevation-r2), preview (feat/launch-kit), preview (staging/merged-main-final) | unknown | - | no | not required |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | PRESENT AND CORRECT | production | none | preview, production | withheld on read | - | no | not required |
| `VAPID_PRIVATE_KEY` | PRESENT AND CORRECT | production | none | preview, production | withheld on read | - | no | not required |
| `VAPID_SUBJECT` | PRESENT AND CORRECT | production | none | preview, production | withheld on read | - | no | not required |
| `ANTHROPIC_API_KEY` | PRESENT AND CORRECT | production | none | preview, production | withheld on read | - | no | not required |
| `SENTRY_DSN` | PRESENT AND CORRECT | none | none | preview, production | withheld on read | - | no | not required |
| `NEXT_PUBLIC_SENTRY_DSN` | PRESENT AND CORRECT | none | none | preview, production | withheld on read | - | no | not required |
| `SENTRY_ORG` | PRESENT AND CORRECT | none | none | preview, production | READABLE on preview, production | preview:ee0514f5 production:ee0514f5 | no | not required |
| `SENTRY_PROJECT` | PRESENT AND CORRECT | none | none | preview, production | READABLE on preview, production | preview:63ccb835 production:63ccb835 | no | not required |
| `SENTRY_AUTH_TOKEN` | PRESENT AND CORRECT | none | none | preview, production | withheld on read | - | no | not required |
| `HEALTH_CHECK_TOKEN` | PRESENT AND CORRECT | none | none | preview (release/launch-line), production | withheld on read | - | no | not required |
| `PEXELS_API_KEY` | PRESENT AND CORRECT | none | none | development, preview, production | READABLE on development, preview, production | development:d78fb89b preview:d78fb89b production:d78fb89b | no | not required |
| `HOMEPAGE_SEED_FIXTURE` | PRESENT AND CORRECT | none | production | preview | withheld on read | - | no | not required |
| `ALLOW_EMPTY_PUBLIC_ENV` | PRESENT AND CORRECT | none | production, preview, development | none | unknown | - | no | not required |
| `ALLOW_PRODUCTION_SUPABASE` | PRESENT AND CORRECT | none | production, preview, development | none | unknown | - | no | not required |
| `ALLOW_PRICING_DRIFT` | PRESENT AND CORRECT | none | production, preview, development | none | unknown | - | no | not required |
| `ALLOW_LOW_DISK` | PRESENT AND CORRECT | none | production, preview, development | none | unknown | - | no | not required |

## Expected shapes

| Variable | Expected shape |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | https://<project-ref>.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a legacy eyJ JWT or an sb_publishable_ key |
| `SUPABASE_SERVICE_ROLE_KEY` | a legacy eyJ JWT or an sb_secret_ key |
| `NEXT_PUBLIC_SUPABASE_URL_PREVIEW` | https://<project-ref>.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW` | a legacy eyJ JWT or an sb_publishable_ key |
| `SUPABASE_SERVICE_ROLE_KEY_PREVIEW` | a legacy eyJ JWT or an sb_secret_ key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | pk_live_51 followed by the 15-character account id and the key body |
| `STRIPE_SECRET_KEY` | (sk|rk)_live_51 followed by the 15-character account id and the key body |
| `STRIPE_WEBHOOK_SECRETS` | whsec_ followed by the signing secret body |
| `STRIPE_WEBHOOK_SECRET` | whsec_ followed by the signing secret body |
| `CRON_SECRET` | a single-token secret of at least 32 characters |
| `QUEUE_SECRET` | a single-token secret of at least 32 characters |
| `RESEND_API_KEY` | re_ followed by the Resend key body |
| `EMAIL_FROM` | an address at eventlinqs.com, the apex domain verified at Resend, optionally with a display name |
| `PAYMENT_ALERT_EMAIL` | any non-empty value with no leading or trailing whitespace |
| `SUPPORT_INBOX_EMAIL` | any non-empty value with no leading or trailing whitespace |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | AIza followed by the Google API key body (about 39 characters) |
| `GOOGLE_MAPS_API_KEY` | AIza followed by the Google API key body (about 39 characters) |
| `UPSTASH_REDIS_REST_URL` | https://<instance>.upstash.io |
| `UPSTASH_REDIS_REST_TOKEN` | any non-empty value with no leading or trailing whitespace |
| `ADMIN_TOTP_ENC_KEY` | a single-token secret of at least 32 characters |
| `NEXT_PUBLIC_SITE_URL` | an https origin on an eventlinqs.com or eventlinqs.com.au host |
| `NEXT_PUBLIC_APP_URL` | an https origin on an eventlinqs.com or eventlinqs.com.au host |
| `WEBHOOK_CANONICAL_HOST` | a bare hostname, no scheme and no path |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | a base64url VAPID public key (87 characters) |
| `VAPID_PRIVATE_KEY` | a base64url VAPID private key |
| `VAPID_SUBJECT` | a mailto: address or an https URL |
| `ANTHROPIC_API_KEY` | sk-ant- followed by the Anthropic key body |
| `SENTRY_DSN` | an https URL |
| `NEXT_PUBLIC_SENTRY_DSN` | an https URL |
| `SENTRY_ORG` | a short identifier |
| `SENTRY_PROJECT` | a short identifier |
| `SENTRY_AUTH_TOKEN` | any non-empty value with no leading or trailing whitespace |
| `HEALTH_CHECK_TOKEN` | any non-empty value with no leading or trailing whitespace |
| `PEXELS_API_KEY` | any non-empty value with no leading or trailing whitespace |
| `HOMEPAGE_SEED_FIXTURE` | any non-empty value with no leading or trailing whitespace |
| `ALLOW_EMPTY_PUBLIC_ENV` | any non-empty value with no leading or trailing whitespace |
| `ALLOW_PRODUCTION_SUPABASE` | any non-empty value with no leading or trailing whitespace |
| `ALLOW_PRICING_DRIFT` | any non-empty value with no leading or trailing whitespace |
| `ALLOW_LOW_DISK` | any non-empty value with no leading or trailing whitespace |

## Open findings

- **SUPABASE_SERVICE_ROLE_KEY** [preview]: must be stored as SENSITIVE but 1 record(s) on the preview scope can be read back in plain text by anyone with project access. Supabase service-role key: bypasses row level security. Fix: re-add it with --sensitive so the store will no longer reveal it.
- **SUPABASE_SERVICE_ROLE_KEY** [development]: must be stored as SENSITIVE but 1 record(s) on the development scope can be read back in plain text by anyone with project access. Supabase service-role key: bypasses row level security. Fix: re-add it with --sensitive so the store will no longer reveal it.
- **SUPABASE_SERVICE_ROLE_KEY_PREVIEW** [preview]: must be stored as SENSITIVE but 1 record(s) on the preview scope can be read back in plain text by anyone with project access. Preview override for the service-role key. Fix: re-add it with --sensitive so the store will no longer reveal it.
- **STRIPE_SECRET_KEY** [preview]: must be stored as SENSITIVE but 1 record(s) on the preview scope can be read back in plain text by anyone with project access. Stripe secret key: creates payment intents, transfers and refunds. Fix: re-add it with --sensitive so the store will no longer reveal it.
- **STRIPE_SECRET_KEY** [development]: must be stored as SENSITIVE but 1 record(s) on the development scope can be read back in plain text by anyone with project access. Stripe secret key: creates payment intents, transfers and refunds. Fix: re-add it with --sensitive so the store will no longer reveal it.
- **STRIPE_WEBHOOK_SECRET** [development]: must be stored as SENSITIVE but 1 record(s) on the development scope can be read back in plain text by anyone with project access. Legacy single webhook signing secret, appended after the plural list. Fix: re-add it with --sensitive so the store will no longer reveal it.
- **RESEND_API_KEY** [development]: must be stored as SENSITIVE but 1 record(s) on the development scope can be read back in plain text by anyone with project access. Resend API key: ticket emails, auth mail and every sentinel alert. Fix: re-add it with --sensitive so the store will no longer reveal it.

## GitHub Actions repository secrets

Read live via `gh secret list`. Only names are ever listed; GitHub does not
reveal a secret value to anyone, including its owner.

- `CRON_SECRET`
- `RESEND_API_KEY`
- `SUPABASE_ACCESS_TOKEN`

## Cross-variable rules

### STRIPE_ACCOUNT_PAIRING

The account id after pk_live_51 must equal the account id after sk_live_51. A publishable key from one Stripe account beside a secret key from another means Stripe.js cannot resolve a clientSecret minted by the other account, so the payment element renders NOTHING with no console error and no network error. This has bitten this project three times.

Applies to: production. Needs: the real values, so it runs in the build and in the serving deployment.

### STRIPE_MODE_FAMILY

On production every Stripe key must be LIVE. A live key coexisting with a test key in the same family looks configured, takes card details and settles nothing: a test-mode charge moves no money.

Applies to: production. Needs: the real values, so it runs in the build and in the serving deployment.

### SUPABASE_PRODUCTION_REF_ISOLATION

No non-production scope may resolve the PRODUCTION Supabase project, and the RAW base service-role key must not be the production one either, so a future direct process.env read cannot resurrect the row-level-security bypass.

Applies to: preview, development, local. Needs: the real values, so it runs in the build and in the serving deployment.

### WEBHOOK_SECRETS_ON_PRODUCTION

STRIPE_WEBHOOK_SECRETS must exist on the PRODUCTION scope and every comma-separated entry must match the whsec_ shape. Production runs two Stripe endpoints and each mints its own signing secret; hold fewer and every delivery from the uncovered endpoint 400s forever while payments keep succeeding.

Applies to: production. Needs: the real values, so it runs in the build and in the serving deployment.

### CRON_SECRET_CROSS_STORE

CRON_SECRET must exist in BOTH Vercel Production and GitHub Actions, and the two copies must be the same secret. When they diverge the post-deploy smoke gate cannot authenticate and silently stops probing the payment and health sentinels, which is exactly what happened from 2026-07-12 to 2026-07-30.

Applies to: production. Needs: both stores, so it runs in the store checker.
