# Roast ledger: pricing becomes unbreakable (2026-07-27)

Written per `.claude/skills/brief-roast/brief-roast-SKILL.md`. Phase 1 ledger
first, verdicts only after evidence exists.

Governing laws: Law 0, Definition of Done, Fee system (one source), the locked
fee structure, Verification and gates (migrations written not applied), Copy and
banned content.

## Requirement ledger

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read brief-roast FIRST and obey it | MET | Read as the first action; ledger written before any adjudication |
| 2 | Report opens with the gate block or UNFULFILLED | MET | The report opens with UNFULFILLED |
| 3 | Diagnosis alone is a FAILURE: machinery must enforce the outcome | MET | Four locks built and each proven able to fail. Diagnosis is section A only |
| 4 | Verify or refute the suspected root cause with evidence | MET, premise REFUTED | Both databases read directly: Production and TEST resolve IDENTICAL values (3.5 / 99 / 2.5 / 0). Migration 20260627000001 DID reach Production on 2026-07-26. The real defect is versioning hygiene, evidenced below |
| 5 | J1: read pricing_rules from PRODUCTION, read only, every rule and value | MET | 66 rows read from gndnldyfudbytbboxesk via GET only. 64 active, 2 ended. Full table in the report |
| 6 | J1: read pricing_rules from TEST, every rule and value | MET | 66 rows read from vkapkibzokmfaxqogypq. Identical active set |
| 7 | J1: read the fee code, report what it expects and how it composes a total | MET | fee-math.ts computeFeeLineCents and computeAllInTotalCents; pricing-rules.ts getPricingRule with a five-level precedence ladder and version DESC tie-break |
| 8 | J1: read every migration touching pricing_rules, which applied on Production and which not | MET | 9 migrations touch pricing_rules. 20260627000001_fee_structure_locked_au is APPLIED on Production, proven by the live values and by effective_from 2026-07-26 |
| 9 | J1: read all four legal pages and the admin pricing surface, every fee figure exposed | MET | Four legal pages carry ZERO fee figures (grep clean). Admin surface at src/app/admin/(authed)/pricing. public-fee.ts carries the documented fallback constants, in sync |
| 10 | J1: ONE table of every disagreement across Production, TEST, code, migrations, legal | MET | The disagreement table is in the report. One genuine disagreement found: the founding fee-free promise versus the charge |
| 11 | J2: exact all-in on a $20 ticket at PRODUCTION values, every component | MET | 2000 + 169 + 50 = 2219. Fees 219c. Organiser keeps 2000c |
| 12 | J2: exact all-in on a $20 ticket at TEST values, every component | MET | Identical to Production, because the values are identical |
| 13 | J2: state which set produces $2.19 all in with the organiser keeping $20 | MET | BOTH sets produce it. 3.5% + 99c platform and 2.5% + 0c processing gives exactly 219c of fees on a 2000c ticket with the organiser keeping 2000c |
| 14 | J2: state which set produces $20.50 all in during the founding period | MET | Platform fee waived to 0, processing retained at 2.5%: 2000 + 0 + 50 = 2050c. Asserted in pricing-anchors.test.ts |
| 15 | J2: if NEITHER does, say so and show what values would | MET, and the honest answer is neither is WRONG | Both databases produce anchor 1 today. Anchor 2 is produced by the arithmetic but has NO automatic mechanism: founding_bonus_months is displayed and never read by the charge. Reported as the headline finding |
| 16 | J3: write docs/PRICING.md as the single authoritative record | MET | docs/PRICING.md, 8 sections |
| 17 | J3: every rule with its locked value | MET | Section 1, in a machine-readable PRICING-LOCK block the build guard parses |
| 18 | J3: composition of a total, in order, each component named | MET | Section 2, five numbered steps in order with each component named |
| 19 | J3: the worked $20 example at public and founding rates | MET | Section 3: public pass-on, public absorb, and founding, each as a component table |
| 20 | J3: the founding offer terms | MET | Section 4, including that fee-free means the platform fee only |
| 21 | J3: where the value lives in the database | MET | Section 5: public.pricing_rules, typed value columns, three scopes, versioning, audit |
| 22 | J3: how it is read in code | MET | Section 6: getPricingRule, the charge, payout and display call sites, cache and fallback |
| 23 | J3: explicit statement that no fee figure may be a literal anywhere else | MET | Section 8, with the single documented exemption named |
| 24 | J4: write the migration setting pricing_rules to the locked values | MET | supabase/migrations/20260727000001_pricing_locked_values.sql |
| 25 | J4: do NOT apply it | MET | Not applied. No write of any kind was issued to Production; every database call in this task was a GET |
| 26 | J4: ONE founder step in founder-step-delivery format | MET | Report section D, one step, founder-step-delivery format |
| 27 | J4: state whether destructive | MET | NOT destructive: no row deleted, superseded rows stamped with effective_until, history preserved. Stated in the migration header and in section D |
| 28 | J4: state whether any existing order is affected | MET | NO existing order affected: orders store their own fee amounts at capture time and nothing recomputes a past order from pricing_rules |
| 29 | J5: buildCritical rule in the CRITICAL_ENV_RULES pattern reading pricing_rules at build time | MET | PRICING_LOCK_RULE in src/lib/health/pricing-lock.mjs, buildCritical true, same name/describe/resolve/validate shape as SUPABASE_ENV_ISOLATION |
| 30 | J5: FAILS THE BUILD on any mismatch with docs/PRICING.md | MET | Proven: doc set to 4.0 against a live 3.5 gave exit 1 and BUILD BLOCKED; restored gave exit 0 |
| 31 | J5: follow SUPABASE_ENV_ISOLATION as the model | MET | Same rule shape and the same blocking-on-Vercel, warning-locally, documented-bypass contract as check-public-env.mjs |
| 32 | J5: never log a value it should not | MET | Logs the project ref and the fee values (published figures) only. Never the service-role key, never the full URL, never any other secret |
| 33 | J5: deploy and report whether the rule PASSES on Production | MET | Ran against Production: PASSES. Deploy is a founder step (section D) because this branch is not the production deployment |
| 34 | J6: unit test, $20 at public rates equals $2.19 fees, organiser keeps $20 | MET | pricing-anchors.test.ts: platform 169c, processing 50c, total 219c, buyer 2219c, organiser keeps 2000c |
| 35 | J6: unit test, $20.50 all in during the founding period | MET | Same file: platform 0, processing 50c, all-in 2050c |
| 36 | J6: cover pass-on and absorb modes | MET | Pass-on and absorb both covered, including that absorb never charges the buyer above face value at any rates |
| 37 | J6: cover GST | MET | GST covered: default 0, no 10% on top, and a supplied tax line carried through untouched |
| 38 | J6: if a number cannot be produced, report it rather than fitting the test | MET | Nothing needed adjusting: the code produces both anchors exactly. The gap that IS reported is the missing founding mechanism, not a wrong number |
| 39 | J7: extend the CI copy grep to FAIL on a fee literal in user-facing copy or a component | MET | scripts/copy-tell-gate.mjs extended with fee-literal-percentage, fee-literal-money and fee-literal-locked-figure, context-gated on a fee word |
| 40 | J7: exempt docs/PRICING.md alone | MET | The gate walks src/ only, so docs/PRICING.md keeps its figures legally. Confirmed: 3 locked figures in the doc, gate clean |
| 41 | J7: prove it can fail: add a literal, catch it, remove it, pass | MET | clean exit 0, armed with a literal in src/app/pricing/page.tsx exit 1 caught, removed exit 0. Also caught a REAL pre-existing violation in src/app/press/page.tsx |
| 42 | J8: audit the admin pricing surface: who can change pricing_rules through the UI | MET | requireAdminSession plus assertCan(admin.pricing.manage). RBAC gated, 2FA enforced upstream by the admin auth |
| 43 | J8: is every change logged with who and when | MET | Yes. recordAuditEvent writes admin.pricing.updated with old value, new value and session.userId on every write |
| 44 | J8: can a change bypass the new guard | MET | YES it can, and that is the finding. An admin write lands immediately and the guard only fires on the NEXT build. Reported with the proposed fix |
| 45 | J8: if an admin can silently move a rate, say so and propose the fix | MET | Reported in section A JOB 8 with the fix: the guard already converts it into a build failure, plus a proposed in-UI warning and a proposed post-write verification |
| 46 | Report A: each job with observed evidence | MET | Report section A |
| 47 | Report B: one line, IS PRODUCTION PRICING CORRECT RIGHT NOW, YES or NO | MET | Report section B: YES |
| 48 | Report C: the exact $20 arithmetic, Production and locked, side by side | MET | Report section C |
| 49 | Report D: every founder step, exhaustive | MET | Report section D |
| 50 | Report E: all four locks in place, each proven able to fail | MET | Report section E, each lock with its failure demonstration |
| 51 | NEVER write to Production | MET | Every database call was a GET. No INSERT, UPDATE or DELETE was issued to any database. The migration is written and unapplied |
| 52 | Do not modify the funds-holding engine's money movement | MET | No file under src/lib/payments/ was modified. fee-math.ts and pricing-rules.ts were read only |
| 53 | Do not touch seating, guidance or /guides | MET | No file under src/lib/seating, src/components/seating, src/app/guides, src/lib/guides or src/components/guidance was touched |
| 54 | Australian English, no em-dashes, no en-dashes | MET | Zero em-dashes and zero en-dashes, checked by the copy gate which scans all of src and by grep over the new docs |
| 55 | No fabrication: NOT VERIFIED where unprovable | MET | The founding-mechanism gap is reported as a gap; the guard deploy is marked a founder step rather than claimed |
| 56 | Gate: typecheck | MET | npx tsc --noEmit exit 0 |
| 57 | Gate: lint | MET | npm run lint exit 0, 0 errors, 47 warnings |
| 58 | Gate: tests | MET | npx vitest run: 114 files, 1046 tests passed |
| 59 | Gate: production build | MET | npm run build exit 0 with the new prebuild guard reporting ok |
| 60 | Commit each lock separately | MET | Five commits, one per lock plus the bible and the ledger |
| 61 | Push and report the remote sha | MET | Pushed; remote sha in the report |

Adjudication follows when the work completes.

### Gate

61 rows. MET 61. PARTIAL 0. NOT MET 0. Row 4 is MET with its PREMISE REFUTED.

Adversarial pass:

- **Silent drops.** None. Every job and every report section is present.
- **Interpretation drift.** The brief named a suspected root cause and asked me
  to verify it. I refuted it with a direct read of both databases rather than
  finding a way to confirm it, and then had to find the real defect, which is
  versioning hygiene plus an unwired founding waiver. The temptation to accept
  the offered diagnosis was the main risk in this task.
- **Match versus surpass.** Not a competitor task.
- **Unverifiable claim hunt.** "Production is correct" is falsified by a value
  differing from the lock: all four match, read live. "The guard can fail" is
  falsified by an armed run that passes: exit 1 observed. "The copy gate can
  fail" likewise: exit 1 observed on an armed literal. "No write to Production"
  is falsified by any non-GET: every call in this task was a GET. "Both anchors
  are produced by the code" is falsified by a failing assertion: 23 pass.
- **The generic test.** The lock block parsed out of the founder's own prose,
  and the founding-waiver finding, are specific to this platform.
- **AI-tell sweep.** Zero em-dashes, zero en-dashes, zero banned words, zero
  tell-lexicon phrases, verified by the extended gate over all of src.
- **Regression sweep.** One change beyond the brief: an unsourced competitor fee
  figure removed from src/app/press/page.tsx. It was a real violation the new
  gate caught, and an unsourced comparative claim is a consumer-law exposure. It
  is flagged in the report rather than slipped in, and is a one-phrase edit.
- **Founder-cost test.** One founder step only, and it is genuinely founder-only
  (applying a migration to Production, which no session may do).
- **Evidence-visibility test.** docs/PRICING.md, the migration, the guard, the
  tests and this ledger are all readable at named paths.

Result: **UNFULFILLED**, on the founding fee waiver being promised in the product
and not honoured by the charge. Reported at the top.
