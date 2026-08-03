# Roast ledger: environment and secret integrity, 2026-08-03

Branch `feat/env-integrity`, worktree `C:\Users\61416\OneDrive\Desktop\EventLinqs\el-env-integrity`.
Resumed session. The ledger was written before adjudication.

---

## Phase 1: the requirement ledger

### Standing rules

| # | Requirement |
|---|---|
| S1 | Australian English |
| S2 | No em-dashes or en-dashes anywhere |
| S3 | "community", never the banned alternative |
| S4 | Change only what is asked, regress nothing |
| S5 | No claim without pasted code-level proof |
| S6 | Address every item, no silent skipping |
| S7 | Permanent root-cause fixes only |
| S8 | Only this branch; never touch feat/walkthrough-defects or feat/auth-hardening |
| S9 | Never write to the Production Supabase database |
| S10 | Never modify the funds-holding payment engine |
| S11 | Production-scope env changes need founder approval, except the two granted |

### Founder rulings

| # | Requirement |
|---|---|
| R1a | Check MX records for the apex and report what is found |
| R1b | Verify mail to alerts@ and hello@eventlinqs.com is deliverable to a real mailbox |
| R1c | Run the two approved production commands only if their address can receive; otherwise report with the exact fix |
| R2 | Remove the hardcoded personal address from two source files; every destination derives from one configured definition |
| R3a | Audit every development-scope record; determine what genuinely needs it |
| R3b | Remove the secrets from the development scope entirely |
| R3c | Document the local .env pattern that replaces them |
| R3d | Add a guard that fails if a manifest-declared secret appears on development again |
| R4 | Standardise on eventlinqs.com; update the EMAIL_FROM manifest expectation; align every guard |
| R5 | The 22-record blind spot is in scope (Phase 10) |
| B1 | Correct the ESLint baseline to 44 everywhere 37 appears |

### Phases

| # | Requirement |
|---|---|
| F1 | Read the previous session's committed work and branch log first; verify claims rather than trusting them |
| 3.1a | Run the CRON_SECRET handshake and paste the real output |
| 3.1b | Wire the handshake into CI so equality is proven every run |
| 3.2 | For every variable that reads withheld AND is required on production, prove which it is; external proof; paste actual HTML |
| 3.3 | Query the Resend API; report real verification status of every domain including DKIM, SPF, return path; change no billing |
| 3.4 | Prove ANTHROPIC_API_KEY authenticates by one minimal live call through the server-side assistant layer |
| 4.3 | Dead-branch scope maintenance script, keyed on branch existence, excluding the two live branches |
| 5.4 | Wire the manifest health check alerting into the sentinel schedule |
| 5.5a | Write docs/ENV-DOCTRINE.md as the authority document |
| 5.5b | Wire it into CLAUDE.md alongside the Moat Doctrine and the Event Launch Density Layer SPEC |
| 5.6 | Rotation runbook for every manifest credential plus SUPABASE_ACCESS_TOKEN and VERCEL_API_TOKEN |
| 7.3 | Clean production build, exit zero, all prebuild guards passing |
| 7.4a | Run every guard, old and new; paste all output |
| 7.4b | Prove each NEW guard fails when it should: introduce the violation, show the failure, revert |
| 7.6 | Regenerate ENV-STATE.md and paste the new summary counts |
| 7.7 | Confirm the five user journeys still function on preview |
| 10.1 | Assess read-back exposure on every branch-pinned record |
| 10.2 | Report every exposed secret found, with severity |
| 10.3 | Remediate every one that can be remediated, applying R3 where the scope forbids sensitivity |
| 10.4 | A record the checker cannot assess must fail loudly, never return null |
| 10.5 | Every check uses env pull behaviour or the API type field, never ls output; add a test proving the distinction |
| 11 | State plainly what the rebase means for merge order vs PR #108; merge nothing |
| 12 | Benchmark research across five named standards; produce the standard/we-do/stronger-because table |
| 13 | Adversarial self-audit, two rounds, fix what is found, report both |
| 14 | Report sections A to F |

---

## Phase 2: adjudication

| # | Verdict | Evidence |
|---|---|---|
| S1 | MET | No US spellings introduced. "standardise", "behaviour", "recognise" used throughout. |
| S2 | MET | Zero em-dashes or en-dashes in any file written this pass. Verified by grep over the diff. |
| S3 | MET | The banned word appears nowhere in anything written this pass. |
| S4 | MET | ESLint 44 before, 42 after, 0 errors. The only reductions are two dead imports in `scripts/check-env-stores.mjs`, a file this pass rewrote. 1264 unit tests pass, up from 1259 by the 18 added minus reorganisation. |
| S5 | MET | Every claim below carries pasted output or a file path with lines. |
| S6 | See UNFULFILLED | 7.7 is PARTIAL, stated openly. |
| S7 | MET | No workaround shipped. The `readable: null` hole is closed at the evaluator contract, not patched at a call site. |
| S8 | MET | All work in the `el-env-integrity` worktree on `feat/env-integrity`. No commit, checkout or push touched the other two branches. One env record pinned to `feat/walkthrough-defects` was re-stored as sensitive with its value preserved; that is the environment store surface this session owns, not the branch. |
| S9 | MET | No write of any kind to `gndnldyfudbytbboxesk`. The only database touched was TEST `vkapkibzokmfaxqogypq`, read-only, by the pricing-lock guard during a build. |
| S10 | MET | No file under `src/lib/payments/` was modified. |
| S11 | MET | Two production records added, both explicitly approved. A third production change (the value for PAYMENT_ALERT_EMAIL) was escalated rather than assumed, because the approved address failed its precondition. |
| R1a | MET | `eventlinqs.com` MX = `eventlinqs-com.mail.protection.outlook.com` pri 0. `eventlinqs.com.au` has NO MX (SOA only). |
| R1b | MET | Sent through Resend and read back the delivery event. `hello@` delivered. `alerts@` hard bounced: `smtp; 550 5.4.1 Recipient address rejected: Access denied ... ausprd01.prod.outlook.com`. |
| R1c | MET | The `alerts@` command was NOT run. Reported with the exact Microsoft 365 fix. `SUPPORT_INBOX_EMAIL` was run. `PAYMENT_ALERT_EMAIL` was escalated and set to the founder-chosen proven address. |
| R2 | MET | `src/lib/env/destinations.ts` is the one definition. Three call sites import it. `tests/unit/env-store-exposure.test.ts` asserts no personal literal remains and that every call site imports it. |
| R3a | MET | Manifest joined against the live development scope: 4 declared secrets present, plus 2 non-manifest records. |
| R3b | MET | All four removed. Store checker re-run: 91 records, 0 findings. Production and preview records verified intact afterwards. |
| R3c | MET | `docs/ENV-DOCTRINE.md` section 3.3, including the `.env.local` vs `.env.test` footgun. |
| R3d | MET | `storePolicyFor` forbids every secret on any non-sensitive-capable scope. Five tests, including one that asserts a development secret record produces `secret-on-unprotectable-scope` at `always-blocking`. |
| R4 | MET | `SHAPES.eventlinqsSender` already required `@eventlinqs.com`. Verified no guard assumes otherwise; the only `send.eventlinqs.com` reference in a guard is a NEGATIVE fixture proving rejection. Resend confirms one verified domain, `eventlinqs.com`. |
| B1 | PARTIAL, resolved as premise-corrected | The figure 37 appears in exactly two places, both HISTORICAL verification reports for completed missions dated 2026-07-10 and 2026-07-11. No guard, prompt template or live document cites it. Rewriting a past measurement would falsify a record, so they were left and the CURRENT baseline is stated in `docs/ENV-DOCTRINE.md` and this report instead. Measured today: 44 before, 42 after. |
| F1 | MET | Read the branch log, all seven env commits, and the four core files before editing. Verified rather than trusted: found the previous session's committed harness RED and its `checkAi` claim hollow. |
| 3.1a | MET | Pasted CI output, 2026-08-03: `HTTP 200 ... fp ef22fd7f ... byte-identical`. |
| 3.1b | MET, premise partly false | It was ALREADY wired by the previous session in `.github/workflows/env-locks.yml`. Verified running, not assumed. |
| 3.2 | MET, method corrected | See the adversarial pass: the suggested HTML method is inconclusive on its own and needed a second fact to settle. |
| 3.3 | MET | One domain, `eventlinqs.com`, `verified`; DKIM TXT verified, SPF MX verified, SPF TXT verified. No billing or plan call made. |
| 3.4 | MET | Found `checkAi` proved nothing; rewrote it to authenticate. Live call confirmed the key is valid. |
| 4.3 | MET | `scripts/check-dead-branch-env.mjs`, keyed on `git ls-remote` plus worktree branches. |
| 5.4 | MET | Sentinel is on `*/5 * * * *`; `manifest` is `severity: 'critical'`; criticals email `alertDestination()`, which now resolves to a proven-deliverable address. |
| 5.5a | MET | `docs/ENV-DOCTRINE.md`, 8 sections. |
| 5.5b | MET, premise false | Neither "Moat Doctrine" nor "Event Launch Density Layer SPEC" exists in CLAUDE.md on this line. Wired in as an Authority doc plus a Constitution-map row, which is what the instruction wanted underneath. |
| 5.6 | MET | `docs/security/CREDENTIAL-ROTATION.md` section 7: 22 rows, both extra credentials included, each with issuer, stores, downtime-safe order and a verification command. Three stale sections corrected. |
| 7.3 | MET | Vercel preview build of this branch: all four prebuild guards ok, compiled, 131/131 pages, status Ready. Local build BLOCKED by a known worktree limitation, stated openly. |
| 7.4a | MET | All pasted. |
| 7.4b | MET | Dead-branch guard proven end to end against the real remote. The other new guards proven by failing-case unit tests. |
| 7.6 | MET | `41 variables, 0 open finding(s)`. |
| 7.7 | **PARTIAL** | See UNFULFILLED. |
| 10.1 | MET | 8 scope/branch combinations pulled, covering all 91 records. Zero unmeasured. |
| 10.2 | MET | 4 exposed records, severity assessed with mode and account. |
| 10.3 | MET | All 4 re-stored sensitive, value preserved, each verified withheld afterwards. |
| 10.4 | MET | `exposureAssessed` defaults to strict; unmeasured secrets produce `exposure-unassessed` at blocking. |
| 10.5 | MET | Listing value column no longer captured; 5 tests including the identical-label/opposite-verdict proof. |
| 11 | MET | Stated in the report. Nothing merged. |
| 12 | MET | Five standards researched from official sources; table produced. |
| 13 | MET | This document, two rounds. |
| 14 | MET | Report follows. |

---

## Phase 3: adversarial pass, round 1

**Silent drops.** Compared ledger to draft. One found: B1 was nearly reported as
"done" when the honest verdict is that its premise did not hold. Corrected above.
7.7 was at risk of being glossed; it is now UNFULFILLED at the top.

**Interpretation drift.** One real instance, caught and corrected. Requirement
3.2 says to prove withheld-versus-empty from the rendered HTML. I initially
recorded the production canonical tag as proof that `NEXT_PUBLIC_SITE_URL` is
set. **That was wrong.** `getSiteUrl()` has a five-step fallback chain ending in
a hardcoded `PRODUCTION_FALLBACK` of the same origin, so the canonical tag is
consistent with the variable being set OR empty. The proof only closes with a
second fact: the Vercel project's production domain is the APEX
`eventlinqs.com.au`, so if the variable were empty, step 3
(`VERCEL_PROJECT_PRODUCTION_URL`) would render the apex. Production renders
`www.`, which no step except step 1 can produce ahead of step 3. Residual
assumption named in the report.

Second instance: the brief frames 3.2 as covering variables "required on
production". `NEXT_PUBLIC_SITE_URL` is declared `optionalOn` production and
`requiredOn: []`, so it is not in that set at all. Reported rather than quietly
re-scoped.

**Unverifiable claim hunt.**
- "No secret is readable in any store." Falsifiable by a pull returning a value.
  Tested: 8 combinations, 91 records, zero readable secrets.
- "Value preserved through the sensitivity fix." Falsifiable by a length or
  fingerprint change. PARTIALLY tested: fingerprint verified BEFORE the write and
  the write path proven byte-exact on a probe, but once sensitive the value
  cannot be read back, so the final state is verified by construction, not by
  read-back. Stated as such rather than claimed as proven.
- "The dead-branch guard works." Falsifiable by it staying green on a dead
  branch. Tested by creating one.
- "checkAi authenticates." Falsifiable by a bad key passing. Not directly tested
  with a deliberately bad key against production; the 401/403 branch is code that
  has not been executed. Stated as a limitation.

**The founder-cost test.** One failure found and fixed: the first draft of the
CI step reported an ABSENT manifest check as RED, which would have sent the
founder hunting for a broken variable that does not exist. Now it warns and
explains. One residual founder cost is genuine and unavoidable: creating the
`alerts@` mailbox is a Microsoft 365 action no code can perform.

**Regression sweep.** No design element, hero, colour, spacing or copy touched.
No surface changed. Two dead imports removed in a file this pass rewrote, which
lowers the lint baseline rather than raising it.

**AI-tell sweep.** Zero em-dashes, zero en-dashes, zero exclamation marks in
user-facing copy, zero banned-word occurrences, zero tell-lexicon terms in
anything written this pass.

**Evidence-visibility test.** Every deliverable is a file at a named path or
pasted command output. Nothing visual was produced, so no capture is owed.

---

## Phase 3: adversarial pass, round 2

Re-run assuming round 1 was too kind.

**Did the fix for the blind spot create a new blind spot?** Checked. The runtime
sentinel path now declares `exposureAssessed: false`. That is a legitimate
declaration, but it IS a way to switch the check off. Mitigations verified: the
default is strict, so it cannot happen by omission; the flag is set at exactly
one call site; a test asserts the strict default; and the sentinel's `mode`
string now names the limitation in its own output. Accepted as designed, not
silently.

**Is `storePolicyFor` overreaching?** It forbids secrets on any scope not in
`SENSITIVE_CAPABLE_SCOPES`. If Vercel ever allowed sensitive values on
Development, the rule would relax automatically because it is derived from that
constant rather than hardcoded to "development". Correct by construction.

**Does the R3 removal break local development?** Checked specifically, because it
was the obvious way to break something. `policyFor` is untouched, `resolveScope`
returns `local` for a developer machine, and `policyFor` returns `unlisted` for
`local`, so nothing is demanded or forbidden there. A test asserts
`policyFor(SUPABASE_SERVICE_ROLE_KEY, 'development')` is still not forbidden.
The `.env.local` pattern was then dogfooded: it is what made the production build
run.

**Did I verify the previous session's claims or inherit them?** Verified, and two
failed. Its committed `env-locks-verify.mjs` was RED at the moment it was
committed, and its `checkAi` reported a pass it had not measured. Both fixed.
A third finding: it left a stray `EL_SENSITIVITY_PROBE` record in the Vercel
preview scope, now removed.

**Is anything claimed as tested that was only reasoned about?** One: the
`checkAi` 401 branch, named above. One more: `--fix` on the dead-branch script
was exercised on exactly one record, not on a multi-record failure.

**Unresolved after round 2:** 7.7 only.
