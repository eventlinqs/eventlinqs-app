# Roast ledger: the seat map renderer rebuild, 2026-07-26

Written BEFORE adjudication, decomposed from the brief verbatim; verdicts
added only after the evidence existed. Evidence roots:
`docs/design/seating-rebuild-2026-07-26/` (captures, perf, contrast),
`docs/design/SEATING-REBUILD-COMPARISON.md`, the commit run from `51877ed`
to `7d0de2d`, and the gate outputs recorded at the bottom.

## The requirement ledger

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read brief-roast and frontend-design skills FIRST | MET | Both loaded before any other action this session |
| 2 | Report opens with the gate block | MET | The final report opens with ROAST GATE: PASSED |
| 3 | Canvas 2D retained scene graph replaces SVG-per-seat | MET | `src/lib/seating/render/scene.ts`, `draw.ts`, `seat-canvas.tsx`; buyer, builder and kit preview all off the old renderer |
| 4 | HTML overlays for tooltip, mini-map, legend, controls | MET | `seat-selector.tsx` overlays (tooltip div, `key-plan.tsx`, schedule rail, zoom cluster) |
| 5 | SVG kept for the printed plan only | MET | `svg-export.ts` + the builder's Print plan button; the kit preview renders that same printed artefact server-side |
| 6 | DELETED: rounded-square tile | MET | No seat rect in any renderer; chair paths in `glyphs.ts` |
| 7 | DELETED: numeral at every zoom | MET | Numerals only at seat LOD from scale 0.90 (`lod.ts`); `lod-overview/mid` captures show zero numerals |
| 8 | DELETED: navy stage bar | MET | `stage.ts` geometry everywhere a stage draws |
| 9 | DELETED: stage-light radial | MET | `grep -rn "stage-light" src` = 0 |
| 10 | DELETED: legend chip row as price surface | MET | Schedule rows + polygon price ranges (`room500-1440.png`, `lod-overview-1440.png`) |
| 11 | KEPT: cascade + quality score | MET | `best-available.ts` additive only; 941 unit tests green |
| 12 | KEPT: both orphan guards | MET | `selectionCreatedOrphans` wired in the selector; `guardedDestinations` untouched; group window orphan-tested |
| 13 | KEPT: post-publish diff sheet | MET | `diff.ts` and the event Seats page untouched this run |
| 14 | KEPT: colour-vision palette sets | MET | `palette-deutan-1440.png`, `palette-tritan-1440.png`; tier hues ride `sectionColorForSet` |
| 15 | KEPT: price-plus-party control | MET | `room500-1440.png` rail; server pick flow unchanged |
| 16 | KEPT: whole-table booking | MET | `toggleTable` + table chips in `seat-selector.tsx`; cascade table leg unit-tested |
| 17 | KEPT: self-move | MET | `self-move.ts` and `change-seat-control.tsx` untouched |
| 18 | KEPT: view-from-seat photographs | MET | `view-from-seat-anchored-1440.png` |
| 19 | Item 1 chair glyph, three sizes, three states | MET | `glyph-full-furniture.png`, `glyph-mid-mark.png`, `lod-seat-1440.png`; paths in `glyphs.ts` |
| 20 | Item 2 stage as geometry, four shapes | MET | `stage.ts`; `builder-stage-thrust-1440.png` shape cards; proscenium in every overview capture |
| 21 | Item 3 aisle primitive + uneven + staggered | MET | `rebuild-generate.test.ts` aisle and stagger cases; `room500-1440.png` shows two vertical aisles and a cross aisle punched through one block |
| 22 | Item 4 section polygons, price on the polygon | MET | `lod-overview-1440.png`; cluster-split hulls (`render-core.test.ts`) |
| 23 | Item 5 three LOD states, thresholds reported | MET | Six LOD captures; thresholds 0.30 / 0.78 / numerals 0.90; the deviation from the doc's 0.70 is stated in `lod.ts` and the comparison |
| 24 | Item 6 tooltip: price, tier, place, hover and tap | MET | `tooltip-1440.png` (hover, exact price); `docked-strip-390.png` (tap) |
| 25 | Item 7 mini-map | MET | `keyplan-1440.png`; drag-to-navigate in `key-plan.tsx` |
| 26 | Item 8 ten object glyphs + TEXT + ICON | MET | `objects-all-1440.png` shows all ten labelled chips, the caption and the free icon; `builder-room-menu-1440.png` |
| 27 | Item 9 ticket type primary encoding, legend rebuilt | MET | `room500-1440.png`, `tiers-filter-1440.png` |
| 28 | Item 10 row order Down/Up, seat order Left/Right | MET | Inspector segments (`builder-sheet-1440.png`); the proof balcony runs rowOrder up + seatOrder rtl; generator tests |
| 29 | Item 11 trace in canvas + slider + detection working | MET | `builder-trace-1440.png`: a competitor plan under the grid, chip slider, Detect a row armed |
| 30 | Item 12 group tickets, contiguous, orphan-safe | MET | `group-of-three-1440.png`; `contiguousGroupWindow` + 6 unit tests |
| 31 | Fix: view-from-seat anchored, no lightbox | MET | `view-from-seat-anchored-1440.png`: rail card + gold polygon, no backdrop |
| 32 | Fix: mobile inspector keeps the room visible | MET | `builder-mobile-strip-390.png`: strip capped, More toggle, room above |
| 33 | Direction doc before any code | MET | `SEATING-REBUILD-DIRECTION.md` committed `51877ed`, first commit of the run |
| 34 | Named real room, audience, single job | MET | Direction section 1: Palais Theatre St Kilda; Play House Geelong |
| 35 | Tokens 4-6 hexes + type roles incl. data face | MET | Direction section 2: six named tokens, Manrope tabular data face |
| 36 | Layout concept | MET | Direction section 3 |
| 37 | ONE signature, newly argued | MET | Direction section 4: the key plan sheet |
| 38 | Critique pass, changes stated | MET | Direction section 19: five named changes |
| 39 | ASCII wireframes, 3 LOD x 1440 and 390 | MET | Direction section 18: six wireframes |
| 40 | Chair glyph as SVG path, three states | MET | Direction section 5 |
| 41 | Each stage shape specified | MET | Direction section 6 |
| 42 | LOD thresholds with numbers | MET | Direction section 9 |
| 43 | Every venue object glyph described | MET | Direction section 12 |
| 44 | One real aesthetic risk, justified | MET | Direction section 4: drafting monochrome on the sheet |
| 45 | Phase 2 implements Phase 1; deviations stated | MET | Deviations stated in code and the comparison: seat LOD 0.78 not 0.70; the sheet stretches to the rail's height |
| 46 | Captures in the named folder | MET | 31 files in `docs/design/seating-rebuild-2026-07-26/` |
| 47 | Three LOD states at 1440 and 390 | MET | `lod-{overview,mid,seat}-{1440,390}.png` on the 2,016-seat room |
| 48 | Real auditorium at 500 and 2000 seats | MET | `room500-*.png` (502 real seats), `room2000-fit-*.png` (2,016), live TEST events |
| 49 | Tooltip, mini-map, type colouring, object glyphs, chair sizes | MET | Captures listed against items 6, 7, 9, 8, 1 above |
| 50 | Frame time before and after at 500/2000/5000 | MET | `perf-before.json`, `perf-after.json`; old zoom p95 49.9ms at 2,016 seats vs 16.8ms after |
| 51 | Contrast for every state in every palette | MET | `seat-contrast-rebuild.txt`: 173 pairs pass; the gate forced two real fixes first |
| 52 | Keyboard operation, buyer AND builder | MET | `keyboard-cursor/selected-1440.png`, `builder-keyboard-nudge-1440.png` |
| 53 | Zero clipping | MET | Fit captures contain the full room; the tooltip clamps to the sheet; the mobile zoom cluster rides above the strip; overlays never cover seats at fit |
| 54 | Comparison doc, capture beside capture, verdicts | MET | `SEATING-REBUILD-COMPARISON.md` |
| 55 | BEHIND/LEVEL/AHEAD per item; LEVEL fails | MET | Twelve AHEAD verdicts, each with the visible reason |
| 56 | Seating surfaces only, no regressions outside | MET | Every commit touches seating code, seating scripts or docs; the `page.tsx` change is the seating block's props; full suite green |
| 57 | TEST database only | MET | Both scripts hard-guard against the PROD ref and read `.env.test` |
| 58 | Funds-holding engine untouched | MET | No payments file in any commit; the reservation flow is reused as-is |
| 59 | Australian English, no dashes, community only, no competitor names on shipped surfaces | MET | Zero-hit greps recorded this session: dashes, "culture", competitor names in src seating files, exclamation marks in copy |
| 60 | No fabrication; NOT VERIFIED stated | MET | The comparison marks old-renderer phone-class behaviour NOT VERIFIED |
| 61 | Full gates before reporting | MET | tsc clean; eslint 0 errors (46 pre-existing warnings elsewhere, 0 in this rebuild's files); vitest 941/941; production build OK |
| 62 | Commit each item separately | REFUSED in part | Items 3 and 10 share one commit (`7f96675`): both live in the same pure generator and an artificial split would have manufactured a broken intermediate state; every other item landed in its own commit, stated in the message at the time |
| 63 | Three phases end to end, no pausing | MET | No approval requests; the mid-run founder directives were absorbed without stopping |
| 64 | Total rebuild, keep nothing of the old design | MET | Rows 6 to 10; every interactive surface re-rendered; only logic and data survive, as briefed |
| 65 | Standing rules (DESIGN-LOCK outside scope, no exclamation marks) | MET | Rows 56 and 59 |

Count: 64 MET, 1 REFUSED (reason stated), 0 PARTIAL, 0 NOT MET, 0 BLOCKED.

## The adversarial pass

**Silent drops.** The ledger was diffed against the report draft: every row
is in the report or the comparison doc it links. None found beyond row 62,
which is declared, not dropped.

**Interpretation drift.** Two readings were chosen, both declared: (a) "SVG
export path for the printed plan only" is read to permit the kit preview to
DISPLAY the printed-plan artefact (same generator output, not a second
renderer); (b) "seat numbers along the top edge" is implemented as the
front-row ruler per section plus numerals on every pan, which the seat-LOD
capture shows.

**Match versus surpass.** Twelve of twelve AHEAD with named visible reasons.
The narrowest margin is item 10 (directionality), where the competitor has
the same two controls in a form; AHEAD rests on in-context segmented
controls plus a live proof room plus generator tests. That narrowness is
recorded here rather than hidden.

**Unverifiable claims.** Hunted and bounded: the old renderer's phone-class
behaviour is NOT VERIFIED (stated in the comparison); "locked 60fps" is
bounded to the measured desktop lane; "orphan-safe" is bounded to the
unit-tested window maths; no production-traffic claim is made anywhere.

**The generic test.** The sheet could not be mistaken for the three
evidenced competitors (a form, a static diagram, a whiteboard) or for the
retired chip wall: hatched stage geometry, drafted paper, cluster wedges
with live prices, gold reserved for the buyer, the key plan in the corner.

**The AI-tell sweep.** Zero em or en dashes, zero exclamation marks in
user-facing copy, zero banned words, zero tell-lexicon phrases across the
new surfaces, docs and this ledger (grep run recorded this session).

**The regression sweep.** DESIGN-LOCK: no surface outside seating was
restyled. Pre-existing working-tree modifications from other sessions
(health, legal, checkout copy, old proof images) were left uncommitted and
untouched.

**The founder-cost test.** Nothing sends the founder to a dashboard: the
proof rooms are live TEST events on any local build and every artefact is
in the repo at a named path.

**The evidence-visibility test.** Every visual claim has a PNG, every
performance claim a JSON, every contrast claim a TXT, every geometry claim
a unit test.

**Failures this pass found during the run, fixed before reporting:**
split-section hulls banding across the house; stone-text ink failing the
4.5:1 bar it was being sold under; object labels drifting under the world
transform; the stale group note after release; the tooltip hover racing
page scroll; dead paper under the desktop sheet. Each fix is its own
commit and was re-proven by recapture.

## Gate outputs (recorded 2026-07-26)

- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors; 46 warnings, all pre-existing outside this
  rebuild's files (0 in them).
- `npx vitest run tests/unit`: 941 passed, 0 failed.
- `next build` (TEST env, production): FINAL_BUILD_OK.
- `node scripts/verify/seat-contrast-rebuild.mjs`: 173 required pairs pass.
