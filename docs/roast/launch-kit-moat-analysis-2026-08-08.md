# Roast ledger: Launch Kit moat analysis

Task: produce `docs/strategy/LAUNCH-KIT-MOAT-ANALYSIS.md`.
Date: 8 August 2026. Ledger written BEFORE adjudication, per the skill.
Two rounds recorded. Round 1 below, round 2 at the bottom.

---

## Phase 1: the requirement ledger

Decomposed verbatim from the brief, top to bottom. Compound requirements split.

### Role and deliverable shape
| # | Requirement |
|---|---|
| 1 | Act as market strategist and product analyst, not engineer |
| 2 | Change no code |
| 3 | Produce a document |
| 4 | Hold the founder's framing throughout: the tool is the bait, not the ticketing platform |
| 54 | Write to `docs/strategy/LAUNCH-KIT-MOAT-ANALYSIS.md` |
| 55 | Open with a ONE PAGE executive summary actionable without reading the rest |
| 56 | Then the full analysis |
| 57 | Then an appendix of every source consulted |
| 66 | Report and stop. Do not commit |

### The comparison set
| # | Requirement |
|---|---|
| 5 | Do NOT analyse only against ticketing platforms |
| 6 | Comparison 1: against the MANUAL STATUS QUO, covering time cost, skill cost, quality of output, what breaks |
| 7 | Comparison 2: against EVENT MARKETING AND PROMOTION TOOLS |
| 8 | Comparison 3: against TICKETING PLATFORMS' OWN ORGANISER TOOLING at the point of creating an event |
| 9 | Name incumbents freely |
| 10 | Produce the three comparisons SEPARATELY and CLEARLY LABELLED |

### Method
| # | Requirement |
|---|---|
| 11 | Generalist first, then specialist. Start wide |
| 12 | Research live, use web search extensively |
| 13 | Do not rely on training knowledge alone |
| 14 | Cite what you find |
| 15 | Where evidence cannot be found, say so plainly rather than filling the gap |
| 16 | Read the actual product: Launch Kit implementation, Magic Start, anti-tell gate, seat builder, share card generation, tracked links, reach panel, `docs/EventLinqs_Scope_v5.md` |
| 17 | Distinguish BUILT AND PROVEN / BUILT BUT UNPROVEN / PLANNED |
| 18 | Credit the product with nothing not seen in code |
| 19 | Use the founder's supplied verified facts as starting facts |

### Part 1
| # | Requirement |
|---|---|
| 20 | Who independent organisers are, SEGMENTED |
| 21 | How they get an event live today, step by step, WITH TIME ESTIMATES |
| 22 | What they complain about, SOURCED |
| 23 | WHERE THEY ABANDON |
| 24 | What they pay for and what they refuse to pay for |
| 25 | What makes them switch, and what makes them stay |

### Part 2
| # | Requirement |
|---|---|
| 26 | Is there real, felt, recurring pain, or a solution looking for a problem |
| 27 | Be willing to conclude it is weaker than hoped |
| 28 | Rank the pains by acuteness and frequency |
| 29 | Map each pain to what the tool actually does |
| 30 | Name EVERY pain the tool does NOT address |

### Part 3
| # | Requirement |
|---|---|
| 31 | Switching cost analysis |
| 32 | What does an organiser LOSE by trying this |
| 33 | What do they have to ABANDON |
| 34 | Where does the tool ask for trust it has not earned |
| 35 | Analyse the free / no-commitment framing: genuinely lowers barrier, or signals low quality |

### Part 4
| # | Requirement |
|---|---|
| 36 | Assess event page, poster, share cards AND copy against PLEASED versus merely WILLING |
| 37 | Proportionate weight, be brutal |

### Part 5
| # | Requirement |
|---|---|
| 38 | STRUCTURAL properties that make an organiser show another organiser, not campaign ideas |
| 39 | Is there anything in the artefact itself that carries the tool to a new user |
| 40 | Assess referral mechanic, tracked links, QR poster as spread vectors |
| 41 | Say plainly if the tool has no inherent spread and relies on marketing |

### Part 6
| # | Requirement |
|---|---|
| 42 | List what is missing, RANKED BY IMPACT AGAINST EFFORT |
| 43 | Concrete and buildable, not aspirational |
| 44 | For each: what it costs and what it buys |

### Part 7
| # | Requirement |
|---|---|
| 45 | State plainly whether strong enough as the acquisition engine |
| 46 | If not, say what would make it so |

### Part 8
| # | Requirement |
|---|---|
| 47 | Risks the founder has NOT considered, including uncomfortable ones |

### Conduct and standing rules
| # | Requirement |
|---|---|
| 48 | Australian English |
| 49 | No em dashes or en dashes ANYWHERE |
| 50 | "community", never the banned alternative |
| 51 | Cite sources for market claims |
| 52 | Distinguish evidence from inference IN EVERY SECTION |
| 53 | Never present own reasoning as a finding |
| 70 | No production writes; TEST only |
| 71 | Internal document, so incumbent names permitted; must be marked internal |
| 72 | Definition of Done: honest reporting, nothing partial reported as complete |

### The roast requirements themselves
| # | Requirement |
|---|---|
| 58 | Run brief-roast against own analysis |
| 59 | Hunt conclusions that flatter the product |
| 60 | Hunt market claims with no source |
| 61 | Hunt anything asserted from training knowledge and presented as research |
| 62 | Hunt any verdict softened to be agreeable |
| 63 | Fix what it finds |
| 64 | Run a second round |
| 65 | Report both rounds |

---

## Phase 2: adjudication, ROUND 1

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | Document is analysis, no engineering output |
| 2 | MET | `git status` shows only the new doc and this ledger under `docs/`; no `src` change made this session |
| 3 | MET | File created |
| 4 | MET | Framing held; Part 7 judges the tool AS the acquisition engine, which is the founder's frame |
| 5 | MET | Canva, Linktree, Buffer, Later, Hootsuite, Music Victoria data all present |
| 6 | **PARTIAL** | Manual stack step table exists at 1.2 but is NOT labelled as a comparison, and SKILL COST is never treated |
| 7 | **NOT MET** | No section compares against event marketing and promotion tools. Buffer, Later, Metricool, Hootsuite, PosterMyWall, Canva Content Planner appear nowhere as a comparison |
| 8 | **NOT MET** | No section compares against incumbent organiser tooling at the point of creation. Fragments only, scattered |
| 9 | MET | Eventbrite, Humanitix, TryBooking, Oztix, Moshtix, Luma, Canva, Bending Spoons all named |
| 10 | **NOT MET** | Grep for the three comparison labels returns 1 weak match. The three comparisons are dissolved into other sections, which is exactly the interpretation drift the skill hunts |
| 11 | MET | Part 1 is wide, Parts 2 to 6 narrow |
| 12 | MET | 14 web searches and 4 fetches this session |
| 13 | PARTIAL | One load-bearing claim asserted from training knowledge, see row 61 |
| 14 | MET | Appendix A lists every source with URL |
| 15 | MET | Three explicit gaps stated: no per-step minute data, no Canva-usage share for organisers, TicketSource primary unreachable |
| 16 | MET | All eight named artefacts read; file paths in Appendix A table. Scope v5 searched, result recorded as a finding |
| 17 | MET | Labels defined at the top and applied per artefact |
| 18 | MET | Every product claim carries a file path or a verification command |
| 19 | MET | Listed and labelled in Appendix A's final block |
| 20 | MET | Four segments A to D |
| 21 | PARTIAL | Step table exists; most per-step times are UNSOURCED and marked as such. Honest, but the requirement asked for estimates and I largely declined to give them |
| 22 | MET | Ranked table at 1.3, each row sourced |
| 23 | **NOT MET** | Grep for "abandon" in the document returns 0. Silent drop |
| 24 | MET | 1.4 |
| 25 | MET | 1.5 |
| 26 | MET | 2.1, concludes the pain is real but different from the one led with |
| 27 | MET | 2.4 states the tool is pointed at the wrong sentence |
| 28 | MET | Ranked table at 2.1 with acuteness and frequency columns |
| 29 | MET | Mapping table at 2.2 |
| 30 | MET | 2.3, seven items |
| 31 | MET | 3.1 and 3.2 |
| 32 | MET | 3.3 table |
| 33 | PARTIAL | "What they lose" covered; "what they must ABANDON" answered implicitly (3.1 says nothing to migrate) but never stated as its own answer |
| 34 | MET | 3.4 |
| 35 | MET | 3.5, concludes neither, it signals table stakes |
| 36 | MET | 4.1 to 4.6, all four named artefacts plus the seat map, each with a pleased/willing verdict |
| 37 | MET | Part 4 is the longest section; verdicts include "not fit for the stated purpose" |
| 38 | MET | 5.4, four structural properties, no campaign ideas |
| 39 | MET | 5.1 table and 5.2 |
| 40 | MET | 5.3, all three assessed individually |
| 41 | MET | 5.2 states it plainly in bold |
| 42 | MET | Part 6 table, ranked |
| 43 | MET | Every item names a file or an existing spec |
| 44 | MET | Cost and buys columns |
| 45 | MET | Part 7 opens with "No." |
| 46 | MET | Part 7 closing paragraph, items 1 to 7, 51 to 73 hours |
| 47 | MET | Ten risks, including the wedge/seat-builder mismatch and the Eventbrite-irrelevance risk |
| 48 | MET | Australian spellings used throughout (organiser, recognised) |
| 49 | MET | `grep -c` for U+2014 and U+2013: **0 and 0** |
| 50 | MET | `grep -ci 'cultur'`: **0** |
| 51 | MET | Every market claim carries a link or an explicit "unsourced" marker |
| 52 | PARTIAL | Inference labelled in Parts 1, 2, 3, 4, 5. **Parts 7 and 8 contain unlabelled reasoning** |
| 53 | PARTIAL | Same as 52 |
| 70 | MET | No database access of any kind this session |
| 71 | MET | Header states INTERNAL DOCUMENT |
| 72 | MET (pending this gate) | - |
| 58 | MET | This ledger |
| 59 to 65 | In progress | Phase 3 below |

**Round 1 count: NOT MET 4 (rows 7, 8, 10, 23). PARTIAL 6 (rows 6, 13, 21, 33, 52, 53).**

---

## Phase 3: the adversarial pass, ROUND 1

**Silent drops.** Four, all in the comparison set and Part 1:
- Comparison 2 (event marketing and promotion tools) does not exist.
- Comparison 3 (incumbent organiser tooling at creation) does not exist as a comparison.
- The three comparisons are not separately labelled.
- "Where they abandon" is absent entirely.

**Interpretation drift.** Found, and it is severe. The brief gave an explicit
structural instruction ("produce THREE separate comparisons, clearly labelled")
and I substituted the easier task of weaving competitor facts through the eight
parts. The brief even warned that the ticketing-only frame "is the mistake to
avoid", and by not building comparison 2 I made a version of exactly that
mistake: the document compares mostly against ticketing platforms and the manual
stack, and barely against the promotion-tool category.

**Match versus surpass.** The brief did not ask me to surpass anything, so this
test does not bind. It DOES bind on the document's own claims about the product
surpassing competitors. Audited: the document claims the anti-tell gate and the
tracked-artefact chain are AHEAD. Both are attributed to the repository's own
2026-07-25 research rather than presented as my own finding, and both name the
capability. Acceptable, but the AHEAD claim on "no surveyed platform renders a
finished promo kit at publish" is a universal negative that the source itself
flags as unprovable. The document repeats it without repeating that caveat.
**Unresolved finding, must fix.**

**Unverifiable claim hunt.** One serious hit.
- "Instagram does not unfurl link previews in feed" is load-bearing for the
  whole of section 4.3 and for exec-summary finding 2. I asserted it from
  training knowledge. It is not sourced. **This is precisely requirement 61.
  Must fix.**
- "Canva made poster production cheap and fast": sourced only to Canva's own
  marketing. Already flagged in the document as a vendor claim. Acceptable.
- "58.9 percent rely on referrals": flagged as directional with a named
  commercial-interest caveat. Acceptable.
- Every code claim: falsifiable by opening the named file at the named line.
  Spot-re-verified `poster.ts:63-64` (Helvetica) and `poster.ts:24-34` (no logo
  slot in `PosterInput`). Both hold.

**Conclusions that flatter the product.** Audited each positive verdict.
- "Event page: pleased" is the softest verdict in the document. It rests on
  design-system inheritance and the cross-promotion removal, both verified.
  The branding limitation is stated. Holding.
- "Generated copy: pleased" rests on code I read line by line. The 34 tests are
  cited from `PHASE-C.md`; **I did not run them.** The document does not say so.
  **Must fix: a cited test count I have not executed is not my evidence.**
- "The artefacts are connected and no competitor connects them" is the
  document's strongest positive claim. It rests on the repository's own survey.
  Same universal-negative problem as above.

**Softened verdicts.** One found. Part 4.2 concludes the poster is "willing,
not pleased" and then softens with "against no poster at all, this wins
outright". That is true but it is the wrong comparison: the brief's whole point
is that the real alternative is Canva, not nothing. The softener should be cut
or reframed.

**The generic test.** Could this document belong to another product? No. It
turns on this repository's file paths, this platform's flags, the Victorian
venue data behind this specific wedge, and this constitution's own laws.

**AI-tell sweep.** Mechanical, run on the file:
- em-dash U+2014: **0**
- en-dash U+2013: **0**
- exclamation marks: **1**, and it is `!isLive`, a JavaScript negation inside a
  code quote. Not user-facing copy. **PASS.**
- banned word, any form: **0**
- tell lexicon: **1 hit, "unlock"**, at line 358, inside a verbatim quotation of
  the product's own shipped copy ("Your launch kit unlocks when you publish").
  Quoting is legitimate. **But this surfaced a real product finding:** "unlock"
  sits in the `generatedOnlyWords` bucket of `src/lib/ai/copy-tells.json`, which
  fails generated copy only, so the platform's own marketing prose passes its own
  gate while using a word its own research file describes as a tell "in marketing
  prose". **New finding, must be added to the analysis.**

**Regression sweep.** DESIGN-LOCK: no existing file was modified. Two new files
created, both under `docs/`. Nothing reverted, nothing to revert.

**Founder-cost test.** Does the document send the founder anywhere I could have
gone myself? One instance found: risk 9 (production cannot sell) is carried from
project memory and I did not re-verify it. Re-verifying would mean querying
production, which the constitution forbids writing to and which is outside a
read-only analysis brief. Stated as carried-forward and labelled. Acceptable.
No question is asked that reading code would have answered.

**Evidence-visibility test.** The deliverable is a written analysis at a named
path, which the skill counts as visible. No visual deliverable was requested, so
no capture is owed. The verification-commands table lets the founder re-run
every absence claim himself. Passes.

---

## Phase 4: the gate, ROUND 1

**Count: 4 NOT MET + 6 PARTIAL + 5 unresolved adversarial findings = 15.**

Gate result: **FAILED.** Option 1 taken: go back and finish. Fixes applied are
recorded in round 2 below.

Fix list carried into round 2:
1. Add the three separately labelled comparisons as their own part (rows 6, 7, 8, 10).
2. Add "where they abandon" to Part 1 (row 23).
3. Source or explicitly mark the Instagram link-preview claim (rows 13, 61).
4. Label inference in Parts 7 and 8 (rows 52, 53).
5. State that the 34 anti-tell tests were cited, not run by me.
6. Carry the universal-negative caveat wherever the "no competitor does this" claim is repeated.
7. Cut the "against no poster at all" softener in 4.2.
8. Answer "what must they abandon" explicitly (row 33).
9. Add the "unlocks" product-copy finding.
10. Add a test plan (Phase 5 decision-evidence dimension, missing entirely).
11. Treat skill cost in the manual comparison (row 6).

---

## Phase 5: decision evidence, ROUND 1

| Dimension | State |
|---|---|
| Competitor | Present and cited, dated 2026 |
| Market | Present and cited |
| Engagement | Weak. PLG benchmarks and QR scan rates cited, both vendor-sourced |
| Trend | Present: the 2026 acquisition, the 2026 AI trust data |
| Our code | Strong. File paths and line numbers throughout |
| **Test plan** | **MISSING ENTIRELY.** The document recommends 51 to 73 hours of work and never says how we would know if the recommendation is wrong |

Test plan is fix 10 above.

---

## ROUND 2

All eleven round 1 fixes were applied to
`docs/strategy/LAUNCH-KIT-MOAT-ANALYSIS.md` before this round was adjudicated.

### Phase 2: adjudication, ROUND 2 (only rows that were not MET in round 1)

| # | Round 1 | Round 2 | Evidence |
|---|---|---|---|
| 6 | PARTIAL | **MET** | New `## COMPARISON 1` section with all four required dimensions as explicit rows: time cost, **skill cost**, quality of output, what breaks. `grep -ci "skill cost"` returns 1 |
| 7 | NOT MET | **MET** | New `## COMPARISON 2` section covering Canva, PosterMyWall, Linktree, the four schedulers, and Luma, with price, AHEAD and BEHIND columns |
| 8 | NOT MET | **MET** | New `## COMPARISON 3` section covering Eventbrite, Humanitix, TryBooking, Oztix and Moshtix, Ticket Tailor, Luma, each with a verdict |
| 10 | NOT MET | **MET** | `grep -c "^## COMPARISON [123]:"` returns **3**, under a shared `# THE THREE COMPARISONS` heading |
| 13 | PARTIAL | **MET** | The Instagram claim now carries two sources and an explicit disclosure that it was written from prior knowledge and sourced only after round 1 flagged it |
| 21 | PARTIAL | **PARTIAL, deliberately** | The step table exists; most per-step minutes remain unsourced and are marked UNSOURCED. Requirement 15 (say so plainly rather than filling the gap) outranks requirement 21 here. Inventing minute estimates to satisfy 21 would have violated 15. Disclosed in the report |
| 23 | NOT MET | **MET** | New section 1.3b, anchored on a primary: Stripe's Ticket Tailor customer story, exact quote fetched and confirmed |
| 33 | PARTIAL | **MET** | New explicit paragraph in 3.1 answering "what must they abandon" with "nothing, and that is the answer" |
| 52 | PARTIAL | **MET** | Parts 7 and 8 now open with an "Evidence status of this part" block separating fact from judgement. Parts 1 to 6 already carried inline **Inference** labels |
| 53 | PARTIAL | **MET** | Same as 52, plus Part 6B states that every forward-looking statement in Parts 5 to 8 is reasoned judgement, not measurement |
| 55 | (not adjudicated round 1) | **PARTIAL** | Exec summary is 808 words including a five-row table, roughly 1.3 printed pages, not one. Reduced from 1020. Cutting further would have meant dropping one of the four findings, which is a worse failure than a slightly long summary. Disclosed rather than hidden |

### Phase 3: adversarial pass, ROUND 2

**Silent drops.** None found. Every round 1 drop is closed and each closure is
grep-verified above.

**New contradictions introduced by the fixes.** One found and fixed. Adding
finding 4 to the executive summary left Part 7 saying "three specific reasons"
while the summary carried four. Verified by grep, reconciled: Part 7 now states
four reasons and carries finding 4 as its own numbered item, distinguishing the
three product facts from the one positioning fact.

**Unverifiable claim hunt, round 2 (new claims only).**
- PosterMyWall template counts and feature list: self-reported vendor marketing.
  **Fixed:** an explicit source caveat now heads the comparison 2 table.
- Luma capabilities: sourced to Luma's own help pages, which is the correct
  primary for "what does this product do". Held.
- Stripe / Ticket Tailor drop-off quote: primary, fetched, exact wording
  confirmed against the page. Held.
- Instagram link-preview behaviour: two independent sources. Held.

**Conclusions that flatter the product, round 2.** The fixes moved the document
AGAINST the product on balance, which is the correct direction for an
adversarial pass: comparison 2 concludes the kit is not novel in its own stated
category, and 4.2's softener was removed and replaced with the harder
comparison. No new flattering conclusion was introduced.

**Softened verdicts, round 2.** None found. The one identified in round 1 is cut.

**AI-tell sweep, round 2** (run with node, not grep, after a shell-escaping
artefact produced a false positive of 844 in the first attempt):
- Every dash-family codepoint (U+2012, U+2013, U+2014, U+2015, U+2212, U+FE58,
  U+FF0D, U+2E3A, U+2E3B): **0**
- Non-ASCII characters anywhere in the file: **NONE**
- Exclamation marks: **1**, and it is `!isLive`, a JavaScript negation inside a
  code quote. Not user-facing copy. PASS
- Banned word, any form: **0**
- Tell lexicon: **3 hits, all "unlock"**, all verbatim quotations of the
  product's own shipped copy or the analysis of that copy as a defect.
  Legitimate reporting, and the underlying product defect is now written up in
  section 4.4

**Regression sweep.** No existing file modified. Three new files, all under
`docs/`. Nothing to revert.

**Founder-cost test.** Unchanged from round 1 and passing. The verification
table lets the founder re-run every absence claim himself.

### Phase 5: decision evidence, ROUND 2

| Dimension | State |
|---|---|
| Competitor | Present, cited, dated, and now organised into three labelled comparisons |
| Market | Present and cited, with source quality flagged per claim |
| Engagement | Improved: the Stripe drop-off primary and the Bynder disclosure study are behavioural evidence, not vendor stat-blog material |
| Trend | Present: the 2026 acquisition, the 2026 AI trust data |
| Our code | Strong. File paths and line numbers throughout, plus a re-runnable verification table |
| Test plan | **NOW PRESENT.** Part 6B: six falsification thresholds plus two named A/B tests, built on the four activation events that already ship |

### Phase 4: the gate, ROUND 2

**Count: NOT MET 0. PARTIAL 2 (rows 21 and 55, both deliberate and both
disclosed). Unresolved adversarial findings: 0.**

Gate result: **PASSED WITH TWO DISCLOSED PARTIALS.** Both partials are choices
where satisfying the letter of one requirement would have breached another
(honesty over invented numbers; completeness over brevity). Neither is a silent
drop, and both are stated at the top of the report rather than buried.
