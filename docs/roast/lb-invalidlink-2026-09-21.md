# Self-audit: LB-INVALIDLINK, 21 September 2026

Three pages a person reaches by following a link out of their own inbox. Each
looked a token up, discarded that read's error, and therefore answered a dropped
socket with a sentence about the link: "This link is not valid ... It may have
already been used." The first of the three is the Spam Act unsubscribe facility.

The ledger below was written before adjudication began. It is the same 27-row
brief as `lb-blinklink-2026-09-21.md`, so the rows that are identical in both are
adjudicated by reference rather than re-argued, and only what DIFFERS for this
item is set out at length.

---

## Phase 1: the requirement ledger

The brief is unchanged from the item before it in this session: 20 rows from the
session brief (read the close-out, the COMPLETION LAW, fix defects found, never
claim without driving, never guess an id, stay in the worktree, never push,
never write the shared files, append a closure block, port 3100 and lane-B rows,
the border, the six gate steps, read the returns, the priority order, close
rather than redo, git status second, the shared machine, production untouched,
disk, update the three lane files) and 7 standing laws (Australian English and no
dashes, no exclamation marks in user copy, the banned word, no placeholders,
Law 8 authorship, DESIGN-LOCK, Law 5).

---

## Phase 2: adjudication

**Rows identical to the previous item and MET on the same evidence:** 1, 5, 6, 7,
8, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25. The priority order was checked
once at the start of the session and has not changed; the returns file was read
once and adjudicated there.

The rows that differ, or that this item must prove again on its own evidence:

| # | Verdict | Evidence |
|---|---|---|
| 2 COMPLETION LAW | MET | Schema N/A and stated. Code: three reads through readOrThrow. Tests: 19 in one new file, five driven red. Guard: three directories added, 31 drills fire. Driven proof: 23 of 23 at 390, 768 and 1440. Regression: all six gate steps green. |
| 3 Fix every defect found | MET | Four found and fixed in this pass, listed in Phase 3. Two of them were in my own work and one was in the drive's first attempt. |
| 4 Never claim without driving | MET | `C:/dev/EVIDENCE/LB-INVALIDLINK/drive.log`, 23 of 23, twelve screenshots, one read back as an image. Both directions on the organiser door, the live direction on all three. |
| 9 Closure block | MET | Appended to LANE-B-CLOSED.md with one line per acceptance criterion. |
| 10 Port 3100 and lane-B rows | MET | `BASE` defaults to 3100. The organiser consent row carries `lane-b-invalidlink-<nonce>` in its email. The waitlist door writes nothing. The `event_artists` row CANNOT be tagged and that gap is stated in Phase 3 rather than glossed. |
| 11 The border | MET | All three directories are lane B's: consent twice and the performer invite, which is the marketplace layer this lane already owns through `src/lib/marketplace`. Nothing in another lane's territory was edited. |
| 12 Six gate steps | MET | typecheck 10s, lint 51s, copy 1s, guards 201s (206 of 206), types-drift 22s, suite 119s at 546 files and 7,352 tests, 0 failed, 0 skipped. |
| 19 Disk | MET | 9.2 GB free, above the 8 GB stop line. This item's evidence is about 1.5 MB. Nothing deleted. |
| 26 DESIGN-LOCK | MET | No markup, spacing, colour, copy or layout changed on any of the three pages. Only the read above the markup. The not-valid branch is untouched and is pinned by a test. |
| 27 Law 5 | MET | This item is Law 5 applied to links people follow out of an email. Both directions are driven: a live token renders the live page, an absent token still renders the explanation. |

**Not met: 0. Partial: 0. Refused: 0. Blocked: 0.**

---

## Phase 3: the adversarial pass

### Defects found on the way and fixed in the same pass

1. **TWO OF MY OWN ASSERTIONS WERE PASSING ON A COMMENT.** The test asserted
   `toContain('This link is not valid')`, and the comment I had written above the
   read QUOTES that sentence to explain the defect. So the assertion was green on
   the comment, and deleting the rendered heading would not have failed it. Found
   because the red proof could not plant its fifth case: the string matched twice.
   A red proof that cannot aim is the only thing that catches this. Both
   assertions of that shape now match the JSX.

2. **THE DRIVE HUNG ITS ROW OFF ANOTHER LANE'S FIXTURE.** The first run seeded
   its consent against "Refund Proof Presents lane-a-r1-...". Nothing broke,
   because the row was this lane's and was removed, but a drive that depends on
   another lane's row goes red the day that lane tidies up. This is the SAME
   lesson recorded during LB-EMPTYPROFILE, so it is applied rather than learned
   twice: the drive prefers an untagged organisation and prints which it used
   ("Afrobeats Melbourne").

3. **THE DRIVE'S SEED WAS REFUSED BY A CONSTRAINT IT HAD NOT READ.**
   `event_artists` is unique on (event_id, artist_id) and the first seed reused
   an existing pair. The database refused it, which is the constraint doing its
   job on a careless seed. It now SEARCHES for a pair that does not exist yet.

4. **MY OWN TEARDOWN REPORTED THE SAME SUCCESS TWICE.** On the failure path
   `main()` reached teardown through both the `finally` and the `catch`, so a
   count a reader relies on was inflated. It is idempotent now.

### Interpretation drift

One, stated rather than hidden. The previous item photographed the happy path
and drove the blink in-process. Here all three reads live inside Next page
components, which cannot be called from a script, so there is NO in-process half
available and no photograph of a blink is possible at all. The easier move was to
describe the browser captures as though they covered the blink. They do not, and
the drive's own header, the closure block and this ledger all say so. What holds
the blink instead: the registered guard, four drills that restore each defect and
watch the guard refuse, and five plantings driven red against the tests.

### Silent drops

Every ledger row is adjudicated above, by name or by the explicit
identical-to-previous-item reference. None is unmentioned.

### The unverifiable claim hunt

- "Three reads." Falsifiable by the scope sweep: each of the three directories
  reports 0 faults where it reported 1.
- "The guard fails as well as passes." Falsifiable by the drill harness: 31 of 31
  fired, and "all guards PASS on the restored tree".
- "The tests catch it." Five plantings driven red, listed by name in
  `red-proof.txt`, and the fifth only became a proof after it exposed a weak
  assertion.
- "It writes almost nothing and cleans up." Falsifiable by the teardown, which
  READS each row back after deleting it, and by the log line recording that the
  waitlist door reused a real row.
- "Nothing else regressed." 546 files, 7,352 tests, 0 failed; 206 of 206 guards.

### The AI-tell sweep

Em-dashes 0, en-dashes 0, exclamation marks in user-facing copy 0, banned word 0,
tell lexicon 0 across the diff.

### The regression sweep (DESIGN-LOCK)

No visual change. The only behaviour change is the intended one: on a blinked
read these three pages now reach an error boundary instead of publishing a false
sentence about somebody's link. The genuinely-absent case is byte-identical and
is pinned by three tests.

### The honest gap in the tagging rule

The brief says every TEST row created carries `lane-B` in its name, slug, email
or reference. The `organiser_marketing_consents` row does, in its email. The
`event_artists` row CANNOT: every column on that table is a uuid, a number or an
enum, and there is no free text to put a lane name in. Instead it is minted
against a pair that did not exist, its id is remembered, and it is deleted in a
`finally` with the delete verified by reading. Stated here because a rule that
cannot be met should be reported, not quietly skipped.

### The founder-cost test

No dashboard step created, no question asked that the code could answer.

### The evidence-visibility test

Twelve screenshots at `C:/dev/EVIDENCE/LB-INVALIDLINK/drive/`, one read back
during the run. Drive log, drive run output, red proof and drill output are all
files at named paths.

---

## Phase 4: the gate

NOT MET 0, PARTIAL 0, unresolved adversarial findings 0.

## Phase 5: decision evidence

One decision needed it: whether a blinked token lookup on an unsubscribe page
should throw, given that a throw on a page is an error boundary rather than a
designed state.

- **Our code.** `src/lib/supabase/read-or-throw.ts` settles it in its own header:
  thrown above a loading boundary it is a 500, inside one the error boundary
  renders, and "either way the reader is told to try again and is never told the
  thing does not exist."
- **Compliance.** The Spam Act unsubscribe facility has to work. Telling a person
  their live link has already been used is not a working facility, and it is
  worse than an error because it ends their attempt.
- **Our code, again.** The waitlist page's own header already states the
  requirement: every link already sitting in an inbox has to keep working.
- **Test plan.** The falsifier is the restoration: three of them went red on the
  exact claim, and four drills hold the same line in the build.

## Phase 6

```
ROAST GATE: PASSED
Requirements: 27. Met: 27. Partial: 0. Not met: 0.
Adversarial findings: 0 unresolved.
Ledger: docs/roast/lb-invalidlink-2026-09-21.md
```
