# Brief roast: LB-ATTENDEEWHOLE, lane B, 20 September 2026

Commits `a6b6df96`, `16b3b5e0`, `2cecc56c` on `lane/b-growth`. Not pushed.
Evidence root `C:\dev\EVIDENCE\LB-ATTENDEEWHOLE`.

The ledger below was written from the literal text of the run brief and of
`C:\dev\BUILD-BRIEF.md`, not from a plan derived from either.

---

## Phase 1 and 2: the requirement ledger, adjudicated

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read `C:\dev\CLOSE-OUT.md` | MET | AN1 body read at lines 1364 to 1410; C19 line 374 |
| 2 | Read `C:\dev\BUILD-BRIEF.md` | **MET, BUT LATE. See adversarial finding A** | Read only during this roast, after the first commit |
| 3 | Continue the build | MET | Three commits |
| 4 | COMPLETION LAW: one item at a time | MET | One item |
| 5 | ... schema | N/A, STATED | No schema change needed or made. Recorded in the closure |
| 6 | ... code | MET | 6 source files, `src/lib/reporting/ordering.ts` new |
| 7 | ... tests, suite grows | MET | 25 new tests, 2 new files. Suite 513/6833 to 519/6907 |
| 7b | ... canary baseline raised in the same commit (BUILD-BRIEF clause 3) | **NOT MET, DELIBERATE. Finding B** | Standing lane B position, BORDER'd to lane A again |
| 8 | ... registered blocking guard, proven to fail AND pass | MET | `the-attendee-list-is-every-attendee.mjs`, 5 clauses, **7 of 7 drills red**, tree sha1-identical after. `drills.txt` |
| 9 | ... driven at 390, 768 and 1440 | MET | **51 of 51** at all three. `lb-attendeewhole-drive.txt`, 6 screenshots |
| 10 | ... full regression green | MET | typecheck, lint, copy, guards, types-drift, suite. Run twice |
| 10b | ... axe zero violations on affected surfaces (BUILD-BRIEF clause 6) | MET, **after finding a real defect** | Zero at every impact level, both screens, three viewports. Found `color-contrast` on 1,150 nodes first |
| 10c | ... build and Lighthouse | REFUSED, CORRECTLY | The run brief reserves both to lane A in terms |
| 11 | Fix every defect found before the next task | MET | 8 defects fixed, listed below |
| 12 | Never claim something works without driving it | MET | Every claim in the report maps to a check in a drive log |
| 13 | Never guess a slug, route or id | MET | Reads enumerated by the chain scanner; event and tier ids come from the fixture's own insert; guard scope directories checked to exist |
| 14 | Work only in `C:\dev\lanes\B` | MET | No `-C` to another lane, no other worktree touched |
| 15 | Never push, never open a pull request | MET | `git log origin/lane/b-growth..HEAD` is 3 |
| 16 | Never write the shared files | MET | Wrote only `BUILD-LOG-B.md`, `REVIEW-QUEUE-B.md`, `LANE-B-CLOSED.md` |
| 17 | Port 3100 only | MET | Listener verified as this worktree's own `next dev` before use, not restarted |
| 18 | lane-B tagged rows on TEST | MET | Every row under `lane-b-attendeewhole` |
| 19 | Never touch another lane's rows, never truncate | MET | Purge scoped to one slug prefix, never widened |
| 20 | Slice and the BORDER rule | MET | No file outside lane B's slice changed. Three BORDER notes written |
| 21 | Six gate steps before calling it done | MET | Twice, both times green |
| 22 | Do not run lighthouse, build or production-parity | MET | None run |
| 23 | Read `LANE-RETURNS.md` first | MET | Latest block to lane B: "Nothing is asked of lane B" |
| 24 | Priority order absolute | MET | All of FO1 to C19 closed or founder-blocked; AN1 open on a Law 10 IMPOSSIBLE only |
| 25 | Check DONE, git log and evidence before starting an item | MET | Checked before concluding the list was exhausted |
| 26 | `git status` as the second action | MET | First tool call of the run |
| 27 | Never kill a process I did not start | MET | 3100 was already running; verified, reused, not restarted |
| 28 | Never touch the marketing leads folder | MET | Never read or listed |
| 29 | Production untouched | MET | types-drift reads it only; CLI rests on TEST |
| 30 | Disk rules | MET | 13 GB at start, 12 GB at end. Nothing deleted, no cache cleaned |
| 31 | Update log, review queue and closed file | MET | All three written |
| 32 | `LANE-B-CLOSED.md` block with id, date, commit, criterion-by-criterion evidence | MET | 15-row acceptance table |
| 33 | Law 8, no AI authorship | MET | `commit-msg` hook accepted all three |
| 34 | Copy law: no em or en dashes, Australian English, no banned word | MET | Zero in the diff; the one `/cultures` hit is a pre-existing guard drill |

**The eight defects fixed, none of which were in the item as scoped except the
first:**

1. Six unbounded reads across the attendee, door-list and orders surfaces.
2. Two discarded errors in those same reads.
3. The order detail buyer profile, discarding its error: a real named buyer
   rendered as a blank row.
4. The waiting-list count using `count ?? 0`: a failed count read as "nobody is
   waiting" on a tier with a queue.
5. The door review keeping whichever admission arrived first from an unordered
   query, so "the scan that beat this one" was undefined.
6. `Total Orders` printing `1150` beside a tile printing `1,150`, and a revenue
   panel printing `AUD 28750.00` below a tile printing `AUD 28,750.00`.
7. A separator left dangling at 390 when the event title wrapped.
8. `text-gold-500` on the "View" link of every order row: a serious
   colour-contrast violation on 1,150 nodes, and a named Design system law.

---

## Phase 3: the adversarial pass

**A. I did not read `BUILD-BRIEF.md` before starting, and it changed the work.**
The run brief names two documents. I read one. `BUILD-BRIEF.md` carries the
Completion Law in full, and its regression clause requires axe zero violations
on affected surfaces. I had changed markup on two organiser screens and had not
run axe. Running it found a serious colour-contrast violation on 1,150 nodes
that had been shipping. **RESOLVED** (read, acted on, fixed, re-driven), and
recorded because the failure is the process one: had this roast not run, a real
defect would have shipped and the requirement would have been silently dropped.
That is the exact failure mode this gate exists for, and it caught it.

**B. The test-count canary baseline was not raised.** BUILD-BRIEF clause 3 asks
for it in the same commit. Lane B has not raised it, for the standing reason
recorded across several runs: the file is the shared spine named in CLOSE-OUT
LB1 and the most frequent conflict in `LANE-CONFLICTS.md`, and a pair measured
from lane B alone is a floor below the truth the moment lane C's branch merges.
The canary PASSES, because a baseline is a floor. **UNRESOLVED BY DESIGN**, and
it is lane A's to write from the merged tree. BORDER'd again.

**C. Interpretation drift.** None found. The item was scoped to three
directories rather than to all 202 unbounded reads, which is the Completion
Law's own "one item at a time" rather than a substitution; the remaining 202 are
enumerated by owner and handed over rather than described.

**D. Match versus surpass.** Not applicable. No competitor capability was in
scope. The data-ownership promise this item repairs is the growth plan's stated
structural advantage over DICE, which withholds attendee emails, and over
Eventbrite, which limits them; this item does not extend that claim, it stops
the platform from quietly failing it.

**E. The unverifiable claim hunt.** One found and fixed. The report claimed
"212 unbounded reads fell to 202" using a throwaway script that had been
deleted, so the reader could not check it. `scripts/verify/unbounded-read-census.mjs`
now reproduces it with one command (`2cecc56c`). While writing that commit I
then quoted per-lane totals derived by adding rows up by hand, and two of the
four were wrong; caught against the script's own summary and corrected before
anything was pushed. Every other claim maps to a named check in a drive log.

**F. The generic test.** No new user-facing design was introduced. The three
presentational fixes each move a surface toward an existing platform rule
(en-AU grouping, the gold-800 text tier) rather than inventing anything.

**G. The AI-tell sweep.** Zero. Swept the full diff for em-dashes, en-dashes,
exclamation marks in user-facing copy, the banned word, and the tell lexicon.
The single `culture` hit is a pre-existing drill that deliberately plants
`/cultures` to prove a guard fires.

**H. The regression sweep, DESIGN-LOCK.** Three visual changes were made that
the item did not ask for, declared rather than buried: thousands separators on
five tiles and the revenue panel, a separator hidden below `sm`, and the gold
tier on the order link. None touches the locked home-rebuild design; each fixes
a stated law or an inconsistency visible on one screen at one time. Nothing else
was changed.

**I. The founder-cost test.** No new founder step is created. No question is
asked that could have been answered by reading the code. No migration.

**J. The evidence-visibility test.** Six screenshots, four drive logs, a drill
log and a counter-proof log, all at named paths under
`C:\dev\EVIDENCE\LB-ATTENDEEWHOLE`. The exports were downloaded and parsed
rather than described: CSV row counts, an XLSX opened with ExcelJS, a PDF opened
with pdf-lib.

---

## Phase 4: the gate

Not met: **1** (item 7b, the canary baseline, deliberate and lane A's to write).
Partial: 0. Unresolved adversarial findings: **1** (finding B, the same item).

Finding A is resolved. Finding E is resolved.

The one open item is a standing inter-lane position, not an incomplete build,
and it is recorded in `REVIEW-QUEUE-B.md` for the lane that owns the merged
number.
