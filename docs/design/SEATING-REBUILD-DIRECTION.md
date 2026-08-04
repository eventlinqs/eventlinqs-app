# Seating rebuild: the direction

Date: 2026-07-26. Status: Phase 1 of the renderer rebuild, written before any
code, per the rebuild brief. The renderer decision is already made and is not
relitigated here: Canvas 2D with a retained scene graph, HTML overlays for
tooltip, mini-map, legend and controls, an SVG path kept for the printed plan
only.

Evidence base: `docs/design/seating-final-2026-07-26/r47/` (TryBooking buyer
chart, Oztix selling configurations and buyer wedge, EventBookings builder and
buyer captures) and the parent folder's captures of our retired design. Every
design call below cites the capture it answers.

---

## 1. The room, the audience, the job

**The room: the Palais Theatre, St Kilda.** 2,896 seats, the largest seated
theatre in Australia: a proscenium house with a raked stalls floor split by
two punched aisles, uneven staggered rows that narrow toward the side walls,
and a horseshoe balcony. If the renderer can hold the Palais at sixty frames
a second on a phone, it can hold any room an Australian organiser draws. The
500-seat proof room is the Geelong Arts Centre Play House: one raked block,
one aisle, a thrust apron: the founder's own wedge city.

**The audience:** a Melbourne music fan on a tram, phone in one hand, buying
two A Reserve seats in the thirty seconds between stops. Secondly: the
organiser laying out that room on a laptop the night before tickets go live.

**The single job of the screen:** show where you will sit and what it costs,
then hold those seats, inside a minute, without the room ever lying about
distance, price or company.

---

## 2. The token system

No new colours: every value below is an existing token from `globals.css` and
`src/lib/seating/palette.ts`. The seating surfaces name them like drafting
materials because the surface behaves like a drawing sheet.

| Name | Hex | Source token | Role on the sheet |
|---|---|---|---|
| **Night** | `#0A1628` | ink-900 | Linework, stage hatching, numerals on gold, sheet frame |
| **Gold** | `#D4A017` | gold-500 | THE BUYER'S MARKS ONLY: selected chairs, keyboard cursor, mini-map viewport, group outline |
| **Bloom** | `#E8B738` | gold-400 | Focus rings, the selection bloom ring |
| **Veil** | `#EDF0F4` | navy 6% wash | The paper: canvas background, object chips, stage fill |
| **Stone** | `#D9D9D6` | ink-200 | Taken chairs, hairlines, disabled states |
| **Dusk** | `#24344D` | navy lifted | Secondary labels, row letters, quiet chrome |

Tier hues are the ten editorial `SECTION_COLORS` and their three
colour-vision sets (`SEAT_PALETTE_SETS`), unchanged: they are the only
saturated material on the sheet besides gold, and gold is never a tier hue.

**The colour law of the sheet: gold means you.** The whole room renders as
ink, paper and tier hue. The only warm metal on the surface is what belongs
to the buyer: their chairs, their cursor, their viewport, their party. On the
retired design gold also lit the stage; that signature is deleted, so the
rule is now absolute.

**Type roles.**

- **Display: Archivo 700.** The sheet title and section polygon names, CAPS,
  0.08em tracking. Used sparingly: a drawing sheet is quiet.
- **Body: Hanken Grotesk 400/600.** Help lines, legend hints, error copy.
- **Data face: Manrope 600/700, `font-variant-numeric: tabular-nums`.**
  Every number on the sheet: prices, seat numerals, row letters, ruler
  numbers, open counts. Tabular Manrope reads like an instrument panel and
  keeps columns of numerals optically aligned at every LOD.

---

## 3. The layout concept

**The buyer surface is a drawing sheet with a schedule column.** Desktop
1440: a two-column card. Left, the canvas: the venue's plan drawn as an
architect's sheet: Veil paper, a hairline Night frame with a second inset
hairline (the double border of a real title sheet), the room in ink and tier
hue. Right, a 300px schedule rail: the ticket-type legend as selectable rows
(EventBookings r47-10 answers), the party-and-price control, the selection
list, and the view-from-seat card, which opens IN this rail, anchored in the
seating context, never a lightbox.

Mobile 390: the sheet runs full-width at 62vh, the schedule stacks under it
as a horizontally scrollable legend strip, then party control, then the
selection bar. The mini-map keys the top-right corner of the sheet; a
44px seat-info strip docks INSIDE the sheet's bottom edge on tap, so the
room is never covered.

**The builder is the same sheet with a drafting rail.** The canvas engine is
shared. Tools sit left, the inspector right on desktop; on a phone the
inspector becomes a compact numbers strip capped well under half the screen
so the room stays visible while its numbers are edited, which the retired
full-height sheet defeated.

---

## 4. The signature element: the key plan sheet

The one thing this map is remembered by: **the seat map is presented as the
venue's own drafted plan sheet.** Three parts, one device:

1. **The sheet frame.** Square-cornered double hairline in Night, on Veil
   paper, inside the platform's rounded panel. Every other ticketing map is
   a floating white void; ours is a document.
2. **The key plan.** The mini-map (Oztix r47-02 answers) drawn exactly as
   architects draw one: a corner block containing the whole plan in
   miniature with the buyer's viewport as the ONLY gold rectangle on it.
   Not a widget bolted on: the corner block of the sheet.
3. **The schedule.** The ticket-type legend rendered as the sheet's schedule
   table: swatch, type, price, seats open: selectable rows that filter the
   field (EventBookings r47-10 answers).

Why this signature is right for this brief: rooms are built from drawings;
organisers trace real floor plans in this very builder (the trace slider is
item 11); and a drafted sheet is the one aesthetic none of the three
evidenced competitors can claim: TryBooking is a form, Oztix is a diagram,
EventBookings is a whiteboard. The stage-light radial is deleted; the sheet
is the new identity, and it is structural rather than decorative.

**The aesthetic risk, named and justified:** the room itself renders in
DRAFTING MONOCHROME at overview and mid zoom on the builder, and near-mono
on the buyer sheet: ink linework, hatched stage, tier hue held to polygon
fills and chair fills only. No card shadows inside the sheet, no rounded
seat chips, no gradients anywhere. The risk is that a buyer used to candy
maps finds it austere; the justification is the evidence: TryBooking's
outline chairs are precisely why its auditorium "reads as architecture"
(r47 trybooking-buyer-01), and our tier hues are already deep editorial
tones, so hue mass stays where the affordability question lives and the
gold has no competition. Restraint is the brand; the sheet spends its one
boldness on being a document.

---

## 5. The chair glyph (item 1)

Chairs, not tiles. Drawn from the front like furniture: a narrow back over a
wider pan. One silhouette, three sizes; the geometry is authored once in a
24 x 24 box and scaled.

**Full glyph, chair >= 14px on screen.** Two stacked rounded forms:

```svg
<!-- back: x 5..19, y 3..12, top radius 3 -->
<path d="M8 3 h8 a3 3 0 0 1 3 3 v6 H5 V6 a3 3 0 0 1 3 -3 Z" />
<!-- pan: x 3..21, y 12..21, wider than the back -->
<path d="M5.5 12 H18.5 A2.5 2.5 0 0 1 21 14.5 V19 a2 2 0 0 1 -2 2 H5
         a2 2 0 0 1 -2 -2 V14.5 A2.5 2.5 0 0 1 5.5 12 Z" />
```

**Mid mark, 6px to 14px.** The two forms merge into one armchair silhouette,
a single filled path (narrow top, shouldered base):

```svg
<path d="M7 3 h10 a3 3 0 0 1 3 3 v5 h1 a2 2 0 0 1 2 2 v6 a2 2 0 0 1 -2 2
         H3 a2 2 0 0 1 -2 -2 v-6 a2 2 0 0 1 2 -2 h1 V6 a3 3 0 0 1 3 -3 Z" />
```

**Mark, at 6px.** A 4:5 rounded chip (taller than wide, tighter top radius):
the same narrow-top silhouette compressed to its last legible signal.

**The three states, constant across sizes (TryBooking r47 answers):**

| State | Fill | Stroke | Numeral |
|---|---|---|---|
| Available | White pan, tier-hue back at full glyph; tier hue solid at mid/mark | Tier hue 1.5px | Dusk (seat LOD only) |
| Taken | Stone solid | none | none |
| Selected | Gold solid | Night 2px + Bloom outer ring | Night 700 |

Accessible seats keep the white inner ring; blocked seats keep the strike.
Contrast for every state in every palette set is proven in Phase 3 by the
existing harness (`scripts/verify/seat-contrast.mjs`) extended to the new
states.

---

## 6. The stage as geometry (item 2)

No labelled rectangle, no letterspaced caps bar. The stage is architecture:
Veil fill, Night 1.5px outline, 45 degree drafting hatch at Night 8%, a 2px
Night apron line on the house edge, and the word Stage set small in Manrope
600 caps 10px Dusk inside the apron. Four shapes the organiser picks from,
stored in the layout JSON as `{ stage: { shape, x, y, width, depth,
rotation } }`; the cascade's focal point derives from the apron's midpoint,
upgrading `resolveFocalPoint` with no migration.

1. **Proscenium with apron** (TryBooking r47 answers): a trapezoid, front
   edge W, back edge 0.72W, depth D, receding upstage; a shallow apron arc
   bulging 0.12D into the house past the front edge.
2. **Thrust:** an upstage band W x 0.5D plus a tongue 0.55W x 0.6D
   projecting into the seating, front corners rounded at 0.08W.
3. **In the round** (Oztix r47-01's bowed table zone answers): an ellipse
   rx 0.5W, ry 0.5D at the plan's focus; the house faces inward.
4. **Flat-floor band:** a full-width strip 0.35D deep, hatched, with only
   the 2px front line: the deck of a hall or a band room.

---

## 7. Aisles and staggered rows (item 3)

TryBooking's auditorium reads as architecture because its rows are staggered,
uneven, and punched through with real gaps. Three primitives deliver that:

- **The aisle primitive:** `{ kind: 'aisle', orientation: 'vertical' |
  'horizontal', x, y, length, width }`. A vertical aisle shifts every seat
  on its far side outward by its width within its span, punching a void
  through any block it crosses. The cascade's `rowSegments` already splits
  runs on gaps at 1.6x the median step, so orphan guards keep working with
  zero changes.
- **Stagger:** `RowsBlock.stagger` offsets alternate rows horizontally by n
  px, the brick-bond look of a real house.
- **Uneven rows** already exist (`seatsPerRow` as a list, centre align);
  the builder surfaces them beside stagger so the three read as one group.

---

## 8. Section polygons (item 4)

First-class objects, auto-derived: the convex hull of each section's seats,
padded by one seat pitch, corner-rounded, filled with the section's tier hue
at 26% over Veil with a 1.5px hue outline (Oztix r47-01 answers). The label
sits IN the polygon: section name in Archivo 700 caps, and under it the
price range in the data face ("$59 to $129"). Polygons are the whole room at
overview LOD, become boundaries at mid LOD, and disappear at seat LOD.

---

## 9. Level of detail, three states (item 5)

The scale `s` is canvas px per world unit; default seat pitch is 24 world
units, so effective chair pitch is `24s` px. The thresholds, chosen so each
state switches while its content is still legible, with a 160ms opacity
crossfade between states:

| State | Threshold | What draws |
|---|---|---|
| **Overview** | `s < 0.30` (pitch < 7.2px) | Section polygons with name and price range, stage, aisles as voids, venue objects. Zero seats, zero numerals. |
| **Mid** | `0.30 <= s < 0.70` (7.2 to 16.8px) | Chair marks (mid silhouette), polygon boundaries and pinned labels, row letters on the flanks from `s >= 0.45`. No numerals. |
| **Seat** | `s >= 0.70` (pitch >= 16.8px) | Full chair glyph; numerals on chairs from `s >= 0.90` (chair >= 16px); the seat-number ruler along each block's top edge; row letters on BOTH flanks. |

Reported in Phase 3 exactly as built.

---

## 10. The tooltip (item 6)

One card, three lines plus a state chip, on hover and on tap (Oztix r47-02
answers, beaten by exact seat price rather than a range):

```
$89.00                        <- data face 700
A Reserve                     <- tier name, tier hue
Stalls: Row J, Seat 28        <- location line
[ Selected ]                  <- state chip, only when relevant
```

Desktop: floats beside the cursor inside the sheet. Touch: docks as the
44px strip inside the sheet's bottom edge, never covering the room.

---

## 11. The mini-map (item 7)

The key plan of the signature: a corner block (bottom left on 1440, top
right on 390) drawn on sheet paper with a hairline frame, containing the
polygons, stage hatch and objects in miniature, and one gold viewport
rectangle. Appears when zoom exceeds 1.15x fit, click or drag to move the
viewport. It is a second small canvas fed by the same scene graph.

---

## 12. Venue objects (item 8)

EventBookings ships labelled objects and Oztix draws stair and exit glyphs;
ours are designed, not emoji. Each is a Veil chip with a Night line glyph
and a Manrope label, resizable and rotatable; plus TEXT and ICON free
primitives. Stored in layout JSON as `{ kind: 'object' | 'text' | 'icon' }`.

| Object | The glyph, described |
|---|---|
| Bar | A coupe glass on a counter line, two glass-widths wide |
| Food | Fork and knife flanking a plate circle |
| Toilets | Two door leaves with the universal figures, drawn in line |
| Entrance | A doorway gap in a wall line with an inward arrow |
| Exit | The doorway gap with an outward arrow and EXIT set in caps |
| Stairs | Four descending step lines in profile with a direction arrow |
| Lift | A car outline with paired up and down chevrons |
| Balcony | A curved band with rail ticks along its house edge |
| Box | A small room outline holding two mid-mark chairs |
| Standing rail | A hatched narrow band with a heavier front rail line |
| Text | Free caption in Manrope, size chosen by the organiser |
| Icon | Any glyph above, free-floating without the chip |

---

## 13. Ticket type is the primary colour encoding (item 9)

The buyer's question is what can I afford and where. Seats colour by TICKET
TYPE; section identity moves to the polygon and its in-place label. The
legend is rebuilt as the schedule: one selectable row per type: swatch,
name, price, open count. Selecting a row filters the field: that type's
chairs hold full hue, all others fade to 25%, and taps outside the type are
guarded. Colour-vision palette sets keep working: tier hues map through
`sectionColorForSet` exactly as sections did.

---

## 14. Directionality controls (item 10)

Per EventBookings r47-04: `rowOrder: 'down' | 'up'` (row A at the front or
at the back) and `seatOrder: 'ltr' | 'rtl'` (seat 1 stage left or stage
right), two segmented controls in the rows inspector, implemented in the
pure generator so preview and save cannot diverge.

---

## 15. Trace integration (item 11)

The venue image is a citizen of the canvas: drawn beneath the grid by the
renderer itself, with the transparency slider in a floating chip on the
sheet (EventBookings r47-13 answers). Assisted row detection keeps working
over it: the detect line samples the same image pixels as before. Beating
the evidence: their trace is a static image beside the work; ours sits
under snap, guides, detect and the same LOD camera.

---

## 16. Group tickets (item 12)

A tier whose `min_per_order` is N is a group ticket (the column exists; no
migration). Its legend row reads "Group of N: N seats together". Selecting
any seat of that tier runs the existing cascade for N seats anchored on the
tapped seat, contiguous and orphan-safe by the same guards as every pick;
the group renders with one gold outline around the block.

---

## 17. The two broken promises, honoured

- **View from seat:** opens in the schedule rail (desktop) or as an inline
  card that pushes content below the sheet (mobile): the photo, the section
  name, and the section's polygon simultaneously highlighted on the sheet.
  No dimmed backdrop, no corner X, no lightbox.
- **Mobile inspector:** a numbers strip docked at the bottom, capped at
  34vh, horizontally scrollable fields, expandable on demand; the canvas
  auto-pans the selected block into the visible upper region. The room
  stays in view while its numbers are edited.

---

## 18. ASCII wireframes

### Overview LOD, 1440

```
+--------------------------------------------------------------+----------------+
| SHEET  =========================== hairline double frame ==  | SCHEDULE       |
|                                                              |                |
|                 ///////////////////                          | [#] A Reserve  |
|                 //  hatched stage //   <- proscenium         |     $129  214  |
|                 ///////////////////                          | [#] B Reserve  |
|        +--------+  +----------+  +--------+                  |     $89   377  |
|        | STALLS |  |  STALLS  |  | STALLS |                  | [#] C Reserve  |
|        |  LEFT  |  |  CENTRE  |  |  RIGHT |  <- polygons     |     $59   462  |
|        | $59-89 |  | $89-129  |  | $59-89 |     with prices  | [#] Group of 3 |
|        +--------+  +----------+  +--------+                  |     $150  x3   |
|          ^aisle void^        ^aisle void^                    |----------------|
|        +------------------------------+                      | 2 of us        |
|        |       BALCONY  $59-79        |                      | [Any price]    |
|        +------------------------------+                      | (Find our      |
|  [key plan]                              [- + fit]           |  seats)        |
+--------------------------------------------------------------+----------------+
```

### Mid LOD, 1440 (chair marks, row letters, no numerals)

```
+--------------------------------------------------------------+----------------+
|                  ///////// stage /////////                   | SCHEDULE       |
|   A  n n n n n n   n n n n n n n n   n n n n n n  A          | rows as above  |
|   B   n n n n n     n n n n n n n     n n n n n   B          |                |
|   C  n n n n n n   n n n n n n n n   n n n n n n  C          | selection      |
|   D   n n n n n     n n n s s n n     n n n n n   D          | list           |
|        (stagger)        (gold pair)                          |                |
|   J  n n n n n n   n n n n n n n n   n n n n n n  J          | [view from     |
|  [key plan]                              [- + fit]           |  seat card]    |
+--------------------------------------------------------------+----------------+
```

### Seat LOD, 1440 (full chairs, numeral ruler, both flanks)

```
+--------------------------------------------------------------+----------------+
|        1   2   3   4   5   6   7   8      <- ruler           | $89.00         |
|   J   [c] [c] [c] [C] [C] [c] [c] [c]   J                    | A Reserve      |
|   K   [c] [c] [G] [G] [c] [c] [c] [c]   K                    | Stalls: J-28   |
|   L   [c] [x] [x] [c] [c] [c] [c] [c]   L                    | [ Selected ]   |
|        G = gold selected, x = stone taken                    |                |
|  [key plan]                              [- + fit]           | Reserve 2      |
+--------------------------------------------------------------+----------------+
```

### Overview LOD, 390

```
+------------------------------+
|  [key]      SHEET            |
|      ///// stage /////       |
|   +------+ +------+          |
|   |STALLS| |STALLS|          |
|   | $59+ | | $89+ |          |
|   +------+ +------+          |
|   +----------------+         |
|   | BALCONY  $59+  |         |
|   +----------------+         |
|                    [- + fit] |
+------------------------------+
| [#] A Reserve $129 | [#] B..|  <- legend strip, scrolls
| 2 of us  [Any price] (Find) |
+------------------------------+
```

### Mid LOD, 390

```
+------------------------------+
|  [key]  //// stage ////      |
|  A n n n n n  n n n n  A     |
|  B  n n n n    n n n   B     |
|  C n n n n n  n n n n  C     |
|  D  n n s s    n n n   D     |
|                    [- + fit] |
+------------------------------+
| docked strip: B-4 $89 Avail  |
| legend strip | party control |
+------------------------------+
```

### Seat LOD, 390

```
+------------------------------+
|  [key]  1  2  3  4  5        |
|  J  [c][c][G][G][c]  J       |
|  K  [c][x][c][c][c]  K       |
|  L  [c][c][c][c][c]  L       |
|                    [- + fit] |
+------------------------------+
| $89.00 A Reserve J-28 [Sel]  |
| Reserve 2 seats  $178.00     |
+------------------------------+
```

---

## 19. The critique pass

**Against the generic defaults.** The template answer to "seat map" is the
one we shipped and retired: rounded chips, numerals everywhere, a labelled
stage bar, a legend of coloured dots: it could belong to any product, which
is why it scored zero. The three current AI-design cliches (warm cream with
terracotta serif, near-black with acid green, broadsheet hairlines with
dense columns) are all absent: the sheet is Veil and Night with gold spent
only on the buyer, and its hairlines exist because drawings have frames,
not as a newspaper costume. Numbered markers appear nowhere; the only
sequence on the sheet is the seat ruler, which IS a sequence.

**What changed in this pass, and why.**

1. The stage was first sketched as a Night-filled solid; it read as the
   heavy dark band the light-and-airy law bans, so it became a hatched
   drafting solid: lighter, more architectural, more ownable.
2. The mini-map began bottom-right beside the zoom cluster; two chrome
   blocks in one corner fought, so the key plan took the drafting-correct
   bottom-left (top-right on 390 where thumbs live low).
3. The tooltip was first floated on touch too; it covered rows on 390, the
   exact defect the mobile inspector promise names, so on touch it docks
   inside the sheet's bottom edge instead.
4. Tier hue at overview was first 40% fill; against Veil it swallowed the
   gold viewport of the key plan, so polygon fill settled at 26% with the
   1.5px hue outline carrying the edge.
5. The chair glyph first had leg lines at full size; at 14px they became
   noise, so the silhouette carries on back and pan alone.

**Against the twelve items.** Each item's section above names the capture it
answers and where it goes past it: exact seat price over Oztix's range on
the tooltip; a live-scene key plan over Oztix's static inset; trace under
snap and detect over EventBookings' static image; group picks running the
orphan-safe cascade over EventBookings' manual N-seat rule; ticket-type
legend rows that filter the field over EventBookings' passive list.

---

## 20. Architecture for Phase 2 (the contract)

- `src/lib/seating/render/scene.ts`: the retained scene graph: typed nodes
  (seat, block, polygon, stage, aisle, object, text), world bounds, a
  spatial hash for hit tests, dirty-flagged layers. Pure, unit-tested.
- `src/lib/seating/render/glyphs.ts`: chair paths per size tier and state,
  venue object glyphs, all as Path2D factories. Pure.
- `src/lib/seating/render/stage.ts`: the four stage geometries. Pure.
- `src/lib/seating/render/lod.ts`: the thresholds above as data. Pure.
- `src/lib/seating/render/polygons.ts`: hull, padding, rounding. Pure.
- `src/lib/seating/render/draw.ts`: the layer painters (one canvas pass:
  cull by spatial bucket, batch by state and hue, Path2D reuse).
- `src/lib/seating/render/svg-export.ts`: the printed plan.
- `src/components/seating/seat-canvas.tsx`: the shared interactive canvas
  (DPR, camera, gestures, keyboard cursor, rAF batching) with HTML overlay
  slots. Used by the buyer selector, the builder, and the kit preview.
- `src/components/checkout/seat-selector.tsx`: rebuilt around the sheet +
  schedule layout. All kept logic (cascade, orphan guards, price and party,
  tables, palette sets, reservation flow) survives byte-compatible.
- `seat-map-builder.tsx`: rebuilt on the same canvas with the new
  primitives and the numbers-strip inspector.
- `src/lib/seating/generate.ts`: extended with aisle, stagger, rowOrder,
  seatOrder, stage, objects. Existing charts render byte-identically: every
  new field is optional with the historic default.

Performance contract, measured in Phase 3: pan and zoom frame time under
8ms at 5,000 seats on the desktop lane, under 16ms on the mobile lane, at
500, 2,000 and 5,000 seats, before and after figures published.
