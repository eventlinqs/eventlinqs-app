# Roast ledger: seating craft round, 2026-07-26

Written before adjudication, decomposed from the brief verbatim.

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Skills read first; report opens with gate block | | |
| 2 | T1 chair anatomy: back ~45% h, r ~30%, gap ~8% visible at 24px, pan narrower ~40%, two armrests ~30% pan height | | |
| 3 | T1 AVAILABLE = outline 1.25px tier hue + paper fill, never solid | | |
| 4 | T1 UNAVAILABLE = solid stone, no stroke, no numeral | | |
| 5 | T1 SELECTED = solid gold + 2px ink keyline | | |
| 6 | T1 HELD = solid stone + dashed tier-hue stroke | | |
| 7 | T1 ACCESSIBLE = available anatomy + mark inside the back | | |
| 8 | T1 numerals removed from inside chairs; below chair only at >= 20px | | |
| 9 | T1 degradation: >=20 full, 10-20 back+pan, <10 single mark reading as a chair | | |
| 10 | T2 placement engine with collision detection | | |
| 11 | T2 section names in clear void or margin + leader; the ten named failures fixed | | |
| 12 | T2 row letters in dedicated gutters; colliding letters dropped; named failures fixed | | |
| 13 | T2 rulers per contiguous block above its first row; no floating strips | | |
| 14 | T2 de-duplication: one name per section; BALCONY CENTRE case fixed | | |
| 15 | T2 overview price labels inside polygon in clear space; BOXES case fixed | | |
| 16 | T2 automated collision assertion, zero intersections, 3 LODs x 1440 and 390, count reported | | |
| 17 | T3 objects placed architecturally in negative space | | |
| 18 | T3 objects drawn as drafted architecture, not floating chips | | |
| 19 | T3 objects never overlap seats, letters, names or each other (engine-enforced) | | |
| 20 | T4 building shell contains everything | | |
| 21 | T4 polygons follow the seats' real curvature | | |
| 22 | T4 side sections relate to the walls | | |
| 23 | T4 tiers read as stepped levels with section-break rules | | |
| 24 | T4 drop shadows killed; depth via line weight | | |
| 25 | T4 four real venue plans cited with the convention taken from each | | |
| 26 | T5 zoom cluster in guaranteed-clear chrome | | |
| 27 | T5 key plan corner reserved in the fit; no room under it | | |
| 28 | T5 key plan is a true miniature (shell, polygons, stage) | | |
| 29 | T6 mobile: header overlap, skip link, straddling labels, piled chips, ghost seats: each fixed and recaptured | | |
| 30 | T7 clipping assertion at fit with margin, 3 LODs x 1440 and 390, results reported | | |
| 31 | Proof: full recapture into docs/design/seating-craft-2026-07-26/ | | |
| 32 | Proof: chair at 24, 14, 8px beside the benchmark chair | | |
| 33 | Proof: SEATING-CRAFT-COMPARISON.md chair vs benchmark, overview vs benchmark, verdicts + reasons | | |
| 34 | Grade all seven tasks; LEVEL fails | | |
| 35 | Seating only; no architecture changes; no new features | | |
| 36 | TEST only; funds engine untouched | | |
| 37 | Australian English; no dashes; no competitor in public copy | | |
| 38 | No fabrication; capture, assertion or URL for every claim | | |
| 39 | Full gates: typecheck, lint, tests, production build | | |
| 40 | Commit each task separately; run start to finish, no pausing | | |
| 41 | Mid-task founder directive: after the report, git push origin feat/walkthrough-defects, confirm landed, report the remote sha | | |

## Adjudication and adversarial pass

(After proof.)
