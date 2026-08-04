# Launch blockers, 2026-07-25

Working file. Updated after every step. If context compacted, READ THIS FIRST and
resume from "Outstanding".

Branch: `feat/walkthrough-defects` (HEAD at start: `d732672`)
Production: `https://eventlinqs.com.au`, project `eventlinqs-app`
(`prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ`), team `lawals-projects-c20c0be8`.
Live prod deployment: `dpl_52nBRGrMoq7GrYXDwbEtLiPi4NuY`, target production,
created 2026-07-12, 13 days old.

Sacred rules in force: no PROD database writes without stating them; do not
modify the funds-holding payment engine; evidence for every claim; Australian
English, no em-dashes or en-dashes.

Scratchpad (session-local, NOT in repo):
`C:/Users/61416/AppData/Local/Temp/claude/C--Users-61416-OneDrive-Desktop-EventLinqs-eventlinqs-app/3d9cf830-2624-41e7-a562-c70a04ad91d9/scratchpad`
- `cron_secret.txt` holds the new CRON_SECRET value (64 chars, never printed).

---

## BLOCKER 1: CRON_SECRET missing from Vercel PRODUCTION

Status: **DONE. Secret set on Production, production redeployed, auth proven on
both TEST and PRODUCTION.**

### Confirmed the blocker was real
`vercel env ls production` before the change listed 27 variables and did NOT
include `CRON_SECRET`. `src/lib/cron/auth.ts:24` fails closed, so
`/api/cron/event-disbursement` and `/api/cron/payout-holds-release` returned 401
on production and organiser payouts never fired.

Root cause of how it was missed: `vercel env ls` (all scopes) shows `CRON_SECRET`
present on many branch-scoped Preview envs (`staging/merged-main-final`,
`feat/launch-kit`, `feat/design-elevation-r2`, `feat/design-elevation`,
`feat/broadcast-layer`, `feat/event-media-standard`, `release/launch-line`) but
never on Production. Every preview worked, so it was never caught.

### What was done
Generated a fresh secret: 48 bytes from `crypto.randomBytes`, base64url, 64
chars, no trailing newline (last byte verified `0x78`). Value never printed.

Set it via stdin (this WORKS, correcting the earlier memory note that the Vercel
CLI is TTY-only for values):
```
vercel env add CRON_SECRET production < <scratchpad>/cron_secret.txt
```
Result: `Added CRON_SECRET / Environments Production / Type Sensitive`.
`vercel env ls production` now shows it. Vercel redacts Sensitive values on
`vercel env pull` (pulls back as `""`, same as `HEALTH_CHECK_TOKEN`), so the
value cannot be read back and a live HTTP test is the only real proof.

### Evidence: auth proven end to end against TEST
Local `next dev` on :3100 with `.env.test` exported into the process env so it
beats `.env.local`. IMPORTANT FOOTGUN CONFIRMED: `.env.local` line 2 sets
`NEXT_PUBLIC_SUPABASE_URL` to the PRODUCTION project. Never run local against
`.env.local`.

Decisive database assertion on the running server: homepage HTML contained
TEST ref `vkapkibzokmfaxqogypq` x2 and PROD ref `gndnldyfudbytbboxesk` x0.

Proof matrix (real HTTP, TEST database):

| Endpoint | No bearer | Wrong bearer | Correct bearer |
|---|---|---|---|
| `/api/cron/payout-holds-release` | 401 | 401 | **200** `{"ok":true,"released":2,...}` |
| `/api/cron/event-disbursement` | 401 | 401 | **200** `{"ok":true,"considered":139,...}` |

`event-disbursement` summary: considered 139, transferred 0, skipped 131,
failed 8. The 8 are NOT defects:
- 6x `open_chargeback_hold` (engine correctly refusing a disputed event)
- 2x `exceeds_platform_balance` (TEST-mode platform balance artefact)
The 131 skips are all `nothing_to_disburse`. Payment engine NOT modified.

Observation worth raising later, not a blocker: the summary counts
`open_chargeback_hold` as `failed` when it is a correct refusal. Telemetry
naming only.

### Production redeploy (required, done)
Vercel bakes env vars per deployment, so the 13-day-old live deployment did not
have the secret. Redeployed the SAME source (no new code shipped):
```
vercel redeploy https://eventlinqs-1e59kxvi0-lawals-projects-c20c0be8.vercel.app
-> Production https://eventlinqs-36hv1br8h-lawals-projects-c20c0be8.vercel.app
-> Aliased https://eventlinqs.com.au
-> Ready in 2m
```
Rollback target if ever needed: `dpl_52nBRGrMoq7GrYXDwbEtLiPi4NuY`.

### Evidence: PRODUCTION proof matrix (https://eventlinqs.com.au)

| Endpoint | No bearer | Wrong bearer | Correct bearer |
|---|---|---|---|
| `/api/cron/event-disbursement` | 401 | 401 | deliberately NOT fired |
| `/api/cron/payout-holds-release` | 401 | 401 | deliberately NOT fired |
| `/api/cron/warm` | 401 | 401 | **200** `{"ok":true,"warmed":[{"path":"/","status":200,...}]}` |

Why `warm` carries the positive case: it uses the IDENTICAL `requireCronAuth`
guard and the same `process.env.CRON_SECRET`, but only re-fetches public pages, so
it moves no money and writes nothing. A 200 there proves three things at once:
the secret is present in the production runtime (fail-closed would give 401), the
stored value byte-matches the generated one (so the stdin pipe added no newline),
and the guard accepts it. All 12 cron routes share that one function, so the money
routes will now authenticate for Vercel Cron.

`/api/cron/event-disbursement` was NEVER fired authenticated on production: it
would run `runEventDisbursements` against live Stripe and move real organiser
money. That is a deliberate refusal, not an untested gap.

---

## BLOCKER 2: no live Stripe webhook for production

Status: **DONE. Report and the one founder step below. Creating the endpoint is
the founder's action in the Stripe dashboard; nothing to fix in code.**

- Production URL: `https://eventlinqs.com.au`
- Webhook path served by the code: `/api/webhooks/stripe`
  (`src/app/api/webhooks/stripe/route.ts`, `export const dynamic = 'force-dynamic'`)
- Full endpoint: `https://eventlinqs.com.au/api/webhooks/stripe`

### Canonical URL, proven empirically
Stripe does NOT follow redirects, so a 3xx silently breaks every webhook. Probed
each production alias with a POST carrying an invalid signature. 400 means the
request reached the handler and signature verification ran.

| Host | Result |
|---|---|
| `eventlinqs.com` | **308 redirect, WOULD BREAK WEBHOOKS. Do not use.** |
| `eventlinqs.com.au` | 400, reaches handler |
| `www.eventlinqs.com.au` | 400, reaches handler |
| `www.eventlinqs.com` | 400, reaches handler |
| `eventlinqs-app.vercel.app` | 400, reaches handler |

The deployed client bundle declares `https://www.eventlinqs.com.au` as its own
canonical site URL (14 occurrences), so that is the host to use:
**`https://www.eventlinqs.com.au/api/webhooks/stripe`**

### The event list is 18, not 17 and not 14
`payment_intent.succeeded` is handled at `route.ts:60` by an `if` OUTSIDE the
switch, so a `case`-only grep misses it. It is the most important event of the
set (it confirms the order and issues tickets). Omitting it would break every
purchase while looking configured.

Account/payment events (10): `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.requires_action`,
`payment_intent.canceled`, `charge.succeeded`, `charge.updated`,
`charge.refunded`, `checkout.session.completed`, `checkout.session.expired`,
`transfer.created`.

Connected-account events (8): `account.updated`,
`account.application.deauthorized`, `payout.created`, `payout.paid`,
`payout.failed`, `payout.canceled`, `charge.dispute.created`,
`charge.dispute.closed`.

`account.application.deauthorized` reads `event.account` (`route.ts:149`), and the
payout and dispute handlers are `handleConnectPayoutEvent` /
`handleConnectDisputeEvent`, so the endpoint must also receive connected-account
events. Unmatched types are logged, not fatal (`route.ts:196-200`).

`STRIPE_WEBHOOK_SECRET` is already present on Production but holds a TEST/staging
value. The new live endpoint yields a new `whsec_` that must replace it. That
replacement is a SECOND step and was deliberately excluded, since only one step
was requested.

### THE ONE FOUNDER STEP

**A. Create the live Stripe webhook endpoint. Where: the Stripe dashboard.**
Open https://dashboard.stripe.com/webhooks and make sure the dashboard is in
LIVE mode, not Test mode (the Test mode toggle must be off).
Click Add endpoint. In Endpoint URL paste exactly
`https://www.eventlinqs.com.au/api/webhooks/stripe`. Turn on the option to also
listen to events on connected accounts. Then select exactly these 18 events:
`payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_intent.requires_action`, `payment_intent.canceled`, `charge.succeeded`,
`charge.updated`, `charge.refunded`, `checkout.session.completed`,
`checkout.session.expired`, `transfer.created`, `account.updated`,
`account.application.deauthorized`, `payout.created`, `payout.paid`,
`payout.failed`, `payout.canceled`, `charge.dispute.created`,
`charge.dispute.closed`. Click Add endpoint to save.
You should see: a new endpoint row for
`https://www.eventlinqs.com.au/api/webhooks/stripe` with status Enabled, a count
of 18 events, and a Signing secret beginning `whsec_` that you can reveal.
If the screen differs from this description, screenshot it and I will tell you
exactly where to click.

---

## BLOCKER 3: connected account payout schedule

Status: **DONE. Premise is FALSE, code already sets the schedule, proven by
readback from a real TEST account. No code change made or warranted.**

`src/lib/stripe/connect.ts:155-159` in `createExpressAccount` already sets it
explicitly:
```ts
settings: { payouts: { schedule: { interval: 'daily', delay_days: input.payoutDelayDays } } }
```
So connected accounts do NOT inherit Stripe's default and organisers are NOT
left on manual payouts. No code change is warranted on the evidence so far.

Supporting facts:
- `delay_days` is single-sourced from `pricing_rules.payout_schedule_days` via
  `getPayoutScheduleDays(country, 'AUD', orgId)` at
  `src/lib/payments/pricing-rules.ts:536`.
- Only caller: `src/app/api/stripe/connect/onboard/route.ts:118-123`.
- A backfill helper already exists for pre-existing accounts:
  `setPlatformPayoutSchedule` (`connect.ts:173`), same daily interval.
- `scripts/test-stripe-connect-e2e.ts:119` uses `payoutDelayDays: 3` as the AU
  launch default.

### Evidence: readback from a real TEST connected account
Added `scripts/verify/connect-payout-schedule.ts` (new file, permanent proof
harness). It refuses to run against a live key, creates an AU Express account
through the real `createExpressAccount`, reads it back, asserts, then deletes it.

Resolved `pricing_rules.payout_schedule_days` for AU/AUD on TEST = **3**.

Run: `npx tsx scripts/verify/connect-payout-schedule.ts` with `.env.test` loaded.
```
Stripe key mode: sk_test_...
created account: acct_1Tww9FGSsRUvTB6y
--- READ BACK FROM STRIPE ---
country          : AU
default_currency : aud
schedule         : {"delay_days":3,"interval":"daily"}
-----------------------------
interval is "daily"              : PASS
delay_days equals requested (3)  : PASS
delay_days >= AU minimum (2)     : PASS
NOT manual (organisers are paid out automatically): PASS
cleanup: deleted acct_1Tww9FGSsRUvTB6y (deleted=true)
```

### Audit of PRE-EXISTING connected accounts (the real residual risk)
The genuine exposure was accounts created before the schedule was enforced.
Audited all connected accounts on TEST via `stripe.accounts.list`:
- 13 accounts found
- 2x `daily/delay=3`, 11x `daily/delay=2`
- **NON-daily (manual or weekly): none**

So no organiser sits on manual payouts. The 11 at delay=2 are on Stripe's AU
minimum rather than the `pricing_rules` value of 3: a one-day drift, they still
pay out automatically. `setPlatformPayoutSchedule` (`connect.ts:173`) can align
them, but changing payout timing on real accounts is a money-timing decision and
was NOT run without founder direction.

The same audit still needs running against LIVE mode before launch. It needs a
live Stripe key, which this session does not hold and did not use.

---

## Environment audit (for report section B)

Production scope after the change holds 28 variables. Code references 42 distinct
`process.env.*` names in `src/`.

Genuinely missing from Production and worth action:
- **`CRON_SECRET`** the blocker. NOW SET, needs redeploy.
- **`QUEUE_SECRET`** SECURITY GAP. `src/lib/queue/tokens.ts:3` falls back to the
  hardcoded `'dev-queue-secret-change-in-prod'`. It HMAC-signs queue position and
  admission tokens consumed by `src/proxy.ts` and `src/app/actions/queue.ts`, so
  in production those tokens are signed with a repo-committed constant and could
  be forged to skip the queue. Recommend setting a strong value.

Missing but SAFE, each has a sane fallback (no action required):
- `WEBHOOK_CANONICAL_HOST` -> falls back to request host (`payment-checks.ts:133`)
- `PAYMENT_ALERT_EMAIL` -> falls back to `lawaladams9@gmail.com` (`runner.ts:17`)
- `SUPPORT_INBOX_EMAIL` -> falls back to `hello@eventlinqs.com` (`handoff.ts:14`)
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` -> falls back to `eventlinqs.com` (`layout.tsx:114`)
- `NEXT_PUBLIC_STORAGE_DOMAIN` -> optional branded host, falls back to Supabase
- `AI_MODEL` -> `claude-opus-4-8`; `AI_MAGIC_START_MODEL` -> `claude-haiku-4-5-20251001`
- `AI_MONTHLY_BUDGET_USD` -> defaults to 50

Not real gaps (platform-provided or build/test only):
`VERCEL_ENV`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA`,
`VERCEL_PROJECT_PRODUCTION_URL`, `NEXT_PUBLIC_VERCEL_ENV`, `NODE_ENV`,
`HOMEPAGE_SEED_FIXTURE`, and the three `*_PREVIEW` overrides
(`NEXT_PUBLIC_SUPABASE_URL_PREVIEW`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW`,
`SUPABASE_SERVICE_ROLE_KEY_PREVIEW`) which are deliberately preview-only per
`src/lib/supabase/env.ts`.

All 9 rules in `src/lib/health/critical-env.mjs` are now satisfied on Production
(`CRON_SECRET` was the only one missing).

---

## CONTRADICTION FOUND: docs/LAUNCH-RUNBOOK.md is stale and actively dangerous

Reported per CLAUDE.md: the constitution wins and the stale doc is wrong until
reconciled. Do not silently follow it. Three defects in that file:

1. **Section 6 (line 108-125) tells the founder to set connected-account payouts
   to MANUAL.** That is now WRONG and would RE-CREATE the exact blocker it claims
   to fix. `createExpressAccount` (`connect.ts:155-159`) deliberately sets
   `daily`, and the comment at `connect.ts:152-154` gives the reason: under the
   funds-holding model the connected balance is empty until the post-event
   platform-to-connected transfer, so a daily schedule never front-runs the hold.
   The hold is enforced platform-side. If the founder followed this runbook and
   set accounts to manual, organiser money would reach the connected account and
   then never reach their bank.
2. **Section 6 (line 124) claims "no payout-schedule constant is hardcoded in the
   app; the schedule is set on the connected account via Stripe".** False. The app
   sets it at creation, single-sourced from `pricing_rules.payout_schedule_days`.
3. **Section 7 (line 133-136) says the live endpoint is
   `https://www.eventlinqs.com/api/webhooks/stripe` subscribed to "the 14 events
   (5 payment + 9 Connect)".** The count is wrong: the code handles 18. The host
   also differs from the code's own canonical `www.eventlinqs.com.au`, though
   `www.eventlinqs.com` does happen to reach the handler without redirecting.

Recommendation: reconcile `docs/LAUNCH-RUNBOOK.md` sections 6 and 7 against the
code in a follow-up. NOT done in this pass because the brief was the three
blockers and rewriting a runbook is a separate, founder-visible change.

## Gates
- `npx tsc --noEmit` exit 0
- `npx eslint scripts/verify/connect-payout-schedule.ts` exit 0
- Full suite not re-run this pass: no application code was changed. The only new
  file is a standalone verification script.

## Files changed in this pass
- ADDED `scripts/verify/connect-payout-schedule.ts` (permanent proof harness for
  Blocker 3; refuses to run against a live Stripe key)
- ADDED `docs/verification/launch-blockers-2026-07-25.md` (this file)
- NO application or payment-engine code was modified. Nothing committed.

## Housekeeping done
- Killed orphaned `next dev` PID 28564 (36 hours old) and PID 31336 (mine).
  Next.js 16 refuses a second dev server in the same directory, so orphans block
  local testing. Several other stale node processes remain (about 6 days old).
- No repo files changed yet.
