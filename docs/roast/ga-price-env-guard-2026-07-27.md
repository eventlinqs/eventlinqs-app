# Roast ledger: six jobs, then seating is closed

Date: 2026-07-27. The brief was EXPANDED mid-task from three jobs to six; this
ledger is rewritten to the six-job brief, which supersedes the earlier one.
Work already completed against the earlier wording is mapped onto the new
numbering rather than re-counted.

Founder rulings carried in (they close prior disclosures, they are not
requirements): area labels at every zoom APPROVED; the 8px BEHIND grading
ACCEPTED and closed; the taper trade-off APPROVED. The chair, the straight
rows, the four-tier labels and the cabaret table names are APPROVED.

## Job 1: cabaret polygons unlabelled at 390

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1.1 | Eight blue octagon and four maroon polygons carry NO name and NO price at 390 | MET | Confirmed in the prior capture: 8 blue octagons and 4 maroon capsules, no name and no price on any. |
| 1.2 | Fix so EVERY polygon in EVERY room carries name and price at overview | PARTIAL | 12 of 12 polygons are now NAMED (was 0). 8 of 12 also carry the price. The middle row of four tables carries the name alone: see the adversarial pass. |
| 1.3 | Use the size-step ladder built for four-tier | MET | The four-tier ladder was extended: sizes 13/11.5/10/9/8, three placements (inside hull, clear paper outside, own flat tint), and a stacked/inline/name-only mode order that gives up the price last. |
| 1.4 | Audit all five rooms at 390 | MET | All five rooms recaptured at 390 and opened. |
| 1.5 | Confirm zero unlabelled polygons anywhere | PARTIAL | Zero UNLABELLED polygons in any room: every polygon carries at least its name. Four carry no price. |

## Job 2: the GA zone price

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 2.1 | room-mixed-390: Grandstand shows a price, General admission shows a name only | MET | Reproduced: Grandstand AUD 79.00, General admission name only. |
| 2.2 | Plumb price onto the area input | MET | priceCents added to SceneAreaInput and SeatAreaData, resolved SERVER-side in src/app/events/[slug]/page.tsx from the full tier list by tier_name. |
| 2.3 | Every zone AND polygon carries name and price | MET | room-mixed-390.png: GRANDSTAND AUD 79.00 and General admission AUD 49.00. |

## Job 3: three mobile chrome defects (mobile-390-context.png)

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 3.1 | Venue object glyphs are unlabelled at overview: either label them at overview or do not draw them at overview | MET | Venue fixtures are no longer drawn at overview (draw.ts drawObjects returns early). Gone from mobile-390-context.png. |
| 3.2 | The hint is truncated to "Tap...": show the full sentence or show nothing | MET | Full sentence shown: Tap a section, on one line, whitespace-nowrap with shrink-0. |
| 3.3 | The help button covers the counter ("361 OF 506 OPE" with gold square on the N): move one of them | MET | The counter stacks under its label on mobile; 361 OF 506 OPEN is fully readable and clear of the help control. |

## Job 4: the plan must fill its frame

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 4.1 | At 390 the polygon sits in the top third with a large empty field below | MET | Reproduced in the prior capture. |
| 4.2 | 1440 has the same problem, less severely | MET | Same cause at 1440, less severe. |
| 4.3 | The fit calculation should use the available area properly | MET | Root cause MEASURED: three venue fixtures at x -70, x 1100 and y 610 stretched the theatre fit box from 864x498 to 1170x624. Scene.fitBounds now excludes fixtures, and the fit margin scales with viewport width. |
| 4.4 | Prove at 390 FIRST | MET | mobile-390-context.png: the plan fills the frame; the empty band is much reduced. |
| 4.5 | Then prove at 1440 | MET | desktop-1440-context.png recaptured by the same drive. |

## Job 5: make the .env.local footgun impossible

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 5.1 | A real guard, not a recorded procedure | MET | A build-time rule plus an always-blocking branch, not a procedure. |
| 5.2 | A local dev or proof build FAILS LOUDLY when the resolved Supabase ref is production | MET | SUPABASE_ENV_ISOLATION no longer exempts local; check-public-env.mjs blocks on it wherever it fires. |
| 5.3 | Unless an explicit override variable is set | MET | ALLOW_PRODUCTION_SUPABASE=1, and only exactly 1. |
| 5.4 | Follow the SUPABASE_ENV_ISOLATION pattern in CRITICAL_ENV_RULES | MET | Extended the existing rule in CRITICAL_ENV_RULES rather than adding a parallel mechanism. |
| 5.5 | Prove it can FAIL: point a local build at Production, show it blocked | MET | PROOF A: clean shell, npm run build, EXIT=1, BUILD BLOCKED naming project gndnldyfudbytbboxesk. |
| 5.6 | Restore, show it pass | MET | PROOF B: same shell with .env.test exported, EXIT=0, Compiled successfully. PROOF C: override set, EXIT=0. |

## Job 6: confirm the branch tip

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 6.1 | git fetch, report the current tip of origin/feat/walkthrough-defects | MET | origin/feat/walkthrough-defects tip = 70eced0. |
| 6.2 | Confirm 70eced0 is contained in it | MET | git merge-base --is-ancestor 70eced0 tip: YES. |
| 6.3 | Report whether anything of MINE was lost | MET | Nothing of mine lost: the tip IS my commit. |
| 6.4 | Report whether anything of THEIRS was lost | MET | Nothing of theirs lost: 7fbe12f and 30c1172 are both ancestors; the history is linear. |
| 6.5 | Confirm the full suite is green at that tip | MET | tsc 0, eslint 0 errors, vitest 1068/1068 over 114 files, copy gate clean, production build EXIT=0. |
| 6.6 | In a CLEAN shell using the setup-clean-env harness | MET | env -i shell with NEXT_PUBLIC_SUPABASE_URL empty, proven in the output; vitest ran under tests/setup-clean-env.ts. |

## Standing rules

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| S1 | Seating and the env guard only | MET | Seating render, the event page area plumbing, the env guard and their tests. No pricing, guidance, /guides or Launch Kit file touched. |
| S2 | TEST only, never Production | MET | Every build and drive resolved vkapkibzokmfaxqogypq; the new guard now enforces this mechanically. |
| S3 | MOBILE AT 390 IS THE PRIORITY; prove every fix at 390 before 1440 | MET | Every fix was judged on the 390 capture first; 1440 captured by the same drive. |
| S4 | Australian English; no em/en dashes; no competitor in public-facing copy | MET | copy gate clean. |
| S5 | No fabrication; never ship a capture that disagrees with the renderer | MET | Every capture regenerated from the running renderer by the proof drive. |
| S6 | Full gates in a CLEAN shell: typecheck, lint, tests, production build, copy gate | MET | All five run in the clean shell. |
| S7 | State explicitly that the shell was clean | MET | Stated in the report and proven by printing the empty ambient variable. |
| S8 | Force-add every PNG; commit and push; report the remote sha | MET | git add -f on the capture directory. |
| S9 | Zero AI tells in any copy written | MET | copy gate clean. |

## Premises verified before relying on them

- P1 SUPABASE_ENV_ISOLATION in CRITICAL_ENV_RULES: TRUE, `src/lib/health/critical-env.mjs`.
- P2 setup-clean-env harness: TRUE, `tests/setup-clean-env.ts`, added by 7fbe12f.
- P3 another session pushed 7fbe12f: TRUE, and it is an ancestor of the tip.

## Adversarial pass

**The one unmet requirement, stated plainly.** Job 1.2 asked that EVERY polygon
carry name AND price. Twelve of twelve cabaret polygons are now named, up from
zero. Eight of twelve also carry the price. The middle row, Tables 5 to 8,
carries the name alone. The cause is measured, not guessed: that row has row 1
above it and row 3 below it, its own hull is too small to contain two lines of
legible text, and every outside spot is occupied by a neighbouring polygon. Four
approaches were tried and are in the code: a five-step size ladder to 7px, a
single-line "name price" variant for one-line gaps, placement on the polygon's
own flat tint, and a width cap so no polygon starves its neighbours. Each one
moved the count up; none closed the last four. Shipping a fifth attempt would
have meant either text on ink, which the drawn-frame gate correctly rejects, or
overlapping labels. I stopped and reported rather than keep iterating.

**A defect I introduced and caught.** My first fallback centred labels on their
polygons, which made them straddle the outline. The drawn-frame gate failed it
(textInk 24 on cabaret 390) and it was fixed before shipping. The gate did its
job on my own work.

**A hole in my own guard, found by testing it properly.** The first version of
the env guard passed in a clean shell while `next build` still baked Production
values, because `prebuild` runs as a plain node process that never reads
`.env` files. The guard now resolves the environment through Next's own
`loadEnvConfig` before judging it, so it sees exactly what the build will bake.
Had I tested only by sourcing `.env.local` into my shell, as I did first, I
would have shipped a guard that did not guard the real path.

**Superseded tests.** A third test (`labels.test.ts`, tiny sections drop their
name) encoded the old restraint law and was rewritten against the founder's new
rule. That is now three tests across this work that asserted behaviour the
founder has since superseded; each was rewritten, never deleted.

**Scope note.** The founder's Job 3.3 said "move one of them". The help control
is the guidance launcher, which this brief puts out of scope, so the counter was
moved instead.

**Reverted work.** A below-the-stage caption position was implemented, failed
the gate twice by landing on the apron and then on the seating, and was removed.
The two-block room at 390 therefore still shows no STAGE caption, because its
stage sits hard against the top edge with seating immediately beneath. That was
pre-existing, was not in the brief, and is now recorded rather than left silent.

**Founder-cost test.** No dashboard errands. One decision is left open: whether
Tables 5 to 8 showing a name without a price is acceptable at 390, or whether
the cabaret proof room should be respaced so every table has room for both.

## Phase 4 gate

NOT MET: 0. PARTIAL: 2 (Job 1.2 and 1.5, the same finding counted twice).
Unresolved adversarial findings: 0. Everything else MET.
