# SEATING-PLAN: the plan rebuild, Phase 0 static proof

Status: STATIC PROOF ONLY. The renderer is untouched, no drive was run, the
buyer sheet is unchanged. The two PNGs in `docs/design/seating-plan-proof/`
await founder approval before any build begins.

Benchmark: `docs/design/seating-final-2026-07-26/r47/trybooking-buyer-01.png`
(1182 x 1002). This is the only benchmark.

---

## 1. The two false claims, confirmed

**Claim 1 was false, confirmed.** `docs/design/seating-craft-2026-07-26/
chair-vs-benchmark.png` has EMPTY benchmark columns: "Benchmark ~24px" and
"Benchmark scaled" are captions over blank space. Task 1 was graded AHEAD
against nothing. Root cause: the old chair step built the benchmark `<img>`
as a `file:///` URL inside a `page.setContent` HTML document; Chromium blocks
`file://` subresources from a non-file origin, the image never loaded
(naturalWidth 0), and no load assertion existed, so the empty frame shipped.
The new generator (`scripts/seating-plan-proof.mjs`) embeds every crop as a
data URI and ABORTS if any image on the page reports naturalWidth 0.

**Claim 2 was false, confirmed.** The report said zero label collisions at 8
configurations; the captures show many. Confirmed by opening each file:

- `seating-craft-2026-07-26/docked-strip-390.png`: two zone labels drawn on
  top of each other inside the dashed polygon, rendering as garbled
  interleaved text ("General admission" through "ROOF TERRACE"); object
  glyphs stamped over their own words (Long bar, Food stalls, Toilets,
  Entrance).
- `seating-craft-2026-07-26/room2000-fit-390.png`: "PREMIUM STALLS
  AUD 149.00" crosses the STAGE trapezoid and its lettering; both BOXES
  labels sit inside the stalls polygon; leader lines cut through the stalls.

## 2. Why the assertion passed (and the fix)

The assertion never read the frame: it read `el.__seatLabels`, which is the
label engine's own output (`placeLabels` result plus `assertLabelCollisions`
over those same rectangles), so the gate re-marked the engine's homework
with the engine's numbers, and it only sampled 8 hand-picked configurations
that excluded the two that visibly failed (the mobile docked strip and the
2,016-seat room at fit were never asserted; the assert step tested room2000
only at overview, mid and seat, and fit only on the 500-seat room). Whole
classes of drawn ink were invisible to the model even on the asserted
configurations: the stage trapezoid and its lettering are painted directly
and appear in no obstacle set; per-seat numerals are painted by the seat
pass, not placed by the engine; an object label sitting inside its own glyph
is explicitly excluded as "composition, not collision"
(`src/lib/seating/render/labels.ts:384`), which is precisely the
glyph-over-word defect in the captures; and the engine measures text through
one `measure` closure at placement time while the painter draws with its own
font state, so drawn glyph extents can exceed the model's boxes. The fix
(shipped in `scripts/seating-rebuild-proofs.mjs`, assert step, proof-harness
only, zero renderer changes): every `fillText`/`strokeText` the frame
actually draws is recorded at draw time with its true device-space extent,
text-on-text is rect-intersected on the final drawn frame, text-on-ink is
measured by sampling the pixels UNDER each run with text suppressed, and the
configuration set now includes the docked strip and room2000 at fit (11
configurations). Run against the current renderer (2026-07-26, local dev on
TEST) it goes RED, which is the correct reading of the frame: 11
configurations, 9 FAILURES, catching exactly the defects the founder named:
the docked-strip garble is the pair "General admission" x "GROUP TERRACE"
drawn in one spot, the stage crossing is the pair "STAGE" x "AUD 149.00"
plus PREMIUM STALLS ink at sd 68, the object glyphs sit over their own
words (Toilets sd 81.9, Food stalls sd 49, Long bar sd 43, Entrance sd 49),
and at seat zoom on 390 the numerals 13 to 24 cross chair strokes. Each
result also records the model's own counts beside the frame's: the model
reports labelSeat 0, labelLabel 0, labelObject 0 on the same configurations
the frame fails, so the divergence is visible in one file. Full results in
`docs/design/seating-rebuild-2026-07-26/assertions.json`.

## 3. What the benchmark actually does (verified against the image)

- **One reusable chair path stamped repeatedly.** Front-elevation armchair:
  tall rounded back, two armrest verticals with rounded tops, a full-width
  seat pan bar. About 24 x 20 in the legend, ~22px on the plan at ~26px
  pitch. Not generated geometry.
- **A strict integer grid.** Uniform pitch everywhere; row offsets only by
  exactly half a pitch in a regular repeating pattern; block leading edges
  step by whole seats. Nothing arced, nothing irregular.
- **Rectangular blocks, straight aisles, mirrored flanks.** Three blocks,
  two straight aisles, the outer blocks mirror each other.
- **ONE label type.** Row letters on BOTH flanks in a fixed gutter (D to P),
  plus a number ruler. No section names on the plan, no prices on the plan,
  no leader lines, no object labels.
- **Sold seats solid dark.** A single dark silhouette (about #4D5357). The
  sold mass clustered near the stage does most of the visual work.
- **Stage: a centred trapezoid** (wider top edge, letter-spaced STAGE)
  aligned to the seating centre.
- **No zoom cluster, no key plan, no LOD.** A plain horizontal scrollbar,
  chevrons, and "Scroll left or right to view more seats."

Its quality comes from RESTRAINT AND GRID DISCIPLINE, not technology. What
comes off ours accordingly: arcs, arbitrary stagger, uneven rows, serrated
polygons, prices on the plan, object labels, leader lines, the zoom cluster,
the key plan. Prices and section names live in the ticket panel, never on
the plan.

## 4. The chair (the exact SVG)

viewBox `0 0 24 20`. ONE closed silhouette plus internal detail. Anatomy:
tall rounded back (x 4.5 to 19.5, top y 0.75), two armrest verticals
(x 0.75 to 4.5 and 19.5 to 23.25, tops at y 6.5, rounded), seat pan bar
(y 14 to 19.25, full width).

Silhouette (one closed path):

```
M7.5 .75 H16.5 Q19.5 .75 19.5 3.75 V6.5 H21.1 Q23.25 6.5 23.25 8.4
V17.6 Q23.25 19.25 21.5 19.25 H2.5 Q.75 19.25 .75 17.6 V8.4
Q.75 6.5 2.9 6.5 H4.5 V3.75 Q4.5 .75 7.5 .75 Z
```

Internal detail (stroke only, dropped at the 8px mark tier):

```
M4.5 6.5 V14 M19.5 6.5 V14 M.75 14 H23.25
```

Stroke widths (viewBox units, so the rendered line stays ~1.1 to 1.4px):
1.4 at 24px, 1.9 at 14px, 3 at 8px (silhouette only). Armrest columns are
3.75px wide at 24px: visible, per the proof.

States (tokens from `src/lib/seating/palette.ts` SEAT_STATE_COLORS and
SECTION_COLORS[0]):

| State | Fill | Stroke |
|---|---|---|
| Available | white | harbour #1F5673 |
| Sold | dusk #24344D solid | none (one silhouette) |
| Selected | gold #D4A017 | night #0A1628 keyline |
| Held | stone #D9D9D6 | dashed #1F5673 |

NOTE for Phase 1: the current painter draws taken seats as LIGHT stone
(#D9D9D6, "it recedes"). The benchmark law is the opposite: sold is the
high-contrast SOLID DARK state that does the visual work. The proof shows
sold as solid dusk; this is a renderer change to make after approval.

## 5. Grid rules (the numbers, as drawn in room-proof.png)

- Pitch P uniform per room. room-proof: P = 30px at 1440.
- Chair 24 x 20 at P = 30 (0.8P wide, 2/3 P tall), centred in its cell.
- Row x-offsets: exactly 0 or P/2 only, in a regular repeating pattern.
  room-proof uses 0 everywhere. Nothing arced, nothing irregular, ever.
- Blocks rectangular. room-proof: two mirrored blocks of 10 columns x 25
  rows = 500 seats exactly. Aisle straight, 2P wide (60px), on the centre.
- Row letters A to Y on BOTH flanks: gutter centreline a fixed 24px outside
  the seat-field edge, 11px weight 600, dusk #24344D, one letter per row,
  vertically centred on its row.
- One number ruler above each block: left block 1 to 10, right block 11 to
  20, 10px weight 600, dusk, baseline 7px above the seat field, one number
  per column centre. Nothing else on the plan.
- Sold: exactly 150 of 500 (30.0%), solid dusk, front-weighted the way real
  sales land (deterministic seed 20260726 in the generator).
- Stage: trapezoid, top edge 320, bottom edge 250, height 56, night
  #0A1628 fill, white letter-spaced STAGE, centred on the seat field's true
  centre (x = 720), bottom edge 46px above the seat field.
- Frame 1440 x 1000; the plan centred with equal opposing margins
  (390 left = 390 right, 74 top = 74 bottom).

## 6. Build sequence (AFTER founder approval, in order)

1. **Chair.** Replace the two-stacked-rects glyph with the single-silhouette
   armchair above (`src/lib/seating/render/glyphs.ts`), states per the
   table; sold becomes solid dark.
2. **Grid.** Constrain the scene to the strict integer grid: uniform pitch,
   offsets 0 or P/2 in a regular pattern only; arcs, arbitrary stagger,
   uneven-row serration and polygon outlines come off.
3. **Plan chrome.** Strip section names, prices, leader lines and object
   labels off the plan. The plan carries row letters (both flanks), one
   ruler per block, seats and the stage. Prices and section names move to
   the ticket panel.
4. **Stage.** Centred trapezoid aligned to the seat field's true centre.
5. **Scroll model.** Fit-height with horizontal scroll and a plain
   instruction; the zoom cluster, key plan and LOD tiers come off the buyer
   sheet.
6. **Gate.** The drawn-frame assertion (already rebuilt) must be GREEN
   across all 11 configurations; captures at 1440 and 390 re-taken.
7. **Integration and drive** in their own approved phase; nothing merges
   without the founder.

## 7. Files

- `docs/design/seating-plan-proof/chair-proof.png` (ours beside the actual
  TryBooking chair at 24, 14, 8px, and the four states)
- `docs/design/seating-plan-proof/room-proof.png` (the 500-seat room)
- Generator: `scripts/seating-plan-proof.mjs` (aborts on any unloaded image)
- Drawn-frame gate: `scripts/seating-rebuild-proofs.mjs`, assert step
