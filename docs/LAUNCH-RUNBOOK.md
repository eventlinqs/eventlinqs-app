# EventLinqs launch runbook (founder console)

The checklist for everything that must be done in an external console and that
Claude Code cannot reach from the repo. Each item has the exact click-path, how
to verify it, and a status.

Status legend: DONE (verified), PENDING (needs the founder), BLOCKER (must be
done before launch), UNKNOWN (cannot be read from here).

Important: this file was re-audited against the code on 2026-07-25. Every
"Repo signal" below was re-derived from the running source on that date, not
carried forward. Production runs on Vercel with its own environment variables;
confirm each on Vercel (Project, Settings, Environment Variables) as well.

Audit note (2026-07-25): the previous revision of this file contained four
claims that contradicted the code, one of them dangerous (it instructed the
founder to put connected accounts on a MANUAL payout schedule, which would have
stranded organiser money). Those are corrected in place and called out in the
"Corrections applied" section at the foot of this file.

---

## 1. Supabase Auth Site URL  -  PENDING

Why: the Site URL is the redirect base for confirmation, magic-link, and
password-reset emails. If it points at localhost or the bare apex, auth links
break for real users.

Click-path: Supabase Dashboard, project `gndnldyfudbytbboxesk`, Authentication,
URL Configuration. Set Site URL to the canonical host. Add the same to Redirect
URLs, plus the `/**` wildcard and the Vercel preview pattern if previews need
auth.

Verify: trigger a password reset on production and confirm the email link points
at the canonical host.

Repo signal (re-derived 2026-07-25): `src/proxy.ts` is the authority. It defines
`APEX_HOST = 'eventlinqs.com'` and `CANONICAL_HOST = 'www.eventlinqs.com'` and
308-redirects the bare apex onto the www host (the Stripe webhook path is
deliberately exempt so it never sees a 3xx). So the canonical host in code is
`https://www.eventlinqs.com`.

OPEN QUESTION, needs a founder ruling: four hosts currently answer 200
independently, and only one pair is canonicalised.

| Host | Observed 2026-07-25 |
|---|---|
| `https://eventlinqs.com` | 308 to `https://www.eventlinqs.com/` |
| `https://www.eventlinqs.com` | 200 |
| `https://eventlinqs.com.au` | 200, no redirect |
| `https://www.eventlinqs.com.au` | 200, no redirect |

`src/proxy.ts` does not canonicalise either `.com.au` host, so auth cookies and
sessions can be established on up to three separate origins. That is exactly
what the HARD-01 canonicalisation was written to prevent. Decide which domain is
the real production domain, then make `CANONICAL_HOST` and the Supabase Site URL
agree with it and redirect the other three.

Env signal (production scope, read 2026-07-25): `NEXT_PUBLIC_APP_URL` is
`https://eventlinqs.com` (the apex, which the proxy then redirects, so every
absolute URL the app emits costs a hop). `NEXT_PUBLIC_SITE_URL` EXISTS on the
Production scope but resolves EMPTY, which is the present-but-empty silent
failure class that `src/lib/health/critical-env.mjs` was written to catch.

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

Repo signal: `RESEND_API_KEY` is set on the Production scope. The Supabase
custom-SMTP binding is a console setting and cannot be read from here.

## 3. Google Maps API key restrictions  -  PENDING

Why: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` ships in client bundles. Without HTTP
referrer restrictions anyone can lift it and burn the quota.

Click-path: Google Cloud Console, APIs and Services, Credentials. Open the
browser key. Under Application restrictions choose HTTP referrers and add the
production hosts plus the Vercel preview pattern `https://*.vercel.app`. Under
API restrictions scope it to the Maps JavaScript, Places and Geocoding APIs
only.

Verify: load a map-bearing page on production (OK) and from an unlisted origin
(should fail).

Repo signal (re-derived 2026-07-25): maps are GOOGLE, not Mapbox. There is not a
single `MAPBOX` reference left anywhere in `src/`, and `NEXT_PUBLIC_MAPBOX_TOKEN`
does not exist on any Vercel scope. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is a
build-critical rule in `src/lib/health/critical-env.mjs` (must start `AIza`,
at least 35 chars), so an empty or malformed value now fails the build rather
than silently breaking every map.

## 4. Upstash Redis migrated to Sydney  -  PENDING

Why: the original free database is N. Virginia; cross-region latency hurts every
rate-limit and inventory check. Launch needs a Sydney (ap-southeast-2) database.

Click-path: Upstash Console, create a new Redis database in `ap-southeast-2`
(Sydney), paid tier. Copy its REST URL and token into Vercel as
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Redeploy. Decommission
the old database once traffic has moved.

Verify: in the Upstash console the active database region reads
`ap-southeast-2`, and the production REST URL host matches it.

Repo signal (2026-07-25): both `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` are set on the Production scope but are flagged
Sensitive in Vercel, so their values cannot be read back from the CLI and the
region CANNOT be confirmed from here. This must be checked in the Upstash
console. The host name does not reveal the region in any case.

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
- `ADMIN_TOTP_ENC_KEY` (regenerate; rotation re-keys admin TOTP, so re-enrol
  admins).
- API keys: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_API_KEY`
  (add referrer restrictions, item 3), `PEXELS_API_KEY`, `PAGESPEED_API_KEY`.
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are not secret; no rotation needed.

Already rotated, no action:
- `CRON_SECRET`  -  rotated 2026-07-25 on the Production scope.
- `QUEUE_SECRET`  -  generated fresh and set on the Production scope
  2026-07-25. Before that it was NOT set at all in production, so
  `src/lib/queue/tokens.ts` was signing queue admission tokens with the public
  repo constant `dev-queue-secret-change-in-prod`. That constant can no longer
  be reached in production: the module now fails closed (refuses to mint a
  token, and honours none) when `QUEUE_SECRET` is absent, and `QUEUE_SECRET` is
  a health-checked critical env rule.

Verify: production boots green after rotation and a smoke purchase succeeds.

## 6. Stripe Connect payout schedule  -  DONE (set in code, verify a sample)

Why: connected organiser accounts must be on the platform's intended payout
schedule so organiser money actually lands.

THE SCHEDULE IS DAILY, AND THAT IS CORRECT. Do NOT set connected accounts to
manual. Under the funds-holding model EventLinqs is merchant of record and holds
the money; the connected account's balance is EMPTY until our post-event
transfer lands. A daily automatic schedule therefore cannot front-run the hold,
it simply pays the organiser out promptly once we have transferred. Setting
these accounts to manual would leave transferred funds sitting in the connected
balance with nothing configured to release them, which strands organiser money.

Repo signal (the authority, re-derived 2026-07-25): the schedule IS hardcoded in
the app, in two places, both `interval: 'daily'`:

- `src/lib/stripe/connect.ts:152-159`, inside `createExpressAccount`:
  `settings: { payouts: { schedule: { interval: 'daily', delay_days:
  input.payoutDelayDays } } }`, carrying the comment that a daily connected
  payout schedule is safe precisely because the connected balance is empty until
  the post-event transfer.
- `src/lib/stripe/connect.ts:181`, inside `setPlatformPayoutSchedule`, the
  PAY-01 backfill for accounts onboarded before the schedule was enforced. Run
  this for any account created earlier.

Click-path (verification only, not a change): Stripe Dashboard, Connect,
Accounts. Open a connected account, Settings, Payouts, confirm the schedule
reads daily with the expected delay.

Verify: `stripe accounts retrieve <acct>` shows
`settings.payouts.schedule.interval = daily` for a sample connected account, and
`delay_days` matching the tier's `payoutDelayDays`. Any account showing `manual`
predates the enforcement and needs `setPlatformPayoutSchedule` run against it.

## 7. Stripe LIVE mode  -  BLOCKER

Why: production is still on TEST-mode API keys. Real ticketing needs live keys.

CURRENT STATE (verified by key prefix on the Production scope, 2026-07-25):

| Variable | Mode |
|---|---|
| `STRIPE_SECRET_KEY` | TEST (`sk_test_`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | TEST (`pk_test_`) |
| `STRIPE_WEBHOOK_SECRET` | LIVE platform signing secret, installed 2026-07-25 |

That combination is deliberately half-migrated and MUST be finished before any
real sale. The live webhook secret means production now verifies live-mode
deliveries, but the handlers still call Stripe with a TEST key, so any live
event that triggers a Stripe API read (for example `stripe.refunds.list` in
`handleChargeRefunded`) will not find the live object. Ship the live API keys in
the same window.

Click-path: Stripe Dashboard, toggle to live, Developers, API keys: copy the
live secret and publishable keys to Vercel (Production scope only). Statement
descriptor `EVENTLINQS` / `ELINQS`.

Webhook destinations: the live endpoint is
`https://www.eventlinqs.com/api/webhooks/stripe` and must be subscribed to the
**18** events the route actually handles, not 14. The breakdown is 5 payment
plus 9 Connect plus 4 explicit no-ops:

- Payment (5): `payment_intent.succeeded` (handled in a dedicated atomic path
  before the switch), `payment_intent.payment_failed`,
  `payment_intent.requires_action`, `payment_intent.canceled`,
  `charge.refunded`.
- Connect (9): `account.updated`, `account.application.deauthorized`,
  `payout.created`, `payout.paid`, `payout.failed`, `payout.canceled`,
  `transfer.created`, `charge.dispute.created`, `charge.dispute.closed`.
- Explicit no-ops (4): `charge.succeeded`, `charge.updated`,
  `checkout.session.completed`, `checkout.session.expired`. These are
  deliberately subscribed and deliberately do nothing, so they appear in logs as
  known-handled rather than falling through to the unknown-event branch. See
  `docs/observability/stripe-webhook-subscriptions.md`, which is the per-event
  authority and already records 18.

SECOND DESTINATION, NOT YET SUPPORTED BY THE CODE: a separate live destination
for connected-account events issues its own `whsec_`. The route cannot use it
today. `src/lib/payments/stripe-adapter.ts:106-111` reads exactly one
`process.env.STRIPE_WEBHOOK_SECRET` and passes it to
`stripe.webhooks.constructEvent`, so any delivery signed by the second
destination fails verification and returns 400. This was confirmed against
production on 2026-07-25: a request signed with the platform secret returned
200, and the identical request signed with the connected-accounts secret
returned 400. Until the adapter accepts a list of candidate secrets, keep every
event on the single platform destination.

Verify (no secrets printed): both keys start with `sk_live_` / `pk_live_`; a
live purchase settles and the webhook delivers.

## 8. Storage bucket allows image/avif  -  DONE (verified 2026-07-25)

Why: the imagery ingestion pipeline (`scripts/ingest-imagery.mjs`) uploads AVIF
renditions, which the `event-images` bucket previously rejected.

Status: RESOLVED. Queried live on 2026-07-25, the `event-images` bucket
`allowed_mime_types` is
`["image/jpeg","image/png","image/webp","image/gif","image/avif"]`. The earlier
"verified missing" finding of 2026-06-06 is no longer true and the blocker is
cleared.

Remaining note: `file_size_limit` is still 5242880 (5 MB). Raise it in Supabase
Dashboard, Storage, `event-images`, bucket settings only if large hero sources
are needed. See `docs/launch-hardening/imagery-pipeline.md`.

---

## Already verified from the repo (no console action needed)

- Server-side auth uses revalidating `getUser()`; zero server-side
  `getSession()`, guarded by a test (hardening item 7). DONE.
- Admin revenue cards show exact cents, not rounded dollars (hardening item 9).
  DONE.

## Quick status table

| # | Item | Status |
|---|------|--------|
| 1 | Supabase Auth Site URL + canonical domain ruling | PENDING |
| 2 | Resend SMTP for noreply@eventlinqs.com | PENDING |
| 3 | Google Maps key referrer restrictions | PENDING |
| 4 | Upstash Redis in Sydney | PENDING (region unreadable from repo) |
| 5 | Credential rotation | PENDING (CRON_SECRET + QUEUE_SECRET done) |
| 6 | Stripe Connect payout schedule | DONE (daily, set in code) |
| 7 | Stripe live mode + live webhook | BLOCKER (live keys still outstanding) |
| 8 | Storage bucket allows image/avif | DONE (verified 2026-07-25) |

## Corrections applied 2026-07-25

Every claim below was in the previous revision and contradicted the code.

1. **Item 6 said to set connected accounts to MANUAL.** The code sets `daily`
   in two places (`src/lib/stripe/connect.ts:152-159` and `:181`), deliberately,
   because the funds-holding model leaves the connected balance empty until the
   post-event transfer. Following the old instruction would have stranded
   organiser money in connected balances with nothing configured to release it.
   Corrected to daily, with the reasoning recorded inline.
2. **Item 6 claimed "no payout-schedule constant is hardcoded in the app".**
   False. It is hardcoded in the two call sites named above. Corrected.
3. **Item 6's verify step told the founder to expect `interval = manual`.** That
   would have made a correctly configured account look broken. Corrected to
   expect `daily`.
4. **Item 7 said the endpoint subscribes to "14 events (5 payment + 9
   Connect)".** The route handles 18. The old total omitted the 4 explicit
   no-op events, and `docs/observability/stripe-webhook-subscriptions.md`
   already recorded 18, so the two docs disagreed. Corrected, with the full
   list.
5. **Item 3 was written for Mapbox.** There is no Mapbox left in `src/` and no
   `NEXT_PUBLIC_MAPBOX_TOKEN` on any Vercel scope; maps are Google. The whole
   item was rewritten for the Google key, including its restriction click-path.
6. **Item 3 cited `src/app/culture/[culture]/[city]`.** That route no longer
   exists; the community surfaces are `/community/...` and the word is banned
   platform-wide. Removed.
7. **Item 1 claimed `NEXT_PUBLIC_APP_URL` is `http://localhost:3000` and
   `NEXT_PUBLIC_SITE_URL` is unset.** On the Production scope
   `NEXT_PUBLIC_APP_URL` is `https://eventlinqs.com` and `NEXT_PUBLIC_SITE_URL`
   exists but is EMPTY. Corrected, and the empty-value hazard called out.
8. **Item 1 asserted a single canonical domain.** Four hosts answer 200 and only
   the `.com` apex is canonicalised. Raised as an open founder ruling rather
   than silently picking one.
9. **The "Already verified" section claimed 34 local migrations match 34 remote
   applied.** There are now 74 migration files in `supabase/migrations/`, so the
   2026-06-06 drift check no longer describes the repo. The stale claim was
   removed; re-run a real drift check before launch.
10. **Item 8 was marked "BLOCKER (verified missing)".** The bucket now allows
    `image/avif`. Corrected to DONE with the live query result.
