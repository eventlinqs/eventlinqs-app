# Seating craft: capture against capture

Date: 2026-07-26. The craft round's evidence lives in
`docs/design/seating-craft-2026-07-26/`. The two benchmark answers the
brief names: our chair beside `r47/trybooking-buyer-01.png`, our overview
beside `r47/oztix-01.png`.

## The chair against the benchmark

Capture: `chair-vs-benchmark.png` (ours at 24, 48, 14 and 8px beside the
benchmark chair at equivalent size), plus `lod-seat-1440.png` in the room.

**Verdict: AHEAD.** The visible reason: both share the same anatomy read
(back, gap, pan, armrests, viewed from behind and above) and both breathe
because AVAILABLE is an outline over paper, not a solid mass. Ours goes
past it in three visible ways: the outline carries the TICKET TYPE hue
while the benchmark has one blue for every seat; the anatomy degrades on
one silhouette (back and pan at 14px, a seat-from-above mark at 8px)
where the benchmark ships a single size and lets the browser blur it; and
the held state (stone body, dashed hue stroke) is a state the benchmark
does not draw at all. Numerals: the benchmark has none inside its chairs;
ours now none inside, below the chair only at 20px and up.

## The overview against the benchmark

Captures: `lod-overview-1440.png`, `lod-overview-390.png` beside
`r47/oztix-01.png`.

**Verdict: AHEAD.** The visible reason: both read as a building, not a
diagram: a shell with walls containing the stage and every section, side
sections against the walls, and sections in real spatial relationship to
the stage. The benchmark's is a hand-illustrated marketing image with
drop shadows; ours is a live drafted plan: double-line walls, wedges
traced along the actual row curvature of the seats inside them, one flat
tint per wedge with depth carried by line-weight hierarchy (no shadows),
tier-break rules where the levels step, and the name plus live price
range placed by a collision engine inside each wedge. Theirs cannot be
tapped; ours dives into the tapped wedge.

## The four published plans and what was taken from each

1. Sydney Opera House Concert Hall, official seating plan (Stalls),
   sydneyoperahouse.com/sites/default/files/collaborodam_assets/concert-hall-ve22.pdf:
   the RADIAL relationship: seating drawn fanning around the platform,
   with boxes wrapping the side walls. Taken as: wedges traced along
   their rows' real arcs, side sections seated against the shell.
2. Sydney Theatre Company's printed plan of the Opera House Drama
   Theatre, sydneytheatre.com.au/-/media/project/sydney-theatre-company/
   sydney-theatre-company/seating-maps/seatingmaps_soh_drama-theatre.pdf:
   row letters in clean dedicated gutters on BOTH flanks, outside the
   seat field, inside a rectangular sheet frame. Taken as: the two-gutter
   row-letter rule with drop-on-collision.
3. Royal Albert Hall detailed seating plan,
   mapaplan.com/seating-plan/royal-albert-hall-seat-numbers-chart/
   high-resolution/royal-albert-hall-seating-plan-01-seat-row-numbers-arena-stalls-circle-loggia-grand-second-tier-boxes-detailed-chart-high-resolution.htm:
   boxes and circles ATTACHED to the building ring, tiers reading as
   stepped concentric levels. Taken as: the building shell as the outer
   wall every side section sits against, and tier-break rules between
   stacked levels.
4. Palais Theatre St Kilda, official venue seating map,
   ticketmaster.com.au/palais-theatre-tickets-st-kilda/venue/155697:
   the stalls-to-circle step drawn as a clean break line across the
   house, arced rows facing a proscenium. Taken as: the section-break
   rule between tier bands and the proscenium-anchored orientation of
   every wedge.

## The seven tasks graded

| Task | Verdict | The visible reason |
|---|---|---|
| 1 Chair glyph | AHEAD | Benchmark anatomy matched (outline, gap, armrests) then exceeded: tier-hue encoding, three-tier degradation, held and accessible states (`chair-vs-benchmark.png`, `lod-seat-1440.png`) |
| 2 Label engine | AHEAD | No competitor capture shows engineered label placement; ours proves zero label-seat, label-label and label-object intersections by machine assertion (`assertions.json`) |
| 3 Venue objects | AHEAD | Their objects are text boxes (EventBookings) or illustration (Oztix); ours are hatched drafted furniture placed architecturally, collision-guarded (`room500-1440.png`, `objects-all-1440.png`) |
| 4 Overview as a room | AHEAD | Shell walls, row-true wedges, tier rules, no shadows, live prices; the benchmark is a static illustration (`lod-overview-1440.png` vs `r47/oztix-01.png`) |
| 5 Nothing covers the plan | AHEAD | The fit RESERVES the chrome band, so key plan and zoom cannot overlap the room by construction; no competitor capture demonstrates reserved chrome (`lod-seat-390.png`, `keyplan-1440.png`) |
| 6 Mobile | AHEAD | Header-clear scroll margin, keyboard-only skip link, engine-placed labels, banded chrome, frame-clipped paint (`docked-strip-390.png`, `lod-seat-390.png`) |
| 7 Zero clipping proven | AHEAD | Machine assertion at fit and at every LOD, both widths: every seat, label and object inside the canvas with margin (`assertions.json`) |

Assertion outputs and the recaptured full set sit beside this file's
evidence folder; the roast ledger is
`docs/roast/seating-craft-2026-07-26.md`.
