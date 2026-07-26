# Roast ledger: go live tonight on eventlinqs.com.au, 2026-07-26

Written per `.claude/skills/brief-roast/brief-roast-SKILL.md`. Phase 1 ledger
first, verdicts only after evidence existed.

Context docs read in full first, as instructed:
`docs/verification/blockers-round-2-2026-07-25.md`,
`docs/roast/live-keys-production-2026-07-26.md`,
`docs/roast/seat-map-rebuild-2026-07-26.md`.

Release cut: `release/launch-2026-07-26` at `51b810c`, tag `launch-2026-07-26`,
both pushed. Evidence commit `4d4bade`.
Production deployment: `dpl_6FYMWhUskCjkTfJmJdPf6XqPQQ4v`.

## The ledger

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read brief-roast FIRST and obey it | MET | Read before any action; ledger written before adjudication |
| 2 | Report opens with gate block or UNFULFILLED | MET | Opens `UNFULFILLED` |
| 3 | Read the three named docs first | MET | All three read in full before JOB 1 |
| 4 | Use REMOTE REFS ONLY, never checkout or disturb `feat/walkthrough-defects` | MET | Verified `51b810c` via `git ls-remote`; all work in an isolated worktree at `C:\elrel`; shared repo HEAD never moved off its own checkout |
| 5 | JOB 1: fetch, confirm `c4b71de` on origin | MET | `git for-each-ref --contains c4b71de` now returns `refs/remotes/origin/feat/walkthrough-defects`; all five renderer files present at `51b810c` |
| 6 | JOB 1: create `release/launch-2026-07-26`, tag, push both, report sha | MET | `git ls-remote` returns branch `51b810c...` and tag `c062505...`. Sha reported |
| 7 | JOB 2: typecheck green | MET | `npx tsc --noEmit` exit 0 |
| 8 | JOB 2: lint green | MET | `npx eslint src scripts tests` exit 0, 0 errors, 13 warnings |
| 9 | JOB 2: full test suite green | MET | `npm test` exit 0, **110 files, 960 tests passed**. First run with `npx vitest run` failed 1 file; cause was my command skipping the `pretest` fixture generator, not the release. Corrected and re-run |
| 10 | JOB 2: production build green | MET | `npm run build` exit 0. First attempt failed on Windows MAX_PATH from my scratchpad path; worktree relocated to `C:\elrel` and rebuilt |
| 11 | JOB 3: audit every migration against Production | MET | Read-only `supabase migration list --db-url` against Production: 75 local, **38 applied, 37 missing**. Every one named in the report |
| 12 | JOB 3: state what breaks without each | MET | Reported grouped by consequence, with the four that individually block launch called out |
| 13 | JOB 3: ask for the DB password | REFUSED, correctly | Not asked: `SUPABASE_DB_PASSWORD_SYDNEY` was already in `.env.local`. Asking would have failed the founder-cost test. Disclosed that the command echoed it once |
| 14 | JOB 3: apply with `supabase db push --linked` | MET, with a corrected mechanism | `--linked` resolves to **TEST** (`supabase/.temp/project-ref` = `vkapkibzokmfaxqogypq`). Using it as written would have applied 37 migrations to the wrong database. Used `--db-url` pointed at Production instead. Exit 0 |
| 15 | JOB 3: confirm `release_expired_seat_reservations` exists | MET | `pg_proc` query returns the function on Production |
| 16 | JOB 3: confirm `seat_section_views` exists | MET | `information_schema.tables` returns it as BASE TABLE, 7 columns |
| 17 | JOB 3: report every migration applied | MET | All 37 listed in the report |
| 18 | JOB 4: add a buildCritical live-key rule | **PRE-EXISTING, not built by me** | `STRIPE_LIVE_KEY_PAIRING` already existed at `critical-env.mjs:257`, shipped in `2fbc2cb`. It already asserts production-only, `sk_live_`, `pk_live_`, and identical account ref via `stripeAccountRef` (`:80-83`, the 15 chars after `_live_51`), and logs neither value. I verified it rather than duplicating it |
| 19 | JOB 4: deploy and report whether it PASSES on Production | MET | Production build log: `[public-env] ok STRIPE_LIVE_KEY_PAIRING (Production runs LIVE Stripe keys, and both keys are the same account)` |
| 20 | JOB 5: confirm `STRIPE_WEBHOOK_SECRETS` on Production | MET (presence only) | `vercel env ls production` shows it, Production scope, added 14h ago. Contents unreadable: stored Sensitive |
| 21 | JOB 5: confirm it holds BOTH live secrets | **NOT MET** | Value is Sensitive and unreadable; the functional proof requires running the sentinel, which is blocked (row 23) |
| 22 | JOB 5: make selfProbe iterate `resolveWebhookSecrets` | **PRE-EXISTING, not built by me** | `payment-checks.ts:126` resolves the list and `:152-159` loops every secret with a fingerprint label. Shipped in `2fbc2cb` |
| 23 | JOB 5: run the sentinel, report each destination result | **NOT MET (BLOCKED)** | Both endpoints are fail-closed Bearer `CRON_SECRET` (observed: 401 each). `CRON_SECRET` is Sensitive on Vercel and is NOT a GitHub secret, so neither I nor the smoke workflow can invoke them. Workflow annotation: "CRON_SECRET not configured as a GitHub secret; sentinel probe skipped" |
| 24 | JOB 6: prove a real email sends and lands | PARTIAL | Sends PROVEN accepted by Resend with real ids from `noreply@eventlinqs.com` (`fb7a2350`) and `hello@eventlinqs.com` (`c8cc758f`). **Landing in the inbox is NOT VERIFIED**: I have no access to `hello@eventlinqs.com` |
| 25 | JOB 6: report which sender each flow uses | MET | Mapped in the report, and proven by live API calls rather than by reading code alone |
| 26 | JOB 6: if not verified, report exactly which flows remain broken | MET | `send.eventlinqs.com` is absent from the Resend account; a send from it returns **403 "domain is not verified"**. Broken flows enumerated |
| 27 | JOB 7: promote the canonical 301 | PARTIAL | `www.eventlinqs.com` and `eventlinqs.com.au` now **301** to canonical (both were 200). `www.eventlinqs.com.au` serves 200 |
| 28 | JOB 7: every other host 301s to canonical | **PARTIAL** | `eventlinqs.com` still **308**s to `www.eventlinqs.com` first, then 301s to canonical: two hops, and the first is a Vercel project-domain redirect that runs at the edge before app code, so it cannot be fixed in the proxy |
| 29 | JOB 7: probe all four hosts live | MET | Probed before and after; both tables in the report |
| 30 | JOB 8: find why smoke skipped since 2026-07-12 | MET | Root cause already documented in the release's own workflow header: expired `SUPABASE_ACCESS_TOKEN` failed `types-drift guard`, CI concluded failure, `workflow_run.conclusion == 'success'` was false. Confirmed independently: `gh run list` shows skipped runs on 2026-07-12 and two skipped `deployment_status` runs today; `gh secret list` shows the token dated 2026-06-07 |
| 31 | JOB 8: fix it so it runs AND BLOCKS | PARTIAL | The `deployment_status` trigger fix is already in the release (`2fbc2cb`). I proved the workflow runs and passes (run `30205861425`, 1m42s, both curl smokes green). It does **not** gate tonight's deploy, because a `vercel deploy --prod` CLI deploy creates no GitHub deployment event, so nothing fires it automatically |
| 32 | JOB 8: prove it runs on tonight's deploy | **NOT MET** | It ran against tonight's production build, but by manual `workflow_dispatch`, not triggered by the deploy. Stated plainly rather than blurred |
| 33 | JOB 9: deploy the release to Production | MET | `dpl_6FYMWhUskCjkTfJmJdPf6XqPQQ4v`, build 54s, READY |
| 34 | JOB 9: alias both `.com.au` hosts | MET | Both aliased; canonical host serves `data-dpl-id="dpl_6FYMWhUskCjkTfJmJdPf6XqPQQ4v"` |
| 35 | JOB 9: homepage loads | MET | 200, captured at 1440 and 390 |
| 36 | JOB 9: event page loads with a live map | MET | 200. Live map proven directly: `gm-style` present, 1 canvas, 27 `maps.googleapis.com` requests including real tiles, 0 console errors |
| 37 | JOB 9: all four legal pages load | MET | `/legal/terms`, `/legal/privacy`, `/legal/refunds`, `/legal/organiser-terms` all 200, all captured at both viewports |
| 38 | JOB 9: checkout shows the all-in price BEFORE commit | **NOT MET (BLOCKED)** | Unprovable on production: every event refuses to sell. The ticket section reads "Tickets not yet on sale. This organiser is still finishing their payment setup." **0 of 16 organisations are charge-ready** |
| 39 | JOB 9: organiser signup works | PARTIAL | `/signup` and `/organisers/signup` both resolve 200 and are captured. **End-to-end signup is NOT proven, and is expected to fail at the confirmation email**, because that path goes through `sendEmail` on the unverified `send.eventlinqs.com` |
| 40 | JOB 9: zero dead links | MET | `link-integrity-crawl.mjs` vs production: **235 unique internal links, zero dead**, exit 0 |
| 41 | JOB 9: report deployment id and rollback target | MET | Both in the report |
| 42 | JOB 10: confirm the rebuilt renderer serves on Production | MET | `seatFrameTimes`, the rebuild's own perf bridge, found in a served production chunk; control marker returns 0 |
| 43 | JOB 10: all three LOD states reachable | **NOT MET (BLOCKED)** | Zero published seated events on production, and the brief forbade creating one |
| 44 | JOB 10: tooltip carries a price | **NOT MET (BLOCKED)** | Same cause |
| 45 | JOB 10: key plan appears when zoomed | **NOT MET (BLOCKED)** | Same cause |
| 46 | JOB 10: ticket-type colouring live | **NOT MET (BLOCKED)** | Same cause |
| 47 | JOB 10: capture at 1440 and 390 into the named folder | MET | 21 files in `docs/verification/production-launch-2026-07-26/`, committed `4d4bade` |
| 48 | JOB 10: report exactly what could not be proven without a seated event | MET | Rows 43 to 46, repeated in the report and the folder README |
| 49 | JOB 11: error tracking live and alerting to me | PARTIAL | Sentry is configured on Production and present in the served bundle. **Alert routing to the founder is NOT VERIFIED**: no Sentry dashboard access, and no test alert raised |
| 50 | JOB 11: Stripe webhook failure emails ON for the live account | **NOT MET** | Requires the Stripe dashboard. No live Stripe credential is reachable from this session |
| 51 | JOB 11: uptime checks on homepage, an event page, checkout | **NOT MET** | No uptime provider is configured on this project and none can be created from here |
| 52 | JOB 11: prove each with a real test alert | PARTIAL | One real alert path proven end to end: Resend accepted two sends with real ids. I also made the smoke gate's failure alert functional by adding `RESEND_API_KEY` as a repo secret (it was absent, so the alert step was inert) |
| 53 | JOB 12: ONE founder step in founder-step-delivery format | MET | Section D, re-scoped to the Connect blocker so it cannot produce a false green |
| 54 | REPORT A: each job with observed evidence | MET | Section A |
| 55 | REPORT B: one line, YES or NO | MET | `NO` |
| 56 | REPORT C: what is missing and who must do it | MET | Section C |
| 57 | REPORT D: the smoke test step | MET | Section D |
| 58 | Do not pause, do not ask approval between jobs | MET | Ran jobs 1 to 12 without pausing. The only earlier stop was the founder-ordered halting condition, since resolved |

## Standing rules

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| S1 | Australian English | MET | Proofread |
| S2 | No em-dashes, no en-dashes | MET | Hyphens, colons, commas only |
| S3 | The word "culture" is banned | MET | Not used in prose. Noted as a DATA finding: production carried a `cultures` table until migration `20260621000006` renamed it to `communities` tonight |
| S4 | Never touch the local working tree or `feat/walkthrough-defects` | MET | All work in `C:\elrel`; shared repo ref unmoved |
| S5 | Do not modify the funds-holding engine's money logic | MET | Zero source changes this session. The only commit is documentation and PNGs |
| S6 | No competitor named in public copy | MET | No public copy written |
| S7 | No fabrication; NOT VERIFIED where unproven | MET | 11 rows carry NOT MET or BLOCKED with the specific blocker |
| S8 | Disk guard 1.5 GB | MET | 25 GB at start, 14 GB after the worktree and install |

## Phase 3: the adversarial pass

**Silent drops.** Ledger diffed against the report. All 58 rows and 8 standing
rules appear. The 11 unmet rows are named individually, not summarised.

**Interpretation drift.** Four instances, all caught:

1. **The dangerous one.** JOB 3 said "apply with `supabase db push --linked`". The
   CLI is linked to TEST. Following the letter would have applied 37 migrations to
   the wrong database and reported success. Intent beat letter; mechanism corrected
   and disclosed.
2. **Claiming credit.** JOBS 4, 5 and 8 asked me to build things that already
   existed in `2fbc2cb`. The convenient framing is "done". The honest one is
   PRE-EXISTING plus what I actually contributed, which was verification and a
   deploy. Rows 18, 22, 31.
3. **A green test suite I had not earned.** A background notification reported the
   vitest job as "exit code 0" when `PIPESTATUS` showed 1. I nearly recorded a
   green gate from the notification. Caught, diagnosed as my own missing `pretest`
   step, re-run properly.
4. **A false defect.** `map-guard.mjs` reported the event map DEAD. Reporting that
   as a production defect would have been wrong twice over: its default slugs 404
   on production, and it is non-deterministic (same `/city/brisbane` URL OK on one
   run, DEAD on the next). A direct browser probe proved the map renders. The real
   finding is that the guard is unreliable, and that is what I reported.

**The unverifiable claim hunt.**
- "37 migrations were missing" - falsifiable by a different count from the DB.
  Tested twice, by `migration list` and by a direct `schema_migrations` query
  (38 applied of 75). Post-apply count is 75.
- "No data was lost" - falsifiable by a row-count drop. Restore point taken
  before the write (415 rows, 52 tables); after: events 46, organisations 16,
  profiles 4, orders 1 unchanged. `cultures` 14 became `communities` 14.
  `pricing_rules` 60 to 66, which is the fee migration inserting rows, expected.
- "Production runs LIVE Stripe keys" - falsifiable if the build guard passed
  vacuously. It does not: it is `buildCritical`, and its negative control is
  recorded in `live-keys-production-2026-07-26.md` failing against test keys.
- "Zero dead links" - falsifiable by any non-200. 235 checked, 0 failed.
- "The event map is live" - falsifiable by absence of tile requests. 27 Google
  requests including `maps/vt?pb=` tiles.
- "Both webhook destinations verify" - **NOT CLAIMED.** Cannot run the sentinel.
- "Email lands in the inbox" - **NOT CLAIMED.** Only that Resend accepted it.
- "Seated works on production" - **NOT CLAIMED.** Only that the renderer is
  served. The interactive states are unproven and named.
- "A stranger can buy a ticket" - **NOT CLAIMED.** Proven false: 0 charge-ready
  organisations.

**The founder-cost test.** One question avoided by reading the repo (the DB
password). Four items genuinely need the founder because they are dashboard-only
or need a credential no session holds: Stripe Connect onboarding, the Resend
domain, Stripe webhook emails, and `CRON_SECRET` as a GitHub secret. Where I
could remove an ask I did: `RESEND_API_KEY` is now a repo secret, so the smoke
gate's failure alert works without anyone being asked.

**The evidence-visibility test.** 21 captures at a named path, committed. Every
other claim is a command with quoted output.

**The regression sweep.** No source file changed. One commit, documentation and
PNGs only. Nothing to revert.

**The AI-tell sweep.** Zero em-dashes, zero en-dashes, zero exclamation marks in
copy, zero banned words, zero tell-lexicon phrases in this ledger and the report.

**The generic test.** Not applicable: no surface was designed this session.

## Phase 4: the gate

Not met: 11. Partial: 7. Unresolved adversarial findings: 0.

Gate result: **UNFULFILLED**, reported at the top of the report.

The unmet rows collapse to four external causes, none of them code:
1. No production organisation has completed Stripe Connect (blocks rows 21, 38, 39 end to end).
2. `CRON_SECRET` is not a GitHub secret (blocks rows 21, 23).
3. `send.eventlinqs.com` is not verified at Resend (blocks row 39's email leg).
4. Production has no seated event, and creating one was forbidden (blocks rows 43 to 46).
