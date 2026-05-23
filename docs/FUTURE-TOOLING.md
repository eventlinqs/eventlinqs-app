# FUTURE-TOOLING.md

Status: AUTHORITATIVE. Records Claude Code plugin, design-tooling, and
brand-quality decisions from 19 May 2026 onward. Updated whenever a new
tool is evaluated or a quality bar is raised.

Save to: `C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app\docs\FUTURE-TOOLING.md`

---

## CORE OPERATING PRINCIPLE (locked 19 May 2026)

**Design and UX decisions are made from verified competitor evidence,
NEVER from generic design principles or training data.**

The workflow is:

1. Claude (chat) writes a research prompt directing CC code.
2. CC code scrapes ALL competitors via Firecrawl + Playwright at
   desktop and mobile, captures screenshots and structured measurements
   (font families, sizes, weights, line-height, spacing tokens, palette,
   motion durations and easing curves, information density).
3. CC code saves artefacts to `/research/competitors/` in the repo
   and produces a structured comparison report inline.
4. Claude (chat) reviews the actual evidence (screenshots and report)
   and makes recommendations from data.
5. Claude (chat) writes the implementation prompt for CC code based on
   what the research shows, not on assumptions.

Generic design advice ("use generous whitespace," "premium = restraint,"
"add a serif display face") is BANNED unless the recommendation is
backed by a specific competitor measurement and a documented reason
EventLinqs should match or deviate. If the evidence is not in
`/research/competitors/`, the recommendation is invalid.

---

## Locked tooling stack (already installed)

**Firecrawl** - competitor intelligence scraping. Authenticated MCP. Use
for: scraping Ticketmaster, DICE, Eventbrite, Humanitix, Resident
Advisor, Boiler Room. Pulls clean markdown of full pages, handles
anti-bot walls that defeat Playwright on those sites.

**Playwright MCP** - own-platform testing AND competitor visual capture.
For competitor visual capture, use Playwright in visible-browser mode
(per memory entry 27) to take screenshots at desktop (1440px) and mobile
(375px) viewports. NOT for content scraping of anti-bot sites - use
Firecrawl for that.

**v0.dev** - design generation from scraped competitor data + project
tokens. Authenticated.

**The locked workflow:**

```
Firecrawl scrape competitors (text + structure)
  + Playwright screenshots (visual proof)
    -> /research/competitors/<competitor>/ folder
    -> structured comparison report
      -> Claude (chat) reviews actual evidence
        -> v0.dev component generation (informed by data)
          -> Claude Code adaptation to project conventions
            -> Playwright + Lighthouse + axe-core verification
              -> ship
```

---

## Install immediately (post Tab B merge)

**Skill Creator (Anthropic official)** - bottles project conventions
(Jaguar pre-check, Competitive Benchmark Gate, migration discipline,
AU-English voice rules, the research-first principle above) into
reusable skills. Free. Global scope.

**Frontend Design skill (Anthropic official)** - production-grade UI on
M5 Public Pages work. Used WITH the research-first principle, not as a
substitute for it. Free. Global scope.

---

## Brand quality bar

EventLinqs must feel premium within the locked competitive set
(Ticketmaster, DICE, Eventbrite, Humanitix). The TECHNIQUES required
to achieve premium feel must be derived from research, not asserted.

Quality gates on every M5+ component:

1. Typography choices verified against competitor measurements.
2. Spacing values verified against competitor measurements (NOT
   "generous whitespace" as a generic principle - Lawal already
   reports over-spacing as a real problem on the current build).
3. Photography treatment matches or exceeds competitor visual
   standards, verified by side-by-side screenshot comparison.
4. Motion tokens defined and applied consistently, with durations and
   easing curves benchmarked against competitor measurements.
5. Colour usage verified against competitor palettes and hierarchy.
6. Detail-level quality (empty states, loading states, errors, hover,
   focus, micro-interactions) reviewed against competitor equivalents.

Each gate references actual evidence in `/research/competitors/`, not
training-data design platitudes.

---

## Defer (revisit only if trigger condition fires)

**Superpowers, GSD, ClaudeMem, Context Mode (community)** - Jaguar
standard, worktree orchestration, CLAUDE.md + docs already implement
these manually.

**/ultra review (paid, $5-20/run)** - save for M6 Stripe Connect merge
or other high-stakes merges. Overlaps existing CI gate.

**Figma MCP / Anima / Builder.io / Locofy** - no Figma source files
yet. Phase 2 (post-launch, designer engaged).

---

## Phased design path

**Phase 1 (this week + next, pre-launch):**

- Run the Competitor Research Pass v1 (see prompt below).
- Install Skill Creator + Frontend Design post Tab B.
- Apply ONLY research-verified techniques on M5 work.
- Manual user testing with three planned beta testers via watched video call.
- Lighthouse 95+ desktop AND mobile (locked).
- axe-core 0 violations.

**Phase 2 (post-launch, month 1):**

- Engage freelance designer to build Figma component library matching
  code tokens via Tokens Studio.
- Storybook setup for component catalogue.
- Playwright visual regression in CI.
- Two user testing rounds, 5 users each.

**Phase 3 (months 2-3):**

- Designer engaged ongoing.
- Continuous user testing.
- A/B test event-detail → checkout conversion.

**Phase 4 (months 4+):**

- Full-time designer or design engineer.
- Public design system documentation.

---

## Change log

- 19 May 2026 - initial creation post the plugin transcript review.
- 19 May 2026 - corrected to include Firecrawl + v0.dev (locked in
  prior chats).
- 19 May 2026 - RESEARCH-FIRST principle locked. Removed unverified
  design claims (typography pairing recommendations, "generous
  whitespace," motion specifics, photography prescriptions). Replaced
  with mandate that all design recommendations must reference
  /research/competitors/ evidence.
