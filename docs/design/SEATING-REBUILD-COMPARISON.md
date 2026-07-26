# Seating rebuild: capture against capture

Date: 2026-07-26. Every rebuild capture sits beside the competitor capture it
answers, with a verdict and the specific visible reason. Competitor evidence:
`docs/design/seating-final-2026-07-26/r47/` (TryBooking buyer chart, Oztix
selling-configuration wedges, EventBookings builder and buyer). Rebuild
evidence: `docs/design/seating-rebuild-2026-07-26/`. Verdicts use the brief's
scale: BEHIND, LEVEL, AHEAD; LEVEL is a failure.

The three proof rooms are real TEST events sold by the live checkout: 502
seats (Play House), 2,016 seats (Grand Hall), 5,000 seats (Endurance Hall),
all materialised through `materialize_seats` and rendered by the shipped
buyer surface, not a demo harness.

| # | Item | Ours | Theirs | Verdict | The visible reason |
|---|---|---|---|---|---|
| 1 | The chair glyph | `glyph-full-furniture.png`, `glyph-mid-mark.png`, `lod-seat-1440.png` | `r47/trybooking-buyer-01.png` | AHEAD | Both draw furniture; theirs is one outline at one size. Ours carries three sizes of one silhouette (back and pan at 14px and up, the merged armchair mark to 6px), the numeral moves onto the white pan at 12.6:1 contrast, and the tier hue rides the chair back, which their monochrome outline cannot say. |
| 2 | The stage as geometry | `lod-overview-1440.png` (proscenium with apron), `builder-stage-thrust-1440.png` (thrust, four shape cards) | `r47/trybooking-buyer-01.png` (trapezoid), `r47/oztix-01.png` (curved apron) | AHEAD | They each ship ONE stage shape, fixed. Ours is organiser-pickable across proscenium with apron, thrust, in the round and flat floor, drawn as hatched drafting geometry with the apron line feeding the best-available focal point, which neither evidenced product connects. |
| 3 | Aisles and staggered rows | `room500-1440.png` (two vertical aisles and a cross aisle punched through ONE stalls block, stagger 8px, uneven 18 to 24 rows) | `r47/trybooking-buyer-01.png` | AHEAD | Theirs shows the look; ours shows the primitive. Their gaps are hand-authored per chart. Our aisle is an object with orientation and width that shifts the far side outward, so the cascade's gap detection refuses to seat parties across it, proven by `group-window` unit tests. |
| 4 | Section polygons | `lod-overview-1440.png`, `glyph-overview-polygons-1440.png` | `r47/oztix-01.png` | AHEAD | Both show labelled price wedges. Theirs is a static marketing diagram; ours is auto-derived from the live seat field (convex hull per spatial cluster, so split boxes wedge per flank), labelled in place with the LIVE price range, and a tap dives into the tapped wedge. |
| 5 | Level of detail | `lod-overview-1440.png`, `lod-mid-1440.png`, `lod-seat-1440.png` and the 390 trio | No competitor capture shows any LOD transition | AHEAD | None of the three evidenced products changes representation with zoom; TryBooking draws numerals at every zoom. Ours ships three states: polygons with prices and zero seats, chair marks with flank letters, then furniture with numerals and the seat ruler. Thresholds as built: overview below 0.30 px per unit, mid 0.30 to 0.78, seat at 0.78 with numerals from 0.90; big sectioned rooms ENTER at overview. |
| 6 | The tooltip | `tooltip-1440.png` | `r47/oztix-02.png` | AHEAD | Same three-line grammar (price, type, exact place) plus the state chip, but ours prints the EXACT seat price where theirs prints a range, and on touch it docks inside the sheet's bottom edge instead of covering rows. |
| 7 | The mini-map | `keyplan-1440.png`, `docked-strip-390.png` (top-right key plan) | `r47/oztix-02.png` | AHEAD | Both orient the buyer. Theirs is a static inset with a level picker; ours is a live key plan fed by the same scene graph, the viewport is the only gold rectangle on it, and dragging it moves the room. |
| 8 | Venue objects | `objects-all-1440.png`, `builder-room-menu-1440.png` | `r47/eventbookings-13.png`, `r47/eventbookings-15.png`, `r47/oztix-01.png` | AHEAD | Theirs are text boxes and stock icons (Food Stalls, Refreshment Corner). Ours are ten designed ink glyphs on paper chips (bar, food, toilets, entrance, exit, stairs, lift, balcony, box, standing rail) plus free TEXT and ICON primitives, all placeable, rotatable and carried to the buyer sheet through the layout. |
| 9 | Ticket type as the colour | `room500-1440.png`, `tiers-filter-1440.png` | `r47/eventbookings-10.png` | AHEAD | Both colour seats by ticket type with a right-hand legend. Their legend is passive; our schedule rows carry a chair swatch, price and live open count, and SELECTING a row dims every other type on the sheet and guards taps outside it. Section identity moves to the polygons as briefed. |
| 10 | Directionality | `builder-sheet-1440.png` inspector; `room500-1440.png` balcony (row 1 at the back, seat 1 at the right) | `r47/eventbookings-04.png` | AHEAD | Their Down and Up, Left and Right dropdowns exist in a form; ours are segmented controls in the inspector AND the proof room ships a balcony with rowOrder up and seatOrder rtl, visible on the sheet and pinned by unit tests on the pure generator. |
| 11 | Trace integration | `builder-trace-1440.png` | `r47/eventbookings-13.png` | AHEAD | Theirs floats a static image beside the work with a transparency slider. Ours draws the image under the drafting grid inside the SAME camera (it pans, zooms and scales with the room), the slider rides the sheet as a chip, and the assisted row detector samples the trace's pixels to lay a counted row along a drag. |
| 12 | Group tickets | `group-of-three-1440.png` | `r47/eventbookings-07.png`, `r47/eventbookings-06.png` | AHEAD | Theirs makes the buyer hand-pick N seats and validates after. One tap on ours holds the whole group, contiguous within its tier and orphan-guarded by the same window maths as best available, outlined as one gold unit, released as one unit. |

## The two broken promises

| Promise | Ours | Verdict against the old build | The visible reason |
|---|---|---|---|
| View from seat, no lightbox | `view-from-seat-anchored-1440.png` | FIXED | The photograph opens inside the schedule rail while the Stalls polygon lights gold on the sheet; no dimmed backdrop, no corner X over a modal, the room never leaves view. |
| Mobile inspector keeps the room | `builder-mobile-strip-390.png` | FIXED | The numbers strip docks at the bottom capped at 34vh with a More toggle; the canvas and the selected block remain visible above it while values change. |

## Frame time, before and after

Measured as requestAnimationFrame intervals during identical scripted
pointer pans and Ctrl-wheel zooms on the same three live TEST rooms,
production builds, same desktop machine. Files: `perf-before.json` (the
retired SVG-per-seat renderer, built at commit 12675b9, the last commit that
still shipped it), `perf-after.json` (the canvas scene graph), plus the new
renderer's true per-paint duration ring (`window.__seatFrameTimes`).

| Room | Before: pan mean / p95 | After: pan mean / p95 | Before: zoom mean / p95 | After: zoom mean / p95 | After: true paint mean / p95 |
|---|---|---|---|---|---|
| 502 seats | 16.67 / 16.7 ms | 16.67 / 16.7 ms | 16.67 / 16.8 ms | 16.67 / 16.7 ms | 1.13 / 1.4 ms |
| 2,016 seats | 16.67 / 16.7 ms | 16.67 / 16.8 ms | **21.68 / 49.9 ms** | 16.67 / 16.8 ms | 0.68 / 2.6 ms |
| 5,000 seats | 16.67 / 16.7 ms | 16.67 / 16.7 ms | 16.67 / 16.7 ms | 16.78 / 16.7 ms | 0.31 / 0.4 ms |

Read honestly: on a desktop, PANNING was already smooth on the old renderer
(its pan was a composited scroll of a rasterised SVG layer) and stays
locked. The measured difference is ZOOM, where the old renderer re-laid-out
one DOM node plus one text node per seat: at 2,016 seats it averaged 21.7ms
per frame with a 49.9ms p95 (three times the 60fps budget, visible hitching)
while the rebuild holds the 16.7ms tick with a true paint cost of 0.7ms,
leaving over 13ms of headroom per frame even at 5,000 seats. The old
renderer's phone-class behaviour was not measured on this desktop lane and
is NOT VERIFIED here; the new renderer's headroom is what makes the
phone-class case tractable, and the docked-strip and LOD captures at 390
show the rebuild operating at that width.

## Contrast and keyboard

- `seat-contrast-rebuild.txt`: 173 required pairs pass across the house,
  protan, deutan and tritan sets on the rebuilt glyph anatomy (dusk numerals
  on the white pan, night on gold, tier hues against the Veil paper,
  simulated-vision separations at deltaE 10 and 15). The proof caught and
  forced two real fixes before passing: row letters stepped up to dusk ink,
  and the selected chair's boundary is gated on its always-drawn night
  keyline.
- `keyboard-cursor-1440.png`, `keyboard-selected-1440.png`: the buyer sheet
  walked by arrows (double-ring cursor), two seats selected by Enter alone.
- `builder-keyboard-nudge-1440.png`: Tab cycles blocks, arrows nudge the
  selected stage, all announced to assistive tech via the live region.

## Zero clipping

Every capture above frames the full sheet element or the full selector
component; fit views contain the entire room inside the sheet margins, and
the docked strip, key plan, tooltip and zoom cluster are laid out inside the
sheet bounds by construction (the tooltip clamps to the sheet, the mobile
zoom cluster rides above the strip). No seat field, control or overlay is
cut in any shipped capture.
