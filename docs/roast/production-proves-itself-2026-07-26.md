# Roast ledger: production proves itself, 2026-07-26

Written BEFORE adjudication, per `.claude/skills/brief-roast/brief-roast-SKILL.md`
Phase 1. Verdicts filled in only after each item is observed.

Predecessor ledger: `docs/roast/live-keys-production-2026-07-26.md`.
Founder ruling carried into this task: he will NOT paste `sk_live_` or either
`whsec_`. Production must prove itself instead.

## The ledger

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read the brief-roast skill FIRST and obey it | MET | Read first; this ledger written before any adjudication |
| 2 | Report opens with the gate block or UNFULFILLED | MET | Opens `UNFULFILLED` (2 items) |
| 3 | Read `docs/roast/live-keys-production-2026-07-26.md` | MET | Read in full, 118 lines |
| 4 | JOB 1: add a `CRITICAL_ENV_RULES` rule | MET | `STRIPE_LIVE_KEY_PAIRING`, `src/lib/health/critical-env.mjs` |
| 5 | JOB 1: it is `buildCritical` | MET | `buildCritical: true`; asserted by test "is a BUILD-critical rule" |
| 6 | JOB 1: only fires when `VERCEL_ENV === 'production'` | MET | `if (target !== 'production') return { ok: true }`; two no-op tests (preview, local) |
| 7 | JOB 1: asserts `sk_live_` | MET | Observed BUILD BLOCKED case A |
| 8 | JOB 1: asserts `pk_live_` | MET | Observed BUILD BLOCKED case A |
| 9 | JOB 1: account substring identical | MET | Observed BUILD BLOCKED case B (live pair, different accounts) |
| 10 | JOB 1: never logs or exposes either value | MET | `resolve()` packs only target + mode + ref; test "NEVER puts key material or an account ref into the failure reason"; observed output contains no `sk_`/`pk_` string and no ref |
| 11 | JOB 1: tests included | MET | 15 tests, `tests/unit/security/stripe-live-key-pairing.test.ts` |
| 12 | JOB 2: `selfProbe` iterates `resolveWebhookSecrets()` | MET | `src/lib/health/payment-checks.ts`; imported from the adapter, one source of truth |
| 13 | JOB 2: probes once per secret | MET | Test verifies by real HMAC that each probe carries a DIFFERENT secret |
| 14 | JOB 2: no human holds a signing secret | MET | Secrets are read from the deployment's own env; probes named by sha256 fingerprint only |
| 15 | JOB 2: tests included | MET | 11 tests, `tests/unit/payments/sentinel-probes-every-secret.test.ts` |
| 16 | JOB 3: every check logs its own result AND reason | MET | `emit()` in payment-checks, `logHealthResult()` in `timed()` for all 10 platform checks, plus a route-level verdict line; asserted by test |
| 17 | JOB 3: report exactly what drove the production 503 | **PARTIAL** | Narrowed to `driftWatchdog` or `endpointConfigCheck` (selfProbe PASSED, observed 200 at 00:40:16.616Z). WHICH is **NOT VERIFIED**: neither logged, cron auth is fail-closed on a Sensitive secret, and anon `orders` reads are RLS-filtered. The shipped logging answers it on the next deploy |
| 18 | JOB 4: report which sender each email flow uses | MET | Full table in the verification doc; every one of the 5 Resend call sites enumerated |
| 19 | JOB 4: ONE founder step | MET | Founder step 3 |
| 20 | JOB 4: is repointing faster, and prepare the change | MET | Yes if `eventlinqs.com` is verified; exact env change prepared. Whether it IS verified is NOT VERIFIED (no Resend access), stated |
| 21 | JOB 5: compare EVERY migration against PRODUCTION, read only | MET | All 75 files; GET-only, PostgREST READ-ONLY transaction proven by `25006` |
| 22 | JOB 5: list EVERY missing migration | MET | 23 listed. Method validated to 0 false negatives on TEST after two corrections |
| 23 | JOB 5: what each does | MET | Table column 4 |
| 24 | JOB 5: what breaks without each | MET | Table column 5 |
| 25 | JOB 5: apply NOTHING | MET | No write issued; no `supabase db push` run; oracle is GET-only |
| 26 | JOB 5: one founder step to apply safely | MET | Founder step 4 |
| 27 | JOB 5: destructive or maintenance window | MET | None destructive at apply time: every DROP is an `IF EXISTS` guard, every DELETE is inside a function body. No window needed, reasons given |
| 28 | JOB 6: find out WHY | MET | `SUPABASE_ACCESS_TOKEN` expired -> `Unauthorized` -> types-drift job fails -> CI concludes failure -> smoke `if` false -> skipped. Every CI run on main since 2026-07-10 is `failure` |
| 29 | JOB 6: fix it so it actually runs | **PARTIAL** | Decoupled onto `deployment_status` (Production, success), YAML validated, Vercel Production deployments confirmed to exist. That the event FIRES is **NOT VERIFIED** until the next production deploy |
| 30 | JOB 6: fix it so it actually blocks | MET | The job's failing steps are unchanged and still `exit 1`; nothing was made non-blocking, no threshold lowered |
| 31 | REPORT A: each job with evidence | MET | Sections 1-6 |
| 32 | REPORT B: one line YES or NO | MET | `NO` |
| 33 | REPORT C: every missing migration + what breaks | MET | 23-row table |
| 34 | REPORT D: founder steps, exhaustive | MET | 6 steps |

## Discipline rules (binding, from the brief)

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| D1 | Never write to the Production database | MET | Every production query is a GET. PostgREST served them in a READ-ONLY transaction, proven: a mutating function returned `25006 cannot execute SELECT FOR UPDATE in a read-only transaction` instead of running |
| D2 | Funds-holding MONEY logic untouched | MET | Changed: `critical-env.mjs` (env guard), `payment-checks.ts` + `checks.ts` (health), `webhook-sentinel/route.ts` (sentinel), `email/send.ts` (sender resolution), 2 workflows, 3 test files. `src/app/api/webhooks/stripe/route.ts` and `stripe-adapter.ts` NOT modified: `resolveWebhookSecrets` is imported, read-only |
| D3 | Australian English | MET | Proofread |
| D4 | No em-dashes, no en-dashes | MET | Hyphens, colons, commas only |
| D5 | Pull before committing | MET | `git fetch origin feat/walkthrough-defects`; `git rev-list --count HEAD..origin/...` = 0 |
| D6 | Commit ONLY my own paths | MET | 13 paths staged explicitly, listed in the commit |
| D7 | Never sweep another session's files | MET | The 14 modified `docs/verification/seated-attachment-2026-07-11/*` files and `docs/verification/merged-main-2026-07-19/` were dirty at session start and are deliberately NOT staged |
| D8 | No fabrication: NOT VERIFIED where unprovable | MET | 3 explicit NOT VERIFIED calls: which check drove the 503; whether `eventlinqs.com` is verified at Resend; whether `deployment_status` actually fires |

## Standing constitution rules

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| S1 | The word "culture" is banned | MET | Used only as a literal DATABASE OBJECT NAME (`cultures` table, `culture_taxonomy` migration) that exists on production today, which is the finding itself, never as product copy |
| S2 | No exclamation marks in user-facing copy | MET | None written |
| S3 | Gates green (tsc, eslint, vitest) | MET | tsc 0; eslint 0 errors, 10 pre-existing warnings; vitest 919/919, 106 files |
| S4 | Nothing reported DONE while a requirement is unmet | MET | Report opens UNFULFILLED with the 2 PARTIAL items |

## Phase 3: the adversarial pass

**Silent drops.** All 34 rows and all 12 rule rows appear in the report. None dropped.

**Interpretation drift.** Three real instances, all caught:

1. **JOB 2 is weaker than it sounds, and I nearly let it pass as strong.** Probing
   each configured secret proves the ROUTE accepts every secret the deployment
   HOLDS. It cannot prove Stripe SIGNS with them, because prober and route read
   the same env, so a configured secret always verifies against itself. Rather
   than quietly delivering the weaker thing, the limit is written into the
   function's own doc comment and the report, and the structural half is genuinely
   covered by the new secret-count-versus-endpoint-count assertion.
2. **The migration oracle was wrong twice and I nearly shipped the first answer.**
   The first run said 29 migrations missing. Validating against TEST, which has
   everything applied, showed `confirm_order` reported missing there too: a bare
   `GET /rpc/<fn>` looks for a zero-argument overload. Then trigger functions
   showed as missing because PostgREST never exposes them. Only after both
   corrections did TEST come back with 0 false negatives. The published number is
   23, from the validated method.
3. **I nearly reported production's community pages as broken.** Production has
   `cultures` and no `communities`, and `/community/first-nations` returns 404, so
   the inference was tempting. Clicking the 21 links the page actually renders
   showed 12/12 resolving 200: `first-nations` simply is not a real slug. No Law 5
   defect. Retracted before it reached the report.

**The unverifiable claim hunt.**
- "The build blocks test keys on production" - falsifiable by running the guard.
  Ran it: BUILD BLOCKED, cases A and B; passes case C.
- "No key material reaches a log" - falsifiable by finding a key substring in the
  reason. Tested in code and observed in the guard output.
- "Each probe uses a different secret" - falsifiable by HMAC. Verified by HMAC.
- "23 migrations are unapplied" - falsifiable by the method reporting false
  negatives on a fully-migrated database. Validated: 0 on TEST.
- "Production's DB is frozen at ~2026-06-21" - falsifiable by an independent
  signal. Corroborated by `cultures` present on prod and absent on TEST.
- "The true number may be higher than 23" - stated, because function-redefinition
  migrations are indistinguishable from applied ones.
- "The smoke gate now runs" - NOT CLAIMED. Marked NOT VERIFIED.
- "Which check drove the 503" - NOT CLAIMED. Marked NOT VERIFIED.
- "The ticket email works on production" - NOT CLAIMED. A different domain from
  the one proven unverified, and I have no Resend access.

**The founder-cost test.** The whole point of this task was to stop asking the
founder for secrets. Two asks were removed permanently: the live keys are now
proven by the build, and both webhook secrets are now probed by production
itself. The remaining founder steps are ones no code can do: rotate an expired
token, verify a DNS-backed domain, apply migrations to a database only he may
write to, promote a branch. Each is a dashboard action with the exact screen and
button named.

**The evidence-visibility test.** Every claim is a command the founder can re-run,
a log line he can pull, or a table in
`docs/verification/production-proves-itself-2026-07-26.md`.

**The regression sweep.** No design surface, colour, spacing or copy touched. No
threshold lowered and no check made optional: the drift guard keeps
`continue-on-error: false`, and every failing smoke step still exits 1. The one
behavioural change to an existing gate is `PROD_URL` moving to the canonical
host, which is a correction, and it is reported.

## Phase 4: the gate

Not met: 0. Partial: 2 (rows 17 and 29). Unresolved adversarial findings: 0.
Gate result: **UNFULFILLED**, reported at the top of the report.

Both PARTIALs are the same shape: the work is built and merged-ready, but the
final confirming observation can only come from production itself, on the next
deploy. Neither is claimed as done.
