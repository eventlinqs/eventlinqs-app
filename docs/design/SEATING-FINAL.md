# SEATING-FINAL: the five corrections, proven

Date: 27 July 2026. Branch: `feat/walkthrough-defects`.
Environment: TEST only (`vkapkibzokmfaxqogypq`). Production was never touched.
Evidence: `docs/design/seating-final-build/` (22 captures, 3 verdict files).
Benchmark: `docs/design/seating-final-2026-07-26/r47/trybooking-buyer-01.png`
(1182 x 1002). This is the only benchmark.

Every number below comes from a command's output or a capture opened and read.
Nothing here is inferred from a filename.

---

## 0A. ROUND 3 (27 July 2026): zone prices, mobile chrome, the frame, the env guard

- **Every polygon is named.** The cabaret room drew twelve anonymous blobs at
  390. The label engine now tries three placements in order (inside the hull, on
  the clear paper outside it, on the polygon's own flat tint) across a five-step
  size ladder, and gives up the PRICE last, not the name. Result: 12 of 12 named,
  8 of 12 priced. Tables 5 to 8 carry the name alone because that row is boxed in
  above and below; the honest detail is in
  `docs/roast/ga-price-env-guard-2026-07-27.md`.
- **A per-table polygon names itself.** A cluster that is exactly one table takes
  that table's name and its own price, so a buyer can tell Table 3 from Table 7
  at overview.
- **Zones carry their price.** A standing or GA zone has no seats, so its price
  is resolved SERVER-side from its bound tier by name (the client is handed
  seat-bound tiers only). `room-mixed-390.png`: Grandstand AUD 79.00, General
  admission AUD 49.00.
- **Mobile chrome.** Venue fixtures are no longer drawn at overview (an
  unlabelled 12px box is noise); the hint shows its full sentence on one line;
  the open-seat counter stacks under its label so the floating help control
  cannot cover it.
- **The plan fills its frame.** Measured cause: three venue fixtures at x -70,
  x 1100 and y 610 stretched the theatre's fit box from 864 x 498 to 1170 x 624,
  shrinking the drawn room by about 26 per cent. `Scene.fitBounds` now frames the
  room and its sellable zones only, the fit margin scales with viewport width,
  and the mobile canvas is 52vh rather than 62vh.
- **The .env.local footgun is now a build failure.** See section 0.6 below,
  which is superseded by this: `SUPABASE_ENV_ISOLATION` no longer exempts a
  local run, `scripts/check-public-env.mjs` blocks on it wherever it fires, and
  the script resolves the environment through Next's own `loadEnvConfig` first
  so it sees exactly what `next build` will bake. Proven: clean-shell
  `npm run build` exits 1 and names the production project; the same shell with
  `.env.test` exported exits 0; `ALLOW_PRODUCTION_SUPABASE=1` releases it.
- **Gates, clean shell:** tsc 0, eslint 0 errors, vitest 1068/1068 over 114
  files, production build 0, copy gate clean. Drive: 16 of 16, 0 failures, probe
  still failing correctly.

---

## 0. ROUND 2 (27 July 2026, later the same day): the chair, the grid, the labels

This section supersedes the chair sections below where they conflict.

### 0.1 One glyph replaces the three-tier system

The tier system is DELETED. The chair is now ONE silhouette, uniformly scaled,
its stroke scaling with it (`CHAIR_STROKE` 6.5 on a 100-box). The founder's
approved rectangles are held as data in `CHAIR_RECTS`
(`src/lib/seating/render/glyphs.ts`) and the path strings are DERIVED from them,
so a path cannot drift from the specification:

| Part | x | y | w | h | r |
|---|---|---|---|---|---|
| back | 18 | 6 | 64 | 30 | 11 |
| arm left | 4 | 40 | 15 | 46 | 7 |
| arm right | 81 | 40 | 15 | 46 | 7 |
| pan | 22 | 62 | 56 | 24 | 9 |

The arms span x 4..96 (92 wide) against the back's 64, so the arms are the
widest part and the glyph reads as furniture rather than stacked bars. The
middle stays open: the back ends at y 36, the arms begin at y 40, the pan at
y 62. Symmetry is arithmetic (4 <-> 96, 18 <-> 82, 22 <-> 78) and is MEASURED,
not asserted: each part and the whole silhouette are rasterised at 600px,
flopped about the centreline and differenced. All four report **0 pixels off,
max channel delta 0**, and the chair step aborts if any ever stops matching.
Evidence: `chair-final.png` (48, 24, 14 and 8px beside the benchmark at matched
sizes; four states at 24px; three real rows at 24px with 31 per cent sold; the
symmetry row).

### 0.2 The rows were not straight: it was the taper, not curves

Both causes were checked before anything changed.

**Cause 1, curves: RULED OUT.** `scripts/seed-seating-final.mjs` sets
`curveDepth`, `curveBack`, `rowCurveOverrides`, `autoBow`, `focalRise`, `skew`
and `stagger` on ZERO blocks in ZERO rooms: a repo-wide search of the seed file
for all seven returns no matches. They also default to off in the generator
itself, which is now covered by a test.

**Cause 2, the taper shifting rows sideways: CONFIRMED, and measured.** The
theatre block (`seed-seating-final.mjs:97`, `taper: 0.5, align: 'centre'`) ran
through `generate.ts` and produced:

```
rows whose first seat is OFF the column grid: 7 of 15
offending offsets: 3.5, 2.5, 1.5, 0.5   (half a seat spacing)
distinct x values: 73; widest row: 37 seats   -> GRID BROKEN
```

`centreShift` computed `((maxCount - count) / 2) * seatSpacing`. Whenever
`maxCount - count` was odd, the whole row moved sideways by half a pitch and
every seat in it left the column grid. Two interleaved column sets is what read
as drifting, freehand rows.

**The fix** quantises the shift to whole seats, so taper only ever removes seats
from the ENDS of a row:

```
distinct x values: 37; widest row: 37 seats   -> GRID CLEAN
rows off the column grid: 0 of 15
```

Verified again on the STORED seat coordinates after re-seeding, per room:
theatre 37 distinct x for a 37-seat widest row (column gaps 24 and 58, the two
real aisles); two-block 20 for 20 (gaps 24 and 64); four-tier 30 for 30 (gap 23
throughout). Grid discipline matches the approved
`docs/design/seating-plan-proof/room-proof.png`.

**The trade-off, stated:** a row whose seat difference is odd can be centred
exactly OR sit on the grid, not both. The grid wins, so such a row is centred to
within half a seat. Two existing tests asserted the old half-seat shift as
intended behaviour and have been rewritten against the grid law.

**The lock:** `tests/unit/seating/taper-convention.test.ts` now asserts that a
default block puts every seat in column N at an identical x, that curve, skew
and stagger are off by default in the generator, that a row only bows when a
curve is set explicitly, and that a tapered block's distinct x count equals its
widest row.

### 0.3 Marks never reach a buyer

`MIN_CHAIR_PX = 10` (`render/lod.ts`) is the legibility floor. Below it
`lodFlags` turns `seats` off and `polygonFill` on, so the plan shows SECTION
POLYGONS instead of seats at any viewport width. At 390 a fitted room lands
around 6 to 8px per chair, which is exactly the case this catches. Evidence:
`theatre-lod-mid-390.png` now shows the STALLS polygon with its price where it
previously showed a grid of marks.

### 0.4 The four label defects

| Defect | State |
|---|---|
| four-tier 390: green and orange polygons carried no label and no price | FIXED. All four polygons carry name and price (`room-four-tier-390.png`). The engine now steps the type down 13 / 11.5 / 10 / 9 until the pair fits inside the polygon, instead of dropping both at one fixed size |
| mixed 390: stage was an empty rectangle with no caption | FIXED. The caption sizes itself to the stage and lifts just above it when the stage is too shallow to hold text inside, instead of vanishing below 26px of drawn height (`room-mixed-390.png`) |
| mixed 390: general admission zone unlabelled | FIXED. A zone holds no seats, so it now names itself at every zoom rather than only at overview (`room-mixed-390.png`) |
| cabaret 1440: tables unlabelled | FIXED. Each table carries its own name, centred in its ring, from a new `scene.tableLabels` anchor set (`room-cabaret-1440.png`, Table 1 to Table 16) |

### 0.5 Round 2 gate result

```
16 configurations, 0 failures
probe armed:   FAIL (correct: the probe collides)  pair "STAGE" x "PROBE"
probe removed: PASS
chair symmetry: silhouette 0, back 0, arms 0, pan 0 pixels off at 600px
```

Gates: tsc 0, eslint 0 errors, vitest 1064/1064 across 114 files, next build 0,
copy gate clean.

### 0.6 A safety finding worth recording

`.env.local` in this working tree points at the PRODUCTION project. A build that
does not explicitly export `.env.test` first bakes PRODUCTION public vars, and
the proof server then reads Production. This was caught when the drive returned
0 rows for every proof room. It was read-only and nothing was written, but the
correct procedure is to export `.env.test` before BOTH the build and the server
start, which is what produced the captures in this round.

---

## 1. The gate result

```
16 configurations, 0 failures
probe armed:  FAIL (correct: the probe collides)  pair "STAGE" x "PROBE"
probe removed: PASS
```

Five rooms at two viewports at fit, plus the three LOD states on the theatre at
two viewports. Every one reports `textText 0`, `textInk 0`, `clipped 0`, and
`seatsClipped 0` at fit. Full table: `seating-final-build/assertions.json`.

`seatsClipped` is 29 at theatre/390/mid and 71 at theatre/390/seat. That is not
a failure and the gate does not score it as one: those are ZOOMED-IN states, and
seeing fewer seats is what zooming in means. The gate scores `seatsClipped` only
at fit, where the whole room is meant to be in frame.

---

## 2. The two defects fixed this round

### 2.1 Ruler numerals drawn on the stage

**Before.** `theatre / 390 / mid` reported `textInk 6`: the numerals 10, 12, 14,
16, 18 and 20 were drawn with ink under them, at luminance standard deviations
of 86.3 to 102.4 against a threshold of 16.

**Root cause, measured not guessed.** The ruler marks anchor one pitch above
their block's front row (`scene.ts:413`). On a room whose front row sits close
under the apron that anchor is ON the stage. The label engine's obstacle set was
seats plus venue objects plus already-placed labels (`labels.ts:167`). The stage
was never in it. A first guess that the seat boxes were missing at mid zoom was
wrong and was discarded: `lod.ts:58` sets `seats: state !== 'overview'`, so seat
obstacles were already present. Confirmed by cropping the canvas bitmap at the
numerals' recorded device coordinates (y 16.8 to 39) and seeing the stage
outline there.

**Fix.** `stageObstacles()` in `labels.ts`: the bounding box of the stage
outline plus apron, mapped to screen, added to the obstacle set. The stage's own
letter-spaced STAGE caption is painted by the world pass inside the flat fill
with nothing under it, so it is not placed through the engine and cannot
self-collide.

**After.** `textInk 0` at every one of the 16 configurations. Three unit
assertions pin it (`tests/unit/seating/labels.test.ts`): the box is reported,
the DEFAULT stage is guarded too (`buildScene` resolves
`defaultStageForBounds` when the organiser drew none, so every chart has one),
and no label of any kind sits inside the stage box at scales 0.4, 0.6, 0.9 and
1.3.

This is precisely the class of defect the drawn-frame gate exists to catch. The
model never saw it: a stage is not a seat and not an object, so
`counts.labelSeat` and `counts.labelObject` were both 0 while the frame was
visibly wrong.

### 2.2 The plan marching off the top of the frame

**Before.** At `theatre / 390 / mid` the seat field occupied CSS y 35.2 to 175.6
in a 412px tall container: the plan sat in the top third with a large void below.

**Root cause.** `fitCamera` centres the room in `height - reservedBottomPx`
(412 - 112 = 300, centre at y 150) because the bottom strip is under the fixed
ticket bar. `zoomAround` anchored at `height / 2` (y 206). Every zoom press
pulled against the fit by 56px and marched the plan upward, compounding.

**Fix.** The visible-area rule is now applied consistently in all three places
that frame the room: `zoomAround` anchors at `(height - reservedBottomPx) / 2`,
`zoomToHulls` fits sections into the available height, and the large-room
overview entry centres in it too.

**After, measured.**

| | Before | After | Target |
|---|---|---|---|
| Seat field centre, CSS y | 105.4 | **151.5** | 150.0 |
| Error from visible centre | 44.6px high | **1.5px** | 0 |

The residual vertical space is honest: 112px is the ticket-bar reserve, and the
rest is aspect slack because a 26-seat-wide room on a 308px CSS viewport is
width-bound at that zoom. The horizontal clipping at mid is not fixed and should
not be: at mid zoom you are inside the room.

### 2.3 An evidence defect found while grading

The chair comparison drew its 14px column with `CHAIR_BACK_PATH` and
`CHAIR_PAN_PATH`, the FULL tier's parts, which are narrow only to leave room for
the armrests. The renderer draws `midBack` and `midPan` at that tier
(`draw.ts:214-219`). The capture therefore understated the chair and disagreed
with the shipped code. Caught because eslint reported `CHAIR_MID_BACK_PATH` and
`CHAIR_MID_PAN_PATH` as imported and unused. Fixed in
`scripts/seating-final-proofs.mjs` and regenerated; the harness now mirrors
`bodyParts`/`keyParts` exactly.

---

## 3. The five corrections, before and after

### Correction 1: the armrests read as armrests

- **Before.** 3.6-unit nubs that disappeared into the body at 24px.
- **After.** Two verticals 3.2 wide by 12.6 tall, more than half the 24-box,
  rounded both ends, at the same full stroke weight as the back and pan, with a
  2-unit clear channel to each so the separation survives the 1.25px
  screen-fixed outline. `glyphs.ts:37-40`.
- **Evidence.** `chair-final.png`, first card, "Ours 24px". Assertions at
  `render-core.test.ts:115-121` pin the height at 12.6 and assert it exceeds
  half the glyph box.
- **Degradation kept.** full (back, pan, arms) at 20px and up, mid (wide back
  and pan) at 10 to 20px, one mark below.

### Correction 2: blocks are first-class, any count works

- **Before.** Rulers and letters assumed a single seat field.
- **After.** `scene.ts:319` derives contiguous blocks by spatial clustering at
  1.9 pitch (holds across half-pitch offsets, splits at any aisle a pitch wide
  or more), ordered left to right, tables excluded. One ruler per block above
  that block's own front row, whatever the count (`scene.ts:392`,
  `labels.ts:178-179`). Row letters merge across blocks so a row crossing three
  blocks carries one letter each flank, anchored one pitch off the seat field's
  outer edges.
- **Evidence.** `room-theatre-1440.png`: three blocks, three independent rulers
  (1-8, 9-19, 20-30), one set of flank letters A to O.
  `room-four-tier-1440.png`: four blocks, four rulers (to 24, 26, 28, 30).

### Correction 3: a deliberate taper, not random stagger

- **Before.** Irregular rows produced by stagger noise.
- **After.** `RowsBlock.taper` is a STATED seats-per-row change toward the back,
  rounded per row and clamped at one seat, so the raked edge is regular and
  intentional. An explicit per-row list still wins, so a genuinely irregular
  real room is still expressible. `generate.ts:58-67`, applied at `:398-402`.
- **Evidence.** Five assertions in `taper-convention.test.ts`: `taper: 1` gives
  10, 11, 12, 13, 14; `taper: -1` clamps to 4, 3, 2, 1, 1, 1; half steps round
  per row; centred taper steps each row's first seat outward by exactly half a
  seat spacing (a straight diagonal, verified to 5 decimal places); an explicit
  list wins. Visible as a clean trapezoid in `room-theatre-1440.png`.

### Correction 4: the I and O convention

- **Before.** Rows lettered I and O read as 1 and 0.
- **After.** Two conventions, the organiser's choice. DASH (the default) keeps
  both letters and every plan renders them as "I-" and "O-"
  (`displayRowLabel`). SKIP letters the block over a 24-letter alphabet with no
  I or O at all, H to J and N to P, rollover included (`ALPHABET_NO_IO`,
  `generate.ts:322`).
- **Evidence.** Five assertions in `taper-convention.test.ts`, including
  `alphaLabel(24, ALPHABET_NO_IO) === 'AA'`. Visible in
  `room-theatre-1440.png` and `room-four-tier-1440.png`: the flanks read
  ... H, I-, J ... and ... N, O-, P ...

### Correction 5: the four-tier colour verdict

This is the piece that was captured and clean but never adjudicated. The verdict
is written here for the first time.

**The room.** `final-proof-four-tier-house`, 590 seats, four stacked bands with
one ticket tier each: Premium Stalls in harbour blue `#1F5673`, Stalls in garnet
`#7A1F3D`, Lower Balcony in forest `#2D5A3D`, Upper Balcony in terracotta
`#9A3E1C`. All four are drawn from the ten editorial `SECTION_COLORS`, not the
retired material brights. About 30 percent sold, 8 house holds, accessible seats
in the front band.

**Does it read calm? YES.** The four hues are deep and desaturated and sit at
similar luminance, so no band shouts over its neighbours. The eye reads four
zones and a price hierarchy, and the plan does not look like a paint chart. The
bands are separated by real vertical gaps and each carries its own ruler, so
colour is doing secondary work: the LAYOUT already says "four tiers" and the hue
confirms it rather than carrying the whole message alone.

**Are sold and held unmistakable in every tier? YES, and this is the load-bearing
reason it works.** State is carried by FILL, never by hue. Available is a light
body with the tier-coloured stroke. Sold is a SOLID dark fill (dusk). Held is a
stone body with a dashed tier-hue stroke. Verified by cropping the garnet band at
4x (`room-four-tier-1440.png`, band G to L): a sold seat is a filled dark block
against outlined light blocks, and that difference survives all four tier hues
because it is a fill-versus-outline difference, not a hue difference. Repeat the
crop in any of the four bands and the sold seats read identically.

**Is it noisy? NO.** Reported honestly, since the brief asked me to say so if it
were and to propose a fix. It is not, and no fix is proposed.

**The accessibility backstop.** Three colour-vision palette sets (protan,
deutan, tritan) remap the tier hues while gold selection, navy stage and stone
recede stay identical, because state never depends on hue.
`src/lib/seating/palette.ts`.

---

## 4. The four room shapes proven

| Room | Shape | Seats | 1440 | 390 |
|---|---|---|---|---|
| Three-block theatre | one stalls band split by two aisles, deliberate taper, rows A to O | 506 | `room-theatre-1440.png` | `room-theatre-390.png` |
| Two-block house | two mirrored blocks, one centre aisle, skip lettering | 500 | `room-two-block-1440.png` | `room-two-block-390.png` |
| Cabaret floor | 16 tables, 12 round and 4 square, two tiers | 152 | `room-cabaret-1440.png` | `room-cabaret-390.png` |
| Grandstand and lawn | seated grandstand split by a centre aisle plus a general admission lawn | 176 seated + 250 GA | `room-mixed-1440.png` | `room-mixed-390.png` |
| Four-tier house | four stacked bands, one tier each | 590 | `room-four-tier-1440.png` | `room-four-tier-390.png` |

All five at fit, about 30 percent sold, holds and accessible seats present, zero
collisions at both viewports.

---

## 5. The drawn-frame gate

**What it replaced.** The old assertion read `el.__seatLabels`, the label
engine's own planned boxes, and re-marked the engine's homework with the
engine's own numbers. It passed while captures showed visibly garbled labels.

**What it does now** (`scripts/seating-final-proofs.mjs:202-281`). Two
independent measures, neither of which asks the engine anything:

1. **Text on text.** `fillText` and `strokeText` are wrapped at draw time; every
   run is recorded with its true device-space extent from `measureText` plus the
   live transform. The last frame's runs are rect-intersected pairwise.
2. **Text on ink.** Text is suppressed, the canvas's OWN bitmap is read via
   `toDataURL`, and the luminance standard deviation of the pixels under each
   recorded run is measured. Above 16 means something is drawn under that label.

The model is still reported alongside, as information, and contributes one check
(`seatsClipped` at fit). It is no longer the verdict.

**The deliberate-failure demonstration.** `probe-demo.json`:

```
cleanBefore   textText 0  textInk 0   PASS
withProbe     textText 1  textInk 0   FAIL (correct: the probe collides)
              pairs: "STAGE" x "PROBE"
cleanAfter    textText 0  textInk 0   PASS
```

A probe label is stamped through the canvas debug bridge straight over the drawn
STAGE text. The gate catches it, the probe is removed, the gate passes again.
A gate that has never failed is not evidence; this one is proven able to fail and
then to recover. Capture: `probe-collision-1440.png`.

---

## 6. Our three-block theatre beside the benchmark

Ours: `docs/design/seating-final-build/room-theatre-1440.png` (506 seats, three
blocks) and the full sheet in `desktop-1440-context.png`.
Benchmark: `docs/design/seating-final-2026-07-26/r47/trybooking-buyer-01.png`
(three blocks, rows D to P).

**Verdict: AHEAD, on two visible differences that a buyer feels immediately.**

**Visible reason 1: the whole house is in one frame.** The benchmark capture
carries a horizontal scrollbar under the plan and the instruction "Scroll left
or right to view more seats." The buyer cannot see the room at once, so they
cannot judge where a seat sits in the house without scrubbing. Ours fits all
three blocks and the stage in a single frame at 1440, with the zoom cluster and
a key plan for going closer. Count the evidence: their capture has a scrollbar
and an instruction telling the buyer to scroll; ours has neither because it does
not need them.

**Visible reason 2: the plan tells the buyer their seat number.** Count the
numerals on each plan. Benchmark: ZERO. There is not one seat number anywhere on
their map, only row letters on the flanks, so a buyer choosing from the map alone
knows their row but not their seat. Ours: THIRTY, as three per-block rulers
reading 1-8, 9-19 and 20-30, sitting above each block's own front row and dropped
rather than drawn askew when they cannot sit clear.

**Where we are LEVEL, stated plainly.** Row letters on both flanks: both have
them. The I and O dash convention: both use it, and matching the real venue
convention exactly is the point rather than a place to differentiate. Their
always-visible inline legend (Available, Unavailable, Selected) is more immediate
than ours, which sits behind a "Seat colours" control in the ticket rail; on
legend immediacy they are ahead and we are not claiming otherwise.

**Not claimed.** Their capture shows a single free-admission tier, so it gives no
evidence about how their product handles multi-tier colour. No comparison is made
on that axis from one capture.

---

## 7. Grades against the benchmark

The brief: LEVEL is a failure. One item is graded LEVEL and is carried into
UNFULFILLED.

| # | Correction | Grade | The specific visible difference |
|---|---|---|---|
| 1 | Stronger armrests | **AHEAD** | At 24px ours draws two separate armrest verticals at full stroke weight with a clear channel each side. The benchmark chair's arms are folded into one continuous tub outline with no separable stroke. Ours reads as an armchair with parts; theirs reads as a seat shape |
| 2 | Configurable multi-block rooms | **AHEAD** | Blocks are derived from real aisle gaps at any count and each earns its own ruler automatically. The benchmark has three blocks and zero rulers, so its block structure carries no seat identity |
| 3 | Deliberate taper | **AHEAD** | Ours is a stated parameter producing a regular raked edge, with an explicit per-row list still available for genuinely irregular rooms. The benchmark's row lengths are irregular with no stated pattern, which our per-row list also expresses. We cover both shapes; it covers one |
| 4 | I and O convention | **AHEAD** | Ours matches the benchmark's dash convention exactly AND adds skip mode as an organiser choice. A superset of the benchmark, proven by assertion including the 24-letter rollover |
| 5 | Four-tier colour | **AHEAD** | Four editorial tier hues with sold and held carried by fill rather than hue, plus three colour-vision palette sets. Graded AHEAD of our own prior state and of the benchmark's monochrome plan, with the caveat in section 6 that their capture shows a single-tier event |
| - | Mid-tier chair at 14px | **LEVEL** | See UNFULFILLED below |

**UNFULFILLED**

`Mid-tier chair legibility at 14px - LEVEL - not a regression and not a blocker,
but not a win either.` At 14px ours drops the armrests by design and draws the
wide back-and-pan pair, which reads as two stacked rounded bars. The benchmark at
the same size is its 24px chair scaled down and still reads as a small tub chair.
Ours is crisper at small sizes and theirs is more chair-like; neither is visibly
better, so LEVEL is the honest grade and the brief counts that as a failure.
What would unblock it: author a dedicated mid glyph that keeps a hint of the arm
silhouette in the outline rather than dropping the arms entirely, then re-grade
against the same crop. This is a glyph authoring task, not a gate or a
correctness problem, and it is the only item on this list.
