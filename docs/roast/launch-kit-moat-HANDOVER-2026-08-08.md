# HANDOVER: feat/launch-kit-moat

Written 8 August 2026 at the point of a clean stop, per the founder's scope
ruling ("if you run out of context, write a precise handover and stop cleanly").

Branch `feat/launch-kit-moat`, cut from `origin/main` at `1888ece`.
Five commits, all gates green at every commit. **Nothing merged. Nothing pushed.**

---

## 1. THE LEDGER: every item A to G, adjudicated

Verdicts are MET, PARTIAL, NOT STARTED, or BLOCKED. No item is described as
complete unless it is at 100 percent with evidence.

| # | Item | Verdict | Evidence / what remains |
|---|---|---|---|
| **C1** | Status message contradicts itself | **MET** | One pure function decides both lists (`src/lib/events/magic-draft-apply.ts`). A synthesised end time is reported as ASSUMED, a third state neither list had. 6 tests assert filled and still-needed never overlap across six event types |
| **C2** | Short Summary empty | **MET** | `summary` added to `DRAFT_SCHEMA` with its own craft instruction, in the copy pass, in the anti-tell gate, and with a deterministic fallback. Asserted non-empty, <=200 chars, ends on a full stop, and NOT a prefix of the description |
| **C3** | Category not selected | **MET at the tool level, PARTIAL at the taxonomy level** | The tool now always chooses; never empty. **R1 (the migration) is NOT STARTED** |
| **C4** | Tags empty | **MET** | In schema, prompt and fallback. Asserted 4 to 8, lowercase, deduplicated |
| **C5** | Communities not ticked | **MET** | In schema, constrained server-side to live slugs, high-precision deterministic detection. Asserted empty when unsignalled and correct when signalled |
| **C6** | Venue address pushed back | **NOT STARTED** | Needs venues-table lookup then Google Places. Est. 5 to 8 h |
| **C7** | Microphone failed silently | **NOT STARTED** | Root cause diagnosed in Phase 0. Est. 4 to 6 h, plus E1's cross-browser testing |
| **R1** | Taxonomy migration | **NOT STARTED** | Divergence fully evidenced (section 3 below). Migration not written. Est. 4 to 6 h |
| **R2** | `.nvmrc` | **MET** | `.nvmrc` = 20, matching CI |
| **R4** | Deterministic floor | **MET** | `buildDeterministicDraft` + `src/lib/ai/draft-fallbacks.ts`. Route falls back on every non-refusal failure |
| **R5** | Raw model output for the founder's input | **BLOCKED** | No `ANTHROPIC_API_KEY` anywhere locally. Unblock: set it on the PREVIEW scope |
| **F1** | Cost per generation | **MET** | USD 0.0166 measured. `docs/strategy/LAUNCH-KIT-COST-ANALYSIS.md` |
| **F2** | Anonymous endpoint model | **MET** | 10/100/1000 per day modelled |
| **F3** | Fail-open cost guard | **MET** | Fails closed on the anonymous path, floor serves. 6 tests, two asserting OPPOSITE verdicts on the same failure |
| **F4** | How others make it cheap | **MET, with one honest gap** | Satori/`@vercel/og` template rendering is the pattern. Luma's internal stack could NOT be determined and is not asserted |
| **F5** | Where AI spend is avoidable | **MET** | Per-call audit. Recommendation: deterministic by default, model for prose only |
| **F6** | Cheaper model, tested | **BLOCKED** | Requires calling models. Same blocker as R5 |
| **F7** | Caching and reuse | **PARTIAL** | Opportunities named and ranked. Identical-input dedup NOT IMPLEMENTED. Est. 6 to 8 h |
| **F8** | Storage and bandwidth | **PARTIAL** | Supabase egress sourced (secondary). **Vercel and Upstash 2026 pricing NOT SOURCED and deliberately not guessed** |
| **F9** | Abuse vectors | **MET** | Eight named with the defence for each. BotID recommended and NOT wired |
| **F10** | Recommendation table | **PARTIAL** | Anthropic figures computed. Other services blocked on F8's gaps |
| **G1** | Platform tie boundary | **MET as a design** | Designed and justified in `LAUNCH-KIT-REACH-AND-TIE.md`. NOT BUILT (it is part of A1) |
| **G2** | Reach inventory | **MET** | Verified by opening code. Decisive finding: the waitlist is orphaned |
| **G3** | Shortest credible path | **MET as a plan** | 6 moves ranked, zero-users problem answered directly. NOT BUILT |
| **G4** | Positioning consequence | **MET** | The promise stated, reach clause deliberately excluded until true per city |
| **A1** | Public composer | **NOT STARTED** | Est. 24 to 34 h. Spec in `PHASE-C.md` part 4 |
| **A2** | Story/square cards + captions | **NOT STARTED** | Est. 30 to 38 h |
| **A3** | Spread mechanic in the kit | **NOT STARTED** | Est. 6 to 10 h |
| **A4** | Positioning copy sweep | **NOT STARTED** | Est. 3 to 5 h. **This was ranked #2 and is the cheapest item left** |
| **B1** | Organiser logo on the poster | **NOT STARTED** | Est. 10 to 14 h (two jobs: no logo is collected anywhere) |
| **B2** | The four zeros empty state | **NOT STARTED** | Est. 3 to 4 h. Ranked #3 |
| **D1** | Pain gap answer | **MET** | Answered in Part G, section G3 |
| **D2** | Full seven-step walkthrough | **NOT STARTED** | Est. 10 to 16 h |
| **D3** | Honest verdict | **NOT DUE** | Due at the end of the branch |
| **D4** | Founder walkthrough script | **NOT STARTED** | Est. 2 to 3 h |
| **E1** | Voice must work | **NOT STARTED** | Est. 8 to 12 h with cross-browser testing |
| **E2** | Images and video | **NOT STARTED** | Est. 20 to 30 h. Architecture recommendation already in F8 |
| **E3** | Composer desk | **NOT STARTED** | Est. 40 to 55 h |
| **E4** | No fault on any page | **PARTIAL** | Applied to what I changed (four defects found by reading real output and fixed). Not applied platform-wide |

**Done to 100 percent: C1, C2, C4, C5, R2, R4, F1, F2, F3, F5, F9, G2, G3, G4, D1.**
**Blocked on one environment variable: R5, F6.**
**Remaining: roughly 170 to 240 hours.**

---

## 2. THE COMMITS

| SHA | What |
|---|---|
| `b56f6f1` | Preserved the moat analysis (it was UNTRACKED) + Phase 0 evidence |
| `89895aa` | C1 to C5 + the deterministic floor + `.nvmrc` |
| `3aa5335` | F3, cost guard fails closed on the anonymous path |
| `9cc2fbc` | Part F cost analysis |
| `59f3b84` | Part G reach inventory, platform tie, positioning |

**Gate state at `59f3b84`:** tsc clean, eslint **47 warnings 0 errors** (baseline
was 48), **1302 tests passing across 121 files** (baseline 1276), copy-tell-gate
clean.

---

## 3. THE THREE FINDINGS A FRESH SESSION MUST NOT RE-DERIVE

**A. The taxonomy divergence (R1's evidence, already gathered).**
`event_categories` on TEST has 21 active rows: Music, Sports, Arts & Culture,
Food & Drink, Business & Networking, Education, Charity, Nightlife, Family,
Technology, Religion, Fashion, Health & Wellness, Community, Festival, Film,
Other, Pride, European, Middle Eastern, Pacific. **No Comedy.**
The homepage `category-nav-rail.tsx` offers nine tiles, of which **two cannot
match any event**: `comedy` and `arts-community` (the table has `arts-culture`).
The homepage Comedy rail (`page.tsx:128`, `byCategory('comedy')`) can therefore
**never render**, and its tile links to `/events?category=comedy`, which
resolves 200 to a permanently empty result.
`community-picks-section.tsx` links to `/categories/comedy`, which is not a
valid hero-category slug, but **that component is not rendered anywhere**, so it
is dead code and not a live dead link. Do not report it as one.

**B. The waitlist is orphaned (G2's decisive finding).**
`/waitlist` writes `city_waitlist_signups`. Nothing reads it to send anything.
The weekly digest reads `marketing_consents`. Bridging the two is the cheapest
real answer to the acute pain in the whole brief.

**C. No organiser logo is collected anywhere.**
`organisations.logo_url` is read in four places and written in none. B1 is two
jobs.

---

## 4. GOTCHAS THAT COST ME TIME

- **`.env.local` points at PRODUCTION** (`gndnldyfudbytbboxesk`). `.env.test` is
  TEST (`vkapkibzokmfaxqogypq`). Never run anything with `.env.local` loaded.
- **No `ANTHROPIC_API_KEY` in any local env file.** This blocks R5 and F6.
- **`grep -c $'—'` does not work in this Git Bash.** It silently matches a
  character class and returns a huge false count. Use node to audit dashes.
- **vitest `console.log` output is swallowed.** Write to a file from inside the
  test instead.
- The **copy-tell-gate has an allowlist** (`scripts/copy-tell-gate.mjs:27-49`)
  for files that must name a banned pattern. Any new file needing one must add
  an entry with a reason.
- **"unlock" is in `generatedOnlyWords`**, so the kit's own shipped copy ("Your
  launch kit unlocks when you publish") passes the gate while identical model
  output would fail. Flagged in the analysis, not yet fixed.

---

## 5. THE EXACT NEXT STEP

Work the ranked list from where I stopped:

1. **A4, the positioning copy sweep** (3 to 5 h). Cheapest item left, and doing
   it before A2/E3 means the new surfaces are written once. The promise to use
   is in `LAUNCH-KIT-REACH-AND-TIE.md` section G4, already worded and already
   constrained so it does not over-claim reach.
2. **B2, the four zeros** (3 to 4 h). Self-contained, DESIGN LOCK permits it.
3. **C7 + E1, voice** (8 to 12 h). Root cause already diagnosed in Phase 0
   section 0.3.
4. **C6, venue resolution** (5 to 8 h).
5. **R1, the taxonomy migration** (4 to 6 h). All evidence is in section 3A
   above; write the migration, test on TEST, put it in the approval block, do
   NOT run it against production.

**Before building A1 or E3, re-read `LAUNCH-KIT-COST-ANALYSIS.md` F5 and F9.**
The deterministic-by-default recommendation and the BotID gap both change how
those are built.

**One founder decision is outstanding and blocks nothing yet:** whether the
G3 reach moves (21 to 33 h, the only work touching the acute pain) should be
sequenced ahead of A2 (30 to 38 h, asset production). My recommendation is yes,
and the reasoning is in `LAUNCH-KIT-REACH-AND-TIE.md`.
