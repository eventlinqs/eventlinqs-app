# Roast ledger: lane B, 20 September 2026, the three items after LB-DEMANDSIGNAL

Covers `LB-ORGWHOLE` (1a554cb9), the Law 5 verification pass (45d54ad5) and
`LB-RECOVERYWHOLE` (ab2902e7). LB-DEMANDSIGNAL has its own ledger at
`docs/roast/lb-demandsignal-2026-09-20.md`. Built from the lane B brief,
`C:\dev\BUILD-BRIEF.md` and the standing laws, before adjudicating.

## Phase 1 and 2: the ledger

| # | Requirement (source) | Verdict | Evidence |
|---|---|---|---|
| 1 | One item at a time, finished before the next begins (COMPLETION LAW) | **MET** | Three commits, each with its own tests, guard drills, drive and six green gate steps before the next began |
| 2 | Schema (COMPLETION LAW 1) | **NOT APPLICABLE, stated three times** | No migration in any of the three; nothing is the founder's except one decision, raised |
| 3 | Code typechecked and linted, no silent catch (2) | **MET** | typecheck and lint green on each. The silent catches were the subject: six discarded errors in LB-ORGWHOLE, four in LB-RECOVERYWHOLE |
| 4 | Tests, the suite grows (3) | **MET** | 13 + 10 new tests. 494/6528 to **496 files / 6551 tests**, 0 failed, 0 skipped |
| 5 | The canary baseline is raised in the same commit (3) | **NOT MET, deliberately** | Three-lane protocol; CLOSE-OUT LB1 acceptance 6 puts it in lane A's merge commit |
| 6 | A registered blocking guard proven red AND green, both outputs (4) | **MET** | 20 of 20 drills for the founder-screens guard, 11 of 11 for the recovery guard, 178 of 178 guards green after each |
| 7 | DRIVEN at 390, 768, 1440 with captures (5) | **MET** | 38 of 38 and 23 of 23, captures under `C:\dev\EVIDENCE\LB-ORGWHOLE` and `...\LB-RECOVERYWHOLE` |
| 8 | axe ZERO at EVERY impact level (6) | **MET** | Both drives assert `violations.length === 0`, not `serious`. Zero at all three widths on four screens |
| 9 | Full regression green AFTER the item (6) | **MET for lane B's six steps**; two pg drives could NOT run | `organiser-transition-e2e` and `aggregate-drift-drive` need `SUPABASE_DB_URL`, absent on this machine. NOT run, NOT claimed. The 10 tests my change broke in `proof.test.ts` were found by the suite and fixed |
| 10 | Fix every defect found before the next task (lane brief) | **MET** | Every one: the unbounded builder bound, the discarded errors, the cascade count, the three guard refusals on my own drive, and the ten broken tests |
| 11 | Never claim something works without driving it | **MET** | The one claim I could not drive before today, the 1,000-row ceiling, is now driven: 1,000 rows returned of 1,200 that exist |
| 12 | Never guess a slug, route or id; enumerate | **MET** | The busiest organiser, the busiest slot and the fixture city are all enumerated at run time; the founding cap is imported from source |
| 13 | Port 3100 only | **MET** | Every drive and the server |
| 14 | TEST rows carry lane-B; never truncate; leave as found | **PARTIAL, AND IT IS REPORTED AT THE TOP OF ITS OWN CLOSURE** | Swept after everything: 0 waitlist rows, 0 invites, 0 organisations, 0 events remain, and the borrowed slot is back to `source_ref 3fe6072b`. **1,200 `recovery_sends` rows are PERMANENT**, written by the first version of a drive into an append-only table. Reported, quantified, and the owner's remedy written out |
| 15 | Your slice, BORDER for anything else (lane brief) | **MET** | The four reads I took are the engine's OWN tables. The seven on the slot ledger are named and left. The one behaviour change inside a lane A file, `proofForSlot` no longer swallowing a ledger read's error, is a BORDER line naming the file and the line |
| 16 | Never push, never open a PR | **MET** | Four commits on `lane/b-growth`, nothing pushed |
| 17 | Never write the shared files | **MET** | Only `BUILD-LOG-B.md`, `REVIEW-QUEUE-B.md`, `LANE-B-CLOSED.md` and these ledgers |
| 18 | Disk logged at start and end of every item (BUILD-BRIEF) | **MET** | 16.5 to 15.2 to 11.9 GB, each recorded |
| 19 | Australian English, no dashes, no exclamation marks, no banned word | **MET** | `copy PASS` on every commit |
| 20 | Law 8, no AI trailer | **MET** | Four commit messages, none carries one |
| 21 | Law 7, nothing stated from memory | **MET, and it changed an answer** | The PostgREST question was left **UNSOURCED** rather than guessed, and the dependency on it removed. The postgrest-js `count` semantics came from the INSTALLED package's own types. The axe rule's exception came from Deque's own page, and it corrected something I had written an hour earlier |
| 22 | Law 10, a verdict on every founder step | **MET** | Two SCRIPTED-and-run, one genuine decision raised with the exact three lines |

## Phase 3: the adversarial pass

**Silent drops.** None found against this ledger. The 1,200 permanent rows are
the one thing a report could have quietly omitted, and it leads both the closure
block and the review queue entry rather than appearing at the bottom.

**Interpretation drift.** One, caught and reversed mid-item: the first
LB-RECOVERYWHOLE drive proved the ceiling by writing its own rows, which is the
easier thing, and the cost was permanent. The rewritten drive proves the same
fact out of rows that already exist and writes nothing.

A second, smaller: I began LB-ORGWHOLE expecting an accessibility defect on
`/admin/organisers` because it has the shape that failed on `/admin/network`. It
does not have the defect, and the temptation was to fix it anyway. Verified
instead, found the rule's own exception at Deque, and CORRECTED the note I had
sent lane C an hour earlier, which would have sent them through forty containers
on a wrong predicate.

**Unverifiable claim hunt.**

| Claim | What would falsify it | Tested |
|---|---|---|
| the ceiling silently truncates at 1,000 | a short read that reports itself | YES, twice: `Content-Range: 0-999/*` with no total on a real table, and 1,000 of 1,200 returned with `error` null on a slot |
| the paged read defeats it | it returns 1,000 too | YES, `factsFor` returns 1,200, and the panel renders 1200 at three widths |
| a failed read is now loud | it renders a zero | YES for the demand signal (photographed both ways). For `proofForSlot`, by unit test, because the raise cannot be induced in a browser without breaking the table |
| the organiser screens agree with the database | one row disagrees | YES, all 25 on page one, plus the busiest organiser's $2,347.30 across 63 orders |
| TEST is left as found | a row remains | YES, swept by name after everything: 0, 0, 0, 0, and the 1,200 that cannot be removed, reported |

**The generic test.** Every guard, drive and test names the EventLinqs surface
and the person harmed: the founder reading demand, the organiser reading their
recovery, the buyer written to twice.

**AI-tell sweep.** 0 em-dashes, 0 en-dashes, 0 exclamation marks in user-facing
copy, 0 banned words, 0 tell lexicon. `copy PASS` on each commit.

**Regression sweep.** Nothing outside the items was changed. The one existing
test file I edited, `proof.test.ts`, was edited because its fake client had to
model a paged read; its assertions are untouched.

**Founder-cost test.** One item on the founder's desk, and it is a genuine
decision rather than a task: whether to suspend an append-only trigger to remove
1,200 rows I put there. My recommendation is written beside it.

**Evidence-visibility test.** Captures and reports under
`C:\dev\EVIDENCE\LB-ORGWHOLE`, `...\LB-RECOVERYWHOLE` and `...\LB-LAW5`.

## Phase 4: the gate

Requirements: 22. Met: 19. Not applicable and stated: 1. Not met: 1 (the canary,
deliberately, lane A's at the merge). Partial: 1 (TEST left as found, reported
in full at the top of its own closure block). Unresolved adversarial findings: 0.
