# Self-audit: LB-BLINKLINK, 21 September 2026

A stale code and a blinked read are different facts and had one answer between
them. Nine reads across six files on the tracked-link, consent and campaigner
spine, each of which already held a correct fallback for a row that is genuinely
absent, and each of which quietly used that same fallback to answer a dropped
socket.

The ledger below was written before adjudication began.

---

## Phase 1: the requirement ledger

### From the session brief

1. Read CLOSE-OUT.md and BUILD-BRIEF.md and continue the build.
2. COMPLETION LAW: one item at a time, finished with schema, code, tests, a
   registered blocking guard proven to fail as well as pass, driven proof at
   390, 768 and 1440, and full regression green, before the next begins.
3. Fix every defect found before starting the next task.
4. Never claim something works without driving it.
5. Never guess a slug, route or id: enumerate from source or the database.
6. Work only in C:\dev\lanes\B, on lane/b-growth.
7. Never push, never open a pull request.
8. Never write the shared files (CLOSE-OUT.md, BUILD-LEDGER.md, REVIEW-QUEUE.md,
   LANE-RETURNS.md and the rest).
9. Append a closure block to LANE-B-CLOSED.md: item id, date, commit hash, one
   line per acceptance criterion with the evidence path that proves it.
10. Port 3100 and nothing else; every TEST row created carries lane-B.
11. Stay inside lane B's slice; anything needing another lane's territory is a
    BORDER line in REVIEW-QUEUE-B.md, not an edit.
12. Before calling the item done, run six gate steps: typecheck, lint, copy,
    guards, types-drift, suite. All six must pass. Do not run lighthouse, build
    or production-parity.
13. Read LANE-RETURNS.md first; returned work outranks new work.
14. Priority order: FO1, GA1 v3, GA2, GA3, GA4, GA5, OL1, AN1, PL1, C19.
15. Before starting an item, check whether it is already MET and close it rather
    than redo it.
16. Second action every run: git status. Never discard uncommitted work.
17. Shared machine: never kill a node or claude process this session did not
    start, never Get-Process node or taskkill by name, never npm cache clean,
    never touch C:\dev\leads.
18. Production Supabase is not written; the CLI rests linked to TEST.
19. Disk: report under 10 GB, stop under 8 GB; delete Playwright traces and
    videos once read.
20. After the item, update the build log, the review queue and the closed file,
    and commit them.

### Standing laws that bind every task

21. Australian English; no em-dashes or en-dashes anywhere.
22. No exclamation marks in user-facing copy.
23. The banned word, in copy, routes, files, identifiers and data.
24. No placeholder, stub or TODO on a shipped surface.
25. Law 8: no commit message names an AI author.
26. DESIGN-LOCK: change only what the item asks and regress nothing.
27. Law 5: zero dead links, zero dead-end affordances.

---

## Phase 2: adjudication

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | Both read at the start of the run. CLOSE-OUT.md lines 1348 to 1470 hold lane B's slice; the priority list was checked against it before any edit. |
| 2 | MET | See the six acceptance lines in the closure block. Schema is N/A and stated; code is nine reads in six files; tests are 39 in one new file; the guard is registered and drilled; the drive ran at all three widths; all six gate steps are green. |
| 3 | MET | Three defects found and fixed in this pass, listed in Phase 3 under "defects found on the way". |
| 4 | MET | `scripts/verify/a-blink-is-not-a-stale-link-drive.mjs`, 10 of 10 checks, `C:/dev/EVIDENCE/LB-BLINKLINK/drive.log`, six screenshots, two of them read back as images rather than trusted as files. |
| 5 | MET | The drive reads the share link, the event and the absent code out of the database at run time and prints which it used. The absent code is generated and then CHECKED against the table rather than assumed absent (`absentCode()`). The guard drills name file paths read from source. |
| 6 | MET | Every command in this run ran with cwd `C:\dev\lanes\B`. No `-C` and no path into another lane. |
| 7 | MET | No push and no pull request. `git status` and `git log` only. |
| 8 | MET | Nothing under C:\dev was written except C:\dev\EVIDENCE\LB-BLINKLINK, and the three lane B files named in requirement 20. |
| 9 | MET | The closure block appended to LANE-B-CLOSED.md, one line per acceptance criterion with its evidence path. |
| 10 | MET | `BASE` defaults to `http://localhost:3100`; the drive reused an existing share link and therefore wrote NOTHING, which the log records. The minting path is tagged `laneb` and its teardown verifies by reading. |
| 11 | MET | The scope deliberately excludes `src/app/actions` as a directory because 46 of its 48 faults are lane A and lane C files; the two lane B files are named individually and the guard forces that narrowing to justify itself on every run. One earlier BORDER line (payouts) stands unchanged in REVIEW-QUEUE-B.md. |
| 12 | MET | typecheck PASS 33s, lint PASS 82s, copy PASS 1s, guards PASS 205s (206 of 206), types-drift PASS 23s, suite PASS (545 files, 7,333 tests, 0 failed, 0 skipped). Lighthouse, build and production-parity were not run. |
| 13 | MET | Read first. It names lane/b-growth twice: two commits HELD by lane A for production parity (not returned, not reverted, nothing asked of this lane), and the recurring canary conflict. Neither is returned work. Adjudicated in Phase 3. |
| 14 | MET | Every named item is DONE and lane-A-verified in CLOSE-OUT.md except AN1, which is open on acceptance 4 alone, and CS1, which is not before 10 October. See Phase 3, "the priority order". |
| 15 | MET | CLOSE-OUT.md, CLOSE-OUT-DONE.md, `git log` and LANE-B-CLOSED.md were all read before this item began. No named item was redone. |
| 16 | MET | `git status` was the second action of the run and reported clean. No stash, no reset, no checkout over anything. |
| 17 | MET | No process was stopped. The server on port 3100 was identified by PID through `Get-CimInstance Win32_Process -Filter "ProcessId = 2980"`, a single-PID query rather than a name sweep, and was USED rather than restarted. No npm cache clean. C:\dev\leads untouched. |
| 18 | MET | The drive refuses unless the URL contains `vkapkibzokmfaxqogypq`, and it ran under `env -u NEXT_PUBLIC_SUPABASE_URL` so the shell's production URL could not leak in. |
| 19 | MET | 9.3 GB at the start. Reported in the review queue. The drive records no Playwright trace or video, so there was none to delete; the evidence directory for this item is about 1 MB. |
| 20 | MET | BUILD-LOG-B.md, REVIEW-QUEUE-B.md and LANE-B-CLOSED.md all updated and committed. |
| 21 | MET | `git diff` over the whole change: 0 em-dashes, 0 en-dashes. |
| 22 | MET | No user-facing copy was added. The one refusal string reuses the existing `'Could not save'`. |
| 23 | MET | 0 occurrences of the banned word in the diff. |
| 24 | MET | No stub, no TODO, no placeholder. The two guards that would catch one (`no-drill-residue`, the copy gate) are green. |
| 25 | MET | Commit message carries no AI attribution; `no-ai-authorship` is among the 206 green guards. |
| 26 | MET | No visual change of any kind. The only rendered surface touched is the admin campaigns page, and only its data read; no markup, spacing, colour or copy was altered. See Phase 3, "regression sweep". |
| 27 | MET | The item STRENGTHENS this law rather than touching it: `/s/[code]` and `/e/[code]` are the link surfaces, and both directions are driven. The browse fallback for a genuinely absent code is pinned by a test so a careless fix cannot turn a deleted event into a 500. |

**Not met: 0. Partial: 0. Refused: 0. Blocked: 0.**

---

## Phase 3: the adversarial pass

### The priority order, checked rather than assumed

FO1, OL1, PL1, C19, FT1, GA1 v3, GA2, GA3, GA4 and GA5 all carry a DONE line in
CLOSE-OUT.md plus a lane A verification dated 19 September. AN1 is open on
acceptance 4 alone: "Search Console shows the property verified and the sitemap
submitted", which needs a property that does not exist until a dashboard in the
founder's own Google account mints it. Both scripted halves exist on disk and
were checked to exist this run (`scripts/ops/search-console-verify.mjs`,
`scripts/ops/set-measurement-identifiers.mjs`). Under Law 10 the verdict is
IMPOSSIBLE for a machine, not an unscripted step. CS1 is not before 10 October.

So the named slice is exhausted, and this item is self-directed defect-family
work in lane B's own territory, which is what the two runs before it also did.

### The returns file

LANE-RETURNS.md names lane/b-growth twice and neither is returned work.

One: two commits are HELD by lane A because they carry a migration and the tree
would then be one ahead of production. Lane A states plainly that nothing was
discarded and nothing is asked of this lane.

Two: the canary conflict, logged by a watchdog every ten minutes. It says the
owning lane should "rebase on origin/verify/l5-launch-readiness". That was
CHECKED rather than obeyed: `git ls-remote` reports origin at `bc3701e9`, dated
14 September, and `git rev-list --left-right --count` reports 0 commits on origin
that this branch does not already have. There is nothing to rebase onto; the
conflicts are in lane A's LOCAL merge. Acting on the instruction as written would
have been a no-op dressed as work. Recorded in the review queue.

### Silent drops

The report names every one of the 27 ledger rows. None is unmentioned.

### Interpretation drift

One real instance, caught and reversed. The brief's COMPLETION LAW says driven
proof at 390, 768 and 1440. The blink itself cannot be injected into a running
server this session is forbidden to restart, and the easier task available was to
photograph only the happy path and call the item driven. That was refused. The
blink is driven in-process against the same real TEST database with
`globalThis.fetch` wrapped, the interception is COUNTED so a pass over nothing is
impossible (4 events requests failed on cue), and what is missing, a photograph
of the browser mid-blink, is stated in the drive's own header and in the closure
block rather than glossed.

### Defects found on the way and fixed in the same pass

1. **A SILENT CATCH I WROTE MYSELF.** The first version of the consent fix was
   `catch { return { ok: false, error: 'Could not save' } }`. The registered
   guard `no-silent-catch` refused the build and named the file and the line.
   It now reports through `captureException` before refusing the save. Found by
   the guard, not by me, which is the guard doing its job on its author.

2. **TWO OF MY OWN DRILLS WERE BLIND.** The drills for the two file-scoped
   entries asserted the string `src/app/actions/consent.ts`, and the guard prints
   that exact path on EVERY run in its "narrowed to one file" line. Both drills
   would have gone green against a guard that never judged the file at all. All
   seven product drills now assert a fragment of their own `becomes` sentence,
   which only `judgeFile()` can emit. This is the same class the drill harness
   itself warns about and it was live in my own work for half an hour.

3. **MY SWEEP OVER-REPORTED BY THREE.** The first pass over `src/` used two of
   the four doors and accused `src/lib/matching/run.ts` of three faults the
   guard had already cleared. Caught by running the real guard against the real
   scope before writing a line of product code, rather than trusting my own
   matcher. No code was changed on the strength of the wrong number.

### The unverifiable claim hunt

- "Nine reads." Falsifiable by the scope-check sweep; each of the six files
  reports 0 faults where it reported 1, 2 or 3, and the count is 2+2+1+1+1+1+1.
- "The guard fails as well as passes." Falsifiable by the drill harness, which
  ran the 27 drills of this guard and reported 27 of 27 firing, each naming the
  sentence its own fault produces. Also: "all guards PASS on the restored tree."
- "The tests catch the defect." Falsifiable by restoring the defect. Six of the
  39 were driven red across two proofs, listed by name.
- "Nothing else regressed." Falsifiable by the suite: 545 files, 7,333 tests,
  0 failed, 0 skipped, and 206 of 206 guards.
- "The drive wrote nothing." Falsifiable by the log line, which records that it
  reused an existing link, and by the teardown reporting nothing to remove.

No claim survives here that was not falsify-tested.

### The generic test

Not applicable in the usual sense: this item ships no new surface. What makes it
EventLinqs is the scope sentences themselves, which are about this platform's own
failures: a printed poster's QR code, a consent record that is evidence under the
Spam Act and by platform rule is never removed, an artist's credit for a sale
they drove, and the one admin screen where a person approves who gets written to.

### The AI-tell sweep

Em-dashes 0. En-dashes 0. Exclamation marks in user-facing copy 0. Banned word 0.
Tell lexicon 0 across the whole diff.

### The regression sweep (DESIGN-LOCK)

Nothing visual was changed. No hero, no spacing, no colour, no layout, no copy,
no chrome. The admin campaigns page is the only rendered file touched and only
its channel read changed; the markup below it is untouched.

One BEHAVIOUR change is deliberate and is stated rather than hidden: on a blinked
read, `/api/organiser/events/[id]/card/[format]` now answers 500 where it
answered 404, and the launch-kit page reaches its error boundary where it
rendered an empty caption list. Both are the point of the item. The genuinely
absent case is unchanged in all four places and is pinned by a test.

### The founder-cost test

No dashboard step is created and no question is asked that the code could answer.
The one founder step anywhere near this lane, AN1 acceptance 4, is pre-existing
and its verdict is IMPOSSIBLE rather than unscripted.

### The evidence-visibility test

Six screenshots at `C:/dev/EVIDENCE/LB-BLINKLINK/drive/`, two of them opened and
read during the run rather than merely produced. Drive log, both red proofs and
the drill output are files at named paths, and the two red-proof scripts are kept
beside their output so either can be re-run.

---

## Phase 4: the gate

NOT MET 0, PARTIAL 0, unresolved adversarial findings 0.

## Phase 5: decision evidence

One decision needed it: whether a blinked read on the consent path should refuse
the save or record the consent without its city.

- **Our code.** `src/lib/consent/record.ts` and the ledger tables. The platform's
  own rule, which this lane met head-on during LB-BLINKDOOR, is that a consent
  record is evidence and is never removed; the database refused a teardown's
  DELETE in those words.
- **Market and compliance.** The Spam Act consent record is the evidence a sender
  relies on. A record narrower than the answer given cannot be corrected once
  written to an append-only ledger.
- **Test plan.** The falsifier is the unit test that restores the pre-fix shape:
  it went red on the exact claim, and the drill holds the same line in the build.

The decision: refuse the save. A correct record or an honest refusal are the two
acceptable outcomes; a record the reader would not recognise as their own answer
is not one of them.

## Phase 6

```
ROAST GATE: PASSED
Requirements: 27. Met: 27. Partial: 0. Not met: 0.
Adversarial findings: 0 unresolved.
Ledger: docs/roast/lb-blinklink-2026-09-21.md
```
