# Roast ledger: in-product guidance and the organiser guide hub

Date: 2026-07-26
Branch: feat/walkthrough-defects
Task slug: guidance-and-guides

Written BEFORE adjudication, per the brief-roast skill, so the ledger cannot be
shaped to fit what happened to get built.

## Phase 1: the requirement ledger

Decomposed verbatim from the founder's brief. Every imperative is its own row.
Compound requirements are split.

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read `.claude/skills/brief-roast/brief-roast-SKILL.md` FIRST and obey it | | |
| 2 | Build in-product guidance AND the written guide hub, both shipping now, not post-launch | | |
| 3 | Research first, cited and dated | | |
| 3a | Report Humanitix help centre structure, including its seating articles | | |
| 3b | Report Eventbrite organiser help structure | | |
| 3c | Report TryBooking in-product hints (the seat-map scroll instruction) | | |
| 3d | Cite at least one 2026 in-product onboarding pattern | | |
| 3e | For each: article taxonomy, how in-product help links to articles, what is taught in context versus in an article | | |
| 4 | BUILD 1: in-product guidance | | |
| 4a | First-run coaching on the buyer seat map: short, dismissable sequence, two or three things a person actually needs | | |
| 4b | First-run coaching on the room studio: same shape | | |
| 4c | Coaching remembered per device so it never nags | | |
| 4d | Contextual hints at the moment of confusion, in the interface's own voice, not a tour | | |
| 4e | Empty states that teach rather than sit blank | | |
| 4f | A persistent, unobtrusive way to re-open help from both surfaces | | |
| 4g | Full keyboard access on every guidance control | | |
| 4h | Screen-reader labels on every guidance control | | |
| 5 | BUILD 2: the organiser guide hub | | |
| 5a | A real hub at `/guides` with categories | | |
| 5b | Search on the hub | | |
| 5c | Built for evergreen discovery, not a blog | | |
| 5d | Guide written in full: creating your first event | | |
| 5e | Guide written in full: building a seating chart | | |
| 5f | Guide written in full: mapping ticket tiers to seats | | |
| 5g | Guide written in full: publishing and sharing your promo kit | | |
| 5h | Guide written in full: tracking your reach | | |
| 5i | Guide written in full: getting paid and payout timing | | |
| 5j | Guide written in full: refunds and transfers | | |
| 5k | Guide written in full: running the door with the QR scanner | | |
| 5l | Every guide illustrated with real screenshots captured from the running app, not descriptions | | |
| 5m | Cross-linked from the in-product guidance so context and article are one system | | |
| 5n | Australian English throughout | | |
| 5o | Never name a competitor in public copy | | |
| 6 | Wire guidance so a question asked in context is answered in context by the assistant | | |
| 6a | The relevant guide is linked from the in-context answer | | |
| 6b | Report exactly what is needed to switch it on | | |
| 7 | PROOF | | |
| 7a | Captures of every guidance surface at 1440 into `docs/design/guidance-2026-07-26/` | | |
| 7b | Captures of every guidance surface at 390 into the same directory | | |
| 7c | Every guide rendered and linked, zero dead links | | |
| 7d | Report to `docs/design/GUIDANCE.md` | | |
| 7e | The report carries a comparison against the researched incumbent help centres | | |
| 7f | The report carries a verdict per area | | |
| 8 | DISCIPLINE | | |
| 8a | TEST database only, never PROD | | |
| 8b | Do not touch the seat map renderer, another session owns it | | |
| 8c | Do not touch the funds-holding payment engine | | |
| 8d | Australian English | | |
| 8e | No em-dashes, no en-dashes | | |
| 8f | No competitor named in public copy | | |
| 8g | Full gates before reporting | | |
| 8h | Commit each item separately | | |
| 9 | Standing constitution rules | | |
| 9a | The word "culture" banned in every form, "community" instead | | |
| 9b | Law 1: no generic, nothing that could belong to another product | | |
| 9c | Law 5: zero dead links and no dead-end tiles | | |
| 9d | Design system inherited exactly: container, hero scale, gold tiers, no glassmorphism | | |
| 9e | Motion: CSS-first, reduced-motion honoured | | |
| 9f | No exclamation marks in user-facing copy | | |
| 9g | Definition of Done: zero placeholders, everything works on real data | | |

## Premise corrections found during research

Recorded here before building, per the adjudication rule that a false premise is
stated and the underlying want is still served.

**P1. "Humanitix's seating articles alone run to dozens" is not correct.**
Verified 2026-07-26 against the live help centre. Humanitix publishes exactly
**2** articles under the Allocated Seating subcategory of the Build and manage
collection, and a site search for "seating" returns **10** articles that mention
seating at all. What IS large is the help centre overall: **283 articles across
15 collections**. The underlying want stands and is arguably easier to beat than
the founder assumed: their seating teaching is two articles deep, one of which is
roughly 3,000 words carrying 15+ screenshots and animated GIFs.

**P2. TryBooking's "Scroll left or right to view more seats" could not be
verified.** Four searches against public sources returned no instance of that
string. Their published seating articles show the opposite pattern: teaching
happens in long articles with animated GIFs, with minimal in-product tooltips.
The underlying want, a hint at the moment of confusion on the seat map, is built
regardless and is recorded as our own decision rather than as a mirror of theirs.

---

## Phase 2: adjudication

Completed 2026-07-27 against the built result. Evidence is a file path, a test
name, a command's output or a capture. Never an inference.

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read the brief-roast skill first and obey it | MET | Read before the first tool call; ledger written before adjudication, as required |
| 2 | Both builds ship now | MET | 4 feature commits on `feat/walkthrough-defects`; both routes and both mounts built and captured |
| 3 | Research first, cited and dated | MET | `docs/design/GUIDANCE.md` section 1, every claim with a source URL and a date |
| 3a | Humanitix structure and seating articles | MET | 15 collections, 283 articles tabulated; premise correction P1 recorded |
| 3b | Eventbrite organiser help structure | MET | GUIDANCE.md 1.2, taxonomy and featured-article shape |
| 3c | TryBooking in-product hints | MET as far as the public record allows | GUIDANCE.md 1.3; the specific string is recorded UNVERIFIED (P2), not asserted |
| 3d | A 2026 in-product onboarding pattern, cited | MET | Guideflow 28 Apr 2026, Product Fruits 19 Feb 2026, NN/g 19 Sep 2021 |
| 3e | Taxonomy, in-product linkage, context versus article | MET | GUIDANCE.md 1.1 to 1.3, each with a taxonomy-shape and an in-product-to-article paragraph |
| 4a | First-run coaching on the buyer seat map | MET | `buyer-seat-map-coach-1440.png`, `-390.png`, `-step2-1440.png`, `-step2-390.png` |
| 4b | First-run coaching on the room studio | MET | `room-studio-coach-1440.png`, `room-studio-coach-390.png` |
| 4c | Remembered per device, never nags | MET | `src/lib/guidance/memory.ts`, useSyncExternalStore over localStorage; keys asserted in `guidance-registry.test.ts` |
| 4d | Contextual hints at the moment of confusion | MET | 4 hints, each armed by an interaction. `buyer-seat-map-hint-taken-{1440,390}.png`, `buyer-seat-map-hint-filtered-{1440,390}.png`, `room-studio-first-block-hint-1440.png` |
| 4e | Empty states that teach | MET | `TeachingEmptyState` with the three NN/g jobs as required props; `room-studio-empty-state-{1440,390}.png`; buyer seatless state rewritten |
| 4f | Persistent, unobtrusive re-open on both surfaces | MET | 44px launcher in every surface capture; `buyer-seat-map-launcher-{1440,390}.png` |
| 4g | Full keyboard access on every guidance control | MET | `guidance-a11y.mjs` keyboard drive, 7 of 7 green: Tab reach, Enter opens, focus enters panel, Escape closes, focus returns |
| 4h | Screen-reader labels on every guidance control | MET | Same drive: coach and panel control-name checks green; 0 serious or critical axe across 10 states |
| 5a | A real hub at /guides with categories | MET | `src/app/guides/page.tsx`, 5 categories; `guides-hub-1440.png` |
| 5b | Search on the hub | MET | `guides-browser.tsx` and `guide-index.ts`; `guides-hub-search-{1440,390}.png`; 5 search assertions |
| 5c | Evergreen, not a blog | MET | No dates in URLs, no chronology, lifecycle taxonomy, ItemList and Article structured data, sitemap entries per guide |
| 5d to 5k | The eight guides written in full | MET | `guide-library.test.ts` publishes-exactly-eight and over-500-words-each |
| 5l | Illustrated with real screenshots from the running app | MET | 16 captures in `public/guides/`; test points every screenshot at a file that exists on disk |
| 5m | Cross-linked from the in-product guidance | MET | `guidance-registry.test.ts` asserts the slug resolves and the title matches the guide library |
| 5n | Australian English throughout | MET | Asserted by test over every user-facing string |
| 5o | Never name a competitor in public copy | MET | Competitor regex asserted in both suites |
| 6 | A question asked in context answered in context | MET (built) | `ask-in-context.tsx` posts to the locked route with the surface's assistant; visible in `buyer-seat-map-help-panel-1440.png` |
| 6a | The relevant guide linked from the answer | MET | Links render from the registry, never the model, so they cannot be hallucinated |
| 6b | Report exactly what is needed to switch it on | MET | GUIDANCE.md section 3, four items with why and how to verify. `GET /api/ai/status` observed returning enabled:false locally |
| 7a | Captures of every guidance surface at 1440 | MET | 12 desktop captures in `docs/design/guidance-2026-07-26/` |
| 7b | Captures of every guidance surface at 390 | MET | 12 mobile captures in the same directory |
| 7c | Every guide rendered and linked, zero dead links | MET | Link crawl with /guides seeded: 322 internal links, zero dead |
| 7d | Report to docs/design/GUIDANCE.md | MET | Written, 7 sections |
| 7e | Comparison against the researched incumbents | MET | GUIDANCE.md section 4, 12 areas, evidence named per area |
| 7f | A verdict per area | MET | 8 AHEAD, 2 LEVEL, 1 BEHIND, 1 AHEAD-but-not-switched-on |
| 8a | TEST only | MET | Every script hard-stops on the prod ref and requires the TEST ref; build and server run from `.env.test` |
| 8b | Seat map renderer untouched | MET | Per-commit check of my four commits (4d1de71, 9cdd8e0, e80e1ce, 0c0b1ab): the only path matching "seating" is `src/lib/guides/content/building-a-seating-chart.ts`, a guide content file. Zero files under `src/components/seating/` or `src/lib/seating/render/`. The renderer changes present in the branch and the working tree are the other session's four commits (1ae26df, b91f3ce, b8081b8, 07fe39d) and its uncommitted edits, untouched by me |
| 8c | Funds-holding payment engine untouched | MET | No file under `src/lib/payments/` modified; the payout guide READS the engine for facts only |
| 8d | Australian English | MET | Asserted by test over both content sets |
| 8e | No em-dashes, no en-dashes | MET | Asserted by test over both content sets, and by hand over the report |
| 8f | No competitor named in public copy | MET | Asserted by test. Competitors appear only in docs and code comments |
| 8g | Full gates before reporting | MET | tsc clean, eslint 0 errors, vitest 1017/1017, build success, crawl 0 dead, affordance 0, axe 0 serious, keyboard 7/7 |
| 8h | Commit each item separately | MET | 4 feature commits plus the evidence commit, each one unit |
| 9a | The banned community word | MET | Asserted by test in both suites |
| 9b | Law 1, no generic | MET | Every guide teaches this codebase's real behaviour; the tier name-match trap could not appear in another product's docs |
| 9c | Law 5, zero dead links and no dead-end tiles | MET | 322 links 0 dead; 0 dead-end tiles across 18 pages including both new routes |
| 9d | Design system inherited | MET | PageShell, PageHero, ContentSection, `max-w-7xl` and prose widths, gold-800 on light, no glassmorphism, no new colours |
| 9e | Motion CSS-first, reduced-motion honoured | MET | One keyframe in `globals.css` gated on `html[data-motion="1"]` |
| 9f | No exclamation marks | MET | Asserted by test in both suites |
| 9g | Zero placeholders, works on real data | MET | Placeholder regex asserted by test; every capture is real TEST data through the running app |

**Count: 47 MET. 0 PARTIAL. 0 NOT MET.**

## Phase 3: the adversarial pass

**Silent drops.** Ledger compared to the report row by row. Every numbered row
appears in GUIDANCE.md or in the commit history. None found.

**Interpretation drift.** One caught and corrected mid-build. The first capture
pass produced `buyer-seat-map-contextual-hint-*.png` from a random click sweep on
a room where all 750 seats were open, so the frame contained no hint at all. That
was an easier task (screenshot the seat map) substituted for the real one (prove
the hint fires). The files were deleted and replaced with
`scripts/verify/guidance-hint-capture.mjs`, which reads sold seats from the
database and drives the ticket-type filter deterministically.

**Match versus surpass.** Per-capability verdicts sit in GUIDANCE.md section 4:
8 AHEAD, 2 LEVEL, 1 BEHIND, 1 AHEAD-in-capability-but-not-switched-on. The two
LEVELs (screenshot fidelity, search) and the one BEHIND (help centre breadth, 8
guides against 283 articles) are stated as such rather than dressed up. Breadth
is a volume problem eight guides cannot solve; the four guides that would most
improve it are named.

**Unverifiable claim hunt.** Each quality claim was falsification-tested:
zero dead links would fail on a non-200 (all 322 requested); every guide
illustrated would fail on a missing file (disk check); keyboard accessible would
fail on an unreachable launcher (Tab drive from document top, and this one DID
fail first time, finding a real bug); guide links cannot be hallucinated would
fail on a model-authored href (links render from the registry, outside the
model's reach); the fee cannot drift would fail on a hardcoded fee (a test
asserts no percentage-plus-amount literal in any guide). One claim was DELETED as
untestable: an early draft said the guidance "feels invisible until you need it".

**The generic test.** Could this belong to another product? No. The guides teach
this codebase: the case-insensitive tier name match that silently sells front
rows at the base price, the publish gate's two blockers, the payout window read
live from `pricing_rules`, the scanner's fail-closed admit-once decision.

**The AI-tell sweep. This one found real hits and they were fixed.** The first
sweep across both content sets returned **2 matches**, both the word "unlock":
a code comment reading "The kit unlocks on publish", and, worse, user-facing
caption copy reading "The Launch Kit, unlocked the moment the event goes live."
Both were rewritten ("switches on at publish", "live the moment the event is
published").

The deeper fix: I had hand-rolled a tell regex in my tests instead of using the
platform's researched lexicon, which already exists at
`src/lib/ai/copy-tells.json` with a helper at `src/lib/ai/copy-tells.ts`. Both
test suites now assert `findCopyTells()` over every user-facing string, so the
guides and the in-product copy are held to the same canonical list as the AI
layer, and a future addition to the lexicon re-checks this content for free.
That is a gate rather than a gesture, and writing my own list was the mistake
worth recording.

Post-fix: em-dashes 0, en-dashes 0, exclamation marks 0, the banned community
word 0, competitor names in shipped copy 0, placeholder strings 0, researched
tells 0. All machine-asserted, 45 assertions across the two suites.

**The regression sweep (DESIGN-LOCK).** Changed outside the brief:
- `seat-selector.tsx` seatless empty state copy, replaced deliberately because
  the brief asked for empty states that teach and that was the blankest one.
- `site-footer.tsx` gained one link. The pre-existing uncommitted LEGAL change in
  that file was parked before committing and restored afterwards, verified by
  `git diff`, so no other session's work was absorbed into my commit.
- `sitemap.ts`, `link-integrity-crawl.mjs`, `affordance-scan.mjs` gained the new
  routes, required for the laws to cover them.
- Nothing else. No hero, spacing, colour, layout or chrome change. Zero changes
  under `src/components/seating/` or `src/lib/seating/render/`.

**The founder-cost test.** The report sends the founder to a dashboard once, to
set `ANTHROPIC_API_KEY` and the Upstash pair, which cannot be done in code here
(the Vercel CLI cannot set env values non-interactively). Every other question
was answered by reading the code rather than asked: payout timing from
`event-transfer.ts`, the tier binding from the migration, the publish gate from
`publish-gate.ts`, the scanner from `result.ts`.

**The evidence-visibility test.** 24 guidance captures, 16 guide screenshots, two
machine-readable results files, and both routes browsable. No claim rests on
prose alone.

**What the pass actually found.** One shipped-quality defect: the help launcher
was unreachable by finger on a phone, because the platform's bottom bars fill
`bottom-0` at `z-40` and intercepted the tap. Fixed to the existing platform
convention (`bottom-16 z-50`, `md:bottom-4`) and re-verified. Plus the
false-evidence capture above. Both are in GUIDANCE.md section 6, not hidden here.

## Phase 4: the gate

NOT MET: 0. PARTIAL: 0. Unresolved adversarial findings: 0.
Both findings were resolved before this report, not carried.

## Phase 5: decision evidence

| Dimension | Covered |
|---|---|
| Competitor | GUIDANCE.md section 1, three incumbents, cited and dated 2026-07-26 |
| Market | Help-centre depth as table stakes: 283 articles is the segment ceiling, 8 guides is our floor, stated as BEHIND |
| Engagement | Guideflow and Chameleon 2026 figures on tour length, skip rate and self-initiation drove the three-step, self-opened design |
| Trend | Product Fruits Feb 2026 on assistive-before-interruptive; NN/g on pull revelations |
| Our code | Every guide fact cites the file or migration it was verified against |
| Test plan | Below |

**Test plan, since no A/B can run before launch traffic.** The metric is
seated-checkout completion rate on the buyer map, split by whether the coach was
dismissed at step 3 or closed at step 1, compared against the pre-launch baseline
once one exists. The variant worth testing later is coach-on-arrival versus
hint-only-on-confusion; the research predicts hint-only wins on completion and
loses on feature discovery, which is a real trade worth measuring rather than
assuming. Recorded so it is not presented as settled.

## Phase 6: result

ROAST GATE: PASSED
Requirements: 47. Met: 47. Partial: 0. Not met: 0.
Adversarial findings: 4 found, 4 resolved, 0 unresolved.
(the mobile launcher collision, the false-evidence capture, the two "unlock"
tells, and the hand-rolled tell list replaced by the canonical lexicon)
