# Roast ledger: LB-DEMANDSIGNAL, 20 September 2026, lane B

The founder's demand-signal screen reads every row, and says so when it cannot.
Ledger built from the lane B brief verbatim, plus `C:\dev\BUILD-BRIEF.md`, plus
the standing laws in `CLAUDE.md`. Written before adjudicating.

## Phase 1 and 2: the requirement ledger, adjudicated

| # | Requirement (source) | Verdict | Evidence |
|---|---|---|---|
| 1 | Read CLOSE-OUT.md and BUILD-BRIEF.md and continue the build (lane brief) | **MET, LATE** | CLOSE-OUT.md read first. BUILD-BRIEF.md was NOT read until the roast caught it, and it carried two requirements I was not honouring: axe at EVERY impact level, and free disk logged at the end of every item. Both are now met. This is the roast earning its place |
| 2 | Read LANE-RETURNS.md; returned work is the first job (lane brief) | **MET** | Two CONFLICT entries name `lane/b-growth` on `src/app/admin/(authed)/pricing/page.tsx` (00:03 and 00:14, 20 Sept). Both are STALE: lane A's watchdog merged my branch at 03:50 (`37a8d422`), and `git merge-tree verify/l5-launch-readiness HEAD` now returns a tree with no conflict, exit 0. Nothing to rebase: `origin/verify/l5-launch-readiness` is an ancestor of my HEAD |
| 3 | Second action every run: `git status`; never discard uncommitted work (lane brief) | **MET** | Run at the start: clean. No stash, reset, revert or checkout over work was used at any point |
| 4 | Priority order absolute: FO1, GA1 v3, GA2-5, OL1, AN1, PL1, C19 (lane brief) | **MET, all closed** | Every one carries a DONE line in CLOSE-OUT.md verified by lane A on 19 September, and AN1 (whose body still stands, so open by the closure rule) was re-opened, finished and closed on 19 September with its own block in LANE-B-CLOSED.md line 4336. AQ1, AQ2, AQ3 likewise. CS1 is not before 10 October. The queue is therefore the defect family named at the end of the last two closure blocks |
| 5 | One item at a time, finished before the next begins (COMPLETION LAW) | **MET** | One item, LB-DEMANDSIGNAL, one commit |
| 6 | Schema: migration written, applied to TEST, verified by query (COMPLETION LAW 1) | **NOT APPLICABLE, stated** | No schema change. The fix is entirely in code. Nothing here is the founder's |
| 7 | Code: built, typechecked, linted, no silent catches (COMPLETION LAW 2) | **MET** | 6 source files. gate `typecheck PASS 9s`, `lint PASS 60s`. The silent catches WERE the defect: six discarded `error`s and five `?? 0` coalesces, all gone |
| 8 | Tests: real tests added, the suite grows (COMPLETION LAW 3) | **MET** | 16 new tests in two files. Suite 492/6512 to **494 files / 6528 tests, 0 failed, 0 skipped** |
| 9 | The canary baseline is raised in the same commit (COMPLETION LAW 3) | **NOT MET, deliberately, three-lane protocol** | CLOSE-OUT LB1 acceptance 6 puts the baseline raise in lane A's merge commit, because three lanes growing the suite independently would each lower or fight the floor. Same standing reason as every lane B item since 13 September |
| 10 | A registered blocking guard, proven to fail against the broken state and pass against the fixed one, both outputs shown (COMPLETION LAW 4) | **MET** | `the-founder-screens-read-every-row.mjs`, registered in `run-guards.mjs`. RED: **15 of 15** drills fired, six of them new. GREEN: **178 of 178** guards pass, gate step `guards PASS 153` |
| 11 | DRIVEN: real browser, 390, 768 and 1440, screenshots under `C:\dev\EVIDENCE\<item>\` (COMPLETION LAW 5) | **MET** | `scripts/verify/lb-demandsignal-drive.mjs`, **45 of 45**, three viewports, each with its own city and its own person, `C:\dev\EVIDENCE\LB-DEMANDSIGNAL\` |
| 12 | REGRESSION: the full gate set green AFTER the item (COMPLETION LAW 6) | **MET for the six steps that are lane B's**, plus two drives | typecheck 9s, lint 60s, copy 1s, guards 153s, types-drift 19s, suite 137s. Then `fo1-founding-offer-drive` 45 of 45 and `lb-orvalue-drive` 15 of 15, both of which cover the files I changed. Lighthouse, build and production-parity are lane A's and were NOT run |
| 13 | axe ZERO violations at EVERY impact level on affected surfaces (COMPLETION LAW 6) | **MET, and it was RED first** | The drive asserts `violations.length === 0`, not `serious`. Before the fix: `scrollable-region-focusable`, serious, 1 node, at 390, on every load. `axe-red.txt` and `axe-green.txt` |
| 14 | Fix every defect you find before starting the next task (lane brief) | **MET, three found** | (a) the axe violation at 390; (b) the unbounded builder whose `.limit()` sat on a different statement, found by the guard; (c) the invite confirmation that could never be seen, found by the drive |
| 15 | Never claim something works without driving it (lane brief) | **MET** | Every claim in the report maps to a check id or a capture. The one claim I could not drive, the 1,000-row ceiling, is named as undriveable with the reason and is proven by test instead |
| 16 | Never guess a slug, route or id; enumerate from source or database (lane brief) | **MET** | Cities enumerated from `getWaitlistCities()` at run time and ranked by live demand; the three fixture people are minted per run; the founding cap is imported from source, not typed |
| 17 | Work only in `C:\dev\lanes\B`; never `-C` another lane (lane brief) | **MET** | Every command ran in this worktree. Lane A's local `verify/l5-launch-readiness` ref was READ through the shared object store from my own worktree, never with `-C`, and never written |
| 18 | Never push, never open a PR (lane brief) | **MET** | One commit on `lane/b-growth`. No push, no PR, no `--no-verify` |
| 19 | Never write the shared files (lane brief) | **MET** | Wrote only `BUILD-LOG-B.md`, `REVIEW-QUEUE-B.md`, `LANE-B-CLOSED.md` and this ledger |
| 20 | Append a closure block to LANE-B-CLOSED.md: id, date, commit, one line per acceptance criterion with evidence path (lane brief) | **MET** | Appended |
| 21 | Port 3100 and nothing else (lane brief) | **MET** | `BASE=http://localhost:3100` on every drive; the server is lane B's own, started by `scripts/dev/lane-b-serve-with-stripe.mjs` |
| 22 | Every TEST row carries lane-B; never touch another lane's rows; never truncate (lane brief) | **MET, observed** | Three waitlist rows and three invites, all `lane-b-demand-*`. Teardown re-reads and reports 0 of each remaining. No table truncated, no other lane's row touched |
| 23 | Your slice: organiser marketing surfaces, pricing configuration, analytics, consent (lane brief) | **MET** | `/admin/network` is FO1's founding-organiser recruitment screen, lane B's build. The one file that touches a fee waiver, `network/actions.ts`, was changed only in its READ error handling; no money path, no charge, no payout. Recorded in REVIEW-QUEUE-B.md rather than left implicit |
| 24 | Six gate steps before calling an item done; not lighthouse, build or parity (lane brief) | **MET** | All six PASS, listed in row 12 |
| 25 | Production Supabase read-only; CLI rests linked to TEST (lane brief, BUILD-BRIEF) | **MET, checked** | `npx supabase projects list` shows `vkapkibzokmfaxqogypq linked: true`, `gndnldyfudbytbboxesk linked: false`, before any database command and unchanged after |
| 26 | Disk floor; log free space at the START and END of every item (BUILD-BRIEF) | **MET** | Start 12.7 GB. End recorded in the closure block. Nothing deleted from `.next`, `.turbo` or the npm cache in any worktree |
| 27 | Australian English, no em dashes, no en dashes, no exclamation marks, no banned word (CLAUDE.md, BUILD-BRIEF) | **MET** | gate `copy PASS`, and every new user-facing string re-read by hand: "Founding invitation sent", "They leave the list below because it shows only organisers who have not been invited yet", three refusal messages, one aria-label. Zero tells |
| 28 | Law 8: no AI trailer, the founder is sole author (CLAUDE.md) | **MET** | Commit message carries no trailer, no "Generated with", no robot emoji |
| 29 | Law 7: no specification stated from memory (CLAUDE.md) | **MET, and re-measured rather than inherited** | The 1,000-row ceiling carries Supabase's own page and a fetch date, and I re-measured it against TEST myself rather than repeating the earlier session's figure: `Prefer: count=exact` gives HTTP 206 and `0-999/14381`, an ordinary read gives HTTP 200 and `0-999/*`. The second is the sharper fact and it is now in the source |
| 30 | Law 10: every founder step gets a verdict (CLAUDE.md) | **MET** | Nothing in this item is his. No migration, no dashboard step. VERDICT: SCRIPTED, and already run |
| 31 | DESIGN-LOCK: change only what the item asks (lane brief, CLAUDE.md) | **MET** | One new element, the invite confirmation, which the item needed. The list, the empty state, the table, the metrics and the chrome are byte-identical in class terms. No new colour, size or token: `emerald-400` was already the file's success colour |
| 32 | Africa deferred (lane brief) | **MET** | Untouched |
| 33 | Never stop a process I did not start; never read or touch `C:\dev\leads` (lane brief) | **MET** | Only my own server on 3100 was started. `C:\dev\leads` never read, listed or touched |

## Phase 3: the adversarial pass

**Silent drops.** One, and it was real: I had not read `C:\dev\BUILD-BRIEF.md`,
which the brief's first sentence names. It carried two requirements I was
missing, axe at every impact level and the end-of-item disk log. Both fixed
before this ledger was finished. Nothing else in the ledger is unmentioned in
the report.

**Interpretation drift.** One caught and reversed. I first proved accessibility
with `impact === 'serious' || 'critical'`, which is the platform's usual bar and
is EASIER than the completion law's "every impact level". The drive now asserts
zero violations of any impact. A second: I nearly proved the new confirmation
region at 1440 only, because that was where the invite happened. The drive was
restructured to run the whole sequence at all three viewports with three people,
so the new interface is proven where it is hardest rather than where it was
convenient.

**Match versus surpass.** Not a competitor item; no surpass claim is made. The
comparison that matters is against the platform's own prior art, and it is
AHEAD on one measurable point: `the-founder-screens-read-every-row` now judges
five screens rather than two, and carries a fifth clause the earlier version
did not have.

**Unverifiable claim hunt.**

| Claim | What would falsify it | Tested |
|---|---|---|
| a failed read is now visible rather than a silent zero | the screen renders figures anyway | YES. The read was sabotaged to a table that does not exist: fixed tree answers **HTTP 500** with the designed boundary, "We hit a snag loading this page", a reference number and a Retry. `loud-failed-read.txt` |
| the old code rendered zeros on the same failure | it errored too | YES. `git show HEAD:` of the module, same sabotage: **HTTP 200**, the whole dashboard, every city 0/0/0/0/0, under a header reading "All figures are live counts". `loud-failed-read-before-this-item-desktop-1440.png`. This is the defect photographed |
| the axe violation was on every mobile load since the screen was built | it needed data, like the /admin/pricing one did | YES. The city rows come from the registry, not the database, so the table always overflows at 390. `git log -S` puts the `overflow-x-auto` in `17ffc3f5`, the commit that created the file |
| the suppression read stops a second invitation | the person stays on the list | YES, at all three viewports, proven by a fresh load rather than by the button's own state, and by counting exactly one invite row |
| the ceiling fix works | it truncates | NOT DRIVEABLE at 9 rows, and said so. Proven by 2,500 rows through a faked 1,000-row cap and 1,200 through a 250-row cap |

**The generic test.** The confirmation names the person, their address and their
city, and explains why they left the list. It could not belong to another
product: it is the EventLinqs founding-organiser recruitment loop, growth lever
one, rendered on the screen the founder recruits from.

**AI-tell sweep.** Em-dashes 0, en-dashes 0, exclamation marks in user-facing
copy 0, banned word 0, tell lexicon 0. `copy PASS`.

**Regression sweep.** Named in row 31. Nothing reverted, because nothing outside
the item was changed.

**Founder-cost test.** Zero. No dashboard step, no migration, no question a
reader of the code could answer.

**Evidence-visibility test.** 21 captures and three text files under
`C:\dev\EVIDENCE\LB-DEMANDSIGNAL\`, including the before and after of the defect
itself.

## Phase 4: the gate

Requirements: 33. Met: 31. Not applicable and stated: 1 (schema). Not met: 1
(the canary baseline, deliberately, by the three-lane protocol, and it is lane
A's to move at the merge). Unresolved adversarial findings: 0.
