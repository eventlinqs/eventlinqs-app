# LB-PROOFCOUNT self-audit ledger, 21 September 2026

Item: the platform's own social proof counted a 1,000-row sample and printed it
beside a true total. Lane B, self-directed under the standing defect-family
work (every item in lane B's named priority order is DONE or blocked on
somebody else; accounted for line by line in row 16 below).

Commit: `b15fca3c`.

The ledger was written before adjudication began, from the session brief read
verbatim, not from memory of it.

---

## Phase 1 and 2: the requirement ledger, adjudicated

| # | Requirement (from the brief, verbatim in substance) | Verdict | Evidence |
|---|---|---|---|
| 1 | Read `C:\dev\CLOSE-OUT.md` and `C:\dev\BUILD-BRIEF.md`; CLOSE-OUT is authoritative | MET | Both read this run. CLOSE-OUT.md lines 1348 to 1470 (the lane B marketing block), 2005 to 2059 (AQ2, AQ3); BUILD-BRIEF.md read in full, and its closing line points back to CLOSE-OUT.md |
| 2a | COMPLETION LAW: schema | N/A, STATED | The fix is a read shape, not a schema change. No migration was written, and that is deliberate: lane A's return of 20 September records that a 147th migration against 146 applied held the whole run's commits at production-parity. `git show --stat b15fca3c` lists no file under `supabase/migrations/` |
| 2b | COMPLETION LAW: code | MET | `src/lib/stats/platform-stats.ts` reads every published event through `readEveryRow`, ordered on `id`, and derives all three numbers from that one array |
| 2c | COMPLETION LAW: tests | MET | `tests/unit/stats/platform-stats.test.ts`, 3 to 6 tests. The new fake client models a SERVER CEILING and honours `.range()`, which the fake it replaced could not express at all. Drilled RED: reverting the resolver to a single page produced `expected 1000 to be 2500`, `expected 300 to be 2500`, `expected 'live' to be 'unavailable'` |
| 2d | COMPLETION LAW: a REGISTERED BLOCKING guard, PROVEN to fail as well as pass | MET | `scripts/guards/no-silent-row-ceiling.mjs`, already registered in `run-guards.mjs`, gains `src/lib/stats` in SCOPE plus a count clause. `--only row-ceiling` reports `12/12 drills fired correctly` and `all guards PASS on the restored tree`. Four of the twelve are new |
| 2e | COMPLETION LAW: driven proof at 390, 768 and 1440 | MET | `scripts/verify/lb-proofcount-drive.mjs`, 30 of 30, run twice on the final shape. `C:\dev\EVIDENCE\LB-PROOFCOUNT\results.json`, `drive.log`, six screenshots in `drive\` |
| 2f | COMPLETION LAW: full regression green | MET | Six gate steps on the committed tree: typecheck PASS 33s, lint PASS 57s, copy PASS 1s, guards PASS 165s (202 of 202), types-drift PASS 30s, suite PASS 126s (536 files, 7,194 tests, 0 failed, 0 skipped) |
| 2g | COMPLETION LAW: the suite grows and the canary baseline is raised in the same commit | MET | `scripts/guards/test-count-canary.mjs` 536/7187 to 536/7194, MEASURED by running the canary, with the +3 and +4 arithmetic written out in the file |
| 3 | Fix every defect you find before starting the next task | MET | Four fixed inside this item, listed in Phase 3 under "defects this run found". None deferred |
| 4 | Never claim something works without driving it | MET | Every claim in the commit message is a measured number from `drive.log` or a gate step's own output. The central claim, that the old shape would have printed 874 organisers and 720 cities, was MEASURED against the real REST endpoint, not reasoned |
| 5 | Never guess a slug, route or id; enumerate from source or the database | MET | The owner uuid, the organisation and event required columns, the `event_status` and `event_visibility` enums, the RLS SELECT policies, the cover URL and the table row counts were each read out of TEST with `supabase db query --linked` before use. The unbounded-read inventory came from the guard's own chain parser over `src/`, not from grep |
| 6 | Work only in `C:\dev\lanes\B`, branch `lane/b-growth` | MET | Every command ran with cwd `C:\dev\lanes\B`. `git rev-parse --abbrev-ref HEAD` is `lane/b-growth`. No `git -C` at another lane |
| 7 | Never push, never open a pull request | MET | No `git push` and no `gh pr` was run. `git log origin/lane/b-growth..HEAD` is non-empty by design |
| 8 | Never write the shared files | MET | The nine named files were read only. The only files written outside the worktree are under `C:\dev\EVIDENCE\LB-PROOFCOUNT\` |
| 9 | Use `BUILD-LOG-B.md`, `REVIEW-QUEUE-B.md`, `LANE-B-CLOSED.md` | MET | All three appended this run (row 23) |
| 10 | Append a closure block to `LANE-B-CLOSED.md`: item id, date, commit hash, one line per acceptance criterion with evidence path | MET | Appended under "LB-PROOFCOUNT CLOSED, 21 September 2026", commit `b15fca3c` |
| 11 | Port 3100 and base URL `http://localhost:3100` only | MET | `BASE` defaults to `http://localhost:3100`. Port 3100 was already held by a `next dev` whose command line reads `C:\dev\lanes\B\node_modules\next\...`, confirmed by reading the owning process (PID 17224) rather than assuming, so it was used rather than replaced |
| 12 | Every TEST row carries lane-B; never touch another lane's rows; never truncate | MET | Every seeded row is `lane-b-proofcount-org-*` or `lane-b-proofcount-event-*`. Deletes are `.like()` on that prefix and `.in()` on ids read back from it. No `truncate` was issued. TEST restored to 285 events / 159 organisers / 5 cities, asserted by the drive and re-checked by SQL |
| 13 | Stay in the lane B slice; a border becomes a BORDER line | MET | `/organisers` and its social proof are organiser marketing surfaces. Nothing in payments, the notification router or the owner digest was touched. `git show --stat b15fca3c` |
| 14 | Run the six cheap gate steps; do NOT run lighthouse, build or production-parity | MET | Six run, all PASS (row 2f). The three reserved steps were not run |
| 15 | Read `LANE-RETURNS.md`; returned work first | MET | Read. Nothing is returned to lane B. The 20 September entry HOLDS two earlier commits for a production-parity reason that is the founder's step, and asks nothing. The recurring canary conflict was checked: `origin/verify/l5-launch-readiness` (bc3701e9) is fully contained in `lane/b-growth`, so there is nothing for this lane to rebase; the overlap is with lane A's unpushed local branch. Recorded in the review queue |
| 16 | Priority order FO1, GA1v3, GA2, GA3, GA4, GA5, OL1, AN1, PL1, C19; CS1 not before 10 October | MET | Checked in CLOSE-OUT.md rather than assumed: FO1 line 1354 DONE, OL1 1359 DONE, PL1 1406 DONE, FT1 1411 DONE, C19 374 DONE, GA1 v3 1443, GA2 1448, GA3 1453, GA4 1458, GA5 1463 all DONE. AN1 (1364) is open on acceptance 4 ALONE, which CLOSE-OUT itself rules IMPOSSIBLE for a machine (a Search Console property in the founder's own Google account). AQ2 is open on one change inside `squad-checkout.ts`, which the protocol gives lane A by name. AQ3 is open on the identical founder Google step. CS1 not started. So the named queue is exhausted and this item is taken under the standing defect-family work |
| 17 | Before starting an item, check whether it is already MET and close it instead | MET | Row 16 is that check. This item is new work, not a repeat: `src/lib/stats` appears in no prior closure in `LANE-B-CLOSED.md` |
| 18 | Second action every run: `git status`; never discard uncommitted work | MET | Run as the second action; the tree was clean, so no work-in-progress commit was needed. Nothing was stashed, reset, reverted or checked out over |
| 19 | Never stop or restart another process; no `Get-Process node`; never touch `C:\dev\leads` | MET | No process was killed or restarted. PID 17224 was INSPECTED with a `ProcessId=`-filtered `Get-CimInstance`, never enumerated by name, and then used. `C:\dev\leads` was never read, listed or written |
| 20 | No production writes; the CLI rests linked to TEST | MET | Every `supabase db query --linked` resolved to `vkapkibzokmfaxqogypq`; `supabase/.temp/project-ref` reads `vkapkibzokmfaxqogypq` at the end of the run. The drive REFUSES to start unless the URL matches that ref. Production `gndnldyfudbytbboxesk` was not contacted at all this run |
| 21 | Disk rules | MET | 9.4 GB at the start, 9.0 GB at the end. Above the 8 GB stop line throughout. No `.next`, `.turbo` or npm cache deleted in any worktree, no `npm cache clean`. The drive records no Playwright traces or videos, so there were none to delete. Reported in the review queue because it is under 10 GB |
| 22 | Africa deferred | MET | Nothing in this item touches multi-language UI or phone OTP |
| 23 | After the item, update the build log, the review queue and the closed file, and commit them | MET | All three appended and committed |
| S1 | Australian English; no em-dashes or en-dashes | MET | Swept the nine changed files: zero em-dashes, zero en-dashes |
| S2 | No exclamation marks in user-facing copy | MET | Swept: the only match is a pre-existing quoted Google Maps error string inside a comment in `test-count-canary.mjs:1289`, not this item's line and not user-facing copy |
| S3 | The banned word (community, never the other one) | MET | Zero matches for `cultur` across the nine files |
| S4 | No AI-tell lexicon | MET | Zero matches across the nine files for the full tell list |
| S5 | Law 8: the founder is the sole author, no AI trailer | MET | `core.hooksPath` is `.githooks`; the `commit-msg` hook accepted `b15fca3c`; `no-ai-authorship` passes inside the 202-guard run |
| S6 | Law 7: no third-party specification stated from memory | MET | The 1,000-row ceiling is cited to `https://supabase.com/docs/reference/javascript/select` in the resolver, the pager and the guard, AND independently re-measured against this project's own endpoint this run: HTTP 206, 1,000 rows, `Content-Range: 0-999/14433` on `consent_events` and `0-999/1285` on the seeded `events` |
| S7 | Law 4: social proof uses real platform truths only; never fabricate numbers | MET | This item exists to satisfy it. The three numbers now come from one complete paged read, so they describe one catalogue by construction |
| S8 | DESIGN-LOCK: change only what the item asks | MET | Phase 3, regression sweep: no visual element changed. `LiveProofStrip` and `OrganisersLandingPage` are untouched in the diff |

Counts: 32 rows. MET 31. N/A stated 1 (schema). PARTIAL 0. NOT MET 0. REFUSED 0.
BLOCKED 0.

---

## Phase 3: the adversarial pass

**Silent drops.** Compared the ledger against the commit message and the closure
block. Rows the report did not originally mention: row 21 (disk) and row 15 (the
canary conflict finding). Both are now in `REVIEW-QUEUE-B.md` and the build log.
No requirement is unmentioned.

**Interpretation drift.** One real instance, and it is worth naming because it
went the wrong way first. The brief's defect-family work could have been
satisfied by the cheapest unbounded read in the list. The first candidate
examined was `src/lib/pricing/read-price-history.ts`, and it was DROPPED on
measurement rather than on taste: `ticket_price_history` holds 405 rows in
total, across all events, so a per-event read of it cannot reach the ceiling.
Choosing it would have been an easier task substituted for the real one. The
second drift risk was the opposite: a database view computing
`COUNT(DISTINCT ...)` is the textbook fix and the file's own comment asks for
it, and it was NOT taken, because it needs a migration and lane A's own return
records what a migration costs three lanes right now. That is a stated
trade-off with the optimisation raised in the review queue, not a quiet
downgrade.

**The match-versus-surpass test.** The brief did not say surpass for this item,
so there is no competitor capability to rank. Not applicable, stated rather than
skipped.

**The unverifiable claim hunt.** Every quality claim, and what would falsify it:

- "past a thousand events the strip describes two catalogues" - falsified by an
  unbounded read returning the whole table. TESTED: it returned 1,000 of 1,285.
- "the old shape would have printed 874 organisers and 720 cities" - falsified
  by deduping the real truncated body and getting the true figures. TESTED: the
  drive does exactly that dedupe and gets 874 and 720 against 1,159 and 1,005.
- "all three numbers now describe one catalogue" - falsified by the page
  printing any number the database disagrees with. TESTED at three viewports.
- "the count clause cannot be bought off with a bound" - falsified by a
  `.limit()` making the guard go quiet. TESTED: drill 3 plants
  `count: 'exact'` WITH `.limit(5000)` and the guard still fails.
- "TEST is left as found" - falsified by a leftover row. TESTED three ways
  (events, organisations, tombstones) inside the drive, and re-checked by SQL
  after the run.
- "the guard is registered and blocking" - falsified by it not running in
  `run-guards.mjs`. TESTED: the guards step reports 202 of 202 and names it.

No claim survives that was not falsify-tested. None deleted.

**The generic test.** Could this belong to another product? No. The subject is
EventLinqs' own organiser proof strip, the rule it restores is CLAUDE.md Law 4,
the guard scope is this platform's marketing and consent path, and the numbers
are this catalogue's.

**The AI-tell sweep.** Em-dashes 0, en-dashes 0, exclamation marks in
user-facing copy 0 (one pre-existing quoted error string in a comment, not this
item's), banned word 0, tell lexicon 0. Zero throughout.

**The regression sweep (DESIGN-LOCK).** Existing elements changed that the brief
did not ask to change: NONE. No hero, spacing, colour, layout, copy or chrome
was touched. `LiveProofStrip` renders exactly as before; only where its numbers
come from changed. The one widened non-subject file,
`fixtures-are-not-published.mjs`, was widened because this item's own drive was
refused by it, which makes it a dependency of the item rather than a drive-by
edit, and it is covered by four tests and a drill.

**The founder-cost test.** Does the report send the founder to a dashboard?
No. This item adds no founder step at all: no migration, no environment
variable, no dashboard setting. It does not ask a question answerable by reading
the code. The database-view optimisation named in the resolver's comment is
written into `REVIEW-QUEUE-B.md` as an optimisation for whenever a migration is
next cheap, explicitly NOT a correctness gap and explicitly not a step he must
take now.

**The evidence-visibility test.** The founder can see this with his own eyes:
`C:\dev\EVIDENCE\LB-PROOFCOUNT\drive\organisers-strip-closeup-mobile-390.png`
shows the rendered sentence "1285 events live right now, across 1005 Australian
cities, from 1159 organisers" at 390, and the full-viewport captures show it in
place on the page at all three widths. `results.json` holds all 30 checks with
their measured details.

### The defects this run found, all fixed inside the item

1. **The drive published its fixtures.** A thousand `visibility: 'public'`
   events would have entered the sitemap that three lanes read and one lane
   deletes, which is how lane B's own PL1 drive refused lane A's push on
   14 September. Caught by `fixtures-are-not-published` in the suite step, not
   by review. They are `unlisted` now, which the RLS policy still shows to the
   anon client the page counts and `PUBLIC_EVENT_MATCH` excludes from the
   sitemap, so the seed is counted and not indexed.
2. **The teardown was one big delete, and the server cancelled it.** Two of the
   three tables came back "canceling statement due to statement timeout" AFTER
   the drive had printed its own teardown as done, leaving 1,000 events and
   1,000 organisations on a TEST project two other lanes are building against.
   They were purged by hand within the run, the teardown batches and VERIFIES
   now, and the batch sizes are measured rather than guessed: 100 organisations
   in one statement timed out, 10 did not.
3. **A teardown that only ran on the happy path.** The first seed failure left
   1,000 organisations behind because `seeded` was set AFTER both inserts
   returned. It is armed before the seed runs now.
4. **The new drill passed on the wrong line.** It expected
   `events.visibility='public'`, which the guard prints on every run as part of
   its excused baseline for OTHER drives, so it went green off a line that had
   nothing to do with the mutation and would have gone green with the widening
   judging nothing at all. Found by reading the drill's output instead of its
   verdict. It is anchored now on `lb-proofcount-drive.mjs:`, the file-and-line
   form the guard only ever emits for a real finding.

Two of those four accused the harness rather than the product, and the fourth is
the ninth harness-over-product incident recorded in this lane. The second is the
more serious: a teardown that reports success while failing is the same class of
defect as the item's own subject, a read that reports completeness while
truncating.

---

## Phase 5: decision evidence

Two decisions in this item carry evidence.

| Dimension | Decision 1: page the read rather than add a database view | Decision 2: put `src/lib/stats` in the existing guard rather than write a new one |
|---|---|---|
| Competitor | Not applicable; this is an internal read shape, not a user-facing capability | Not applicable |
| Market | Not applicable | Not applicable |
| Engagement | Not applicable | Not applicable |
| Trend | Not applicable | Not applicable |
| Our code | `src/lib/supabase/read-every-row.ts` is the platform's established remedy for this exact family, already used by `src/lib/audience/read.ts:94` and `:125` and by `src/lib/marketplace/showcase.ts`. `src/app/organisers/page.tsx:6` declares `revalidate = 60`, so the paging cost is at most once a minute per region | `scripts/guards/no-silent-row-ceiling.mjs` already owns this rule, already carries a dated scope list with two prior additions, and already holds the machinery (`selectChainsIn`, `boundednessOf`, `headOnlySelectLines`). A second guard would duplicate all of it |
| Test plan | The metric is round trips per render, one per 1,000 published events. The threshold at which the view wins is a catalogue large enough that the extra round trips matter more than a migration costs; that is a judgement for when a migration is cheap, and it is in the review queue rather than presented as settled | Falsified if adding the scope entry changed no verdict. TESTED: drill 1 plants an unbounded read in `src/lib/stats` and the guard names it. Falsified if the count clause fired on correct existing code. TESTED: every `count:` already in scope on 21 September 2026 was head-only, so the clause costs the tree nothing |

Where an A/B test would settle a question: none here. Neither decision is a
user-visible variant.

---

## Phase 4: the gate

NOT MET 0. PARTIAL 0. Unresolved adversarial findings 0.

ROAST GATE: PASSED.
