# Roast ledger: the one-glyph chair, then Phase 2

Date: 2026-07-27. Written BEFORE work began per brief-roast Phase 1.

## Part A: the approved chair specification

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| A1 | Read brief-roast FIRST, obey | MET | Ledger written before work; this adjudication and the gate block are its output |
| A2 | Read frontend-design FIRST, obey | MET | Loaded at session start; benchmark studied and magnified before drawing, own output critiqued from captures and corrected |
| A3 | Report opens with the gate block or UNFULFILLED | MET | Report opens with the gate block |
| A4 | ABANDON the three-tier system; delete mid and mark | MET | `CHAIR_MID_BACK_PATH`, `CHAIR_MID_PAN_PATH`, `CHAIR_MARK_PATH`, `chairTierParts`, `GlyphTier` and `glyphTier` all deleted; repo-wide search returns no consumers |
| A5 | ONE glyph, uniformly scaled | MET | `CHAIR_PART_PATHS` has exactly 4 parts; `draw.ts` `bodyParts` draws all four with no branch; asserted by test "is ONE silhouette: four parts, no tier variants" |
| A6 | Stroke scales with the glyph (6.5 on a 100 box) | MET | `CHAIR_STROKE = 6.5`; painter uses `(scene.chairW / GLYPH_BOX) * CHAIR_STROKE` in world units, replacing the old screen-fixed `1.25 / camera.scale`; print export uses the same constant |
| A7 | BACK x18 y6 w64 h30 r11 | MET | `CHAIR_RECTS.back`, asserted exactly by test |
| A8 | ARM LEFT x4 y40 w15 h46 r7 | MET | `CHAIR_RECTS.armLeft`, asserted exactly |
| A9 | ARM RIGHT x81 y40 w15 h46 r7 | MET | `CHAIR_RECTS.armRight`, asserted exactly |
| A10 | PAN x22 y62 w56 h24 r9 | MET | `CHAIR_RECTS.pan`, asserted exactly |
| A11 | Do not reinterpret the proportions | MET | The rectangles are held as data and the path strings are DERIVED from them via `roundedRectPath`, so no proportion can be restated by hand |
| A12 | Arms are the widest part, wider than the back | MET | Arms span 92 against the back's 64; test asserts armSpan 92 and greater than both back and pan, and that the arms reach 14 outside the back on each side |
| A13 | The middle stays OPEN | MET | Test asserts back bottom (36) is above both arm top (40) and pan top (62), and that the pan sits between the arms |
| A14 | Symmetric about x=50; mirror test passes | MET | Arithmetic (test) plus measurement: silhouette, back, arms and pan each 0 pixels off, max channel delta 0, at 600px |
| A15 | Four states unchanged | MET | `chair-final.png` STATES card; the painter's state branches were not altered |
| A16 | Regenerate chair-final.png from IMPORTED paths | MET | The proof imports `CHAIR_PART_PATHS`, `CHAIR_STROKE`, `GLYPH_BOX`; no geometry is duplicated |
| A17 | 48, 24, 14 and 8px beside the benchmark at matched sizes | MET | `chair-final.png` card 1 |
| A18 | All four states at 24px | MET | `chair-final.png` card 2 |
| A19 | The symmetry check | MET | `chair-final.png` card 4, four cells with measured verdicts |
| A20 | THREE REAL ROWS AT 24PX, roughly 30 per cent sold | MET | `chair-final.png` card 3: 3 rows x 14 seats at 24px on a 32px pitch (the renderer's own 0.75 chair-to-pitch ratio), 13 sold = 31 per cent |

## Part B: Phase 2 of the earlier brief

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| B1 | Check BOTH causes before changing anything | MET | Cause 1 searched in the seed file and Cause 2 read in generate.ts, both before any edit; the first edit came after the diagnostic run |
| B2 | Report all seven curve/skew/stagger params for every block in every proof room | MET | A search of `scripts/seed-seating-final.mjs` for `curveDepth\|curveBack\|rowCurveOverrides\|autoBow\|focalRise\|skew\|stagger\|bow` returns NO MATCHES: not one is set on any block in any room |
| B3 | Compare against how room-proof.png was generated | MET | room-proof.png's room carries no taper and no align (seed line 113: rows 25, seatsPerRow 20), which is why its columns were already clean; the theatre differs only by `taper: 0.5, align: 'centre'` |
| B4 | If any curve or skew is set on a proof room, zero them all | REFUSED, correctly | None is set, so there was nothing to zero. Zeroing absent parameters would have been a change with no cause. The defaults are instead locked in the generator (B8) and covered by a test |
| B5 | Read the taper code; taper must remove seats from ends, never offset a row | MET | `generate.ts:398-402` (row counts) and `:426` (centreShift) read and reported |
| B6 | Fix it if it offsets rows | MET | It did. `centreShift` now rounds to whole seats. Before: 7 of 15 rows off-grid, 73 distinct x for a 37-seat widest row. After: 0 of 15 off-grid, 37 distinct x |
| B7 | LOCK: x is column index times pitch, nothing else | MET | Enforced by the rounding plus the defaults; asserted by "a default block puts every seat in column N at an identical x" |
| B8 | Default every parameter off IN THE GENERATOR | MET | `curveDepth ?? 0`, `curveBack ?? front`, `skew ?? 0`, `stagger ?? 0`, `autoBow` falsy, `rowCurveOverrides` undefined; asserted by "curve, skew and stagger are OFF by default in the generator" and "a row only bows when the organiser sets a curve explicitly" |
| B9 | Unit test: column N identical x for a default block | MET | `taper-convention.test.ts`, "the straight-row grid law" suite, plus a tapered-block grid test |
| B10 | Prove theatre at 1440 and 390, all three LOD states | MET | `theatre-lod-overview/mid/seat` at both viewports recaptured; seat-level shows clean vertical columns and the tapered staircase edge |
| B11 | Place beside room-proof.png, confirm grid discipline matches | MET | Both opened and compared: identical column discipline, ours additionally carrying the deliberate taper |
| B12 | Report which cause it actually was | MET | Cause 2, the taper. Cause 1 ruled out with a zero-match search. Reported in the summary and in SEATING-FINAL.md section 0.2 |
| B13 | Below the threshold show polygons, never marks, at any width | MET | `MIN_CHAIR_PX = 10` in lod.ts; `lodFlags` turns seats off and polygonFill on below it; asserted by test; visible in `theatre-lod-mid-390.png` |
| B14 | Make every room consistent with the four-tier polygon behaviour | MET | The rule lives in `lodFlags`, which every room and both viewports go through: it cannot be per-room |
| B15 | Prove all four room shapes at 390, none showing a square | MET | All five rooms recaptured at 390; the mark glyph no longer exists in the codebase, so a square cannot be drawn |
| B16 | four-tier 390 green and orange polygons had no label and no price | MET | `room-four-tier-390.png`: all four polygons carry name and price (Premium Stalls 149, Stalls 119, Lower Balcony 89, Upper Balcony 59) via the new size-step ladder |
| B17 | mixed 390 stage had no STAGE caption | MET | `room-mixed-390.png`: STAGE caption present above the apron |
| B18 | mixed 390 general admission zone unlabelled | MET | `room-mixed-390.png`: the zone is labelled General admission |
| B19 | cabaret 1440 tables unlabelled, each carries its own name | MET | `room-cabaret-1440.png`: Table 1 to Table 16, each centred in its own ring, from the new `scene.tableLabels` |
| B20 | Re-run the proof: 16 of 16 clean, probe failing correctly, zero collisions, zero clipping at fit | MET | `16 configurations, 0 failures`; probe armed FAIL (correct), removed PASS; assertions.json regenerated |
| B21 | Recapture every room at 1440 and 390 | MET | 10 room captures plus 6 LOD captures rewritten by the drive |
| B22 | Update SEATING-FINAL.md | MET | New section 0 (round 2) covering the glyph, the grid, the polygons, the labels, the gate and the safety finding |
| B23 | Re-grade the chair against the benchmark | MET | `chair-final.png` at four matched sizes; grading in the report |
| B24 | Do not stop again | MET | Ran straight from the chair into Phase 2 and to the push without pausing |

## Standing rules

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| S1 | Seating only | MET | Change set is seating render, generator, seed-driven proof, seating tests and seating docs. No pricing, guidance, /guides or Launch Kit file touched |
| S2 | TEST only, never Production | MET, with a finding | Every write targeted `vkapkibzokmfaxqogypq`, asserted before each. The finding: `.env.local` points at PRODUCTION, so the first build read Production READ-ONLY (0 rows, no writes). Caught, rebuilt against TEST, recorded in SEATING-FINAL.md 0.6 |
| S3 | Mobile at 390 is the priority | MET | The 390 captures were opened and judged first (`theatre-lod-seat-390`, `theatre-lod-mid-390`, `room-four-tier-390`, `room-mixed-390`) before any 1440 capture |
| S4 | Straight rows on a fixed grid; curves off by default and in every proof room | MET | Proven numerically on the STORED coordinates per room and locked by four tests |
| S5 | Australian English; no dashes; no competitor in public-facing copy | MET | copy gate clean (dashes, banned word, phrase tells, competitor names). The benchmark name appears only in internal docs and the internal proof sheet, as before |
| S6 | No fabrication; no capture that disagrees with the renderer | MET | The proof imports the renderer's own constants. One caption error was found and fixed mid-task: it read "480px" after the symmetry raster moved to 600px, and now derives from the constant |
| S7 | Full gates | MET | tsc 0; eslint 0 errors (47 pre-existing warnings); vitest 1064/1064 across 114 files; next build 0; copy gate clean |
| S8 | Force-add every PNG; commit and push; report the remote sha | MET | See the report |
| S9 | Zero AI tells | MET | copy gate clean |

## Adversarial pass

- **Silent drops:** none. Every A and B row is adjudicated above and appears in the report.
- **Interpretation drift:** one requirement (B4) could not be executed as written because its precondition was false; recorded as REFUSED with the reason rather than quietly marked done, and the underlying intent (straight rows by default) was met another way.
- **Match versus surpass:** the brief asked to match the benchmark's one-glyph scaling discipline. Symmetry is AHEAD (0 pixels off, measured; the benchmark's own chair is not pixel-symmetrical). Legibility at 8px is BEHIND the benchmark and stated as such in the report, which is why the polygon floor exists.
- **Unverifiable claims:** each claim carries a number (pixel counts, distinct-x counts, gate exit codes, test counts). The one judgement, that the glyph "reads as furniture", is supported by the in-context rows card rather than asserted.
- **Regression sweep:** three regressions found and fixed inside this task (two tests that encoded the half-seat defect as intended behaviour; the "480px" caption). One behaviour change beyond the literal brief is disclosed below.
- **Disclosure, for founder veto:** area labels now draw at EVERY zoom, not only at overview. The brief named the unlabelled GA zone at 390; a zone holds no seats, so restricting its name to overview would have left it blank at other zooms too. Related observation, not fixed: the GA zone shows its name but no price, because price is not carried on the area input. Say the word and I will plumb it.
- **Founder-cost test:** no dashboard errands. The safety finding about `.env.local` is reported with the procedure that avoids it.
- **Evidence visibility:** 16 regenerated captures plus the chair sheet at named paths, and the numeric diagnostics quoted in SEATING-FINAL.md.

## Phase 4 gate

NOT MET: 0. PARTIAL: 0. REFUSED with cause: 1 (B4). Unresolved adversarial findings: 0.
