# EventLinqs Platform Health Sentinel and Founder Alerting

You are the first to know when anything breaks. No user, friend, or customer
should ever discover a fault before you do. This is how that promise is kept,
in plain language.

## What it is

A scheduled monitor that checks every critical system every 5 minutes and again
after every deployment. When something CRITICAL breaks (money path, site down,
checkout broken, database down, email down), it emails you immediately. Softer
problems (maps, AI, push) roll into a once-a-day summary. Every morning you get
a short "all green" heartbeat, so if that email ever goes missing, that silence
itself tells you the monitor is down.

- **Schedule:** `/api/cron/health-sentinel` every 5 min (`vercel.json`).
- **After every deploy:** the post-deploy smoke workflow calls it once the new
  build is live (`.github/workflows/post-deploy-smoke.yml`).
- **Daily heartbeat:** `/api/cron/health-heartbeat` at 21:00 UTC (~07:00 AEST).
- **Live status page (private, founder-only):** `/admin/health` - runs every
  check live on load and shows green / amber / red per system with the check
  time. No waiting for an email.
- **Alerts go to:** `PAYMENT_ALERT_EMAIL` (defaults to `lawaladams9@gmail.com`).
- **Money-path checks are shared** with the payment sentinel
  (`src/lib/health/payment-checks.ts`) - one source of truth, never duplicated.

## Severity

- **CRITICAL** = immediate email. Payment path, database, email delivery,
  primary pages, SSL/domain, critical env vars.
- **WARNING** = rolled into the daily heartbeat. Maps, image storage, AI layer,
  web push.

## No false alarms

Each check separates a true failure from a benign state, so the monitor never
cries wolf:

- The drift watchdog only alerts when Stripe holds a **succeeded** payment for
  an order still marked pending. Ordinary abandoned carts are ignored.
- A missing map/AI/push key is a WARNING, not a CRITICAL, because checkout and
  browsing still work.
- Redirects (3xx) and auth-gated 401/403 on primary pages are treated as
  healthy; only 5xx or unreachable is a fault.
- A persisting fault re-alerts at most once every 30 minutes (deduped through
  Redis), and you get a "RECOVERED" email the moment it clears.

## Every alert, what it means, what you do

| System | What a red means | What you do |
|---|---|---|
| **Payment path** | The webhook that confirms paid orders is failing, or a real payment did not confirm. | Open `docs/payments/WEBHOOK-CANON.md`. Almost always the Stripe webhook signing secret in Vercel differs from the enabled Stripe endpoint - re-key per the runbook and redeploy. |
| **Database (Supabase)** | The app cannot read/write the database. Checkout, tickets, everything stalls. | Check Supabase status page. Confirm `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` are present/correct in Vercel for the serving environment. |
| **Email delivery (Resend)** | Confirmation emails AND these alerts cannot send. | Resend dashboard → API Keys: confirm the key is active. Update `RESEND_API_KEY` in Vercel and redeploy. |
| **Image storage** | Cover/photo uploads and images are failing. | Supabase → Storage: confirm the `event-images` bucket exists and is public. |
| **Map surfaces** | A map key is missing from this build, so maps render a fallback. | Vercel → Env Vars: set the missing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (event maps) or `NEXT_PUBLIC_MAPBOX_TOKEN` (city/venue maps), then **rebuild** (these are baked at build time). |
| **AI layer** | The AI assistants are offline (missing key) or the spend guard's store is down. | Vercel → Env Vars → add `ANTHROPIC_API_KEY` (Production + Preview), redeploy. Soft feature; nothing else is affected. |
| **Web push** | Push alerts are unconfigured, so alerts fall back to email. | Generate a VAPID keypair (`npx web-push generate-vapid-keys`) and add `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Vercel, then rebuild. |
| **Primary pages** | A main page is 500ing or unreachable - the site is degraded/down. | Open the failing path + the Vercel deployment logs. If all pages fail, roll back to the last green deployment in Vercel → Deployments. |
| **SSL + domain** | The site's certificate is invalid/expired, or the domain does not resolve. | Vercel → Domains: confirm the domain is attached and its cert is valid (Vercel auto-renews; red here means DNS/verification broke). |
| **Critical env vars** | A must-have secret is absent from the deployment serving traffic. | Vercel → Env Vars: add the named var for the serving environment. `NEXT_PUBLIC_` vars need a rebuild. |

## Proving it works (drills)

All calls are cron-authed (`Authorization: Bearer $CRON_SECRET`).

- **Green run (no email):**
  `GET /api/cron/health-sentinel?dry=1` - runs every check, sends nothing.
- **Break drill (proves the CRITICAL email lands):**
  `GET /api/cron/health-sentinel?drill=email` (or `payment`, `database`,
  `storage`, `maps`, `ai`, `push`, `pages`, `ssl`, `env`, or `all`) - forces
  that check to fail so the alert email is sent with the correct diagnosis.
  Nothing real is touched; the drill is labelled as such in the email.
- **Heartbeat:** `GET /api/cron/health-heartbeat` sends the daily summary now.

## Go-live wiring (production)

At production go-live, confirm in Vercel (Production scope):

1. `CRON_SECRET` set (crons refuse to run without it - fail closed).
2. `PAYMENT_ALERT_EMAIL` set to the founder inbox (else defaults to
   `lawaladams9@gmail.com`).
3. `RESEND_API_KEY` + `EMAIL_FROM` set (a verified Resend sending domain).
4. `ANTHROPIC_API_KEY` and the three `VAPID_*` vars added to Production if AI
   and push are wanted at launch (currently WARNING gaps - see the integrations
   table in the mission report).
5. The `CRON_SECRET` GitHub Actions secret set so the post-deploy probe runs.

The `crons` block in `vercel.json` activates automatically on the production
deployment. The daily heartbeat is your dead-man's switch: if it stops
arriving, the monitor itself is down.
