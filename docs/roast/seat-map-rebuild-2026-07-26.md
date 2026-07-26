# Roast ledger: the seat map renderer rebuild, 2026-07-26

Written BEFORE adjudication, decomposed from the brief verbatim. Verdicts
land in the Adjudication column only after evidence exists; nothing here is
shaped to fit what was built.

## The requirement ledger

| # | Requirement (from the brief, decomposed) | Verdict | Evidence |
|---|---|---|---|
| 1 | Read brief-roast and frontend-design skills FIRST, obey both | | |
| 2 | Report opens with the gate block or UNFULFILLED | | |
| 3 | Canvas 2D with a retained scene graph replaces the SVG-per-seat renderer | | |
| 4 | HTML overlays carry tooltip, mini-map, legend, controls | | |
| 5 | SVG export path kept for the printed plan only | | |
| 6 | DELETED: rounded-square seat tile | | |
| 7 | DELETED: numeral on every seat at every zoom | | |
| 8 | DELETED: navy rectangle stage bar with letterspaced caps | | |
| 9 | DELETED: stage-light radial gradient signature | | |
| 10 | DELETED: legend chip row as the primary price surface | | |
| 11 | KEPT working: best-available cascade and quality score | | |
| 12 | KEPT working: both orphan guards | | |
| 13 | KEPT working: post-publish diff sheet | | |
| 14 | KEPT working: colour-vision palette sets | | |
| 15 | KEPT working: price-plus-party control | | |
| 16 | KEPT working: whole-table booking | | |
| 17 | KEPT working: self-move | | |
| 18 | KEPT working: view-from-seat photographs | | |
| 19 | Item 1: chair glyph, furniture at 24px, simplified mark at 6px, three sizes one silhouette, three states | | |
| 20 | Item 2: stage as geometry, four organiser-pickable shapes, no labelled rectangle | | |
| 21 | Item 3: aisle primitive (vertical + horizontal, width splits blocks); uneven AND staggered rows | | |
| 22 | Item 4: section polygons, first-class, auto-derived, labelled in place, price range on the polygon | | |
| 23 | Item 5: three LOD states exactly as specified; thresholds reported | | |
| 24 | Item 6: tooltip with price, tier name, exact location, on hover and on tap | | |
| 25 | Item 7: mini-map showing where the buyer is in the building | | |
| 26 | Item 8: designed glyphs for bar, food, toilets, entrance, exit, stairs, lift, balcony, box, standing rail, plus TEXT and ICON primitives | | |
| 27 | Item 9: ticket type as primary colour encoding; legend rebuilt as selectable type rows; section moves to the polygon | | |
| 28 | Item 10: row order Down or Up, seat order Left or Right | | |
| 29 | Item 11: trace image in the canvas with transparency slider; assisted row detection still working over it | | |
| 30 | Item 12: Group of N tickets, contiguous and orphan-safe via the existing cascade | | |
| 31 | Fix: view-from-seat anchored in the seating context, no lightbox | | |
| 32 | Fix: mobile inspector keeps the room visible while numbers are edited | | |
| 33 | Phase 1: direction doc at docs/design/SEATING-REBUILD-DIRECTION.md BEFORE code | | |
| 34 | Phase 1: grounded in one named real Australian room, audience, single job | | |
| 35 | Phase 1: token system 4-6 named hexes plus type roles incl. a data face | | |
| 36 | Phase 1: layout concept | | |
| 37 | Phase 1: ONE signature element, newly argued | | |
| 38 | Phase 1: critique pass vs generic defaults and vs the twelve items, changes stated | | |
| 39 | Phase 1: ASCII wireframes, all three LOD states, 1440 and 390 | | |
| 40 | Phase 1: chair glyph as SVG path with three states | | |
| 41 | Phase 1: each stage shape specified | | |
| 42 | Phase 1: LOD thresholds with numbers | | |
| 43 | Phase 1: every venue object glyph described | | |
| 44 | Phase 1: one real aesthetic risk, justified | | |
| 45 | Phase 2: implement Phase 1 exactly; deviations stated | | |
| 46 | Phase 3: captures in docs/design/seating-rebuild-2026-07-26/ | | |
| 47 | Phase 3: three LOD states at 1440 and 390 | | |
| 48 | Phase 3: real auditorium (aisles, staggered uneven rows, polygons, objects) at 500 and 2000 seats | | |
| 49 | Phase 3: tooltip, mini-map, ticket-type colouring, every object glyph, chair at three sizes | | |
| 50 | Phase 3: frame time on pan and zoom, measured, before and after, at 500, 2000, 5000 | | |
| 51 | Phase 3: contrast proven for every seat state in every palette set | | |
| 52 | Phase 3: full keyboard operation of buyer map AND builder | | |
| 53 | Phase 3: ZERO CLIPPING in captures | | |
| 54 | Phase 3: every capture beside its competitor capture in SEATING-REBUILD-COMPARISON.md with verdict and visible reason | | |
| 55 | The bar: BEHIND / LEVEL / AHEAD per item, LEVEL is a failure, any BEHIND or LEVEL goes in UNFULFILLED | | |
| 56 | Seating surfaces only; regress nothing outside them | | |
| 57 | TEST database only, never Production | | |
| 58 | Funds-holding payment engine untouched | | |
| 59 | Australian English; no em or en dashes; "community" only; no competitor named in public-facing copy or assets | | |
| 60 | No fabrication: unprovable claims written as NOT VERIFIED | | |
| 61 | Full gates before reporting: typecheck, lint, tests, production build | | |
| 62 | Commit each item separately | | |
| 63 | Run all three phases end to end, no pausing, no approval requests | | |
| 64 | Mid-task founder directive: total rebuild, keep NOTHING of the old design, from scratch | | |
| 65 | Standing rules: DESIGN-LOCK outside scope, no exclamation marks in copy | | |

## Adjudication

(Completed after Phase 3; see the verdict column above and the adversarial
pass below.)

## Adversarial pass

(Completed after Phase 3.)
