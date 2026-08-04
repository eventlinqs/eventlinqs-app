# Launch blockers, round two, 2026-07-25

Working file, updated as each job lands. Round one is
`docs/verification/launch-blockers-2026-07-25.md`; read that first for the
CRON_SECRET, live-webhook and payout-schedule work earlier tonight.

Branch: `feat/walkthrough-defects` (HEAD at start: `09ebf9c`).
Production: `https://www.eventlinqs.com.au`, project `eventlinqs-app`
(`prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ`), team `team_yPo8T18zSl5VczJfWIIrNqly`.

Sacred rules in force: no PRODUCTION database writes (config and code only);
the funds-holding payment engine's logic is untouched (webhook secret plumbing
is adapter-level and in scope); every claim proven by observation; Australian
English, no em-dashes or en-dashes; every Vercel variable backed up before any
destructive change.

## Tooling note: how the Vercel config was changed safely

`vercel env rm <name> <scope>` could not be used. Several of these variables
have BOTH an all-scope record and branch-scoped Preview records, so the CLI
returned `action_required / multiple_envs` and refused to act. Removing the
all-scope record is also the documented cascade hazard.

Instead the changes went through the Vercel REST API, which addresses each
record by ID and supports PATCH. That turns "split a shared variable" into a
NON-DESTRUCTIVE operation: PATCH the existing record down to `["production"]`
keeping its production value, then CREATE a separate record for
`["preview","development"]`. Nothing was ever deleted, so the cascade could
not bite.

The CLI's stored OAuth access token had expired (`expiresAt` 2026-07-04; the
CLI refreshes in memory and never rewrites `auth.json`). A fresh token was
obtained with the CLI's own refresh token against
`https://api.vercel.com/login/oauth/token`. It expires in 8 hours and is held
only in the session scratchpad.

---

## JOB 1: preview must not reach production

Status: **DONE. Proven at config level and in the deployed preview runtime.**

### The premise was right, but the real hole was worse than stated

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` were indeed byte-identical across Production,
Preview and Development, all on `gndnldyfudbytbboxesk`.

But the `*_PREVIEW` overrides the brief asked me to create **already existed**
on the Preview scope with correct TEST values (created 28 days ago), and they
already resolved TEST on every branch. Resolved state before any change:

| branch / scope | URL | anon | service role | RAW base URL | RAW base service key |
|---|---|---|---|---|---|
| preview (default) | TEST | TEST | TEST | **PROD** | **PROD** |
| staging/merged-main-final | TEST | TEST | TEST | **PROD** | **PROD** |
| release/launch-line | TEST | TEST | TEST | **PROD** | **PROD** |
| feat/claude-api | TEST | TEST | TEST | **PROD** | **PROD** |
| feat/design-elevation(-r2) | TEST | TEST | TEST | EMPTY | EMPTY |
| production | PROD | PROD | PROD | PROD | PROD |

So the resolver was fine. The danger was the two RAW columns: the production
service-role key, which bypasses row level security, sat in every preview
runtime's environment under its plain name. Anything reading it directly
bypassed the resolver completely.

### Six call sites did exactly that

`grep` for direct reads of the three base variables, excluding the resolver
itself, found six:

| File | What it did on a preview |
|---|---|
| `src/proxy.ts:51-52` | **Built a Supabase client from the raw pair and queried `events` on EVERY `/events/<slug>` request. A preview read the LIVE database on every event page view.** |
| `src/lib/storage/url.ts:24` | Generated storage URLs against the PRODUCTION bucket while rows came from TEST |
| `src/lib/images/spine.ts:59` | Same, for the 56-image spine |
| `src/lib/broadcast/share-links.ts:58` | Salted visitor hashes with the PRODUCTION service-role key |
| `src/lib/pricing/dynamic-pricing.ts:16` | Gated on the presence of a key the admin client does not use |
| `src/components/media/safe-image-src.ts:71` | Not a defect: deliberately allow-lists BOTH hosts, matching `next.config.ts` remotePatterns |

All five real ones now go through `src/lib/supabase/env.ts`.

### The config fix: preview can no longer even see the production key

Backed up all six values to individual newline-free scratchpad files first
(hashes recorded, last byte verified, nothing printed). Then, per record:

| Variable | Action |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` (`05KXurtKTAf2EZin`) | PATCH target -> `["production"]`, value untouched |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`YhcVbaqOLXZ6v8zY`) | PATCH target -> `["production"]`, value untouched |
| `SUPABASE_SERVICE_ROLE_KEY` (`8JZozWVgvHlyOXku`) | PATCH target -> `["production"]`, value untouched |
| `NEXT_PUBLIC_SUPABASE_URL` (`OOyv2VOpR8MdGMlB`) | NEW, `["preview","development"]` = TEST |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`0lScmOzvkACIFNgI`) | NEW, `["preview","development"]` = TEST |
| `SUPABASE_SERVICE_ROLE_KEY` (`5qyINjqvU5ODWU6N`) | NEW, `["preview","development"]` = TEST |

Re-pulled every scope and every branch afterwards. Resolved state now:

| branch / scope | URL | anon | service role | RAW base URL | RAW base service key |
|---|---|---|---|---|---|
| preview (default) | TEST | TEST | TEST | TEST | TEST |
| staging/merged-main-final | TEST | TEST | TEST | TEST | TEST |
| release/launch-line | TEST | TEST | TEST | TEST | TEST |
| feat/claude-api | TEST | TEST | TEST | TEST | TEST |
| main | TEST | TEST | TEST | TEST | TEST |
| feat/design-elevation(-r2) | TEST | TEST | TEST | EMPTY | EMPTY |
| production | PROD | PROD | PROD | PROD | PROD |

**No production Supabase credential of any kind is reachable from a preview
runtime, on any branch.** Development was moved to TEST in the same pass,
which also defuses the `.env.local` footgun recorded in round one.

### The regression guard

`SUPABASE_ENV_ISOLATION` added to `CRITICAL_ENV_RULES`
(`src/lib/health/critical-env.mjs`). It is the first CROSS-VARIABLE rule:
every other rule asks "is this one variable sane", this one asks "is this
DEPLOYMENT pointed at the right database". For any non-production deployment
it fails if either the RESOLVED url/key or the RAW base service-role key
belongs to the production project. `buildCritical: true`, so a preview
pointed at production fails the Vercel build outright; it is also carried by
the runtime sentinel, which emails the founder. Production and local runs are
an explicit no-op pass.

12 tests in `tests/unit/security/supabase-env-isolation.test.ts`, including
the subtle case: `*_PREVIEW` correct but the RAW production key still present
must FAIL.

---

## JOB 2: multi-secret webhook verification

Status: **CODE DONE AND PROVEN ON A REAL DEPLOYMENT. Production setting needs
one founder value (see Outstanding).**

`src/lib/payments/stripe-adapter.ts` now resolves a LIST of signing secrets
and tries each. `STRIPE_WEBHOOK_SECRETS` is comma-separated, whitespace
tolerant, de-duplicated; `STRIPE_WEBHOOK_SECRET` is appended last so every
existing deployment, branch env and `.env.test` keeps working untouched. If
all secrets reject the signature, the last Stripe error is re-thrown, so the
route still returns 400 exactly as before.

`CRITICAL_ENV_RULES` accepts either form and validates every entry in the
list starts with `whsec_`.

### A second defect this exposed, fixed in the same pass

`endpointConfigCheck` in `src/lib/health/payment-checks.ts` required EXACTLY
ONE enabled endpoint at the canonical host and treated two as a failure. The
deliberate two-endpoint design (account + connected-accounts at the same URL)
would have tripped that alert forever. It now counts per DELIVERY CHANNEL:
exactly one account endpoint, at most one connected-account endpoint.

Note for whoever touches this next: a connected-account endpoint is
identified by a **non-null `application`** field. Stripe does not echo the
`connect: true` create parameter back as a boolean, so testing for
`connect === true` silently classifies every endpoint as an account endpoint.
Verified against the raw API:

```
we_1Tx1Ze... application: "ca_UQ2phIublHF6cN0tKhNKRxWdDpYAiHlb"   <- connect
we_1Tx1Zd... application: null                                    <- account
```

### Evidence: both secrets verify on a real deployment

Two endpoints were minted at the staging URL via the sanctioned rotation
(`scripts/verify/rotate-webhook-endpoints.mjs`), each with its own signing
secret, both set as `STRIPE_WEBHOOK_SECRETS` on the branch preview env. Real
Stripe-scheme signed events posted to the REAL route on the deployed build:

| # | Signed with | Expected | HTTP | Body |
|---|---|---|---|---|
| 1 | account endpoint secret `e418e383b7` | 200 | **200** | `{"received":true}` |
| 2 | connected-accounts endpoint secret `486414be8c` | 200 | **200** | `{"received":true}` |
| 3 | account secret, signature deliberately corrupted | 400 | **400** | `{"error":"Invalid signature"}` |
| 4 | the OLD drifted secret `be578eb68d` | 400 | **400** | `{"error":"Invalid signature"}` |

Rows 1 and 2 are the fix: two DIFFERENT secrets both verify against one route.
Rows 3 and 4 prove it did not become permissive.

The probe event type is `sentinel.probe`, which the route verifies and then
logs-and-ignores, so it moves no money, writes no order and touches no seat.

### A THIRD defect this uncovered: the Preview scope had no Stripe secret key

The first run of the four-way proof returned 400 on ALL FOUR rows, including
the two that should have passed. The cause was not the secrets:
`getStripeClient()` runs BEFORE signature verification and throws when
`STRIPE_SECRET_KEY` is unset, and the route's catch block reports every such
failure as `Invalid signature`.

`STRIPE_SECRET_KEY` did not exist on the general Preview scope at all. Only
six individual branches had branch-scoped copies, so any branch without one
(including this one) had a webhook route that 400d every delivery no matter
what secret Stripe signed with. Fixed by adding the TEST key to the Preview +
Development scopes, so every preview branch works rather than only the six.

Worth noting the error message actively hid this: a missing API key and a
wrong signing secret are indistinguishable from outside the route.

---

## JOB 3: queue token event scoping

Status: **DONE.**

`src/proxy.ts` gated on `validateAdmissionToken(queueToken).valid` and threw
the token's embedded `eventId` away. A signature proves ISSUANCE, never
SCOPE, so one token legitimately earned by queueing for a quiet event
admitted the bearer to EVERY high-demand event on the platform: join the
queue for something nobody wants, get admitted in seconds, reuse the token to
walk past the gate on the on-sale that actually has demand.

The fix adds `admitsToEvent(token, eventId)`, and the event lookup now
selects `id` so there is something to compare against.

`tests/unit/queue/admission-event-scope.test.ts` (7 tests). The key test is
self-proving: it asserts the OLD gate condition is still `true` for a
cross-event token before asserting the new gate rejects it, so it cannot pass
for the trivial reason that the token was malformed.

---

## JOB 4: staging webhook drift

Status: **DONE. Reconciled, and a real paid purchase completes end to end.**

### The drift, proven before touching anything

A signed probe using the `.env.test` secret against the live staging endpoint:

```
url     : https://eventlinqs-staging.vercel.app/api/webhooks/stripe
secret  : be578eb68d
http    : 400  {"error":"Invalid signature"}
```

Stripe was signing with a secret the deployment did not hold, so deliveries
400d while payments succeeded and paid orders sat `pending`. Fourth occurrence
of this failure class (2026-07-12, 2026-07-19, and twice on 2026-07-25).

### Reconciliation

Followed the sanctioned rotation in `docs/payments/WEBHOOK-CANON.md`, because
the deployed secret is stored `sensitive` in Vercel and Stripe does not reveal
an existing endpoint's secret. Rotation is the only way to get a known value
into all homes at once.

1. Created a new ACCOUNT endpoint (`we_1Tx1ZdGqHIQtgS8tngtwQU7m`, 10 events)
   and a new CONNECTED-ACCOUNT endpoint (`we_1Tx1ZeGqHIQtgS8toxBwnFxv`,
   8 events), capturing both secrets from the CREATE response.
2. Wrote both to `STRIPE_WEBHOOK_SECRETS` on the branch preview env and to
   `.env.test` (backed up first).
3. Disabled the stale endpoint `we_1TukSyGqHIQtgS8touv1HwMs`.
4. Redeployed, because Vercel snapshots env per deployment, and re-aliased
   `eventlinqs-staging.vercel.app`.

Endpoint state now: exactly one enabled ACCOUNT endpoint and exactly one
enabled CONNECTED-ACCOUNT endpoint at the staging host, which is precisely
what the corrected sentinel invariant expects.

### A FOURTH defect: staging could not take a payment at all

With the secrets correct, the paid purchase still failed: the Stripe payment
element never rendered. No console error, no network error, no on-page
message. The form advanced to the payment step, the order summary showed the
correct all-in total, and the Payment card was simply empty.

Root cause: the Preview `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` was from a
DIFFERENT Stripe account than `STRIPE_SECRET_KEY`.

| | account embedded in the key |
|---|---|
| deployed publishable key | `T8WBhG...` |
| secret key account | `acct_1T8WBzGqHIQtgS8t` |

Stripe.js cannot resolve a clientSecret minted by one account using a
publishable key for another, and it fails SILENTLY: the element renders
nothing. Fixed by repointing the Preview publishable key to the matching TEST
key. **Production was checked and its pair is consistent** (`sk_test_51T8WBz`
/ `pk_test_51T8WBz`), so this was Preview-only.

`scripts/verify/stripe-live-key-check.mjs` now asserts this pairing, so the
same mismatch cannot pass unnoticed at the live cutover.

### Evidence: a real paid purchase, end to end

`node scripts/verify/paid-purchase-webhook-e2e.mjs https://eventlinqs-staging.vercel.app`

```
[proof] 40 candidate event(s) under 11 charge-ready organisation(s)
[proof] trying cat-a-midsummer-night-dream-on-stage-melbourne
[proof] paid. order 9665ed16-6a5a-4553-81a7-a33ed21c4c33

order_number : EL-K6BWXD8Q
status       : confirmed  (after 3s)
total        : 6354 AUD
tickets      : 1

verdict: PASS - the webhook confirmed the order and issued tickets
```

Card 4242 through the real UI. The assertion is deliberately the ORDER STATUS,
not the confirmation page: only the webhook can move an order out of
`pending`, so `confirmed` is proof that Stripe's own delivery was
signature-verified AND processed. That is the exact thing that was broken.

Screenshots and the machine-readable result are in
`docs/verification/blockers-round-2-2026-07-25/`.

One incidental finding while building the harness, NOT a defect: many seeded
organisations have `stripe_account_country = null`, so checkout correctly
refuses with "Payments for this region are not yet supported"
(`org_country_unsupported`). That is the guard working on an incomplete
Connect setup. The harness now selects only charge-ready organisers. If the
founder wants those seeded events purchasable on staging, their organisations
need Connect onboarding completed; it is a data gap, not code.

---

## JOB 5: canonical host and env hygiene

Status: **DONE.**

### Canonical host

Founder ruling: `www.eventlinqs.com.au` is canonical, every other host 301s.
Observed behaviour before the change:

| Host | Before |
|---|---|
| `eventlinqs.com` | 308 -> `https://www.eventlinqs.com/` |
| `www.eventlinqs.com` | 200 |
| `eventlinqs.com.au` | 200 |
| `www.eventlinqs.com.au` | 200 |

Four branded hosts answering 200 means auth cookies, sessions, share links,
OG cards and the Google index can each settle on a different one.
`canonicaliseHost` in `src/proxy.ts` now 301s all three others onto the
canonical host. 301 rather than 308 because 301 is the redirect search
engines treat as canonicalisation, and these hosts serve GET marketing
traffic only.

`localhost`, `*.vercel.app` and the staging alias are exempt via an explicit
allow-list rather than a suffix match: redirecting them would break local
dev and bounce every preview deployment at production. The Stripe webhook
path stays exempt because Stripe does not follow redirects.

### One premise in the brief needed correcting

`NEXT_PUBLIC_SITE_URL` is **not empty**. It is `type: sensitive`, and
`vercel env pull` redacts sensitive values to `""`, which is what made it
look empty. Proven by observation instead: `/cities` renders its JSON-LD
through the raw `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'`
pattern, and live production emits `https://www.eventlinqs.com.au`. If the
variable were empty or unset that page would say `https://eventlinqs.com`.
So Production is correct and was left alone.

The real defect was on **Preview**, where the variable is absent. 21 call
sites across 18 files hardcoded `?? 'https://eventlinqs.com'`, so every
canonical tag, JSON-LD block, OG url, share link and auth redirect on staging
pointed at production, where the TEST-database row does not exist. All 21 now
route through the single resolver in `src/lib/site-url.ts`.

`src/app/api/webhooks/stripe/route.ts` was deliberately EXCLUDED from that
sweep under the funds-holding rule.

`getAppUrl()` was also missing the preview carve-out `getSiteUrl()` has, so
`VERCEL_PROJECT_PRODUCTION_URL` beat the deployment's own URL and previews
generated production links for payouts and tickets. Fixed, with a test.

`PRODUCTION_FALLBACK` moved from `https://www.eventlinqs.com` to the new
canonical host, so no generated link starts life behind a redirect.

### Env changes

| Variable | Before | After |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://eventlinqs.com` on prod+preview+dev (a 308ing host) | `https://www.eventlinqs.com.au`, production only |
| `NEXT_PUBLIC_APP_URL` | inherited by preview | UNSET on preview/dev, so `getAppUrl()` resolves the deployment's own `VERCEL_URL` |
| `RESEND_API_KEY` | one record, prod+preview+dev | split: production record untouched, separate preview+development record |
| `EMAIL_FROM` | one record, prod+preview | split: production untouched, preview/dev = `EventLinqs Staging <hello@eventlinqs.com>` |

On Resend: a genuinely separate API key has to be minted in the Resend
dashboard, which this session has no credentials for. What was done instead
is real and non-breaking: the RECORDS are now independent, so a dedicated
staging key can be dropped in without touching production, and the sender is
already visibly different. Stripping the key from preview outright was
rejected because `sendEmail()` throws without one, which would have broken
every staging QA flow (signup confirm, ticket transfer, seat moves).

Belt and braces in code: `src/lib/email/send.ts` now stamps `[STAGING]` into
both the sender display name and the subject on any non-production
deployment, so staging mail can never be mistaken for a real ticket even if
`EMAIL_FROM` is later cleared.

---

## JOB 6: Stripe LIVE API keys

Status: **PREPARED. Everything is ready; the one founder step is below.**

Production runs `sk_test_51T8WBz...` / `pk_test_51T8WBz...` while holding a
LIVE webhook signing secret. That combination looks configured and will take
card details, but every charge is a TEST charge and no money ever moves.

Prepared so the cutover is set-and-prove:

- `scripts/verify/stripe-live-key-check.mjs` is written and exercised. It does
  a READ-ONLY live-mode API call (`accounts.retrieve`) and creates nothing.
  It asserts: the secret key is live; the live-mode read succeeds; charges and
  payouts are enabled on the live account; the publishable key is live; and
  the publishable and secret keys belong to the SAME account.
- Verified as a negative control against the current TEST keys: it correctly
  FAILS the two mode checks and PASSES the pairing check, so a green result
  cannot be a false green.

```
FAIL  secret key is LIVE mode :: prefix sk_test_
PASS  API read succeeds (mode: TEST) :: account acct_1T8WBzGqHIQtgS8t
PASS  charges enabled on the TEST account :: charges_enabled=true
PASS  payouts enabled on the TEST account :: payouts_enabled=true
PASS  account country :: country=AU, default_currency=aud
FAIL  publishable key is LIVE mode :: prefix pk_test_
PASS  publishable and secret keys are the SAME account
```

The account-pairing check exists because of what was found tonight on Preview:
a mismatched pair renders NO payment element and reports NO error anywhere.
That must not be discovered on live traffic.

On handover the keys go to Production only (`STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), production is redeployed because Vercel
snapshots env per deployment, and the check is run against the production env.

### THE ONE FOUNDER STEP

**Get the LIVE Stripe API keys. Where: the Stripe dashboard.**
Open https://dashboard.stripe.com/apikeys and make sure the dashboard is in
LIVE mode, not Test mode (the "Test mode" toggle at the top right must be
OFF). You will see a "Standard keys" table with two rows.
Row one is "Publishable key": its value is visible and starts with `pk_live_`.
Copy it.
Row two is "Secret key": it is hidden behind a "Reveal live key" button. Click
that button, complete any two-factor prompt, and copy the value that appears,
which starts with `sk_live_`.
Send me both, and say which is which.
You should see: two keys, one beginning `pk_live_` and one beginning
`sk_live_`, both roughly 107 characters long, and the characters right after
`pk_live_51` and `sk_live_51` should be IDENTICAL in both (that is the account
id, and a mismatch there is the silent failure described above).
If the secret key row instead says "Reveal test key", the dashboard is still
in Test mode; turn the Test mode toggle off and look again.
If the screen differs from this description, screenshot it and I will tell you
exactly where to click.

---

## Outstanding, honestly stated

These are NOT done and are not claimed as done.

1. **The two LIVE webhook signing secrets are not set on Production.** Job 2
   asked for both to be set there. The platform one is present but stored
   `sensitive`, so it cannot be read back; the connected-accounts one is not
   held by this session at all, and Stripe reveals an endpoint secret only at
   creation. The CODE is done and proven, so this is a value handover, not
   work. Once both `whsec_` values are to hand, they go into
   `STRIPE_WEBHOOK_SECRETS` on Production as `secret1,secret2` and production
   is redeployed. The existing `STRIPE_WEBHOOK_SECRET` can stay: it is
   appended automatically, so nothing breaks during the transition.
2. **The canonical 301 is not live on production.** It is implemented, unit
   tested across all three redirected hosts and all three exemptions, and
   deployed to staging, but production still serves the old behaviour because
   this branch has not been promoted. Merging to production needs founder
   sign-off, which was not given.
3. **A dedicated staging Resend API key.** The records are now split so one
   can be dropped in without touching production, and staging mail is stamped
   `[STAGING]`, but the key value itself is still shared. Minting a separate
   key needs the Resend dashboard.
4. **LIVE-mode connected-account payout audit.** Round one audited the TEST
   account (13 accounts, none on manual payouts). The same audit against LIVE
   needs the live key and should be run as part of the cutover.

## Gates

- `npx tsc --noEmit` exit 0
- `npx eslint src scripts tests` exit 0 (9 pre-existing warnings, 0 errors)
- `npx vitest run` **783 passed / 783**, 95 files
- Disk free: 24.4 GB (guard is 1.5 GB)

Two existing tests failed on first run and were rewritten, not deleted: both
encoded the superseded HARD-01 ruling (apex -> `www.eventlinqs.com`, 308).
`canonical-host-redirect.test.ts` now covers all three redirected hosts plus
the three exemptions.

Note on the count: an unrelated concurrent session was committing to this same
branch during the work (`bc1465a`, `b253057`, and the unpushed `782c09c`). The
suite total moved 765 -> 783 because of their new test file, not because of a
change here. Their in-progress files were deliberately kept OUT of these
commits: the first attempt at the URL-sweep commit swept in four legal pages
and `checkout-form.tsx`, and was amended to exclude them.

---

## FINAL RE-VERIFICATION (against the last pushed commit)

Everything above was proven as each job landed. Because the branch moved
afterwards, the whole battery was re-run against the FINAL artefact rather
than left resting on intermediate builds.

Deployment `eventlinqs-cxq0vbn33`, built from `f8d85e9` (which also contains
the concurrent session's `bc1465a` and `b253057`), aliased to
`eventlinqs-staging.vercel.app`.

| Check | Result |
|---|---|
| Build-time `SUPABASE_ENV_ISOLATION` guard | `[public-env] ok SUPABASE_ENV_ISOLATION` |
| Served bundle: TEST project ref | 752 occurrences |
| Served bundle: PRODUCTION project ref | **0 occurrences** |
| Served bundle: `service_role` markers | **0 occurrences** |
| Webhook, account endpoint secret | **200** `{"received":true}` |
| Webhook, connected-accounts endpoint secret | **200** `{"received":true}` |
| Webhook, corrupted signature | **400** `{"error":"Invalid signature"}` |
| Webhook, old drifted secret | **400** `{"error":"Invalid signature"}` |
| Stripe endpoints at the staging host | 1 account + 1 connected-account enabled, 3 disabled |
| Paid purchase end to end | **PASS** order `EL-HFFMD4QF`, confirmed in 3s, 1 ticket |

The paid purchase is a SECOND, independent order (the first was
`EL-K6BWXD8Q` on the previous build), so the result is reproducible rather
than a one-off.

Production hosts were re-probed and are deliberately UNCHANGED, because the
branch has not been promoted:

```
eventlinqs.com        -> 308 https://www.eventlinqs.com/
www.eventlinqs.com    -> 200
eventlinqs.com.au     -> 200
www.eventlinqs.com.au -> 200
```

That is the old behaviour, and it is what production will keep serving until
the branch is promoted with founder sign-off. The canonical 301 is proven by
unit test and deployed to staging only.
