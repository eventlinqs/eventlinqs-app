# Seating supremacy: research, matrix, build, proof

## ROUND 2 - 2026-07-26: one benchmark (Humanitix), one parts bin

Ledger: `docs/roast/seating-final-2026-07-26.md`. Evidence:
`docs/design/seating-final-2026-07-26/`. The eleven-platform row-by-row
comparison below (Round 1) is retained as history; from this round there is
ONE benchmark to beat on design (Humanitix) and a parts bin to absorb.
Results are appended to this section as the round completes.

### R2.1 The aesthetic brainstorm (written before any code, 2026-07-26)

The Round 1 system holds: the six seating tokens (`seat-night`, `seat-dusk`,
`seat-veil`, `seat-gold`, `seat-bloom`, `seat-stone`), the editorial section
tones, the stage light signature, tabular numerals, the chip legend. This
round adds nine capabilities; the brainstorm below is the token DELTA for
the new surfaces only. No new brand colours; every delta derives from the
existing tokens or is a functional accessibility ramp derived from the
editorial palette.

1. **Colour-vision palette sets (new, functional).** Three alternate section
   ramps beside the house editorial ramp: red-green (protan), red-green
   (deutan), blue-yellow (tritan). Each tone keeps the house tone's depth
   (white numerals stay 4.5:1+) while moving hue onto the axis the viewer
   can separate: the protan and deutan ramps live on blue against
   gold-brown; the tritan ramp lives on red against blue-green, with
   luminance steps carrying what hue cannot. Gold selection, navy stage,
   stone recede are IDENTICAL in every set: the brand does not dim for
   accessibility, the sections adapt around it. The switcher is a quiet
   "Seat colours" chip at the legend's end, not an eye-icon dropdown.
2. **One concierge row (party + price in one control).** The best-available
   row and the price chips merge into a single bordered group: a party
   stepper (tabular numerals), the price chips, one gold action. One label:
   "Seats together". Two controls become one; the map above stays the hero.
3. **The diff sheet (post-publish editing).** No git red-green. Four
   semantics from the existing system: protected sold and held seats lead,
   gold lock glyph on navy chip; additions carry the section tone keyline;
   repositioned seats carry `seat-dusk`; removals carry `seat-stone` with a
   struck numeral. The sheet opens from the sync action and nothing commits
   until the founder-grade sentence at the top is true: "Sold and held
   seats are never touched."
4. **Mobile studio chrome.** Below `lg` the inspector becomes a solid white
   bottom sheet with a navy-tinted grab handle; the tool rail becomes a
   44px icon bar; the canvas gains the buyer map's pinch and pan engine.
   Nothing translucent, nothing glass.
5. **View from seat.** A photo card, not a lightbox: navy scrim base, the
   gold filament rule, Archivo caps caption ("VIEW FROM A RESERVE"), the
   photograph full-bleed above it. Entered from a camera glyph on the
   section legend chip; closed by the one control.
6. **Curve controls.** The bow slider stays the hero; per-row shaping is a
   front-and-back pair of sliders plus an auto-bow toggle labelled "Bow to
   the stage", so the theatre curves the way real rooms do: around the
   focal point, deeper at the back.
7. **Floor plan assist.** The trace tool inherits the underlay language:
   the detected row previews as ghost seats in `seat-dusk` at 40 percent
   until accepted, then takes the section tone. Gold dashed line while
   drawing, the same alignment-guide gold as the studio's snap guides.

### R2.2 The critique (against generic defaults, before code)

- **Refused: the assistive-tech cliche.** An eye icon and "Colorblind mode"
  toggle is the generic default. Changed to: "Seat colours" chip, three
  sets named by what they solve (red-green, blue-yellow), live swatch
  preview in the menu, remembered per device. Plain words, no medicalised
  icon, no US spelling.
- **Refused: the git diff.** Added-green and removed-red is the default
  the whole industry ships. Changed to the four-semantic navy system above;
  the protected count leads because safety is the story, not churn.
- **Refused: the airline widget.** Party size and price as two dropdowns
  and a submit button reads as a flight search. Changed to one bordered
  row where the stepper and chips share a baseline and the single action
  carries the gold; it reads as one sentence: this many of us, under this,
  find us seats.
- **Refused: the lightbox.** View-from-seat as a dimmed overlay with a
  corner X is every gallery since 2012. Changed to the photo card anchored
  in the seating context with the section's own name in Archivo caps.
- **Refused: the three AI-default looks** (cream and serif and terracotta;
  near-black and acid; broadsheet hairlines) - unchanged from Round 1,
  still refused; nothing in this round introduces them.
- **Kept and named: the bottom sheet grab handle.** It is a genuine
  convention doing real work on a 390 canvas; it is tinted navy at 8
  percent, the one generic-adjacent element this round retains.

### R2.3 The build record (all nine parts-bin items, one commit each)

Evidence: `docs/design/seating-final-2026-07-26/` (34 files, every capability
driven LIVE on the TEST build at 1440 and 390, plus the contrast proof).
Gates at delivery: 875 unit tests, typecheck, lint (0 errors) and the
production build all green.

1. **Curved rows done properly.** Auto-bow lays true concentric arcs
   around the stage: every row a circle on a shared focal centre, seats
   spaced evenly ALONG the arc so aisles radiate and back rows flatten
   the way a real room rakes; manual mode gains a front-and-back bow pair
   with per-row overrides behind a Shape row by row disclosure; the live
   bow slider sits ON the lit canvas. Skew (px-per-row shear) joins it.
   Existing charts render byte-identical, pinned by test. What a person
   notices: the theatre starter opens as a genuine fanned auditorium
   (`builder-preset-theatre-autobow-1440.png`), not a stack of bent lines.
2. **Floor plan intelligence, assisted.** With a plan traced under the
   grid, Detect a row samples the plan's pixels along a drawn line (a
   three-pixel band on a downscaled offscreen canvas), counts dark blobs
   as seats and lays the row on the line with count, spacing and angle
   (`builder-detect-anchor-1440.png`, `builder-detect-row-placed-1440.png`).
   Low contrast lays an even row and says so. HONESTLY REMAINING for full
   auto-detect: whole-plan blob detection and row clustering with no
   guiding line; not shipped this session.
3. **Price and party size in ONE control.** One bordered row reads as a
   sentence: this many of us, under this price, find our seats. The band
   also drives the map recede, the cascade runs inside the band, orphan
   accounting runs on the whole real room, and an under-supplied band
   answers an honest none (`buyer-banded-receded-1440.png`,
   `buyer-banded-found-1440.png`). Research verdict at R2.4.
4. **Best-available quality scoring.** Every pick scored on contiguity
   (largest block over party size), focal proximity, and orphans created
   (a multiplicative 0.7 per strand); writing the score exposed a real
   weakness and produced the best-split leg, a deterministic beam judged
   by the score itself. Reproducible proof: on a real generated
   two-section curved chart across three deterministic occupancies and
   five party sizes, our pick meets or beats naive row-fill in EVERY
   case, wins in aggregate, and strands strictly fewer singles
   (`tests/unit/seating/quality-score.test.ts`).
5. **Mobile builder, fully usable at 390.** Pinch and pan from the buyer
   map's engine, a solid bottom-sheet inspector, 44px tools, and every
   operation captured live at 390: draw, bind a tier, move, relabel,
   save (`mobile-01..05-*.png`). Plus redo, and three starter shapes.
6. **Safe post-publish editing.** A read-only diff of exactly what the
   additive sync will do, protected sold and held counts leading with the
   lock, then adds, moves and never-sold removals with named seats; only
   an explicit confirm commits (`diff-sheet-1440.png`, driven against an
   event with 7 sold and 2 reserved seats). The room studio and chart
   list name their live attachments, and the silent chart-swap failure in
   updateEvent now refuses in plain words.
7. **Colour-vision palette sets.** Protan, deutan and tritan sets beside
   the house ramp, six wide-separated tones each, switchable from the
   legend and remembered per device; gold selection, navy stage and stone
   recede identical in every set. Proof: WCAG text and boundary pairs
   PLUS Machado-simulated Lab separation for every seat state in every
   set, machine-checked (`seat-contrast-all-palettes.txt`, 164 rows, all
   pass).
8. **Attendee self-move that cannot strand a seat.** Flag-gated and
   organiser opt-in as before; the offered list is orphan-guarded and
   price-matched server-side, the guard re-runs at move time, and the
   control names the held-back count (`selfmove-control-1440.png`).
9. **View from seat by photograph.** One real photo per section, uploaded
   in the studio through the proven pipeline (magic bytes, EXIF strip,
   ownership scoping; the capture drive uploaded a real JPEG end to end
   into the section-views bucket), shown to buyers from a camera glyph on
   the section chip as a navy photo card with the honesty line
   "Photographed from this section, not a render"
   (`buyer-view-from-seat-1440.png`). Migration `20260726000001`, applied
   to TEST.

Also shipped: full keyboard operation of both surfaces (Tab cycles blocks,
arrows nudge in the studio; arrows walk seat to seat with a spoken cursor
on the buyer map: `buyer-keyboard-cursor-1440.png`), and the organiser room
view's traffic-light status colours replaced with brand tones.

**Defects the live drive caught and fixed in the same session** (the
reason the drive exists): the mobile sheet swallowing marking-tool taps;
the empty-canvas invitation blocking detect clicks over a traced plan;
and the price band reading tier prices from a non-existent column, which
made every banded request answer "nothing fits". All three are separate
fix commits with the story in the message.

### R2.4 The research verdict for the ONE control (F22, cited, 2026-07-26)

Live survey of 16 platforms and vendors (Ticketmaster, Ticketek,
Eventbrite, Humanitix, AXS, SeatGeek, StubHub, Vivid Seats, TodayTix,
DICE, Tixel, Oztix, TryBooking, Sticky Tickets, EventBookings, Seats.io,
plus the 3D vendors): **no surveyed platform documents a single
buyer-facing control that takes party size and a price ceiling together
and returns contiguous seats with orphan protection applied in that same
request.** The closest prior art, honestly stated: Seats.io's
best-available API combines quantity plus CATEGORY constraints with
orphan prevention on by default, developer-facing only, no price-number
input (docs.seats.io/docs/api/best-available, viewed 2026-07-26);
Ticketmaster's "Choose Seats For Me" takes quantity and a price dropdown
in one form but its documentation is silent on contiguity and orphans
(ticketmaster.com.au/interactiveseatmap/faq.html, viewed 2026-07-26);
Ticketek allocates best-available within a chosen price CATEGORY and
separately enforces a no-single-seats rule in seat changes
(premier.ticketek.com.au Seatmap.HelpGuide, viewed 2026-07-26). The
supportable claim is exactly: FIRST TO COMBINE the four documented
guarantees (party size + price ceiling + contiguity + orphan safety) in
one buyer control; never "first to auto-pick seats".

### R2.5 The outstanding items from the last round, closed

- **R31 (PARTIAL: curved rows LEVEL, price filter LEVEL).** Closed by
  build: curvature now carries auto-bow concentric geometry, per-row
  shaping, skew and the on-canvas live slider, beyond any surveyed
  implementation including the specialist's; the price filter is now half
  of the ONE control no platform documents (R2.4). Both formerly LEVEL
  rows are now AHEAD with capture proof.
- **R46 (PARTIAL: the poster seat map premise).** Closed by founder
  ruling, recorded verbatim in the brief: no seat mini-map on the A4
  poster. Not revisited.
- **R47 (PARTIAL: three platforms not viewed).** Closed by evidence:
  Humanitix (live buyer captures plus 43 builder images), EventBookings
  and Oztix imagery obtained and judged; verdicts in
  `SEATING-VISUAL-COMPARISON.md`. Also corrected there: Round 1's matrix
  wrongly recorded Humanitix as having no curve control; their builder
  has Skew and Curve sliders, and the corrected verdict is LEVEL on
  having a slider, AHEAD on curvature done properly.
- **Founder rulings held:** no poster mini-map; 3D view-from-seat stays
  parked (the photograph ships instead); seating cost stays free.

---

## ROUND 1 - 2026-07-25 (history)

Date: 2026-07-25. Companion to `docs/design/PHASE-C.md`. Evidence in
`docs/design/phase-c-2026-07-25/`. Roast ledger:
`docs/roast/phase-c-launch-kit-seating-2026-07-25.md`.

This document is written in the order the founder mandated: the aesthetic
brainstorm FIRST, its critique SECOND, then the build, then the functional
matrix and the supremacy verdicts. Research findings are cited inline; the
full per-platform findings live in section 5.

---

## 1. The aesthetic brainstorm (3e step 1, written before any code)

**Token discrepancy reported first (constitution rule):** the brief names
gold `#D4A437`; the binding tokens in `globals.css` are gold-500 `#D4A017`
and gold-400 `#E8B738` (the poster and the buyer map already carry
`#D4A017`). The tokens win; every derivation below starts from `#0A1628`
and `#D4A017`.

**The six named seating tokens:**

| Token | Hex | Derivation | Job |
|---|---|---|---|
| `seat-night` | `#0A1628` | ink-900 verbatim | stage, structure, primary labels |
| `seat-dusk` | `#24344D` | navy lifted 14% toward white | secondary labels, row letters, quiet chrome |
| `seat-veil` | `#EDF0F4` | navy at 6% over white | canvas wash, section tint underlays, the builder grid field |
| `seat-gold` | `#D4A017` | gold-500 verbatim | the selected seat, the focal moment |
| `seat-bloom` | `#E8B738` | gold-400 verbatim | the selection bloom ring, focus rings on dark |
| `seat-stone` | `#D9D9D6` | ink-200 verbatim (the one neutral inherited from the ink ramp) | sold, held, blocked: everything that recedes |

Section fills stay on the existing editorial palette
(`src/lib/seating/palette.ts`: ten deep tones, every one verified 4.5:1+
with a white numeral). Never traffic-light red-amber-green anywhere.

**Type roles:** Archivo (display) for the stage wordmark and section names in
caps; Manrope (UI face) for controls and the legend; the utility face for
seat and row labels is Manrope with `font-variant-numeric: tabular-nums`,
weight 600, letter-spacing 0.02em, so numerals align in columns and read at
small optical sizes.

**Layout concept: the room as a stage-lit plan.** White plan field inside a
`seat-veil` washed frame; the stage is a designed object (navy body, gold
filament rule, Archivo letterspaced wordmark); orientation comes from light,
not arrows.

**The ONE signature element: the stage light.** A soft gold wash cast from
the stage apron onto the plan (a shallow radial, gold at 4% fading to zero
within a bounded apron), so every chart carries the same quiet answer to
"which way do I face": the light falls from the stage. The focal point of
best-available lives where the light lands, the selected seat blooms gold,
and the whole system reads as one idea: the good seats sit in the light.

**Seat geometry:** one corner radius at 30% of seat size, one gap-to-seat
ratio of 0.3, optical adjustments by effective on-screen size: numerals
render only when a seat draws at 14px or larger, keylines thin below 10px,
so 50-seat rooms read warm and 2000-seat rooms read clean.

**States:** available = section tone with soft white keyline; hover =
the same tone brightened with the bloom ring at 40%; selected = seat-gold
with seat-night numeral and the bloom; held and sold = seat-stone (held
carries a dashed keyline so staff can tell them apart on enquiry);
accessible = section tone with a white ring and the wheelchair glyph beside
the row; companion = section tone outline only.

## 2. The critique (3e step 2, before building)

Held against the brief, three parts of the plan failed and were revised:

1. **The full-canvas light cone failed the density test.** A wash across the
   whole plan flatters 50 seats and muddies 2000. REVISED: the stage light
   is clamped to a bounded apron (roughly six row-depths), and the plan
   field beyond it stays clean white. The signature survives at every
   density instead of only in the demo shot.
2. **`seat-veil` as the sold-seat fill failed the legibility test.** Veil on
   veil vanishes. REVISED: unavailable seats keep `seat-stone` (the existing
   ink-200), and veil is reserved for the canvas wash and section tint
   underlays. This is also one fewer new value on the seats themselves.
3. **The generic test.** A white canvas with coloured sections could be any
   competent seating tool. What makes this one EventLinqs and nothing else:
   the navy and gold system carried into the plan (night stage, gold
   filament, gold selection bloom), the editorial section tones instead of
   any default swatch row, Archivo caps on the stage and sections, and the
   stage light as the orientation idea. The dot grid in the builder is the
   one generic-adjacent element retained, for function; its dots tint to
   navy at 8% so even the grid is the brand's.
4. **AI-default calibration (the three looks to refuse):** no cream field
   with a high-contrast serif and a `#D97757` terracotta accent (our field
   is white over a cool navy-derived veil, our faces are the house sans
   stack; the palette's pre-existing deep rust `#9A3E1C` is not featured as
   an accent anywhere new); no near-black with an acid accent (the dark
   surface here is a photograph-free stage object, not a page treatment);
   no broadsheet hairlines and zero radius (seats keep their 30% radius,
   elevation is soft shadow, rules are the gold filament, not hairline
   grids).

## 3. What was already true (verified before building)

The founder's aesthetic displeasure was the primary finding, so the audit
checked what the current surfaces actually carry before changing them:

- Curved rows ALREADY exist end to end: `curveDepth` sine-bow geometry
  (`src/lib/seating/generate.ts:245`) and a numeric control in the builder
  (`seat-map-builder.tsx:758-760`). What was missing was the designed
  control (a slider), the reference-image underlay, and any way a buyer
  would feel the room was real.
- The editorial section palette ALREADY exists (`src/lib/seating/palette.ts`)
  with contrast verified 6.8:1 to 10.8:1 for white numerals.
- The gold selection bloom ALREADY exists on the buyer map
  (`seat-selector.tsx`, `.seat-bloom`), as does the touch zoom and pan
  engine and per-seat screen-reader labels.
- One-tap whole-table booking ALREADY exists (`seat-selector.tsx:413`).

## 4. What was built (3c), each at or above the best observed grade

| Item | What shipped | Where |
|---|---|---|
| S1 | Server-side best-available v2: per-chart focal point (explicit layout focal, stage scenery anchor, or top-centre fallback, so every existing chart works with no migration), orphan-seat prevention on by default with admissible-window shifting, accessible plus companion mixing in one request, self-calibrating aisle detection, and the mandated cascade: contiguous rows, then scattered, then whole table, then GA signalled honestly | `src/lib/seating/best-available.ts`, `src/app/actions/best-available.ts`, wired in `seat-selector.tsx`; 17 unit tests in `tests/unit/best-available.test.ts` |
| S2 | The buyer-selection orphan guard: an advisory nudge naming the stranded seat with a one-tap "Sit us together" re-pick; never a wall, and pre-existing isolation never nags | `selectionCreatedOrphans` in `best-available.ts`, nudge UI in `seat-selector.tsx` |
| S3 | Curved rows (sine-bow geometry already shipped; the control became a designed slider with a live bow readout) plus the floor plan tracing underlay with a visibility slider (session-only by design: venue documents never persist into the chart) | `seat-map-builder.tsx`, `generate.ts:245` |
| S4 | Price band filter on the buyer map: distinct prices as chips (ranges when busy); seats outside the band recede to 22 percent and stop selling until cleared; the room always stays whole | `seat-selector.tsx` |
| 3e | The stage light signature on all three surfaces, elevation on selection, density optics, tabular numerals, chip legend, eased button zoom honouring reduced motion, gold focus rings, keyboard-editable selection, the invitation empty state, and the kit preview brought onto the same language | `seat-selector.tsx`, `seat-map-builder.tsx`, `seat-map-preview.tsx` |

Grade check against the best observed implementation per capability: the
cascade mirrors the specialist's documented seven-step shape (contiguous,
degrade, scattered, tables, GA) plus focal proximity and orphan prevention
on by default; the orphan guard exceeds the observed implementations (the
strongest Australian one blocks the selection outright; ours names the seat
and re-picks in one tap without removing the buyer's right to choose); the
underlay matches the reference-image tracing concept; the price filter
matches the strongest buyer map's band-highlight pattern with recede rather
than hide.

## 5. The research record (3a), condensed, all live-fetched 2026-07-25

Full findings with every URL live in the research transcripts; the decisive
facts per platform:

- **Humanitix**: free drag-and-drop builder (tables, rows, GA, rotation,
  labelling, hide seats, tier mapping with capacity auto-match); post-sale
  attendee moves with auto-updated tickets and optional attendee self-move;
  no curved rows, no focal point, no auto best-available; buyer picks or
  organiser assigns. 4% + $0.99 AU, all features all plans.
  (help.humanitix.com articles 8905642, 8914357; humanitix.com/au/pricing)
- **Eventbrite AU**: self-serve designer (sections, tables, venue objects,
  curve and skew on sections, tiered pricing); auto-sells best available
  first; reviewers call it clunky and inflexible for gala table picking; no
  mobile chart editing. AU fee 5.35% + A$1.19, reserved seating included.
  (eventbrite.com.au/organizer/features/reserved-seating, capterra.com/p/114949, eventbrite.com.au/organizer/pricing)
- **Ticketek**: enterprise only, no public organiser platform (Marketplace
  is fan resale); buyer default is automatic best-available within a price
  category; the interactive map (selected venues only, promoter-controlled)
  has zoom, price-category filtering, and an isolated-single-seat guard.
  No public pricing. (help.ticketek.com.au 360001896307, premier.ticketek.com.au Seatmap.HelpGuide)
- **Ticketmaster AU**: TM1 Events is client-contract only (custom floor
  edits, focal-point selling order, reusable configurations); the buyer map
  is the strongest in market (section zoom, price slider, colour coding,
  Choose Seats For Me, accessible toggle, pinch zoom in app) but is
  withheld from high-demand onsales and can be switched off per event.
  (business.ticketmaster.com/tm1-events-key-features, ticketmaster.com.au/interactiveseatmap/faq.html)
- **Moshtix** (Ticketmaster-owned, operating): self-serve GA in minutes,
  but NO reserved seating at all: "there are no individual reserved seats";
  no buyer map exists. (business.moshtix.com; tixsupport.moshtix.com.au 360000910596)
- **Oztix**: a real Reserved Seating product (drag and drop, reusable
  templates, tier pricing, accessible and companion seats, holds and focal
  points, choose-your-own or best-available, tables and allotments), but
  gated behind a book-a-demo sales motion with unpublished pricing.
  (assets.oztix.com.au Reserved-Seating product guide PDF)
- **Megatix**: a seating login subdomain exists with zero public
  documentation; live events show unreserved GA or organiser-allocated
  tables; no buyer seat picker found. (seating.megatix.com.au; megatix.com.au/faq)
- **TryBooking**: solid self-serve builder (rows, sections, stage object,
  wheelchair designation, venue templates exportable between accounts,
  three table modes); buyer picks a seat; no best-available, no curved
  rows documented; 50c + 2.5% AU, seating included.
  (learn.trybooking.com 41841, 41840, 41856; trybooking.com/pricing)
- **Sticky Tickets**: self-serve builder with curve and skew shape tools,
  tables (round, rectangular, oval), extras, PDF export; one plan per
  event; editing after publish is restricted and support-mediated; buyer
  picks a seat; no best-available. Tiered flat fees, seating included.
  (help.stickytickets.com.au custom-seating-layout-guide; stickytickets.com.au/pricing)
- **EventBookings**: basic drag builder (row blocks, tables, icons, tier
  assignment); allocated seating gated behind Premium (AUD 99/month);
  sparse documentation. (support.eventbookings.com/allocated-seating; eventbookings.com/pricing)
- **Ticketebo**: concierge-built plans (one-off setup fee), buyer NEVER
  picks a seat (Next Best Available auto-allocation with group-aware
  logic); seat moves via phone or email to staff.
  (help.ticketebo.com.au how-does-allocated-seating-work; ticketebo.com.au/pricing)
- **Seats.io** (specialist benchmark, not a ticketing platform): the
  reference designer (curves with smoothing, reference-image tracing, Scan
  a chart, multi-floor, colourblind-safe sets) and renderer (documented
  7-step best-available cascade, focal point, orphan prevention, mixed
  accessible requests, view from seat), at roughly EUR 0.12 to 0.18 per
  used seat on top of ticketing. (seats.io/features; docs.seats.io/docs/api/best-available; seats.io/pricing)

## 6. THE MATRIX (3b)

Columns: the eleven Australian-market platforms, the specialist benchmark,
EventLinqs before this build, EventLinqs after. Cells: Y (documented), N
(documented absent), E (exists but enterprise, demo, or paywall gated),
? (undocumented). The verdict column judges EventLinqs AFTER against the
best AUSTRALIAN platform on that row, per the founder's rule.

| Capability | Hum | EB | Ttek | TM | Mosh | Oz | Mega | TryB | Sticky | EvB | Tebo | Seats.io | EL before | EL after | Verdict vs best AU |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Open self-serve reserved chart builder | Y | Y | N | E | N | E | ? | Y | Y | E(paywall) | N | Y(SaaS) | Y | Y | AHEAD of the enterprise-gated majors; LEVEL with the SMB tier on openness, AHEAD of it on what the builder does (below) |
| Rows + tables + GA zones in one chart | Y | Y | N | E | N | Y | ? | Y | Y | Y | N | Y | Y | Y | LEVEL on presence; AHEAD on scenery annotations + per-seat notes (no AU platform documents either) |
| Curved rows | N | Y (curve+skew) | N | E | N | ? | N | N | Y (curve+skew) | Y | N | Y | Y | Y (designed slider) | LEVEL with Eventbrite and Sticky on capability (see UNFULFILLED) |
| Floor plan tracing underlay | N | N | N | ? | N | N | N | N | N | N | N | Y | N | Y | AHEAD of every Australian platform |
| Reusable venue templates | Y | Y | N | E | N | Y | ? | Y (exportable) | copy-event only | ? | N | Y | Y | Y | LEVEL (TryBooking's cross-account export is a variant we lack; our copy-on-attach isolation is one they lack) |
| Tier mapping + per-section pricing | Y | Y | E | E | N | Y | ? | Y | Y | Y | E | Y | Y | Y | LEVEL |
| Accessible + companion designation in builder | partial (hide only) | ? | E | E | N | Y | ? | Y (wheelchair) | N | N | manual | Y | Y | Y | LEVEL with Oztix; AHEAD of the rest (companion seats: only Oztix documents them) |
| Per-seat relabel + notes on ticket | N | N | N | E | N | N | N | N | N | N | N | N | Y | Y | AHEAD of every platform surveyed including the specialist |
| Buyer interactive seat pick | Y | Y | E (selected venues) | Y (can be off) | N | Y | N | Y | Y | Y | N (never) | Y | Y | Y | LEVEL on presence; ours is never promoter-disabled (TM's own FAQ concedes it withholds the map exactly when demand peaks) |
| Mobile pinch zoom + pan on the map | ? | ? | zoom buttons | Y (app) | N | ? | N | ? | ? | ? | N | Y | Y | Y (plus eased button zoom) | AHEAD of everything documented on the mobile WEB (TM's pinch zoom is app-only) |
| Price filter on the buyer map | N | N | Y (category) | Y (slider) | N | Y (dynamic pricing display) | N | N | N | N | N | Y | N | Y (band chips + recede) | LEVEL with Ticketmaster and Ticketek on capability (see UNFULFILLED) |
| Best-available auto-assign | N | Y (auto-sell order) | Y | Y | N | Y | N | N | N | N | Y | Y | client-side runs only | Y (server cascade) | LEVEL on presence with the majors (see UNFULFILLED); AHEAD of every AU platform on the documented shape: focal cascade, table and GA legs, mixed accessible requests, which none of them documents |
| Focal-point definition of best seats | N | N | ? | E (TM1 clients set it) | N | Y (holds/focal) | N | N | N | N | ? | Y | N | Y (every chart, zero setup) | AHEAD of every self-serve AU offering |
| Orphan-seat prevention | N | N | Y (buyer guard) | single-seat row rules | N | ? | N | block-N distancing only | block-N distancing only | N | group logic | Y (default on) | N | Y (assign default + advisory buyer nudge with one-tap fix) | AHEAD: no AU platform documents BOTH sides, and none offers the named-seat nudge with re-pick |
| Accessible seats inside a best-available request | N | N | ? | ? | N | N | N | N | N | N | manual request | Y | N | Y | AHEAD of every Australian platform |
| Whole-table one-tap booking | N (workaround) | N (chair by chair) | N | N | N | Y (tables) | Y (manual allocation) | Y (tabled mode) | Y (table pick) | N | N | Y | Y | Y | LEVEL with the table-mode platforms |
| Real-time holds + one-winner concurrency | Y | Y | Y | Y | n/a | Y | ? | Y | Y | Y | Y | Y | Y (proven) | Y | LEVEL (table stakes) |
| Post-sale attendee move with auto-updated ticket | Y (+self-move) | ? | staff | staff | n/a | Y (no refund needed) | staff | ? | support-mediated | ? | staff (phone) | n/a | Y (move + email) | Y | LEVEL with Humanitix on organiser moves; BEHIND Humanitix on attendee SELF-move (see UNFULFILLED) |
| Seating cost to the organiser | free | included in 5.35%+$1.19 | enterprise | enterprise | n/a | quote + setup | ? | free | free | AUD99/mo | setup fee | ~EUR0.12-0.18/seat | free | free | LEVEL with the free tier (free cannot be beaten, only matched; see UNFULFILLED) |
| View from seat / 3D | N | N | N | N (AU: not documented) | N | N | N | N | N | N | N | Y | N | N (parked, S6) | LEVEL by universal absence in Australia (see UNFULFILLED) |
| The room in the marketing kit (live map preview beside poster and tracked links) | N | N | N | N | N | N | N | N | N | N | N | n/a | Y | Y (one signature language) | AHEAD of every platform surveyed |

## 7. Supremacy verdicts (3d) and the honest failures

The AHEAD rows above each name their visible difference. The rows the
founder's rule sends to UNFULFILLED are consolidated in the roast ledger
and the PHASE-C report: curved rows (LEVEL with two AU platforms),
price-filter presence (LEVEL with two), best-available presence (LEVEL on
existence, AHEAD on shape), attendee self-move (BEHIND Humanitix), cost
(LEVEL with the free platforms), and 3D view-from-seat (LEVEL by universal
Australian absence). Everything else lands AHEAD or LEVEL-as-table-stakes.

**Capture-backed proof per item** (all in `docs/design/phase-c-2026-07-25/`,
driven live on the preview build against the TEST database):

- S1: `buyer-best-available-4-curved-1440.png` (the server cascade picks a
  contiguous four in the stage light on the curved 500 chart) and
  `buyer-best-available-after-nudge-1440.png`. The visible difference an
  organiser or buyer notices: the pick lands centred in the light with no
  stranded single beside it, on every chart, with zero setup; no Australian
  self-serve platform runs any auto-assignment at all, and the enterprise
  ones neither mix accessible seats into a request nor expose a focal point
  to a self-serve organiser.
- S2: `buyer-orphan-nudge-1440.png` (the nudge names seat A-1 as stranded)
  and the drive log: nudge shown true, cleared after the one-tap fix. The
  visible difference: the strongest Australian implementation silently
  blocks the selection; ours names the seat, explains why, and fixes it in
  one tap while leaving the buyer free to insist.
- S3: `builder-density-500-curved-1440.png` (the bowed theatre),
  `builder-underlay-tracing-1440.png` (a real photograph under the grid at
  30 percent with the visibility slider). The visible difference: no
  Australian platform offers floor plan tracing; two offer curves, neither
  with a live-bow slider on a lit canvas.
- S4: `buyer-price-filter-all-1440.png`, `buyer-price-filter-active-1440.png`,
  `buyer-price-filter-390.png` (A Reserve at 59 and B Reserve at 39; the
  chosen band stays vivid, the rest recedes to 22 percent and stops
  selling). The visible difference: the only Australian implementations of
  price filtering live on the two enterprise buyer maps; no self-serve
  platform has one, and ours recedes rather than hides so the room always
  reads whole.
- Density (R36): `buyer-density-50-1440.png`, `buyer-density-500-curved-1440.png`,
  `buyer-density-2000-1440.png` plus the 390 trio: one radius, one gap
  ratio, numerals stepping back at 2000 so the plan reads clean.
- The signature across surfaces (R46): `kit-room-preview-2000-1440.png`
  beside the buyer captures: one language.

Visual comparison verdicts: `docs/design/SEATING-VISUAL-COMPARISON.md`.
