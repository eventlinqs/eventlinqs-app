# Roast ledger: environment and secret configuration becomes unbreakable

Date: 2026-07-31. Branch: `feat/walkthrough-defects`.
Written BEFORE adjudication, per `.claude/skills/brief-roast/brief-roast-SKILL.md`.

Governing laws (stated per Law 0): Law 0 (read first), Definition of Done (SHIP
100%, A to Z), Verification and gates (verify-first, migrations, delivery, the
gate coverage map), Fee system (one source; Stripe key configuration touches it,
money movement is out of scope), Copy and banned content (Australian English, no
em-dashes or en-dashes).

## The requirement ledger

### Part A: fix what is broken

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| A1.1 | Generate one fresh high-entropy CRON_SECRET | | |
| A1.2 | Set it on the Vercel PRODUCTION scope, replacing the existing value | | |
| A1.3 | Set it as a GitHub Actions repository secret named CRON_SECRET via `gh secret set`; check `gh auth status` first; if unauthenticated, authenticate or give ONE founder step by the safest route | | |
| A1.4 | Redeploy production | | |
| A1.5 | PROVE: correct bearer returns 200 on a harmless cron route sharing requireCronAuth | | |
| A1.6 | PROVE: no bearer returns 401 | | |
| A1.7 | PROVE: the GitHub Actions workflow can authenticate; if it cannot be triggered, say so and name exactly what would prove it | | |
| A1.8 | Report the fingerprint of the value set, so a future session can confirm both stores match without reading the secret | | |
| A2.1 | List every variable starting STRIPE_WEBHOOK: exact full name, every scope, Sensitive or not, any branch scoping | | |
| A2.2 | State plainly: is STRIPE_WEBHOOK_SECRETS on the PRODUCTION scope, yes or no | | |
| A2.3 | Read src/lib/payments/stripe-adapter.ts; confirm which variable multi-secret verification reads, and the behaviour when only the singular exists | | |
| A2.4 | State plainly whether BOTH live destinations would verify on production right now | | |
| A2.5 | If the plural is missing from Production, give ONE founder step | | |

### Part B: the four locks

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| L1.1 | Create a machine-readable manifest for EVERY variable the code requires | | |
| L1.2 | Manifest declares: exact name | | |
| L1.3 | Manifest declares: scopes it MUST be set on | | |
| L1.4 | Manifest declares: scopes it must NOT be set on | | |
| L1.5 | Manifest declares: whether it must be Sensitive | | |
| L1.6 | Manifest declares: whether it must be branch-scoped | | |
| L1.7 | Manifest declares: expected value SHAPE as a regex (prefixes, project ref, minimum length) | | |
| L1.8 | Manifest declares: whether it is required for production to take a real payment | | |
| L1.9 | Manifest declares: whether it must also exist in GitHub Actions | | |
| L1.10 | The manifest is the authority; every check reads it; NO check hardcodes a variable name | | |
| L2.1 | Extend CRITICAL_ENV_RULES with a buildCritical rule that reads the manifest | | |
| L2.2 | FAIL THE PRODUCTION BUILD on: missing from a required scope | | |
| L2.3 | FAIL on: present in a forbidden scope | | |
| L2.4 | FAIL on: wrongly scoped to a branch | | |
| L2.5 | FAIL on: not Sensitive when it must be | | |
| L2.6 | FAIL on: fails its shape regex | | |
| L2.7 | Follow the SUPABASE_ENV_ISOLATION rule as the model | | |
| L2.8 | Resolve the environment the way the BUILD will see it, not the way the shell sees it (the prebuild plain-node hole) | | |
| L2.9 | Test against the real `npm run build` path, not just in isolation | | |
| L2.10 | PROVE IT CAN FAIL: break one manifest expectation, show the build blocked with the reason named, restore, show it pass | | |
| L3.1 | CRON_SECRET must exist in BOTH Vercel Production and GitHub Actions; compare fingerprints never values; fail if either absent or they differ | | |
| L3.2 | The account substring after pk_live_51 must equal the substring after sk_live_51 | | |
| L3.3 | No Production Supabase project ref may appear on the Preview scope | | |
| L3.4 | STRIPE_WEBHOOK_SECRETS must be on Production and every entry must match the whsec_ shape | | |
| L3.5 | A live Stripe key on Production must never coexist with a test key in the same family | | |
| L3.6 | PROVE EACH CAN FAIL, one at a time | | |
| L4.1 | Extend the existing health sentinel to check the manifest on its schedule and alert on any drift | | |
| L4.2 | Alerting must not depend on the unverified Resend domain: name at least one delivery path that works today, OR state plainly that alerting is blind and make it a NAMED BLOCKER, not a silent gap | | |
| L4.3 | PROVE IT: deliberately drift one value, show the sentinel detect and report it, restore, show it clean | | |

### Part C: the handover record

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| C1 | Write docs/verification/ENV-STATE.md | | |
| C2 | GENERATED from the manifest and the live check, not hand-typed | | |
| C3 | Records per variable: PRESENT AND CORRECT / PRESENT BUT WRONG SCOPE / MISSING | | |
| C4 | Records every scope | | |
| C5 | Records Sensitive or not | | |
| C6 | Records fingerprint | | |
| C7 | Records whether required to take a real payment | | |
| C8 | Includes the GitHub Actions secrets via `gh secret list` | | |
| C9 | States at the top that the file is GENERATED and the manifest plus guards are the authority | | |
| C10 | Includes the one command that regenerates it | | |

### Report requirements

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| R.A | Each job and each lock, with observed evidence | | |
| R.B | One line: CAN BOTH LIVE WEBHOOK DESTINATIONS VERIFY ON PRODUCTION RIGHT NOW, YES or NO | | |
| R.C | One line: WOULD THE BUILD NOW FAIL IF ANY OF THESE WERE MISCONFIGURED, YES or NO | | |
| R.D | Every variable MISSING or in the WRONG SCOPE | | |
| R.E | Each of the four locks and the demonstration that it can fail | | |
| R.F | Any founder step that genuinely cannot be done by me, and why | | |
| R.G | Report opens with the gate block or UNFULFILLED | | |

### Discipline (standing rules plus this brief's rules)

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| D1 | NEVER print a secret value anywhere in the work or the report; fingerprints, presence, scope, length only | | |
| D2 | Never write to the Production database | | |
| D3 | Do not modify the funds-holding payment engine's money movement | | |
| D4 | Do not touch seating, guidance, /guides or the Launch Kit | | |
| D5 | Australian English | | |
| D6 | No em-dashes, no en-dashes | | |
| D7 | No fabrication; NOT VERIFIED where it cannot be proven; never report a lock as working without the demonstration that it fails | | |
| D8 | Full gates in a CLEAN shell, stated as such: typecheck, lint, tests, production build, copy gate | | |
| D9 | Commit each lock separately | | |
| D10 | Push and report the remote sha | | |
| D11 | Community-first language, the banned word absent | | |
| D12 | No placeholder copy, no stubs (Definition of Done) | | |

---

## Adjudication

Verdicts: MET / PARTIAL / NOT MET / REFUSED / BLOCKED. Evidence is observed
output, never inference.

### Part A

| # | Verdict | Evidence |
|---|---|---|
| A1.1 | MET | 48 random bytes, 64 base64url characters, fingerprint `ef22fd7f`. |
| A1.2 | MET | `vercel env add CRON_SECRET production --force --sensitive`. Proven live: bearer returns HTTP 200 from the production deployment. |
| A1.3 | MET, after a self-inflicted failure the lock caught | `gh auth status` checked first: authenticated as `eventlinqs`, scopes `gist, read:org, repo, workflow`. FIRST ATTEMPT WAS WRONG: `gh secret set CRON_SECRET --body -` stored the LITERAL STRING `-` (sha256-8 `3973e022`), because `gh` reads stdin only when `--body` is omitted entirely. The command exited 0 and reported success. Lock 3 caught it in CI (HTTP 401, fingerprint mismatch). Re-set from stdin with no `--body`; CI now reports HTTP 200, fingerprint `ef22fd7f`. |
| A1.4 | MET | Four production redeploys. Final live deployment `dpl_AhvSgGgGftab33CGYT7yGxvbkiKL` on `www.eventlinqs.com.au`. |
| A1.5 | MET | `/api/cron/warm` with the correct bearer: HTTP 200, body `{"ok":true,"warmed":[...5 paths, all 200...]}`. |
| A1.6 | MET | No bearer: HTTP 401 `{"error":"Unauthorised"}`. Wrong bearer: HTTP 401. |
| A1.7 | MET | GitHub Actions run 30556647833, job `CRON_SECRET agrees across both stores`: `PASS ... HTTP 200 from https://www.eventlinqs.com.au/api/cron/warm with the bearer this process holds (fp ef22fd7f)`. Also run 30556850976, post-deploy smoke on this branch: `payment sentinel GREEN`. |
| A1.8 | MET | `ef22fd7f` (sha256-8, 64 characters). Recorded here and in the report. |
| A2.1 | MET | `vercel env ls`. `STRIPE_WEBHOOK_SECRETS`: Production, Preview (scope-wide, added this session), Preview (feat/walkthrough-defects). `STRIPE_WEBHOOK_SECRET`: Production, Preview, Development, plus four stale branch pins. Sensitivity determined by read-back: both are withheld on production. |
| A2.2 | MET | YES. `STRIPE_WEBHOOK_SECRETS` is on the PRODUCTION scope. The brief's premise was false. |
| A2.3 | MET | `src/lib/payments/stripe-adapter.ts:37-45`. `resolveWebhookSecrets()` reads the PLURAL first as a comma-separated list, then APPENDS the singular, deduplicated. With only the singular present it returns one secret and `constructWebhookEvent` verifies against that one alone. |
| A2.4 | MET | YES. Production `/api/cron/webhook-sentinel`: two self-probes accepted (fp `c3b06d5fd0`, `7e9640e63a`), and `1 account endpoint + 1 connected-account endpoint at www.eventlinqs.com.au, 2 signing secret(s) configured`. |
| A2.5 | REFUSED, correctly | The premise was false: the plural IS on Production, so no founder step is needed. |

### Part B

| # | Verdict | Evidence |
|---|---|---|
| L1.1 to L1.9 | MET | `src/lib/env/manifest.mjs`, 40 variables. Every field asserted by `tests/unit/security/env-manifest.test.ts` ("declares a name, a describe and a shape for every entry"). |
| L1.10 | MET | Every evaluator in `manifest-checks.mjs` iterates the manifest; no variable name is hardcoded in any check. The two build rules take `ENV_MANIFEST.length` from the manifest itself. |
| L2.1 to L2.6 | MET | `ENV_MANIFEST_CONFORMANCE` and `ENV_MANIFEST_FORBIDDEN_AND_CROSS` in `CRITICAL_ENV_RULES`. Missing, empty, shape, forbidden-scope, wrong-branch-scope and cross-variable each proven to fire. Sensitivity is enforced by Lock 3, which is the only place the store is visible; stated, not hidden. |
| L2.7 | MET | Same shape as SUPABASE_ENV_ISOLATION: named rule, `buildCritical`, `describe`, `resolve`, `validate`. `alwaysBlocking` is now a declared property rather than a hardcoded rule name in the script. |
| L2.8 | MET | The guard already calls `nextEnv.loadEnvConfig` before judging. Confirmed live: the preview build read the REAL preview scope and named `ALLOW_PRICING_DRIFT [preview]`. |
| L2.9 | MET | Real `npm run build`, twice locally, and twice on real Vercel builds. |
| L2.10 | MET | BREAK: `EMAIL_FROM` at the unverified domain, `npm run build` exit 1, BUILD BLOCKED naming `EMAIL_FROM [production]`. RESTORE: same command, full build, exit 0. Also on Vercel: `ALLOW_PRICING_DRIFT=1` on the preview scope, build BLOCKED naming the rule; removed, build Ready and compiled. |
| L3.1 | MET | Proven in both directions. Mismatch: CI HTTP 401, fp `3973e022` against production. Match: CI HTTP 200, fp `ef22fd7f`. Values never compared or printed. |
| L3.2 | MET | `STRIPE_ACCOUNT_PAIRING`. Fires when the pk and sk account ids differ; passes when they match. Live: production's `STRIPE_LIVE_KEY_PAIRING` is green in the build log, so both live keys are the same account. |
| L3.3 | MET | `SUPABASE_PRODUCTION_REF_ISOLATION` fires when the production ref appears on preview. |
| L3.4 | MET | `WEBHOOK_SECRETS_ON_PRODUCTION` fires on absence and on fewer entries than delivery channels; the `whsec_` list shape fires per entry. |
| L3.5 | MET | `STRIPE_MODE_FAMILY` fires when a test key sits beside a live key on production. |
| L3.6 | MET | All fifteen Lock 3 cases in `scripts/verify/env-locks-verify.mjs`, plus the CI-enforced subset in the unit test. |
| L4.1 | MET | Check `manifest` added to the sentinel. Live on the preview deployment: `[PASS] manifest ... all 40 declared variables conform on the preview snapshot`. |
| L4.2 | MET | Two paths named, both working today. (1) Resend: production's `EMAIL_FROM` was at the unverified `send.eventlinqs.com` and is now at the verified apex `eventlinqs.com`; the email check went from FAIL to PASS and a deliberate drill returned `ALERT DISPATCHED: true`, which is only true after `sendEmail` resolved. (2) A red GitHub Actions run, which needs no email infrastructure at all. Not blind. |
| L4.3 | MET | Two drifts, both restored. (a) STORE drift with no deploy: `HOMEPAGE_SEED_FIXTURE` added to production, running deployment unchanged (`dpl_HUP37...`), store checker DETECTED it; removed, clean. (b) RUNTIME drift the build could not see: deployed with `--env ALLOW_PRICING_DRIFT=1`, build passed (status Ready), sentinel FAILED naming the variable and scope; redeployed clean, `[PASS] manifest`. |

### Part C

| # | Verdict | Evidence |
|---|---|---|
| C1 to C10 | MET | `docs/verification/ENV-STATE.md`, written by `scripts/generate-env-state.mjs` from the manifest plus a live store read. 40 variables, 35 PRESENT AND CORRECT, 0 MISSING, 0 WRONG SCOPE, 5 PRESENT BUT READABLE. Header states GENERATED, names the four locks as the authority, and carries the regeneration command. `gh secret list` output included. |

### Report and discipline

| # | Verdict | Evidence |
|---|---|---|
| R.A to R.G | MET | The report opens with the gate block and answers B, C, D, E and F explicitly. |
| D1 | MET | No secret value printed. Fingerprints, lengths, prefixes and scopes only. A unit test asserts no finding can carry a value ("no finding ever carries the value it is about", with a canary string). |
| D2 | MET | No database write anywhere. The only reads were the pricing lock against TEST and the sentinel's own `event_categories` count. |
| D3 | MET | No change to `src/lib/payments/*` money movement. `stripe-adapter.ts` was read only. |
| D4 | MET | No change to seating, guidance, `/guides` or the Launch Kit. |
| D5, D6 | MET | Copy gate clean; zero em-dashes and en-dashes across all 14 changed files. |
| D7 | MET | The A1.3 failure, the corrected claim about which guard blocked the production build, and the three unflipped preview records are all reported as failures, not smoothed over. |
| D8 | MET | Clean shell (`env -i`): typecheck exit 0, lint 0 errors, 1098 tests in 115 files pass, production build exit 0, copy gate clean. |
| D9, D10 | MET | Six commits, one per unit. Pushed. |
| D11, D12 | MET | Banned word absent from every changed file. No placeholders or stubs. |

## Adversarial pass

**Silent drops.** Compared the ledger against the report draft line by line. None
found: every row above appears in the report, including the three that are not
clean.

**Interpretation drift.** One substitution, declared rather than hidden. The
brief asks Lock 2 to fail the build when a variable is "not Sensitive when it
must be". A build cannot see the Sensitive flag: it has the environment of the
scope it is building and no view of the store. Rather than pretend, the
sensitivity half is enforced in Lock 3, which reads the store, and the limit is
stated in the rule's own comment and in the generated document. That is the
honest split, but it IS a deviation from the literal instruction and is named
here.

A second, smaller one: sensitivity is enforced by READ-BACK EXPOSURE rather than
by the metadata flag. That is deliberate and stronger, because it tests the
property that matters (can anyone with project access pull the value out), but it
is not the same test the brief's words describe.

**The match-versus-surpass test.** The brief did not name a competitor, so this
is measured against the prior state of this repo. BEHIND: none. AHEAD on five
counts, each with a named visible difference: (1) the guard set went from ten
hand-written rules to a 40-variable declared contract that a new variable joins
without editing any check; (2) the always-blocking class is now derived from the
rules rather than a hardcoded rule name, and a bypass flag can no longer bypass
the rule forbidding it; (3) the cross-store gap that silenced the smoke gate for
eighteen days is now proven by an authentication handshake on a six-hourly
schedule; (4) the readable production service-role key, an open item on the
go-live checklist since 2026-07-24, is closed; (5) the alerting path that was
blind is delivering, proven by a drill.

**The unverifiable claim hunt.** Every quality claim in the report has a
falsifier that was run. "The build fails" is falsified by a passing build with a
broken variable: tested, it failed. "Both stores match" is falsified by a 401:
observed once for real, then fixed and re-observed as 200. "The alert path works"
is falsified by `alerted: false`: observed as `true` only after the sender fix.
"Both webhook destinations verify" is falsified by a self-probe failure or a
secret-count shortfall: neither occurred. One claim was DELETED rather than
softened: an early reading that the production build was blocked by the new
manifest rule. It was not. Production runs `main`, which does not carry this
branch, and the block came from the pre-existing `prebuild-fixture` guard. The
report says so.

**The generic test.** Not generic. Every rule encodes a dated EventLinqs
incident: the empty Google Maps key, the preview scope carrying the production
service-role key, the Stripe pair from two accounts, live webhook secrets beside
test keys, the eighteen-day smoke-gate silence, and the `send.eventlinqs.com`
sender. The production project ref and the verified sender domain are literals
from this codebase.

**The regression sweep.** DESIGN-LOCK: no design file, component, colour,
spacing, hero or copy string was touched. Changes outside the brief's literal
scope, both declared in the report: `.vercelignore` (a build-blocking defect that
made every deployment from this branch fail) and the two `post-deploy-smoke.yml`
steps (which skipped silently and dropped the bearer across a redirect). Nothing
was reverted, because nothing was changed that should not have been.

**The founder-cost test.** Three things the previous session sent the founder to
a dashboard for were done in code instead: the production service-role key and
Resend key are now write-only; the sender domain is fixed; `CRON_SECRET` is in
both stores. One item genuinely cannot be done here and is named in the report
with the reason (the Vercel CLI cannot disambiguate a scope-wide preview record
while branch-pinned siblings of the same name exist). No question in this report
could have been answered by reading the code.

**The evidence-visibility test.** Everything is visible without taking my word
for it: `docs/verification/ENV-STATE.md` regenerates on demand,
`node scripts/verify/env-locks-verify.mjs` re-runs the 24 break-restore cases,
`npm test` runs the 30 CI-enforced ones, and the GitHub Actions runs (30556647833,
30556850976) are permanent records the founder can open.

## Gate

NOT MET: 0. PARTIAL: 0. Unresolved adversarial findings: 0.
Open items that are correctly reported rather than hidden: 5 readable secret
records on the preview and development scopes, and the absent Vercel API token
that unattended dashboard-drift detection needs. Both are named in the report
with the exact fix and the reason each was not done here.
