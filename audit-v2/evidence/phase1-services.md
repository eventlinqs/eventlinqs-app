# Phase 1: third-party service verification — 24 May 2026

All probes executed at audit time. Secret values are not echoed; only
endpoint, HTTP status, and non-secret response fields are recorded.

## Supabase

- Project ref: `gndnldyfudbytbboxesk` (Sydney, ap-southeast-2)
- `HEAD /rest/v1/` with apikey header → 401 (expected — no table path)
- `GET /rest/v1/events?select=slug,title,status&limit=10` with apikey +
  bearer → **200**, 10 published rows returned, RLS honoured (anon
  role only sees `status='published' AND visibility='public'`).
- Migration drift via Supabase MCP `list_migrations`: **0 drift**.
  - Local files: 25
  - Remote applied: 25
  - Latest applied: `20260520000002_webhook_dedupe`
  - Latest local file: `20260520000002_webhook_dedupe.sql`
  - No gaps, no orphans, no anomalies.

## Stripe

- Account `acct_1T8WBzGqHIQtgS8t`
- `GET /v1/account` → 200; `livemode=false`, `country=AU`,
  `email=hello@eventlinqs.com`
- `GET /v1/webhook_endpoints?limit=10` → 200, 1 endpoint:
  - URL: `https://www.eventlinqs.com/api/webhooks/stripe`
  - Status: enabled
  - api_version: `2026-02-25.clover`
  - 18 enabled events:
    ```
    charge.succeeded
    charge.updated
    checkout.session.completed
    checkout.session.expired
    payment_intent.succeeded
    payment_intent.payment_failed
    account.updated
    account.application.deauthorized
    payout.created
    payout.paid
    payout.failed
    payout.canceled
    transfer.created
    charge.dispute.created
    charge.dispute.closed
    payment_intent.requires_action
    payment_intent.canceled
    charge.refunded
    ```
  - Handled in code (`src/app/api/webhooks/stripe/route.ts`): 14
    (the first four in the list above fall into the `default` no-op).
    See MEDIUM-A in the main audit doc.

## Resend

- `GET /domains` → 200
- Domain `eventlinqs.com` (id `38bf2e6c-619c-418b-b47e-5e1038f96bf6`)
  - Region: `ap-northeast-1` (Tokyo)
  - Status: verified
  - DKIM `resend._domainkey` TXT: verified
  - SPF `send` MX → `feedback-smtp.ap-northeast-1.amazonses.com`: verified
  - SPF `send` TXT `v=spf1 include:amazonses.com ~all`: verified
  - DMARC: **not present** in the domain detail response.

See LOW-A (Tokyo region) and LOW-B (no DMARC) in the main audit doc.

## Vercel

- CLI not installed (per session-start hook). Could not run
  `vercel env ls`, `vercel ls`, or `vercel inspect`.
- `HEAD https://www.eventlinqs.com/` → 200, `Server: Vercel`,
  `X-Vercel-Cache: MISS` (first hit on a fresh cache window).
- `gh run list --branch main --limit 5` → 5 most recent runs all
  `conclusion=success, status=completed, event=push, name=CI`.

## Mapbox

- `HEAD /styles/v1/mapbox/streets-v12/tiles/0/0/0?access_token=...` →
  **200, Content-Type: image/png**.
- URL-restriction enforcement on the token cannot be inferred from a
  successful tile fetch in PowerShell (the request did not carry a
  Referer header that would be checked). REQUIRES MANUAL VERIFICATION
  via Mapbox dashboard.

## Upstash Redis

- Endpoint: `https://prepared-stork-113798.upstash.io`
- `GET /ping` with bearer auth → **200**, body
  `{"result":"PONG"}`.
- Region: N. Virginia (free tier per CLAUDE.md). Sydney migration is
  in-flight in Session 2.

## GitHub

- `gh auth status` → authenticated as `eventlinqs`, scopes
  `gist, read:org, repo, workflow`.
- `gh api repos/eventlinqs/eventlinqs-app` → 200; `default_branch=main`,
  `private=false`, `visibility=public`, `pushed_at=2026-05-23T20:35:08Z`.
- Branch protection details on main were not inspected; the standard
  `gh api repos/.../branches/main/protection` requires an admin token
  scope. REQUIRES MANUAL VERIFICATION via GitHub repo Settings.

## Sentry

- DSN present in `.env.local` (both `SENTRY_DSN` and
  `NEXT_PUBLIC_SENTRY_DSN`). Project `4511144328101888`, org
  `o4511144322203648`.
- No live error event was synthesised on production to avoid polluting
  the Sentry stream; `captureException` wrapping in the webhook hot
  paths is verified in the prior static audit.

## Mapbox + Google Maps coexistence

Both `NEXT_PUBLIC_MAPBOX_TOKEN` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
are present in `.env.local`. The codebase uses Mapbox for tile rendering
on event detail and city pages; Google Maps remains for legacy `/events?view=map`
fallback per prior audit. Not a finding; just an inventory note.

## Pexels

`PEXELS_API_KEY` present. Used for the seed-event cover image source
(see MEDIUM-5 in the prior audit). Not exercised in this audit.

## Admin TOTP

`ADMIN_TOTP_ENC_KEY` present (base64). Used by the admin 2FA enrolment
flow. Not exercised in this audit.

## PageSpeed API

`PAGESPEED_API_KEY` present. Used in Lighthouse CI tooling. Not
exercised in this audit (cleaned-up Lighthouse snapshots removed in
commit `ca192dd`).
