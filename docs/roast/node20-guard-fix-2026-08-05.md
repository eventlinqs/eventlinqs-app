# Roast ledger: Node 20 guard fix, 2026-08-05

Requirements decomposed verbatim from the brief, written BEFORE adjudication.

## Conduct standards (standing, apply to every row)

| # | Requirement |
|---|---|
| C1 | Australian English |
| C2 | No em dashes or en dashes anywhere |
| C3 | Use "community", never the banned alternative |
| C4 | Change only what this fix requires |
| C5 | No claim without pasted proof |
| C6 | Permanent root cause fix, no workaround |
| C7 | Do not modify the funds holding payment engine |

## Task rows

| # | Requirement |
|---|---|
| T1a | Fix all three guards so they run on Node 20 |
| T1b | Do NOT raise the CI Node version to make the error go away |
| T1c | Use an approach that works on both Node 20 and newer |
| T2a | Check every other script added in this branch for the same class of problem |
| T2b | Report what was checked and what was found |
| T3a | Add a check that fails when a script uses an API unavailable in CI's Node |
| T3b | If a static check is not reliably achievable, say so plainly |
| T3c | Alternative: make the guard runner run under the CI Node version locally |
| T3d | Alternative: document the version contract somewhere a build reads |
| T3e | State which was chosen and why |
| T4a | Install or invoke Node 20 |
| T4b | Run the full prebuild guard suite under Node 20 |
| T4c | Paste the output |
| T5a | Full battery: test suite |
| T5b | Full battery: lint against the 42 warning baseline |
| T5c | Full battery: clean production build |
| T5d | Full battery: all four guards passing |
| T6a | Run the brief-roast skill |
| T6b | Hunt for anything else in this branch verified on the wrong environment |
| T6c | Hunt for any other assumption about the runtime not checked |
| T6d | Hunt for any guard added that cannot actually fail |
| T6e | Fix what it finds, second round, report both rounds |
| T7 | Commit and push to feat/auth-hardening |
| R-A | Report: what changed in each of the three files and why that approach |
| R-B | Report: what else was checked in step 2 |
| R-C | Report: what was chosen in step 3 and why |
| R-D | Report: the Node 20 proof from step 4 |
| R-E | Report: both roast rounds |
| R-F | Report: anything that could not be verified |

## Adjudication

| # | Verdict | Evidence |
|---|---|---|
| C1 | MET | Australian English throughout; `copy-tell-gate` exit 0 |
| C2 | MET | Dash sweep across all 14 changed files: 0 occurrences; `copy-tell-gate` exit 0 |
| C3 | MET | Banned-word sweep across changed files: 0 occurrences |
| C4 | MET | `git status`: 8 modified, 7 added. No `src/` file touched, no design file, no dependency (`package-lock.json` unchanged) |
| C5 | MET | Every claim in the report carries pasted output |
| C6 | MET | Shared `sourceFiles()` on `readdirSync`, plus an allowlist contract. No pinned version raised, no API shimmed |
| C7 | MET | `git status` shows no payment, stripe, payout or funds file modified |
| T1a | MET | Guard suite exit 0 under Node 20.20.2 |
| T1b | MET | `ci.yml` still resolves Node 20, now via `.nvmrc`. CHECK 5 blocks any pin below the contract |
| T1c | MET | `readdirSync(dir, { withFileTypes: true })` exists since Node 10; suite passes on 20.20.2 and 24.14.0 |
| T2a | MET | All 16 added scripts parsed under Node 20 with every builtin import resolved; contract guard scans 239 scripts |
| T2b | MET | Section B of the report |
| T3a | MET | `scripts/guards/node-version-contract.mjs`, 5 checks, wired into `prebuild` |
| T3b | MET | Stated plainly: complete for builtin imports/modules/global statics, NOT complete for prototype methods or dynamic access |
| T3c | MET | `npm run guards:contract-node` |
| T3d | MET | `.nvmrc`, read by `ci.yml` via `node-version-file` and by the guard |
| T3e | MET | Section C of the report: all three layers, and why no single one suffices |
| T4a | MET | `npx --yes node@20` gave v20.20.2, the exact version in the CI error |
| T4b | MET | Whole `prebuild` chain under Node 20, exit 0 |
| T4c | MET | Pasted in the report and in `docs/hardening/auth/GUARD-PROOFS.md` |
| T5a | MET | 125 files, 1370 tests passed |
| T5b | MET | 42 problems, 0 errors, 42 warnings. Baseline exactly held |
| T5c | MET | `next build` under Node 20.20.2, exit 0 |
| T5d | MET | 5 of 5 guards pass (4 original plus the new contract guard) |
| T6a | MET | This ledger |
| T6b | MET | Round 2 found the build had been run on Node 24 only, and a silent PATH failure. Redone under Node 20 |
| T6c | MET | Checked: Vercel Node source, Linux case sensitivity, `.vercelignore` reach, `npm ci` impact, the other CI steps |
| T6d | MET | Round 1 found my own guard could not fail. Round 2 found 4 undrilled checks. 19/19 drills now fire |
| T6e | MET | Section E of the report |
| T7 | MET | Committed and pushed to `feat/auth-hardening` |
| R-A to R-F | MET | Sections A to F of the report |

## Adversarial findings

**Round 1**

1. The new contract guard could not fail. It scanned the string-blanked view for
   a module specifier, which is itself a string, so it reported PASS on the exact
   defect it was written for. Caught by drilling it. Fixed: each check scans the
   view it needs, and byte-offset comparison separates real code from quoted text.
2. A hand-maintained denylist can only ever catch what someone remembered to
   list. Replaced with an allowlist generated by Node 20 itself.
3. The guard then false-positived on the drills file, whose payloads legitimately
   hold import statements as strings. Fixed with the `atRealCode` offset test.
4. `docs/hardening/auth/GUARD-PROOFS.md` was cited by two files and had never
   been created. Written, with real pasted output.

**Round 2**

5. The production build had only ever been run on Node 24. Attempting it on
   Node 20 via a `PATH` prefix silently failed (`node --version` still reported
   v24, because a non-executable `node` stub shadows `node.exe`). Caught by
   reading the echoed version instead of trusting the command. Redone by invoking
   the Next binary directly with the Node 20 executable: exit 0.
6. Four checks had no drill and were therefore unproven: two banned SMTP calls,
   the sender FROM-constant pattern, and the provider registry disagreement.
   Drills added, 19/19 fire.
7. Three CI steps in the failing job had never been run locally
   (`copy-tell-gate`, `critical-path-guard`, `lighthouse-exemption-expiry`). All
   three run and exit 0 under Node 20.
8. Vercel does not read `.nvmrc`; it takes Node from `engines.node` or project
   settings. The contract therefore governs CI and local machines, NOT the
   production runtime. Named as an open gap rather than closed, because adding
   `engines.node` would change the production runtime and is beyond this fix.

## The generic test

Not applicable: no user-facing surface was touched. Nothing in `src/` changed.

## Founder-cost test

One item is routed to the founder by necessity, not by laziness: whether to pin
Vercel's Node with `engines.node`. That changes the production runtime, so it is
a founder decision, and it is stated in the report rather than actioned.
