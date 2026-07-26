# Roast ledger: LIVE Stripe keys on Production, 2026-07-26

Written BEFORE adjudication, per `.claude/skills/brief-roast/brief-roast-SKILL.md`
Phase 1. Verdicts are filled in after each job is observed, never before.

Context doc: `docs/verification/blockers-round-2-2026-07-25.md`.
Branch at start: `feat/walkthrough-defects`, HEAD `4474cc7`.

## Hard constraint carried by this task

Another session is building on this repo. Read-only verification plus Vercel
configuration ONLY. No commit, stage, push, tag, merge, checkout, or
modification of any tracked file. If a job needs a code change, report the
change and stop.

## The ledger

| # | Requirement (from the brief, verbatim intent) | Verdict | Evidence |
|---|---|---|---|
| 1 | Read the brief-roast skill first and obey it | MET | Read `.claude/skills/brief-roast/brief-roast-SKILL.md` (the file is named `brief-roast-SKILL.md`, not `SKILL.md`); this ledger written before adjudication |
| 2 | Report opens with the gate block or UNFULFILLED | MET | Report opens `UNFULFILLED` |
| 3 | Make zero git operations, zero commits | MET | `git reflog -3` shows only the concurrent session's 3 seating commits (78a7b1c, 41fce17, 70f268a, author EventLinqs, 10:39-10:48); `git diff --cached --name-only` empty |
| 4 | Do not modify any tracked file | MET | Only new file created is untracked `docs/roast/live-keys-production-2026-07-26.md`; it appears in no commit (`git log --name-only 4474cc7..HEAD` grep = 0) |
| 5 | Read the context doc | MET | Read in full, 547 lines |
| 6 | JOB 1: run `stripe-live-key-check.mjs` | MET | Ran `node scripts/verify/stripe-live-key-check.mjs --env .env.prod.check` -> `STRIPE_SECRET_KEY is not set.` exit 1 |
| 7 | JOB 1: prove BOTH keys are live mode | **PARTIAL** | Publishable PROVEN `pk_live_`. Secret key value is unreadable: Vercel stores it Sensitive, `env pull` redacts it to `""` |
| 8 | JOB 1: prove both keys belong to `acct_1T8WBhGuiZ9cvxuu` | **PARTIAL** | Publishable PROVEN: embeds `T8WBhGuiZ9cvxuu` == `acct_1T8WBhGuiZ9cvxuu` minus `acct_1`. Secret key not observable |
| 9 | JOB 1: account substring after `pk_live_51` / `sk_live_51` identical | **PARTIAL** | pk substring extracted and compared explicitly (`true`). The sk substring cannot be obtained by any available means |
| 10 | JOB 1: create nothing, charge nothing | MET | No Stripe object created; the only Stripe API calls made were none (script exited before constructing a client) |
| 11 | JOB 2: production runtime resolves live keys not test | **PARTIAL** | Publishable PROVEN live in the served bundle. Secret key PROVEN SET (webhook 200 requires `getStripeClient()` to succeed) but its MODE is not observable |
| 12 | JOB 2: read the SERVED BUNDLE for the publishable key prefix | MET | Crawled 18 chunks / 1,228,325 bytes from `www.eventlinqs.com.au`: 1 distinct key, `pk_live_51T8WBhGuiZ9...`, len 107, in `44bpdawjgyv14.js`; **0** `pk_test_` occurrences; served value == Vercel Production config value |
| 13 | JOB 2: live-mode Stripe API read succeeds FROM production | **NOT MET (BLOCKED)** | The only production code paths that read Stripe (`endpointConfigCheck`, `driftWatchdog`) sit behind `requireCronAuth` (fail-closed Bearer `CRON_SECRET`), and `CRON_SECRET` is Sensitive/unreadable. No unauthenticated production route performs a Stripe read |
| 14 | JOB 3: platform secret -> 200 | **NOT MET (BLOCKED)** | I do not hold the live platform `whsec_`; it is Sensitive on Vercel and Stripe reveals an endpoint secret only at creation. Nearest observed evidence: production's own sentinel self-probe returned **200** at 00:40:16Z, but it signs with the SINGULAR `STRIPE_WEBHOOK_SECRET`, not the pair in `STRIPE_WEBHOOK_SECRETS` |
| 15 | JOB 3: connected-accounts secret -> 200 | **NOT MET (BLOCKED)** | Same cause. Nothing on production currently probes this secret at all |
| 16 | JOB 3: corrupted signature -> 400 | MET | `node scripts/verify/webhook-signature-probe.mjs https://www.eventlinqs.com.au/api/webhooks/stripe <wrong> --invalid` -> **400** `{"error":"Invalid signature"}` |
| 17 | JOB 3: report all three | MET | All three reported, two as BLOCKED with the reason |
| 18 | JOB 4: list every LIVE connected account | **NOT MET (BLOCKED)** | Requires a live secret key. No live Stripe credential is reachable from this session |
| 19 | JOB 4: report each payout schedule | **NOT MET (BLOCKED)** | Same |
| 20 | JOB 4: report any on manual | **NOT MET (BLOCKED)** | Same |
| 21 | JOB 4: `createExpressAccount` sets daily + `delay_days` from `pricing_rules` | MET | `src/lib/stripe/connect.ts:157` `schedule: { interval: 'daily', delay_days: input.payoutDelayDays }`; sole call site `src/app/api/stripe/connect/onboard/route.ts:118` `getPayoutScheduleDays(country,'AUD',org.id)` -> `src/lib/payments/pricing-rules.ts:542` `getPricingRule({ruleType:'payout_schedule_days'})` |
| 22 | JOB 4: read only, change nothing | MET | No writes issued anywhere |
| 23 | JOB 5: remaining items in founder-step-delivery format | MET | Section E of the report |
| 24 | JOB 5: include the canonical 301 promotion | MET | Re-probed live: `eventlinqs.com` 308, `www.eventlinqs.com` 200, `eventlinqs.com.au` 200, `www.eventlinqs.com.au` 200 |
| 25 | JOB 5: include the dedicated staging Resend key | MET | Included, plus the newly found PRODUCTION Resend defect |
| 26 | JOB 5: exhaustive and honest | MET | Includes 3 defects the brief did not ask about and did not know of |
| 27 | REPORT A: each job with observed evidence | MET | Sections 1-5 |
| 28 | REPORT B: one line at top, YES or NO | MET | `NO` |
| 29 | REPORT C: exactly what is missing | MET | Section C |
| 30 | REPORT D: zero git operations | MET | Section D |

## Standing rules (apply to every task)

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| S1 | Australian English | MET | Report proofread |
| S2 | No em-dashes, no en-dashes | MET | Hyphens, colons and commas only |
| S3 | The word "culture" is banned | MET | Not used |
| S4 | No PRODUCTION database writes | MET | No checkout, no reservation, no RPC call. The only production requests were GETs of public pages and static chunks, plus one webhook probe carrying `sentinel.probe`, an unmatched event type the route verifies then logs-and-ignores |
| S5 | Funds-holding engine untouched | MET | Zero code changes of any kind |
| S6 | Every claim proven by observation | MET | Each row above names the command, path with line number, or log line |
| S7 | No exclamation marks in user-facing copy | MET | None written |

## Phase 3: the adversarial pass

**Silent drops.** Compared the ledger to the report. Every one of the 30 rows is
named in the report, including the six BLOCKED. None dropped.

**Interpretation drift.** One real instance, caught and corrected. When the
secret key proved unreadable I was drawn to report the webhook self-probe 200 as
though it satisfied JOB 3. It does not: `selfProbe`
(`src/lib/health/payment-checks.ts:33`) signs with the SINGULAR
`STRIPE_WEBHOOK_SECRET`, so it exercises neither of the two live secrets the
founder put in `STRIPE_WEBHOOK_SECRETS`. Reported as BLOCKED, with the 200 given
only as adjacent evidence for what it genuinely proves (the secret key is set and
non-empty).

A second, subtler one: a webhook 200 was tempting to read as "the live keys
work". It proves only that `getStripeClient()` did not throw, which requires
`STRIPE_SECRET_KEY` to be non-empty. `new Stripe(key)` makes no network call, so
the 200 says nothing about the key's MODE or ACCOUNT. Stated that way in the
report.

**The unverifiable claim hunt.**
- "Publishable key is live and on the right account" - falsifiable by finding a
  `pk_test_` in the served bundle or a different embedded substring. Tested both:
  0 test keys, substring matches exactly.
- "The redeploy took effect" - falsifiable if served != configured. Tested: equal.
- "The secret key is set" - falsifiable if the webhook 400d every request.
  Tested: production's own probe got 200 while my corrupted one got 400, so the
  route is discriminating rather than blanket-accepting.
- "The secret key is LIVE" - NOT CLAIMED, because I cannot falsify it.
- "Order confirmation email works on production" - NOT CLAIMED. I proved a
  DIFFERENT sender domain is unverified; `noreply@eventlinqs.com` is a separate
  domain whose Resend status I cannot observe.
- "Seated events are broken on production" - NOT CLAIMED. What is observed is
  narrower: the seat leg of the expiry sweeper errors every minute.

**The founder-cost test.** The report asks the founder for two things that
genuinely cannot be obtained any other way (Vercel Sensitive values are
write-only by design, and Stripe reveals an endpoint secret only at creation).
To stop this recurring, the report proposes the code change that removes the ask
permanently: have `selfProbe` iterate `resolveWebhookSecrets()` so production
proves BOTH destinations itself, on a schedule, with no human holding a secret.
The change is described, not made, per the constraint.

**The evidence-visibility test.** Every claim is a command the founder can re-run
or a log line they can pull. Ledger at this path.

**The regression sweep.** No code changed, no config changed. Nothing to revert.

## Phase 4: the gate

Not met: 6. Partial: 4. Unresolved adversarial findings: 0.
Gate result: **UNFULFILLED**, reported at the top of the report.

All six blocked rows share ONE root cause: no live Stripe credential is reachable
from this session. Two founder values unblock all six.
