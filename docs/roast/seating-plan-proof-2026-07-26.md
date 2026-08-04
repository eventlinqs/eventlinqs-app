# Roast ledger: seating plan Phase 0 static proof (2026-07-26)

Brief: the founder's correction of two false claims in the prior report, then
Phase 0 static proof only. Ledger was written before adjudication; verdicts
filled in after the work.

## Requirement ledger

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read `.claude/skills/brief-roast/brief-roast-SKILL.md` FIRST | MET | Read in the first tool batch of the session, before any other action |
| 2 | Read the frontend-design skill FIRST | MET | `/mnt/skills/public/frontend-design/SKILL.md` does not exist on this Windows host; the same skill is installed as the `frontend-design` plugin skill and was invoked in the first tool batch |
| 3 | FALSE CLAIM 1: open `chair-vs-benchmark.png`, confirm empty benchmark columns | MET | Opened; "Benchmark ~24px" and "Benchmark scaled" are captions over blank space. Root cause: `file:///` img inside `setContent` HTML is blocked by Chromium (naturalWidth 0) and no load assertion existed |
| 4 | FALSE CLAIM 2: open both captures, confirm each named collision | MET | Opened both. Docked strip: two zone labels interleaved into garble plus glyphs over Long bar / Food stalls / Toilets / Entrance. room2000-fit-390: PREMIUM STALLS AUD 149.00 crosses STAGE, both BOXES labels inside the stalls polygon, leader lines through it. The garbled pair is "General admission" x "GROUP TERRACE" (the founder read ROOF TERRACE in the garble; the drawn-frame gate names the actual pair) |
| 5 | Explain in one paragraph why the assertion passed | MET | `docs/design/SEATING-PLAN.md` section 2 |
| 6 | Fix the assertion so it reads the DRAWN FRAME, not the model | MET | `scripts/seating-rebuild-proofs.mjs` assert step rewritten: records every fillText/strokeText at draw time with true device-space extents, rect-intersects text-on-text on the final frame, samples pixels under each run with text suppressed for text-on-ink, 11 configurations including docked strip and room2000-fit. Run against the current renderer: 11 configurations, 9 FAILURES, while the model beside them reports 0/0/0 (`docs/design/seating-rebuild-2026-07-26/assertions.json`) |
| 7 | Study `trybooking-buyer-01.png` before drawing; verify each listed property | MET | Full image plus 4x legend and 3x field crops inspected; every property in the brief confirmed and recorded in SEATING-PLAN.md section 3 |
| 8 | chair-proof.png: ours at 24/14/8 DIRECTLY BESIDE the actual TryBooking chair cropped at matching sizes; stop if uncroppable | MET | Cropped from the legend chips (coordinates verified by nearest-neighbour inspection), embedded as data URIs, generator ABORTS if any image reports naturalWidth 0; output visually inspected, every column populated |
| 9 | chair-proof states: available outline, sold solid dark, selected gold, held | MET | All four shown at 24px beside TryBooking's three; TryBooking held honestly labelled "none" |
| 10 | Chair anatomy: single armchair silhouette, tall rounded back, two armrest verticals flanking a seat pan, one closed outline with internal detail, armrests visible at 24px | MET | One closed path + detail strokes (SEATING-PLAN.md section 4); armrest columns 3.75px wide at 24px, visible in the render |
| 11 | room-proof.png: one 500-seat room at 1440 | MET | 1440x1000, exactly 500 seats (2 blocks x 10 columns x 25 rows), count asserted in the generator |
| 12 | Straight rows, uniform pitch, mirrored blocks, clean straight aisles | MET | Pitch 30px uniform, zero stagger, two mirrored 10-column blocks, one straight 60px centre aisle |
| 13 | Row letters both flanks fixed gutter; one ruler above each block; NOTHING else | MET | A to Y both flanks at fixed 24px gutter; rulers 1-10 and 11-20; no other plan text |
| 14 | No section names, prices, leader lines, object labels, polygons, zoom cluster, key plan | MET | None present; visually verified |
| 15 | Roughly 30 percent sold, solid dark | MET | Exactly 150/500 (30.0%), solid dusk #24344D, front-weighted, deterministic seed |
| 16 | Stage a centred trapezoid aligned to the blocks' true centre | MET | Trapezoid centred at x=720, the exact centre of the 660px seat field |
| 17 | Whole plan centred with equal margins | MET | 390px left = right, 74px top = bottom (equal opposing margins per axis; frame width fixed at 1440 by the brief) |
| 18 | Write SEATING-PLAN.md with the five required parts | MET | `docs/design/SEATING-PLAN.md`: claims confirmed and explained, benchmark observations, chair SVG path, grid rules with numbers, build sequence |
| 19 | STOP: no renderer changes, no drive, no buyer sheet changes; wait for approval | MET with one disclosure | Renderer untouched, buyer sheet code untouched, no purchase drive. DISCLOSURE: to prove the fixed assertion reads the frame, the assert step was RUN read-only against a local dev server on TEST (it opens buyer pages, clicks zoom, and taps one seat to dock the mobile strip; selection is client-side, no reservation, no write). If the founder reads the stop line as covering that run, it exceeded it; stated here rather than hidden |
| 20 | TEST only | MET | Server log shows supabase host vkapkibzokmfaxqogypq (TEST); the proofs script hard-stops on the PROD ref |
| 21 | Australian English, no em/en dashes, no exclamation marks | MET | Zero-match grep for both dash characters across all new files; no exclamation marks in copy |
| 22 | No fabrication; NOT VERIFIED rather than an empty frame | MET | Nothing reported unseen; the empty-column failure mode now hard-aborts the generator |

## Adversarial pass

- **Silent drops:** none found; every imperative in the brief is a ledger row.
- **Interpretation drift:** three interpretations, all named: (a) the garbled
  docked-strip pair is GROUP TERRACE, not ROOF TERRACE; (b) "equal margins"
  read as equal opposing margins per axis, since the frame width is fixed at
  1440 by the brief; (c) FILE 2's "one number ruler above each block" was
  followed over the benchmark description's singular "one number ruler".
- **Unverifiable claims:** each claim is tied to an opened file, a command
  output, or a named path; the assertion-fix claim is backed by a red run.
- **Generic test:** the proofs carry the EventLinqs tokens (night, dusk,
  gold, harbour, navy stage); the discipline mirrored is the ordered Phase A.
- **AI-tell sweep:** 0 em dashes, 0 en dashes, 0 exclamation marks, 0 banned
  words across the new files (grep evidence above).
- **Regression sweep:** no shipped surface touched. Changes: two new PNGs,
  one new generator script, the assert step of one proof script (the ordered
  fix), this ledger, SEATING-PLAN.md, and regenerated assertions.json.
- **Founder-cost:** nothing requires a dashboard; both PNGs and the doc are
  at named paths.
- **Unresolved findings:** none. The req-19 disclosure is surfaced at the
  top of the report.

## Gate

Requirements: 22. Met: 22. Partial: 0. Not met: 0.
Adversarial findings: 0 unresolved (one disclosure, surfaced).
