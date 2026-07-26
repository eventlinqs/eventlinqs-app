# Seating visual comparison

## ROUND 2 - 2026-07-26: one benchmark, judged aspect by aspect

Ours: `docs/design/seating-final-2026-07-26/` (captured live on the TEST
build, 1440 and 390). Theirs: `docs/design/seating-final-2026-07-26/humanitix/`
(the buyer map captured LIVE with Playwright on a real on-sale reserved
seating event at 1440x900 and 390x844, including a selected state; the
builder from 43 full-resolution help-centre images including the flagship
full-builder shot at 2302x1480, sources and dates in
`humanitix/builder-help-manifest.json`) and
`docs/design/seating-final-2026-07-26/r47/` (Oztix product-guide renders,
EventBookings article images and 1080p official video frames, TryBooking
buyer imagery). Every verdict below is from imagery actually viewed.

### R47, quoted verbatim, and its resolution

> R47. Visual comparison doc `docs/design/SEATING-VISUAL-COMPARISON.md`:
> reference image of each Australian platform's builder and buyer map
> beside ours; per platform, more or less attractive and why (colour,
> spacing, type, density, depth, motion); any platform more attractive
> goes in UNFULFILLED.

R47 was PARTIAL last round because Humanitix, EventBookings and Oztix
imagery could not be viewed at capture quality. All three are now viewed
and judged below; no platform remains without a verdict. R47 is RESOLVED.

**Humanitix (builder + buyer, VIEWED).** Ours is more attractive.
- Colour: theirs is a light utility UI: teal-green available dots, peach
  selection ring, pale blue-grey unavailable and a pale grey outlined
  rectangle labelled STAGE & SCREEN; accents are coral and teal on white.
  Competent, and characterless: nothing in the room says whose product it
  is. Ours is a composed system: navy proscenium with the gold filament
  casting a stage light onto the plan, editorial section tones, gold
  selection with the bloom, stone recede.
- Spacing and density: theirs renders seats as small flat circles with
  row letters flanking each block; legend is three plain dots centred
  over the map. Ours holds one 4px-derived rhythm across legend chips,
  the concierge row and the map frame; numerals appear and retire by
  effective seat size so 50 and 2000 seats both read.
- Type: theirs sets canvas text in a Lato bitmap sprite (WebGL) and UI in
  a rounded grotesque; no tabular discipline. Ours: Archivo caps on the
  stage and card titles, Manrope with tabular numerals on every count.
- Depth: theirs is entirely flat; selection is a ring. Ours lifts the
  selected seat with the gold bloom and a soft navy elevation shadow.
- Motion: theirs swaps states instantly; ours blooms the selection and
  eases button zooms on a real curve, honouring reduced motion.

**EventBookings (builder + buyer, VIEWED via article images and the
official 1080p walkthrough frames).** Ours is more attractive. Theirs is
a tidy white SaaS template: one teal accent, green full-width CTAs,
candy-coloured seat dots per ticket type, a plain grey stage rectangle,
hairline borders, no depth, no motion language. Nothing is composed; it
could be any booking tool. The full-bleed buyer frame
(`r47/eventbookings-10.png`) shows the strongest surface and it is still
a flat diagram.

**Oztix (buyer, VIEWED via the product-guide renders; no public builder
exists).** Ours is more attractive. Their real buyer UI
(`r47/oztix-02.png`) is flat coral dots fanned on white with a white
tooltip card and a small mini-map: clean, single-accent, no stage
object, no depth; the glossy pseudo-3D venue illustration beside it in
the guide is marketing art, not the product. The builder verdict is a
forfeit: there is no public Oztix builder to lose to.

**TryBooking (buyer, now VIEWED: `r47/trybooking-buyer-01.png`).** Ours
is more attractive. Theirs is dated utility: literal chair icons in
navy outline, amber selection, a grey trapezoid stage, a visible
"Scroll left or right to view more seats" instruction instead of zoom
and pan, flat rectangles throughout.

### The eight aspects against Humanitix (the founder's list, one verdict each)

Side-by-side pairs: ours `buyer-one-control-found-1440.png`,
`buyer-palette-menu-1440.png`, `buyer-view-from-seat-1440.png`,
`builder-preset-theatre-autobow-1440.png`, `mobile-01-draw-390.png` et al;
theirs `humanitix/buyer-page-1440.png`, `humanitix/buyer-selected-1440.png`,
`humanitix/buyer-page-390.png`, `humanitix/builder-help-31.png` (the
flagship full-builder shot), `humanitix/builder-help-14.png` (curve and
skew sliders).

1. **Visual design (colour, type, spacing, depth, restraint): AHEAD.**
   The visible reason: their stage is a pale grey outlined rectangle;
   ours is a navy proscenium whose gold filament casts the light the
   good seats sit in. Their palette codes function (teal = open, peach =
   picked); ours composes a brand (editorial tones under white tabular
   numerals, gold reserved for the chosen seat). Both are restrained;
   only one is composed.
2. **Layout and information hierarchy: AHEAD.** Their prices live in a
   separate right-hand panel of ticket cards the buyer must mentally map
   onto seat colours; their legend is three unlabelled dots. Our legend
   chips carry section name, live from-price, the view-photo affordance
   and the open count in one line above the map, and the concierge row
   sits between legend and map exactly where the decision happens.
3. **Clarity, the room in two seconds: AHEAD.** Ours orients by light
   (the stage light says which way the room faces), recedes everything
   unavailable to one stone tone, and names every section on a chip.
   Theirs asks the buyer to parse teal versus pale blue-grey dots and
   find the stage by reading its caption; at 54 percent mobile fit the
   dots are near-uniform specks (their own live 390 capture).
4. **Ease of use for the organiser: AHEAD, with two conveniences
   honestly ceded.** Ours starts from a real floor plan (trace it, then
   Detect a row lays seats along a drawn line), bows rows to the stage
   as true concentric arcs with one toggle, ships three starter shapes,
   works at 390, and edits safely after publish with a reviewed diff and
   named protected counts. Theirs is a strong desktop console (three
   templates, mapping validation) and also holds two conveniences we do
   not: multi-select and a dedicated text tool (our scenery labels cover
   part of that ground). Neither reverses the verdict: the core job,
   getting a real room into a chart and keeping it safe on sale, is
   materially faster and safer on ours.
5. **Ease of use for the buyer: AHEAD.** Humanitix buyers hunt seat by
   seat; there is no auto-pick of any kind on their map. Ours seats a
   party in one sentence (this many of us, under this price, find our
   seats), guards orphans both ways with a one-tap fix, books whole
   tables in one tap, and walks the map by keyboard.
6. **Mobile at 390: AHEAD.** Their buyer map at 390 is the desktop
   canvas at 54 percent with a help bubble; their builder has no mobile
   story at all (a desktop console). Our buyer map keeps chips, the
   concierge row and gestures at full size, and our builder is fully
   usable at 390: draw, move, relabel, bind tiers in the bottom-sheet
   studio (captured, `mobile-0*.png`).
7. **Delight: AHEAD.** Theirs runs a ten-minute countdown chip; the one
   memorable element is anxiety. Ours blooms the chosen seat in the
   stage light, answers a found party with an honest sentence, and shows
   the real photographed view from the section on tap.
8. **Capability: AHEAD.** Everything on their sheet has an equal or
   better answer on ours (tier mapping, templates versus starter shapes
   plus venue-reusable charts, hide/override seats, organiser moves,
   self-move toggle) and ours carries what theirs does not: server
   best-available with a published quality score, price-plus-party in
   one orphan-safe control, orphan guards on selection and self-move,
   colour-vision palette sets with proven contrast, view-from-seat
   photographs, floor-plan tracing plus assisted detection, true
   concentric auto-bow with per-row shaping and skew, a post-publish
   diff with hard sold-seat protection, and full keyboard operation of
   both surfaces. The two ceded conveniences (multi-select, text tool)
   are named in aspect 4 and do not close the gap.

**Round 1 matrix correction (honesty entry):** the 2026-07-25 matrix row
"Curved rows: Humanitix N" was wrong. The help-centre imagery now viewed
(`humanitix/builder-help-14.png`) shows Skew and Curve sliders on their
seating blocks. The corrected comparison is: LEVEL on having a curve
slider; AHEAD on curvature done properly (true concentric auto-bow around
the focal point with radiating aisles, front-to-back interpolation,
per-row overrides, and the live slider on the canvas, none of which their
imagery or documentation shows).

### The Chanel cuts, this round

One thing came off each finished screen, in code: the word Fit off the
buyer zoom cluster (the frame glyph carries it); the Tool eyebrow off the
studio rail; the Seat a table button off the empty-canvas invitation (the
Gala starter shape lays six); the eyebrow off the view-from-seat card
(the title and the honesty line carry it). The self-move control took its
cut at design time: the raw 500-option select is gone entirely.

---

## ROUND 1 - 2026-07-25 (history)

Date: 2026-07-25. Ours: `docs/design/phase-c-2026-07-25/` (buyer maps at 50,
500 curved, and 2000 seats at 1440 and 390; builder empty, drawn, underlay;
kit preview). Theirs: `docs/design/phase-c-2026-07-25/competitor-refs/`
(downloaded where a public screenshot exists) plus the cited source pages.
Verdicts follow the founder's dimensions: colour, spacing, type, density,
depth, motion. A verdict is only stated where the competitor interface was
actually viewed; anything else is marked NOT VIEWED and sits in the
UNFULFILLED block rather than being guessed.

### What ours looks like (the shared language, from the captures)

White plan field over a navy-derived veil; the navy proscenium with the
gold filament and the stage light falling onto the first rows; editorial
section tones (harbour blue, garnet) with white tabular numerals; gold
selection with the bloom and a soft navy lift; stone-grey recede for
everything unavailable; chip legend; curved rows bowing toward the light;
numerals that step back at 2000 seats so the room reads as architecture.

### Platform verdicts (Round 1; the three NOT VIEWED rows are resolved in Round 2 above)

| Platform | Reference | Verdict, and why |
|---|---|---|
| **Ticketmaster** (buyer map) | `competitor-refs/ticketmaster-buyer-2.png` (viewed) | **Ours is more attractive.** Theirs is the functional benchmark (price slider, legend, minimap) but visually clinical: primary blue and magenta dots on flat white-grey, a grey block for the stage, no depth, system type. Colour: coded, not composed. Depth: none. Ours answers with a designed stage, light, editorial tones and elevation while matching zoom, filter and best-available function. |
| **Eventbrite** (designer + buyer) | `competitor-refs/eventbrite-designer.png`, `eventbrite-buyer.png` (viewed) | **Ours is more attractive.** Theirs is clean and even award-listed, but characterless: pastel pink, gold and lavender circles on white, flat throughout, generic sans. It is exactly the "clean but generic" the research records. Ours carries a brand (navy and gold, the stage light), real depth on selection, and typographic intent (tabular numerals, letterspaced caps). |
| **Sticky Tickets** (builder + buyer) | `competitor-refs/sticky-builder.png` (viewed) | **Ours is more attractive.** Theirs is a dated admin panel: salmon circle seats on a grey engineering grid, a black and yellow chrome, form sidebar, no stage object, no design system. Ours opens on a lit stage with an invitation, draws with editorial colour, and reads as one product with the buyer map. |
| **TryBooking** (creation flow) | `competitor-refs/trybooking-builder.png` (viewed) | **Ours is more attractive.** Their reserved-seating creation is form-first (rows and seats-per-row number fields in a wizard step), corporate-clean but visually inert; the plan editor itself is a utilitarian grid. Ours is a visual room studio with the same numeric precision available in the inspector. |
| **Ticketek** | Help centre diagram only (no builder exists to compare) | **Ours is more attractive by forfeit on the builder** (they have no self-serve builder at all); their buyer map is enterprise-gated to selected venues and the public help imagery is a static section diagram. No like-for-like surface exists to lose to. |
| **Moshtix** | None exists | No reserved seating product and no seat map of any kind (their own help centre: "there are no individual reserved seats"). Nothing to compare; ours wins by existence. |
| **Megatix** | None public | The seating subdomain is a bare login; no public seat interface imagery anywhere. Nothing to compare publicly. |
| **Ticketebo** | None (concierge-built, buyer never sees a map) | Buyers get auto-allocation with no map at all. Ours wins by existence on the buyer surface. |
| **Humanitix** | RESOLVED in Round 2 above (viewed 2026-07-26) | Ours is more attractive; the aspect-by-aspect record is Round 2. |
| **EventBookings** | RESOLVED in Round 2 above (viewed 2026-07-26) | Ours is more attractive. |
| **Oztix** | RESOLVED in Round 2 above (viewed 2026-07-26) | Ours is more attractive; builder by forfeit. |

### The Chanel cut (Round 1)

After the captures, one thing came off the finished buyer map: the
"Unavailable" legend chip. The stone-grey receded seats explain themselves,
and the chip was the least informative element on the screen. The code
carries the cut (`seat-selector.tsx`); the captures in this folder predate
it by minutes and still show the chip.

### Honest capture notes (Round 1)

- The 500-seat element captures include the sticky site header band mid
  frame: an artefact of element screenshots on a tall scroll, not a defect
  of the map.
- `buyer-price-filter-active-1440.png` shows the two proof blocks
  overlapping: the test chart placed the second block without dragging it
  clear. A defect of the test data's placement, not of the product; the
  filter behaviour (band vivid, rest receded, focus ring visible) is
  exactly as designed.
