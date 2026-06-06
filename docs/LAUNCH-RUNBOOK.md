# EventLinqs launch runbook (founder console)

The checklist for everything that must be done in an external console and that
Claude Code cannot reach from the repo. Each item has the exact click-path, how
to verify it, and a status.

Status legend: DONE (verified), PENDING (needs the founder), BLOCKER (must be
done before launch), UNKNOWN (cannot be read from here).

Important: the env values below were read from the local `.env.local` on
2026-06-06. Production runs on Vercel with its own environment variables;
confirm each on Vercel (Project, Settings, Environment Variables) as well.

---

## 1. Supabase Auth Site URL = https://www.eventlinqs.com  -  PENDING

Why: the Site URL is the redirect base for confirmation, magic-link, and
password-reset emails. If it points at localhost or the bare apex, auth links
break for real users.

Click-path: Supabase Dashboard, project `gndnldyfudbytbboxesk`, Authentication,
URL Configuration. Set Site URL to `https://www.eventlinqs.com`. Add the same to
Redirect URLs, plus `https://www.eventlinqs.com/**` and the Vercel preview
pattern if previews need auth.

Verify: trigger a password reset on production and confirm the email link points
at `https://www.eventlinqs.com/...`.

Repo signal: `NEXT_PUBLIC_APP_URL` is `http://localhost:3000` locally and
`NEXT_PUBLIC_SITE_URL` is unset (so `src/app/page.tsx` falls back to
`https://eventlinqs.com`). Set both to `https://www.eventlinqs.com` on Vercel.

## 2. Resend SMTP for noreply@eventlinqs.com  -  PENDING

Why: Supabase's built-in email is rate-limited and not deliverable at launch
scale. Auth emails must send through Resend from a verified domain.

Click-path:
- Resend Dashboard, Domains: verify `eventlinqs.com` (add the DKIM, SPF and
  return-path DNS records Resend shows; wait for Verified).
- Supabase Dashboard, Authentication, Emails (SMTP settings): enable Custom
  SMTP. Host `smtp.resend.com`, port 465, username `resend`, password = a Resend
  API key, sender `noreply@eventlinqs.com`, sender name `EventLinqs`.

Verify: send a test from the Supabase SMTP panel, then sign up a real address on
production and confirm the email arrives from `noreply@eventlinqs.com` and not
from a supabase.co address.

Repo signal: `RESEND_API_KEY` is present locally; the Supabase custom-SMTP
binding is a console setting and cannot be read from here.

## 3. Mapbox token URL restrictions  -  PENDING

Why: `NEXT_PUBLIC_MAPBOX_TOKEN` ships in client bundles. Without URL
restrictions anyone can lift it and burn the quota.

Click-path: Mapbox account, Tokens, open the public token. Under URL
restrictions add `https://www.eventlinqs.com`, `https://eventlinqs.com`, and the
Vercel preview pattern `https://*.vercel.app`. Scope it to the public styles and
tiles APIs only.

Verify: load a map page (`/city/[slug]`, `/venues/[handle]`) on production (OK)
and from an unlisted origin (should fail).

Repo signal: token present locally and used in `src/app/city/[slug]`,
`src/app/culture/[culture]/[city]`, `src/app/venues/[handle]`.

## 4. Upstash Redis migrated to Sydney  -  PENDING

Why: the current free database is N. Virginia; cross-region latency hurts every
rate-limit and inventory check. Launch needs a Sydney (ap-southeast-2) paid
database.

Click-path: Upstash Console, create a new Redis database in `ap-southeast-2`
(Sydney), paid tier. Copy its REST URL and token into Vercel as
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Redeploy. Decommission
the old database once traffic has moved.

Verify: in the Upstash console the active database region reads
`ap-southeast-2`, and the production REST URL host matches it.

Repo signal: current `UPSTASH_REDIS_REST_URL` host is
`prepared-stork-113798.upstash.io`; the host name does not reveal the region, so
confirm in the console.

## 5. Credential rotation before launch  -  PENDING

Why: every secret that has been on a developer machine or in chat should be
rotated before real money and real PII flow.

Rotate / confirm (each in its own console, then update Vercel env and redeploy):

- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_PASSWORD_SYDNEY` (Supabase,
  Settings, API and Database).
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET` (Stripe, Developers; see item 7 for live mode).
- `RESEND_API_KEY` (Resend, API Keys).
- `UPSTASH_REDIS_REST_TOKEN` (rotates with the new Sydney database, item 4).
- `CRON_SECRET` and `ADMIN_TOTP_ENC_KEY` (regenerate; `ADMIN_TOTP_ENC_KEY`
  rotation re-keys admin TOTP, so re-enrol admins).
- API keys: `NEXT_PUBLIC_MAPBOX_TOKEN` (item 3), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  (add HTTP-referrer restrictions), `PEXELS_API_KEY`, `PAGESPEED_API_KEY`.
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are not secret; no rotation needed.

Verify: production boots green after rotation and a smoke purchase succeeds.

## 6. Stripe Connect payout schedule  -  BLOCKER

Why: connected organiser accounts must be on the platform's intended payout
schedule. A known launch blocker is accounts defaulting to Stripe's daily
automatic schedule instead of the manual / Tier-1 3-day post-event schedule the
platform controls.

Click-path: Stripe Dashboard, Connect, Accounts. Open a connected account,
Settings, Payouts, confirm the schedule. For the platform default: Connect,
Settings, payout schedule for connected accounts. Set to manual (platform
controlled) so payouts fire via the disbursement service, not Stripe's daily
cron.

Verify: `stripe accounts retrieve <acct>` shows
`settings.payouts.schedule.interval = manual` for a sample connected account.

Repo signal: no payout-schedule constant is hardcoded in the app; the schedule
is set on the connected account via Stripe, so it must be checked in Stripe.

## 7. Stripe LIVE mode  -  BLOCKER

Why: local keys are in TEST mode. Real ticketing needs live keys and a live
webhook.

Click-path: Stripe Dashboard, toggle to live, Developers, API keys: copy the
live secret and publishable keys to Vercel. Developers, Webhooks: create the
live endpoint `https://www.eventlinqs.com/api/webhooks/stripe` subscribed to the
14 events (5 payment + 9 Connect) and copy the live signing secret to
`STRIPE_WEBHOOK_SECRET`. Statement descriptor `EVENTLINQS` / `ELINQS`.

Verify (no secrets printed): both keys start with `sk_live_` /
`pk_live_`; a live test purchase settles and the webhook delivers.

Repo signal: local `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
are both TEST mode as of 2026-06-06. Confirm Vercel production uses live keys.

## 8. Storage bucket allows image/avif  -  BLOCKER (verified missing)

Why: the imagery ingestion pipeline (`scripts/ingest-imagery.mjs`) uploads AVIF
renditions. The `event-images` bucket currently rejects them.

Click-path: Supabase Dashboard, Storage, `event-images`, bucket settings. Add
`image/avif` to Allowed MIME types (keep jpeg, png, webp, gif). Raise the file
size limit above 5 MB if large hero sources are needed.

Verify (from the repo): the bucket's `allowed_mime_types` includes
`image/avif`; a real `node scripts/ingest-imagery.mjs --src <library>` run
uploads without the "mime type image/avif is not supported" error.

Status detail: VERIFIED on 2026-06-06 that the bucket allows only
`["image/jpeg","image/png","image/webp","image/gif"]`. Until `image/avif` is
added this is a hard blocker for the pipeline. See
`docs/launch-hardening/imagery-pipeline.md`.

---

## Already verified from the repo (no console action needed)

- Migration drift: NONE. 34 local migrations match 34 remote applied
  (`docs/launch-hardening/migration-drift-2026-06-06.md`). DONE.
- Server-side auth uses revalidating `getUser()`; zero server-side
  `getSession()`, guarded by a test (hardening item 7). DONE.
- Admin revenue cards show exact cents, not rounded dollars (hardening item 9).
  DONE.

## Quick status table

| # | Item | Status |
|---|------|--------|
| 1 | Supabase Auth Site URL = www.eventlinqs.com | PENDING |
| 2 | Resend SMTP for noreply@eventlinqs.com | PENDING |
| 3 | Mapbox token URL restrictions | PENDING |
| 4 | Upstash Redis in Sydney | PENDING |
| 5 | Credential rotation | PENDING |
| 6 | Stripe Connect payout schedule | BLOCKER |
| 7 | Stripe live mode + live webhook | BLOCKER |
| 8 | Storage bucket allows image/avif | BLOCKER (verified missing) |
