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

### Job 1: state of the branch

| # | Verdict | Evidence |
|---|---|---|
| 1.1 | MET | `git fetch --all --prune`. |
| 1.2 | MET | `origin/feat/walkthrough-defects` = `a44e9e795e65f8492d2b8b8fa12ced4fdba2dd8d` (was `97fbb6c` before the drift fix). |
| 1.3 | MET | `origin/main` = `414d801ab1bca4ba3ec4a6186af0bd51cc75a774`. |
| 1.4 | MET | 127 ahead, 0 behind. `git rev-list --left-right --count` returned `0 126` before the drift commit. |
| 1.5 | MET | 16 open PRs listed. |
| 1.6 | MET | NO PR targeted main from this branch. PR #108 was opened by this mission. |
| 1.7 | MET | ZERO conflicts. `git merge-tree --write-tree` exit 0, no CONFLICT markers, and `main` is an ancestor, so the merge is a fast-forward. |

### Job 2: the full gate

| # | Verdict | Evidence |
|---|---|---|
| 2.1 | MET | `env -i` with only PATH, HOME, USERPROFILE, APPDATA, LOCALAPPDATA, SYSTEMROOT, TEMP, TMP, COMSPEC. |
| 2.2 | MET | Proven, not asserted: `git merge-tree` result tree `de5a291a217d71a20595f807c892988b51bbfa3e` is byte-identical to the branch tip tree, and `git merge-base --is-ancestor origin/main origin/feat/walkthrough-defects` returned YES. |
| 2.3 | MET | typecheck exit 0. |
| 2.4 | MET | lint 0 errors (50 pre-existing warnings). |
| 2.5 | MET | 1098 tests, 115 files, all pass. |
| 2.6 | MET | production build exit 0. |
| 2.7 | MET | `copy-tell-gate: clean`. |
| 2.8 | MET | 24 of 24 break-restore cases behaved as declared. |
| 2.9 | MET | All six green. |
| 2.10 | MET | The inherited variable names were printed inside the shell, and a grep for NEXT_PUBLIC / STRIPE / SUPABASE / RESEND / CRON / ANTHROPIC / VERCEL / UPSTASH / GOOGLE / ALLOW_ returned 0. |

### Job 3: the merge

| # | Verdict | Evidence |
|---|---|---|
| 3.1, 3.2, 3.3, 3.4 | MET | PR #108, exact title, body lists the carried work and names all four locks. |
| 3.5 | MET | Waited. Three Lighthouse runs plus two CI runs. |
| 3.6 | **NOT MET** | CI is NOT green. `Lighthouse mobile gate`, a required status check under branch protection, fails. The merge did not happen. |
| 3.7 | PARTIAL | One cause fixed properly: the types-drift guard. The Lighthouse cause is a genuine performance shortfall that I will not fix by lowering the threshold, and cannot responsibly fix by guessing at JavaScript execution cost inside a ship mission. |
| 3.8 | **NOT MET** | There is no merge commit. |

### Job 4: promote to production

| # | Verdict | Evidence |
|---|---|---|
| 4.1 to 4.5 | **BLOCKED** | Nothing merged, so there is nothing new to promote. Production still serves `dpl_AhvSgGgGftab33CGYT7yGxvbkiKL` built from `main`. Promoting the branch directly would bypass the gate the merge is blocked on. |
| 4.6 | **BLOCKED** | The env manifest rule is not in `main`, so no production build runs it yet. It IS proven to run and pass on a real Vercel build of this branch. |
| 4.7 | MET | Read-only query against project `gndnldyfudbytbboxesk`: all five locked rules resolve exactly (3.5, 99, 2.5, 0, 1) with exactly one open row each. The pricing lock would pass on a production build. |
| 4.8 | MET | Production `/api/cron/webhook-sentinel`: both self-probes accepted, `1 account endpoint + 1 connected-account endpoint, 2 signing secret(s) configured`. |
| 4.9 | MET | GitHub Actions job `CRON_SECRET agrees across both stores` PASS, HTTP 200, fp `ef22fd7f`. |
| 4.10 | **NOT MET** | Confirmed the OPPOSITE: `main` still carries `PROD_URL: https://www.eventlinqs.com`, the host that 301s cross-host and drops the bearer, and still warns-and-exits-0 when CRON_SECRET is absent. The fix exists only on the branch. |
| 4.11 | MET | 200, no error boundary, 0 console errors, at 1440 and 390. |
| 4.12 | PARTIAL | Event pages load 200 at both viewports. NO production event has a seat map: `seat_maps` and `seats` both hold 0 rows, and the page renders 0 `<canvas>` elements. |
| 4.13 | MET | `/legal/privacy`, `/legal/terms`, `/legal/refunds`, `/legal/cookies` all 200 at both viewports. The repo carries six legal pages, not four. |
| 4.14 | **NOT MET** | `/guides` is 404 on production. It is the ONLY dead link the crawler found. The merge is what fixes it. |
| 4.15 | MET | `/organisers/signup` 307 to `/signup?role=organiser`, which renders 200. |
| 4.16 | **NOT MET** | On a live production event page the only price shown is "From AUD $35". No total, no fees-included phrase, no fee line. "Get tickets" links to `#tickets` and no ticket-selection UI renders there, so there is no surface on which an all-in total could appear. |
| 4.17 | MET | `scripts/link-integrity-crawl.mjs` against production: 236 unique internal links, 4 legitimate redirects, **1 dead link, `/guides`**. |

### Job 5: seated and general admission on production

| # | Verdict | Evidence |
|---|---|---|
| 5.1 | NOT VERIFIED | I did not locate a `seated_events` flag row to read. The seating SCHEMA is present on production (`seat_maps`, `seat_map_sections`, `seats`, `seat_holds`, `seat_section_views` all exist). |
| 5.2 to 5.6 | **BLOCKED** | Production holds ZERO seat maps and ZERO seats, so no seated surface exists to render. The three LOD states, the tooltip price, the key plan and ticket-type colouring cannot be observed on production. Proving them requires a seated event, which the brief forbids me from creating. |
| 5.7, 5.8, 5.9 | MET | 21 captures at 1440 and 390 from `https://www.eventlinqs.com.au` into `docs/verification/production-launch/`. |
| 5.10 | MET | No production event created. No write of any kind to the production database. |
| 5.11 | MET | Stated above and in the report. |
| 5.12 | PARTIAL | All 14 published future events have open, in-window, in-stock tiers. But every one of the 16 organisations has `stripe_charges_enabled = false`, and no ticket picker renders, so a general-admission purchase cannot be completed either. |

### Job 6: the three open items

| # | Verdict | Evidence |
|---|---|---|
| 6.1 | MET, with a corrected premise | The brief said the three branches no longer exist. They DO still exist on the remote. Their env pins were deleted anyway (15 records across the three), which is correct because the branches are superseded and the pins only shadowed the scope-wide TEST values. |
| 6.2 | PARTIAL | `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY_PREVIEW` on preview are now SENSITIVE and verified withheld on pull. `STRIPE_SECRET_KEY` on preview could NOT be flipped: four further branch pins remain (staging/merged-main-final, feat/launch-kit, release/launch-line, feat/event-media-standard) and the CLI cannot target a scope-wide record while siblings exist. Those four were not authorised for deletion. The development-scope records are unchanged by design. |
| 6.3 | MET | One founder step given. |
| 6.4 | MET | One founder step given. |
| 6.5 | MET | The code path exists and is gated on the token; `checkManifestAgainstStore()` reports NOT CHECKED without it and reads the live store within one sentinel run with it. |
| 6.6 | MET, as a negative | `main` does NOT carry the fix. Diff evidence above. |

### Job 7

| # | Verdict | Evidence |
|---|---|---|
| 7.1 to 7.9 | MET | Given in the report in founder-step-delivery format. |

### Discipline

| # | Verdict | Evidence |
|---|---|---|
| D1 | MET | No secret value printed anywhere. Fingerprints, lengths and scopes only. |
| D2 | MET | ZERO writes to the production database. Every production query was a read, and each is named in the report. |
| D3 | MET | No change to `src/lib/payments/*`. |
| D4 | MET | No guard weakened. The Lighthouse threshold was NOT relaxed even though the config's own note anticipates relaxing `/events`, and `--admin` was not used. |
| D5, D6 | MET | Copy gate clean; zero em-dashes and en-dashes. |
| D7 | MET | No competitor named in public-facing copy. |
| D8 | MET | The three wrong readings I made are all corrected in the report rather than buried. |
| D9 | MET | `[disk] 11.8 GB free - ok to build.` |
| D10 | MET | Banned word absent. |

## Adversarial pass

**Silent drops.** None. Every ledger row appears in the report, including the six
that are NOT MET and the five that are BLOCKED.

**Interpretation drift.** The strongest temptation in this mission was to read
"SHIP" as permission to relax the Lighthouse assertion for `/events` and the
event detail route. The config file itself invites it ("relax it only when it
actually fails", and it has now actually failed), and `/` and `/culture/*`
already carry that exemption. I did not do it, because both CLAUDE.md ("never
lower a threshold or mark a check optional to go green") and this brief ("do not
weaken any guard to make anything pass") forbid it, and because the decision to
accept a documented performance exemption on the two highest-traffic commercial
surfaces is a founder decision, not mine. `--admin` was likewise available and
not used.

**The match-versus-surpass test.** Not applicable: no competitor comparison was
asked for. Measured against the prior state, the branch is AHEAD of production on
the one performance number I could compare like for like, and that is worth
stating precisely because it cuts against the gate: warmed production `/events`
scored 0.62, 0.65, 0.50 in three local mobile runs, while the PR preview scored
0.71 to 0.79 in CI. Those two numbers come from different machines and are NOT
directly comparable as absolutes; what they support is the narrower claim that
the release did not introduce this shortfall.

**The unverifiable claim hunt.** Three claims were tested and DELETED or
corrected rather than softened. (1) "Production has no seating schema" was wrong:
I probed invented table names (`seating_charts`, `seat_sections`) and read 404 as
absence. The real tables exist. (2) "Zero of 14 events have ticket tiers" was
wrong: I filtered on `quantity_available`, `quantity_sold` and `sale_starts_at`,
none of which exist on `ticket_tiers`, so every row was silently excluded. The
real columns are `total_capacity`, `sold_count`, `sale_start`, `sale_end`, and
all 14 events DO have open tiers. (3) "The production build was blocked by the
new manifest rule" was carried in from the previous session and is corrected in
the report. Each of these is the same failure class this whole week of work is
about: a query that succeeds while measuring the wrong thing.

**The generic test.** Not generic. The evidence is specific to this platform:
named production event slugs, the exact `dpl_` ids, the 236-link crawl result,
the `#tickets` anchor that leads nowhere, the 16 organisations with Stripe
charges disabled.

**The regression sweep.** DESIGN-LOCK: nothing visual was touched. The only file
changed in this mission is `src/types/database.ts`, regenerated above the legacy
marker to match the live schema, with `tsc` and the full suite green afterwards.
Three temporary Playwright scripts were created in the repo root and deleted.

**The founder-cost test.** Two things that could have become founder steps were
done in code instead: the types drift was fixed rather than reported, and the two
preview secrets were flipped rather than handed over. Four genuine founder steps
remain, and each names precisely why it cannot be done from here.

**The evidence-visibility test.** 21 production captures at 1440 and 390 in
`docs/verification/production-launch/`, PR #108 with its checks, and the CI run
records are all inspectable without taking my word for anything.

## Gate

NOT MET: 6. BLOCKED: 5. PARTIAL: 4.
The mission's headline outcome, the merge and the production promotion, did NOT
happen. The report opens with UNFULFILLED.
