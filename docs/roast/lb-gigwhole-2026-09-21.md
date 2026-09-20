# LB-GIGWHOLE self-audit ledger, 21 September 2026

The requirement ledger for the performer marketplace, written from the literal
text of the lane B brief, the COMPLETION LAW in `C:\dev\CLOSE-OUT.md`, and the
standing laws in `CLAUDE.md`. Written BEFORE adjudication.

The subject: `src/lib/marketplace/gigs.ts`, `src/app/actions/gigs.ts`, the
organiser gig board, the public board, the performer directory and the artist
profile, where a marketplace BLOCK failed open and an applicant list could
vanish.

---

## PHASE 1 AND 2: THE LEDGER, ADJUDICATED

### A. The lane rules

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| A1 | Work only in `C:\dev\lanes\B` on `lane/b-growth` | MET | every path written is under `C:/dev/lanes/B`; the branch is unchanged |
| A2 | Never push, never open a pull request | MET | no `git push`, no `gh pr` |
| A3 | Never write the shared files | MET | only `REVIEW-QUEUE-B.md`, `BUILD-LOG-B.md` and `LANE-B-CLOSED.md` were appended |
| A4 | Port 3100 only | MET | `LB_BASE_URL` defaults to `http://localhost:3100`; the owner of 3100 was identified as this worktree's own `next dev` earlier in the run and nothing was restarted |
| A5 | Every TEST row carries lane-B | MET | organisations `lane-b-gigwhole-org-<run>`, artists `lane-b-gigwhole-artist-<run>`, users `lane-b-gigwhole-*@eventlinqs.test` |
| A6 | Never touch another lane's row, never truncate | MET | every delete is keyed to an id or a `lane-b-gigwhole-` slug this run created |
| A7 | Lane B's slice only; a border goes to REVIEW-QUEUE-B.md | MET | the performer marketplace is lane B's (FO1, AQ3 and LB-ARTISTWHOLE were all lane B). No checkout, webhook, refund, slot-ledger, connected-account, notification-router or owner-digest file was touched. `src/lib/marketplace/notify.ts` was deliberately NOT edited and is raised as a BORDER |
| A8 | Priority order absolute | MET | accounted for line by line in the LB-INVITEWHOLE ledger earlier the same session: every named item DONE or blocked on the founder, CS1 not before 10 October |
| A9 | LANE-RETURNS.md first | MET | read at the start of the session; nothing is asked of lane B, and re-checked mid-session (the last "TO LANE B" entry is still the one of 20 September) |
| A10 | `git status` second | MET | run as the second action, clean |
| A11 | Six cheap gate steps, never lighthouse/build/parity | MET | see B10. The three reserved steps were not run |
| A12 | Never stop a process I did not start | MET | none stopped; no `Get-Process node`, no `taskkill` |
| A13 | Never read `C:\dev\leads` | MET | never opened |
| A14 | Production is not written; the CLI rests on TEST | MET | production read only through `scripts/lib/production-select.mjs`, which refuses any non-SELECT. The CLI remains linked to `vkapkibzokmfaxqogypq` |
| A15 | Disk above 10 GB, nothing deleted | MET | 12 GB through the item. No `.next`, `.turbo` or npm cache deleted, no `npm cache clean` |
| A16 | Delete traces and videos once read | MET | the drive records neither; the kept evidence is screenshots and logs |

### B. The COMPLETION LAW

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| B1 | One item at a time | MET | LB-GIGWHOLE only. The showcase reads in `src/lib/marketplace/showcase.ts` were FOUND and are named as the next item rather than folded in, so the boundary is stated rather than blurred |
| B2 | Schema | MET | `supabase/migrations/20260920000060_a_block_holds_when_the_read_blinks.sql`: `enforce_marketplace_block_on_application` and `enforce_marketplace_block_on_request`, with a trigger each. Applied to TEST and READ BACK: both triggers present in `pg_trigger`, `prosecdef` true, both function bodies carry `check_violation` |
| B3 | Measured before the constraint was written, both databases | MET | TEST 0 blocks / 7 applications / 2 requests / 0 applications from a blocked pair / 0 requests to one. Production 0 across all five. No row on either breaks the rule, so no repair statement |
| B4 | Code, typechecked, linted | MET | `--only typecheck` and `--only lint` (B10) |
| B5 | Tests | MET | `tests/unit/growth/a-marketplace-block-holds.test.ts`, 15 cases against a fake PostgREST server that can refuse and that has a real row ceiling |
| B6 | Canary raised in the same commit with the arithmetic | MET | `scripts/guards/test-count-canary.mjs` raised with the measurement and the arithmetic written out |
| B7 | A registered blocking guard | MET | `scripts/guards/a-marketplace-block-holds.mjs`, registered in `run-guards.mjs` (entry 2482, header list 659). 198 guards now, and `every-guard-has-been-seen-to-fail` PASSES |
| B8 | Proven to FAIL as well as pass | MET | 7 drills, one per clause, `C:\dev\EVIDENCE\LB-GIGWHOLE\drills.txt`: "7/7 drills fired correctly", "all guards PASS on the restored tree". Two plant the defect in its ORIGINAL form |
| B9 | Driven proof at 390, 768, 1440 | MET | `scripts/verify/lb-gigwhole-drive.mjs`, 34 of 34, TWICE consecutively. Twelve screenshots in `C:\dev\EVIDENCE\LB-GIGWHOLE\drive\` |
| B10 | Full regression green | MET | six gate steps on the committed tree, recorded in the closure block |
| B11 | Fix every defect found before the next task | MET | eleven fixed in this pass, listed in D |
| B12 | Never claim something works without driving it | MET | every claim traces to `results.json`, `drills.txt`, or a gate step's own output |
| B13 | Never guess a slug, route or id | MET | the gig id comes from the database after a real form post, the artist and organisation ids from their inserts' `.select()`, the form field ids read out of `post-gig-form.tsx` after the first run refused a malformed value, and the subject itself was enumerated by sweeping every unbounded read in `src/` |
| B14 | Zero placeholders | MET | no new copy string on any surface |

### C. The standing laws

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| C1 | Law 0: state the governing laws before editing | MET | stated at the start of the session and unchanged for this item |
| C2 | Law 1: no generic | MET | no new surface; every change is a read, a refusal path, or a comment |
| C3 | Law 5: verify by clicking what the user clicks | MET | the gig is posted through the real form, the application made through the real panel, and the BLOCK is pressed on the real applicants screen with the real confirm dialog accepted. The first version wrote the block row with the service role; the screenshot showed the control sitting there and it was changed to press it |
| C4 | Law 7: no third-party spec from memory | MET | the only external claim is the Supabase response ceiling, already cited in the code it justifies |
| C5 | Law 8: no AI authorship | MET | the commit message carries no trailer, no "Generated with", no robot emoji; `no-ai-authorship` is inside the 198 |
| C6 | Law 9: nothing pinned backwards | MET | no version changed |
| C7 | Law 10: the founder's step is SCRIPTED, RESERVED or IMPOSSIBLE | MET | one step: the production migration, RESERVED by the founder's own ruling and already one command, recorded in `REVIEW-QUEUE-B.md` |
| C8 | Copy gate | MET | `--only copy` PASS; the AI-tell sweep counts zero |
| C9 | The word "culture" is banned | MET | zero occurrences in anything this commit writes |
| C10 | Australian English | MET | organiser, organisation, behaviour throughout |
| C11 | Migrations: file written, TEST only from here | MET | applied to TEST through `apply-migration-to-test.mjs`, which refuses any project that is not TEST |
| C12 | Fee system untouched | MET | no fee value read or written. The `one-lawful-writer-of-the-fee` DRILL was repaired, which is a test of the fee guard and changes no fee code |
| C13 | Design system: inherit exactly | MET | no visual change at all in this item. No colour, token, font, spacing or layout value moved |
| C14 | axe zero violations | MET | 9 scans (board, applicants, public board, each at three viewports), 0 violations at ANY impact level, 23 to 28 passing checks each |
| C15 | Touch targets 44px or larger | MET | the Block control already carries `min-h-[44px]`; no control was added |

### D. The defects, and what each one was telling somebody

| # | Defect | Verdict | Evidence |
|---|---|---|---|
| D1 | `isPairBlocked` returned `Boolean(data)` over a discarded error, so a blink answered "not blocked" and both call sites read that as permission | MET | `readOrThrow`, plus two database triggers. Driven: the refusal is shown at all three viewports and zero applications are stored; the database answers 23514 to both an application and a booking request |
| D2 | The rule was a COMMENT. The migration that created `marketplace_blocks` on 11 July states it and nothing enforced it | MET | migration 20260920000060, verified back from `pg_trigger` and `pg_proc` |
| D3 | `fetchGigApplications` unbounded with its error discarded: "no applications yet" on a gig that has them | MET | `readEveryRow` on a total order. Test: 2,500 applications come back through a 1,000 ceiling; a refused read throws |
| D4 | The organiser's per-gig counts were ONE unbounded read across every gig, so the response cap was shared across the whole board, and a failure rendered every gig as 0 applicants | MET | paged on the primary key. Driven: the screen says one applicant and the database holds one, at all three viewports |
| D5 | The city picker was four copies of one read, all four writing `(result.data ?? [])` | MET | one reader, `src/lib/marketplace/cities.ts`, ordered on the table's PRIMARY KEY as the tiebreak (verified: `cities_pkey PRIMARY KEY (slug)`). Clause 6 sweeps the whole tree for a fifth copy. Driven: 7 options on the organiser form, 21 on the public board |
| D6 | `billing_order: count ?? 0` on accepting a booking: a failed count puts a support act at the TOP of the bill | MET | the tag is not written when the count cannot be taken, which is the same end state this block already accepted for a failed insert, and it is reported the same way |
| D7 | Ten further refusal-deciding reads in `src/app/actions/gigs.ts` each told somebody something false: "Gig not found", "Application not found", "Not your application", "Pick a city from the list", "That event is not yours", "needs an approved organiser account", "not open to mentoring right now" | MET | all routed through `readOrThrow` |
| D8 | Two notify reads discarded their errors, so an organiser was never told an application arrived and a performer was never told they had been offered work | MET | errors bound and reported; they may not throw because the primary write has already happened, and that is stated in the comment |
| D9 | FOUND BY MY OWN GUARD: `fetchOpenGigs` discarded its error, so a blink rendered the public board as a platform with no work on it | MET | bound and thrown, with the deliberate `.limit()` kept and explained |
| D10 | FOUND BY MY OWN GUARD: the artist profile's viewer check was `(count ?? 0) > 0`, so a blink hid the booking control from an organiser who does run a business | MET | `countOrRaise` |
| D11 | FOUND BY THE FULL DRILL HARNESS: my own guard's clause 5 matched `trg_marketplace_block_on_application` as a PREFIX, so a trigger renamed to `..._disabled` still satisfied it. The harness said so: "guard PASSED on a violating tree" | MET | anchored with `(?![A-Za-z0-9_])`; the drill now fires |
| D12 | FOUND BY THE FULL DRILL HARNESS: the `one-lawful-writer-of-the-fee` drill had gone quietly green, because LB-FEEARGS added a SECOND migration declaring `write_pricing_rule` and clause 4 fails only when NO migration declares it | MET, as a removal | Two repairs were TRIED and both failed, which is recorded in the drill file rather than reasoned about: repointing at the newer migration (either declaration satisfies the clause) and drilling the guard's own constant (the work report's "DID NOTHING" check fires first, so the run would prove that check rather than clause 4). The drill is removed with the full reason written where it stood, the guard keeps its six other drills, and `every-guard-has-been-seen-to-fail` still passes |

### E. Found AFTER this ledger was first written, by the gate rather than by me

| # | Defect | Verdict | Evidence |
|---|---|---|---|
| E1 | My drive flipped `gig_board` and SLEPT for the cache TTL. Lane B's own guard `a-drive-waits-for-a-cached-flag`, written after LB-FLAGCACHE, refused it: a sleep is a guess about somebody else's cache | MET | replaced with `waitForFlagToLand`, which reloads until the server agrees. The guard passes: "308 drive script(s), 5 write a feature flag, 2 wait for it to land" |
| E2 | The first waiter watched `/gigs` ALONE, and the very next run failed on "heading count 0": the public board was already 200 while `/dashboard/gigs` still answered its own `notFound()`. Two routes, two render paths, two cached reads | MET | the waiter requires `/gigs` 200 AND `/dashboard/gigs` not 404. Two consecutive runs at 34 of 34, both logging "gig_board has landed: /gigs answers 200, /dashboard/gigs answers 307". This also explains the earlier transient described below |
| E3 | My drive's organisation is `status: 'active'`, which `fixtures-are-not-published` refuses by default | MET | baselined with a CHECKED reason rather than an asserted one: the sitemap catalogue filters active organisations through `isOrganiserProfileIndexable`, which is `hasBiography \|\| isDiscoveryIndexable(eventCount, threshold)`, and this fixture has neither. The drive's own comment said something weaker and was corrected to say this |
| E4 | `tests/unit/seo/read-failure-is-not-not-found.test.ts` asserted an EXACT count of `readOrThrow(` calls per module, over the whole file, so it went red because MORE reads in `src/lib/marketplace/gigs.ts` were made safe | MET | the count is a floor now, with the reason written into the helper. A test that goes red when the code improves teaches people to edit the test |


---

## PHASE 3: THE ADVERSARIAL PASS

**Silent drops.** Every row above is named in the closure block or the build
log. The ones I would have been tempted to leave out, and have therefore
written in: D11 and D12, both of which are defects in MY OWN guards found by a
harness rather than by me, and the drive failure described below.

**Interpretation drift.** One place, named. The item could have been scoped to
"the unbounded reads in the marketplace", which is a morning's work and would
have left the block failing open, because that defect is not in a bound at all.
It is in `Boolean(data)`. The harder reading is the one built, and the database
half exists because an application-layer fix alone still leaves the rule a
promise.

A second: I nearly extended the item into `src/lib/marketplace/showcase.ts`,
which carries four more unbounded reads. It is a different surface, the
COMPLETION LAW says one item at a time, and folding it in would have made the
driven proof span two journeys. It is named as the next item instead.

**The match-versus-surpass test.** The brief for this item does not say
surpass. `/dashboard/gigs` is an authed organiser screen and
`docs/benchmark/competitor-2026/INDEX.md` carries no competitor dashboard, so
the benchmark gate is BLOCKED rather than skipped, on the same grounds as
LB-INVITEWHOLE. No layout was redesigned and no visual value moved.

**The unverifiable claim hunt.** Every claim and its falsifier:

- "a block holds when the read blinks" - falsified by an application from a
  blocked pair being stored. Driven at three viewports and asserted against the
  database, and separately asserted as a 23514 from a direct insert.
- "no applicant disappears" - falsified by the screen's count differing from
  the database's. Both are read in the same check, at three viewports.
- "every application comes back through the ceiling" - falsified by a short
  list. Tested against a fake server whose ceiling is real (the test asserts no
  response carried more than 1,000 rows).
- "the city picker has one reader" - falsified by a fifth inline copy anywhere
  in `src/`. Clause 6 sweeps the whole tree.
- "the flag was restored" - falsified by `gig_board` being true afterwards.
  Read back by name at the end of every run.
- "TEST is left as found" - falsified by a row remaining. Re-read by name.

One claim was DELETED during this pass: a draft of the log said the marketplace
"is now safe". It is not falsifiable and it is gone; what is provable is the
list above.

**The generic test.** The migration names marketplace_blocks, gig_applications
and booking_requests, and quotes the EventLinqs comment that stated the rule in
July. Not generic.

**The AI-tell sweep.** Counted across every file in the commit: em-dashes 0,
en-dashes 0, exclamation marks in user-facing copy 0, "culture" 0, and the tell
lexicon 0. The copy gate agrees.

**The regression sweep, DESIGN-LOCK.** Nothing visual changed in this item. No
hero, spacing, colour, chrome or copy string moved. The only user-visible
behaviour changes are refusals that used to be false statements.

ONE THING SEEN AND DELIBERATELY NOT CHANGED: at 390 the organiser's gig board
puts the "Post a gig" form ABOVE the list of posted gigs, because the list
carries `order-2 xl:order-1`. On a screen titled "Your gigs" that means a
phone user scrolls the whole form before seeing their gigs. It is a
pre-existing ordering decision, this item did not ask for it, and DESIGN-LOCK
says change only what the item asks. It is recorded in `REVIEW-QUEUE-B.md`.

**The founder-cost test.** One founder step, the production migration, which is
RESERVED to him by his own ruling and is one command. No question in the report
could have been answered by reading the code.

**The evidence-visibility test.** Twelve screenshots plus `results.json`,
`drive.log` and `drills.txt` under `C:\dev\EVIDENCE\LB-GIGWHOLE\`. The founder
can see the applicants screen, the board, the blocked refusal and the public
board at three viewports without reading a word.

**THE DRIVE FAILURE I AM NOT HIDING.** One run of this drive reported 13 of 21
and accused the product of losing an application. The apply control was simply
not on the page that run, `count()` was 0, the click was skipped, and the check
that followed read the absence as a lost application. It was transient: the two
runs before and the two runs after all found the control and applied
successfully. The instrument was changed rather than the conclusion: the drive
now names the page heading and the number of apply controls it found, and
photographs the page at that moment, so a recurrence accuses the harness
instead of the product. The drive has since been run twice consecutively at 34
of 34.

---

## PHASE 4: THE GATE

NOT MET: 0. PARTIAL: 0. Unresolved adversarial findings: 0. REFUSED: 0.

BLOCKED: 1.

- **The competitor benchmark gate.** `/dashboard/gigs` and
  `/dashboard/gigs/[id]` are authed organiser screens and
  `docs/benchmark/competitor-2026/INDEX.md` carries no competitor dashboard.
  Capturing one needs an organiser account inside a competitor's product. What
  would unblock it: such an account, or a founder ruling that an authed
  dashboard is out of the gate's scope. No layout was redesigned.

RAISED FOR ANOTHER LANE: 1. `src/lib/marketplace/notify.ts` carries two reads
that fail the same way (a duplicate-suppression read whose failure sends the
notification twice, and an unbounded push-subscription read), and the
notification router is lane C's territory, so it is a BORDER line rather than
an edit.

NAMED AS THE NEXT ITEM: `src/lib/marketplace/showcase.ts`, four unbounded reads
on the artist showcase and its share links.

---

## PHASE 5: DECISION EVIDENCE

### Decision: the block is enforced in the database, not only in the application

| Dimension | Evidence |
|---|---|
| Competitor | Not applicable: another platform's transaction boundaries are not observable |
| Market | Not applicable |
| Engagement | The person a block protects is the one who asked not to be contacted. The cost of failing open is not a wrong number on a screen; it is contact somebody refused |
| Trend | Not applicable |
| Our code | `marketplace_blocks` has carried a UNIQUE (organisation_id, artist_id) since 11 July and an index on it, so the trigger's lookup is one indexed probe. The application check is kept as well, because a raised constraint is not a sentence a performer can read, and the action translates it |
| Test plan | The metric is whether a row exists after an attempt by a blocked pair. The threshold is exact: zero. Measured three ways: through the screen at three viewports, and by two direct inserts that must answer 23514 |

### Decision: an unreadable count does not write a position on the bill

| Dimension | Evidence |
|---|---|
| Our code | The block already accepted "the lineup add did not happen" as an outcome, and logged it, for a failed insert. Skipping on a failed count gives that outcome one shape rather than two, instead of inventing a position |
| Test plan | Falsified by a performer appearing at billing_order 0 on an event they were added to late. Pinned by a source assertion that `billing_order: count ?? 0` never returns, read with comments stripped so the comment quoting the old line cannot satisfy it |
