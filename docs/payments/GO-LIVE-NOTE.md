# Go-live note - payment rails (2026-07-12)

The two launch-day steps that CANNOT be verified from previews, because
Vercel runs vercel.json crons on production deployments only:

1. CRONS FIRING: after the production deploy, open Vercel > Crons and
   confirm `/api/cron/reservation-expire` (every minute) and
   `/api/cron/webhook-sentinel` (every 10 minutes) are listed and executing.
   Proof: one green sentinel log entry and one abandoned test hold released
   within two minutes.
2. PRODUCTION WEBHOOK ENDPOINT: mint the LIVE endpoint per
   docs/payments/WEBHOOK-CANON.md (URL www.eventlinqs.com, LIVE Stripe
   account), write its secret to the Vercel PRODUCTION env only, set
   `WEBHOOK_CANONICAL_HOST=www.eventlinqs.com` and `PAYMENT_ALERT_EMAIL`,
   and add `CRON_SECRET` to GitHub Actions secrets so the post-deploy
   sentinel step arms.

Both were exercised end to end on staging this mission (manual cron
invocations, sentinel proven green and alerting); production only needs the
wiring confirmed live.
