# Webhook canon - the one documented home for the Stripe webhook secret

This ends the recurring drift: ONE live endpoint per environment, ONE place
its secret lives, one rotation procedure, and an automated sentinel that
emails the founder the moment any of it stops holding.

## What is live right now (staging / TEST)

| Item | Value |
|---|---|
| Live endpoint | `we_1TsCg7GqHIQtgS8tACqBes6I` (created 2026-07-12, audit re-key) |
| URL | `https://eventlinqs-staging.vercel.app/api/webhooks/stripe` |
| Old endpoint | `we_1TpKq2GqHIQtgS8tIND6Iy23` - DISABLED 2026-07-12 (its secret had drifted from the app env; paid orders sat pending) |
| Stripe account | the TEST sandbox `acct_1T8WBzGqHIQtgS8t` |

## Where the secret lives (all three must always match)

1. Vercel branch env `STRIPE_WEBHOOK_SECRET` on `feat/launch-kit` (the
   staging line) - runtime source of truth for deployed staging.
2. Vercel branch env on any active elevation branch (`feat/design-elevation`,
   `feat/design-elevation-r2`) - so challenger previews verify the same signer.
3. `.env.test` locally - the value harnesses and probes sign with.

RULE: the secret is only ever WRITTEN as part of the rotation procedure
below, never patched in one place. Env changes take effect on the NEXT
deployment (Vercel snapshots env per deployment): after any secret change,
rebuild the branch and re-alias staging.

## Rotation procedure (the only sanctioned way to change the secret)

1. Create a NEW endpoint via the Stripe API with the same URL and the
   enabled-events list of the current one; capture `secret` from the CREATE
   response (the only moment Stripe reveals it).
2. Write that secret to ALL homes above (both/all branch envs + .env.test).
3. Disable the old endpoint (never leave two enabled: the sentinel treats
   duplicate enabled endpoints at the canonical host as a failure).
4. Push a rebuild of the affected branches; re-alias staging.
5. Prove: run the sentinel (green), then one live paid purchase confirming
   through the webhook.

## The payment sentinel

Route: `/api/cron/webhook-sentinel` (CRON_SECRET-authed, scheduled every 10
minutes in vercel.json, plus a post-deploy hook step in
`.github/workflows/post-deploy-smoke.yml`).

Checks and their probable-cause mapping:
- SELF-PROBE: a synthetic `sentinel.probe` event signed with the
  deployment's own secret goes through the REAL webhook route. 400 =
  signature mismatch; unreachable = endpoint down; other non-200 =
  processing error.
- DRIFT WATCHDOG: paid orders stuck `pending` beyond 15 minutes = deliveries
  failing while payments succeed (the 2026-07-12 incident class).
- ENDPOINT CONFIG: exactly one ENABLED Stripe endpoint at the canonical host
  (`WEBHOOK_CANONICAL_HOST`, default: the deployment's own host).

On any failure the sentinel emails `PAYMENT_ALERT_EMAIL` (default the
founder) through the existing Resend rails, naming the deployment and the
probable cause. Drill mode `?simulate=missign` deliberately mis-signs the
probe to prove the alert path end to end.

The sentinel READS ONLY: it never mutates orders, seats, or money, and the
funds-holding engine is untouched.

## Go-live day (production)

1. Mint the PRODUCTION endpoint: same procedure, URL
   `https://www.eventlinqs.com/api/webhooks/stripe`, LIVE Stripe account;
   write the secret to the Vercel PRODUCTION env only.
2. Set `WEBHOOK_CANONICAL_HOST=www.eventlinqs.com` and
   `PAYMENT_ALERT_EMAIL` in the Production env.
3. Add `CRON_SECRET` as a GitHub Actions secret so the post-deploy sentinel
   step arms (it warns-and-skips until then).
4. First live purchase + a green production sentinel are the go-live proof.
