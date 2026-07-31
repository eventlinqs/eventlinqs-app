# Roast ledger: SHIP. feat/walkthrough-defects merges to main and reaches production

Date: 2026-07-31. Written BEFORE adjudication, per
`.claude/skills/brief-roast/brief-roast-SKILL.md`.

Governing laws (stated per Law 0): Law 0 (read first), Definition of Done (SHIP
100%, A to Z), Verification and gates (CI gates are the merge authority, no
skipping gates, never lower a threshold, disk guard, never merge without
approval), Launch sequence and parked workstreams, Fee system (one source, ACCC
all-in display), Law 5 (zero dead links), Copy and banned content (Australian
English, no em-dashes or en-dashes, no competitor named in public copy).

Approval note: CLAUDE.md forbids merging to main or production without founder
sign-off. This brief IS that sign-off, given by Lawal Adams in the session. It is
recorded here so the merge is never mistaken for a unilateral act.

## The requirement ledger

### Job 1: state of the branch

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1.1 | git fetch | | |
| 1.2 | Report the tip of origin/feat/walkthrough-defects | | |
| 1.3 | Report the tip of origin/main | | |
| 1.4 | Report how many commits ahead the branch is | | |
| 1.5 | List every open pull request via `gh pr list` | | |
| 1.6 | Say whether any already targets main from this branch | | |
| 1.7 | Report any merge conflicts against main | | |

### Job 2: the full gate before the merge

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 2.1 | Run in a VERIFIABLY CLEAN shell | | |
| 2.2 | Run on the MERGE RESULT, not the branch alone | | |
| 2.3 | typecheck | | |
| 2.4 | lint | | |
| 2.5 | the full test suite | | |
| 2.6 | a production build | | |
| 2.7 | the copy gate | | |
| 2.8 | `node scripts/verify/env-locks-verify.mjs` | | |
| 2.9 | All six green or the merge does not happen | | |
| 2.10 | State that the shell was clean AND SHOW IT | | |

### Job 3: the merge

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 3.1 | Open a PR from feat/walkthrough-defects to main | | |
| 3.2 | Title exactly "Launch release: seating, guidance, pricing locks, founding waiver, env locks" | | |
| 3.3 | Body lists what it carries | | |
| 3.4 | Body names the four locks | | |
| 3.5 | Wait for CI | | |
| 3.6 | If CI green, squash merge | | |
| 3.7 | If CI red, fix the CAUSE and re-run (never weaken a guard) | | |
| 3.8 | Report the merge commit sha | | |

### Job 4: promote to production

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 4.1 | Deploy main to production | | |
| 4.2 | Alias eventlinqs.com.au to it | | |
| 4.3 | Alias www.eventlinqs.com.au to it | | |
| 4.4 | Report the deployment id | | |
| 4.5 | Report the rollback target | | |
| 4.6 | CONFIRM: the env manifest rule runs and PASSES on a production build | | |
| 4.7 | CONFIRM: the pricing lock passes against live pricing_rules | | |
| 4.8 | CONFIRM: both live webhook destinations verify | | |
| 4.9 | CONFIRM: CRON_SECRET authenticates from GitHub Actions against production | | |
| 4.10 | CONFIRM: post-deploy-smoke runs and passes, with the canonical-host fix live | | |
| 4.11 | CONFIRM: the homepage loads | | |
| 4.12 | CONFIRM: an event page with a live seat map loads | | |
| 4.13 | CONFIRM: all four legal pages load | | |
| 4.14 | CONFIRM: /guides loads | | |
| 4.15 | CONFIRM: organiser signup loads | | |
| 4.16 | CONFIRM: checkout shows the all-in price before commitment | | |
| 4.17 | CONFIRM: zero dead links | | |

### Job 5: seated and general admission both work on production

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 5.1 | Confirm seated_events is ON | | |
| 5.2 | Confirm the canvas renderer serves on production | | |
| 5.3 | All three LOD states reachable | | |
| 5.4 | The tooltip carries a price | | |
| 5.5 | The key plan appears when zoomed | | |
| 5.6 | Ticket-type colouring is live | | |
| 5.7 | Capture proof at 1440 from the PRODUCTION domain | | |
| 5.8 | Capture proof at 390 from the PRODUCTION domain | | |
| 5.9 | Captures land in docs/verification/production-launch/ | | |
| 5.10 | Do NOT create a production seated event | | |
| 5.11 | State exactly what cannot be proven without one | | |
| 5.12 | Prove general admission works on production | | |

### Job 6: close the three open items

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 6.1 | Delete the stale branch pins (feat/design-elevation, feat/design-elevation-r2, feat/claude-api) | | |
| 6.2 | Then remove or re-add the scope-wide records as Sensitive | | |
| 6.3 | If still impossible from the CLI, give ONE founder step | | |
| 6.4 | Give ONE founder step to create VERCEL_API_TOKEN + VERCEL_PROJECT_ID | | |
| 6.5 | Confirm the sentinel closes that gap within one run once set | | |
| 6.6 | Confirm main's post-deploy-smoke.yml now carries the canonical-host fix | | |

### Job 7: the founder smoke test

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 7.1 | ONE founder step, in founder-step-delivery format | | |
| 7.2 | Complete Stripe Connect onboarding as the first production organiser | | |
| 7.3 | Create a private low-price event | | |
| 7.4 | Buy a ticket with a real card | | |
| 7.5 | Confirm the ticket and email | | |
| 7.6 | Refund | | |
| 7.7 | Exact links | | |
| 7.8 | Exact fields | | |
| 7.9 | Exact success criteria at each step | | |

### Report

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| R.A | Each job with observed evidence | | |
| R.B | One line: IS PRODUCTION SERVING THE MERGED RELEASE, YES or NO | | |
| R.C | One line: ARE ALL FOUR ENV LOCKS NOW ACTIVE ON PRODUCTION, YES or NO | | |
| R.D | One line: CAN A STRANGER BUY A REAL TICKET ON PRODUCTION RIGHT NOW, YES or NO | | |
| R.E | The production deployment id and the rollback target | | |
| R.F | Founder steps, exhaustive | | |
| R.G | Report opens with the gate block or UNFULFILLED | | |
| R.H | Report the remote sha and the merge commit | | |

### Discipline

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| D1 | Never print a secret value | | |
| D2 | Never write to the Production database without stating exactly what and why | | |
| D3 | Do not modify the funds-holding payment engine's money movement | | |
| D4 | DO NOT WEAKEN ANY GUARD TO MAKE ANYTHING PASS | | |
| D5 | Australian English | | |
| D6 | No em-dashes, no en-dashes | | |
| D7 | No competitor named in public-facing copy | | |
| D8 | No fabrication; NOT VERIFIED where it cannot be proven | | |
| D9 | Disk guard before any build or deploy step | | |
| D10 | Community-first language, banned word absent | | |

---

## Adjudication

Filled in after the work.

## Adversarial pass

Filled in after adjudication.
