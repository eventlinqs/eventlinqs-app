# LB-DRAWSORT self-audit ledger, 21 September 2026, lane B

The item: `/artists?sort=draw` offers "Strongest draw first" and ranked only the
alphabetically first 48 performers, and placed performers who had not consented
to publishing their draw by that hidden number.

Ledger written before adjudicating, from the brief verbatim rather than from
memory of it.

---

## Phase 1: the requirement ledger

### From the session brief

| # | Requirement |
|---|---|
| 1 | Read `C:\dev\CLOSE-OUT.md` and `C:\dev\BUILD-BRIEF.md` and continue the build |
| 2 | CLOSE-OUT.md is authoritative |
| 3 | COMPLETION LAW: one item at a time |
| 4 | ... finished with schema |
| 5 | ... code |
| 6 | ... tests |
| 7 | ... a registered blocking guard proven to fail as well as pass |
| 8 | ... driven proof at 390, 768 and 1440 |
| 9 | ... plus full regression green, before the next begins |
| 10 | Fix every defect you find before starting the next task |
| 11 | Never claim something works without driving it |
| 12 | Never guess a slug, route or id; enumerate it from source or the database |
| 13 | Work only in `C:\dev\lanes\B`, branch `lane/b-growth`; never `git -C` another lane |
| 14 | Never push, never open a pull request |
| 15 | Never write the shared files (CLOSE-OUT, CLOSE-OUT-DONE, CLOSE-OUT-NEXT, BUILD-LEDGER, BUILD-LOG, REVIEW-QUEUE, DEPLOY-STATE, push-attempt.log, BUILD-COMPLETE) |
| 16 | Append a closure block to `LANE-B-CLOSED.md`: item id, date, commit hash, one line per acceptance criterion with the evidence path |
| 17 | Own port 3100 and nothing else; every driven proof there |
| 18 | Every TEST row carries `lane-B`; never touch another lane's rows; never truncate a table |
| 19 | Work only lane B's slice; a change in another lane's territory is a BORDER line, not an edit |
| 20 | Before calling an item done run six gate steps: typecheck, lint, copy, guards, types-drift, suite |
| 21 | Do NOT run lighthouse, build or production-parity |
| 22 | Read `LANE-RETURNS.md`; if it names my branch that work is first |
| 23 | Second action every run: `git status`; never discard uncommitted work |
| 24 | Priority order FO1, GA1 v3, GA2, GA3, GA4, GA5, OL1, AN1, PL1, C19; CS1 not before 10 October |
| 25 | Before starting an item read CLOSE-OUT-DONE.md, git log and the evidence directory; close rather than redo |
| 26 | Do not restart C1 to C10 or the F items |
| 27 | Never stop, kill or restart a process I did not start; never `Get-Process node` or `taskkill` |
| 28 | Never read, edit or delete anything under `C:\dev\leads` |
| 29 | Production Supabase `gndnldyfudbytbboxesk`: no writes without new approval; CLI rests linked to TEST |
| 30 | Do not delete `.next`, `.turbo` or the npm cache above 10 GB free; never `npm cache clean`; stop under 8 GB |
| 31 | Africa is deferred |
| 32 | After each item update build log, review queue and closed file, and commit them |

### From `C:\dev\BUILD-BRIEF.md` (the COMPLETION LAW's source)

| # | Requirement |
|---|---|
| 33 | Schema: migration written, applied to TEST, verified by querying it back |
| 34 | Code: built, typechecked, linted, no silent catches |
| 35 | Tests: real tests added, the suite grows, the canary baseline raised IN THE SAME COMMIT |
| 36 | Guard proven to fail against the broken state and pass against the fixed one, BOTH outputs shown |
| 37 | Driven in a real browser at 390, 768 and 1440 with screenshots under `C:\dev\EVIDENCE\<item-id>\` |
| 38 | Regression: axe zero violations at every impact level on affected surfaces |
| 39 | PRODUCTION read only; every migration to TEST only; read the project ref BACK before every supabase command |
| 40 | Australian English, no em dashes, no en dashes, no hyphens surrounded by spaces |
| 41 | Lawal is sole author: zero AI trailers in every commit |
| 42 | Log free disk at the start AND the end of every item |
| 43 | Run the brief-roast skill and record the verdict with evidence paths |
| 44 | CLOSE-OUT.md overrides any earlier ordering in that brief |

### Standing constitution rules that bind every task

| # | Requirement |
|---|---|
| 45 | Law 0: state the governing laws before editing |
| 46 | Law 1: nothing generic, no placeholders |
| 47 | Law 5: zero dead links and no dead-end tiles |
| 48 | Law 7: no third-party specification from memory; cite or mark UNSOURCED |
| 49 | Law 8: no AI authorship trailer |
| 50 | The word "culture" is banned in every form |
| 51 | DESIGN-LOCK: change only what the item asks |
| 52 | Definition of Done: no partial ship, no placeholder, real data, QA pass |

---

## Phase 2: adjudication

| # | Verdict | Evidence |
|---|---|---|
| 1 | **MET, LATE, AND THE LATENESS IS THE FINDING** | `CLOSE-OUT.md` was read first. `C:\dev\BUILD-BRIEF.md` was NOT read until the roast gate forced it, which is the second consecutive run in which the first line of the brief was the line that was skipped (the previous session's own commit `327777d4` says so in its subject). Nothing in it changed the work: it points at CLOSE-OUT.md as authoritative and supplies the COMPLETION LAW, which was already being followed. Two of its clauses were being met only by accident and are now met on purpose: the canary raise in the same commit (35) and the disk log at both ends (42). |
| 2 | MET | Items taken from CLOSE-OUT.md and CLOSE-OUT-DONE.md, never from memory |
| 3 | MET | One item. Nothing else started |
| 4 | MET | `supabase/migrations/20260921000010_the_directory_ranks_the_platform_not_the_alphabet.sql` |
| 5 | MET | `src/lib/marketplace/showcase.ts` (`fetchDirectoryArtistsRankedByDraw`, the first-claim rule), `src/app/artists/page.tsx` |
| 6 | MET | `tests/unit/growth/the-directory-ranks-the-platform.test.ts` (18 cases) plus 2 in `tests/unit/growth/a-performers-proof-of-draw-is-whole.test.ts` |
| 7 | MET | `scripts/guards/the-directory-ranks-the-platform.mjs`, registered in `run-guards.mjs`, 7 drills in `guard-failure-drills.mjs`, all fired RED and the restored tree GREEN (`12/12 drills fired correctly`, `all guards PASS on the restored tree`) |
| 8 | MET | `C:\dev\EVIDENCE\LB-DRAWSORT\drive\` holds `desktop-1440`, `tablet-768` and `mobile-390` captures of the ranked page, the profile the first card leads to, and the unranked page. 39 of 39 checks passed |
| 9 | MET | typecheck PASS 9s, lint PASS 130s, copy PASS 1s, guards PASS 157s (202 of 202), types-drift PASS 22s, suite PASS 108s (535 files, 7145 tests, 0 failed, 0 skipped) |
| 10 | MET | Two defects found during this item were fixed inside it rather than deferred: the guard's clause five passed on a violating tree (found by the red drill) and the drive's selector counted the global `MobileBottomNav` list. Neither was left for later |
| 11 | MET | Nothing is claimed that the drive did not assert. The counter-proof (that the old read never reached the headliner) is MEASURED in the run, not argued |
| 12 | MET | The flag name, the page bound, the filter columns and the function name all come from source or from the database. The performer ids are enumerated from the rows the drive itself wrote |
| 13 | MET | Every command run from `C:\dev\lanes\B`. No `git -C` |
| 14 | MET | No push, no pull request |
| 15 | MET | `C:\dev\CLOSE-OUT.md` and the other eight were read only |
| 16 | MET | Block appended to `C:\dev\LANE-B-CLOSED.md` |
| 17 | MET | `BASE http://localhost:3100` in the drive log |
| 18 | MET | Every row carries `lane-b-drawsort`; teardown re-read reports 0 performers, 0 links, 0 tracked rows; no table truncated. Pre-existing TEST rows (Marlo Reyes and four others) were READ and never written |
| 19 | MET, with one note | Nothing in lane A's money path or lane C's notification router was touched. The shared gate files (`run-guards.mjs`, `guard-failure-drills.mjs`, `test-count-canary.mjs`) were appended to, which is how every lane registers a guard. `src/types/database.ts` is shared and is noted in REVIEW-QUEUE-B.md |
| 20 | MET | All six, listed at row 9 |
| 21 | MET | lighthouse, build and production-parity were not run |
| 22 | MET | Read. The newest entry to lane B is "YOUR NEWEST TWO COMMITS ARE HELD", which asks nothing of this lane |
| 23 | MET | `git status` ran second and reported a clean tree |
| 24 | MET | Every one of the ten is closed or blocked on somebody else: AN1 and AQ3 on the founder's Search Console step, AQ2 on lane A's `squad-checkout.ts`, CS1 not before 10 October. Verified against CLOSE-OUT.md bodies rather than believed |
| 25 | MET | CLOSE-OUT-DONE.md, `git log` and `LANE-B-CLOSED.md` all read before starting |
| 26 | MET | None restarted |
| 27 | MET | The dev server on 3100 was already running and was used, not restarted. No process killed |
| 28 | MET | `C:\dev\leads` never read or listed |
| 29 | MET | One production read, SELECT-only through `scripts/lib/production-select.mjs`, recorded in the migration header. `supabase/.temp/project-ref` read back as `vkapkibzokmfaxqogypq` before the write, and the drive refuses to run unless the URL is TEST |
| 30 | MET | Nothing deleted, no cache cleaned |
| 31 | MET | Not touched |
| 32 | MET | `BUILD-LOG-B.md`, `REVIEW-QUEUE-B.md`, `LANE-B-CLOSED.md` updated and committed |
| 33 | MET | Applied through `scripts/verify/apply-migration-to-test.mjs --via-api`, then queried back: `directory_artists_ranked_by_draw()` returns Marlo Reyes 4 then four non-consenting performers at 0 |
| 34 | MET | typecheck and lint green; no `catch` added anywhere in this item |
| 35 | MET | `MIN_FILES` 534 to 535 and `MIN_TESTS` 7125 to 7145 in the same commit, with the arithmetic and the one rewritten assertion declared in the canary's own header |
| 36 | MET | Both outputs shown: the red half named each clause's refusal sentence, the restored tree reported `all guards PASS` |
| 37 | MET | Nine full-page captures under `C:\dev\EVIDENCE\LB-DRAWSORT\drive\` |
| 38 | MET | axe 0 violations at any impact level, on both pages, at all three viewports: 12 axe assertions in the run |
| 39 | MET | See row 29 |
| 40 | MET | Swept: 0 em dashes, 0 en dashes, 0 prose hyphens surrounded by spaces across all six changed or added files. The ten ` - ` matches are arithmetic minus operators and the house `PASS - N` guard convention. `copy` gate PASS |
| 41 | MET | Commit message carries no trailer; `no-ai-authorship` guard is in the 202 that passed |
| 42 | MET | 10.7 GB at the start, logged in `BUILD-LOG-B.md`; end figure logged in the same place |
| 43 | MET | This file |
| 44 | MET | CLOSE-OUT.md was followed |
| 45 | MET | Stated in session before the first edit |
| 46 | MET | No placeholder, no stub. The ranking is real and charged against real rows |
| 47 | MET, BY CLICKING | First adjudicated from the fact that no href changed, which is an inference and the law does not accept one. The drive now FOLLOWS the first ranked card: `/artists/lane-b-drawsort-zenith-headliner-...` answers 200 and names the performer 4 times, at 1440, 768 and 390 |
| 48 | MET | One third-party claim is relied on, the Supabase 1,000-row ceiling, and it is cited with its URL and fetch date in the module and guard that already carried it. No new external specification is asserted |
| 49 | MET | See row 41 |
| 50 | MET | 0 matches for `cultur` in every file this item touched |
| 51 | MET, and tested | The unranked `/artists` order is asserted UNCHANGED at all three viewports (`is-still-ordered-by-name`), which is DESIGN-LOCK made executable rather than promised. No colour, spacing, hero, chrome or copy was altered |
| 52 | MET | Driven on real rows, 39 of 39, nothing partial |

**Count: 52 requirements. MET 52. PARTIAL 0. NOT MET 0.**

Row 1 is MET but is recorded as a process failure, not a clean pass.

---

## Phase 3: the adversarial pass

**Silent drops.** Compared the ledger against the report draft. The report did not
mention rows 1, 35, 40, 42 or 51. Row 1 is now the first thing in the report. The
other four are added.

**Interpretation drift.** One real instance, and it was caught rather than
shipped. The cheap reading of "the sort ranks the wrong 48" is "raise the page
bound", which would have looked like a fix, passed every check, and left the
defect intact at 500 performers. The second cheap reading is "sort in JavaScript
after reading every artist", which is correct and would put an unbounded read of
every performer, every share link and every click on a public `force-dynamic`
page. The bound had to move behind the rank, which meant the rank had to become a
query. Recorded because both easier tasks were available and one of them was
briefly attractive.

A second, smaller one: the disclosure half was not in the item as I first framed
it. "Rank by draw" is the obvious reading and it is the reading that publishes a
withheld number by position. Widening to the published draw was a decision, and
it is written into the migration header rather than made silently.

**Match versus surpass.** The brief did not say surpass for this item and no
competitor capability is claimed. Not applicable, stated rather than skipped.

**The unverifiable claim hunt.**

| Claim | What would falsify it | Tested |
|---|---|---|
| The old code ranked only an alphabetical prefix | the headliner appearing in a 48-row name-ordered read | YES, measured in the run: "the last one it reached was Lane B Drawsort Filler 046" |
| The new code ranks the platform | the first card not being the strongest published draw | YES, at three viewports |
| The order and the badge agree | a badge larger than the one above it | YES, `the-badges-never-increase-down-the-page`, three viewports |
| Consent gates the position | the withheld performer ranking above a published one | YES, position 5 against position 3, three viewports, with 35 unconsented tickets against 2 published |
| The guard would catch a regression | the guard passing on a broken tree | YES, seven drills, and one of them CAUGHT THE GUARD ITSELF being blind |
| The unranked page is unchanged | a different first card | YES, "Aurora Skies" at three viewports |
| Every ranked card is a working link | the first card's target not answering 200 | YES, followed at three viewports, 200 with the performer named |
| Nothing is left on TEST | a row surviving the teardown | YES, re-read reports 0, 0, 0 |

No claim survives that was not falsifiable and tested.

**The generic test.** The ranking key is EventLinqs' own: attributed tickets
through this platform's share-link spine, gated by the performer's own
`draw_consent`. No other product has that column or that chain.

**The AI-tell sweep.** 0 em dashes, 0 en dashes, 0 prose spaced hyphens, 0 banned
words, 0 tell-lexicon hits, 0 exclamation marks in user-facing copy, 0 occurrences
of the banned community word in any form, across all six files.

**The regression sweep.** DESIGN-LOCK: nothing visual changed. The only file with
rendered output is `src/app/artists/page.tsx`, where the diff is the read that
supplies `artists` and the deletion of the JavaScript sort. No hero, spacing,
colour, layout, copy or chrome was touched, and the unranked page's order is
asserted unchanged at all three viewports.

**The founder-cost test.** This item adds no founder step of its own. The
migration reaches production through his existing `npm run migrate:production`,
which is Law 10 RESERVED rather than an unscripted step. No question is asked
that the code could answer.

**The evidence-visibility test.** Nine full-page captures at
`C:\dev\EVIDENCE\LB-DRAWSORT\drive\`, plus `drive.log` and `results.json` with
every assertion and its measured detail. The ranked page's top row is visible in
the capture as 18, 4, 2 tickets driven with the withheld performer unbadged
below them.

**Unresolved adversarial findings: 0.**

---

## Phase 5: decision evidence

Two decisions were made inside this item.

**Decision one: rank in the database rather than in JavaScript.**

| Dimension | Evidence |
|---|---|
| Our code | `src/lib/marketplace/showcase.ts:157` bounds at 48 ORDER BY name; `src/app/artists/page.tsx` sorted after. The alternative, reading every performer and every tracked row per request, is the shape `scripts/guards/no-silent-row-ceiling.mjs` was written against |
| Test plan | The metric is the first card's identity against the platform maximum, at three viewports, with a fixture larger than the page bound. The threshold is exact equality. It is `scripts/verify/lb-drawsort-drive.mjs` |
| Competitor | NOT GATHERED, and stated rather than skipped. How Eventbrite or Bandsintown order a performer directory is not the question here: the defect is that a stated order was not the order delivered, which is a correctness question rather than a design one |
| Market / Engagement / Trend | Not applicable to a correctness fix; no design choice was made from them |

**Decision two: the rank key is the PUBLISHED draw, so consent gates position.**

| Dimension | Evidence |
|---|---|
| Our code | `src/app/artists/page.tsx` renders the badge only under `artist.draw_consent`, so consent already gates the number. Ranking on the ungated number published its rank anyway |
| Test plan | The metric is the position of a non-consenting performer carrying more attributed tickets than the consenting leader. The threshold is that she ranks below a performer with two published tickets. Driven, three viewports |
| Competitor | Not applicable: this is a consent decision on a field this platform invented |
| A/B test | None. This is not a preference to optimise, it is a disclosure rule |

---

## Phase 4: the gate

NOT MET + PARTIAL + unresolved adversarial findings = **0**.

ROAST GATE: PASSED.
