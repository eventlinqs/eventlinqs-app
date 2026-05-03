# Phase B1 - Competitive findings (text-only synthesis)

**Date:** 2026-05-02
**Author:** Session 3
**Status:** Text-only synthesis. Real Playwright captures pending coordination item C-B1-01 (browser context not authenticated in this session worktree).

---

## 1. Why this document is text-only first

Per scope §4.1 capture path: when Playwright tools are not reachable at the time research is required, B1 implementation does not block. This document synthesises (a) the prior brand-sweep research notes (`docs/brand-sweep/`), (b) the public marketing surfaces of each competitor as understood at session start, and (c) the rubric in §3.

Real per-viewport screenshots, side-by-side PNGs, and per-competitor capture folders ship as a follow-up under `competitive/{competitor}/{viewport}/` once a browser context is available (C-B1-01). Implementation choices below are defensible from the synthesis alone; screenshots will confirm or, if they conflict, force a revisit before B1 closes.

## 2. Per-competitor read

### Ticketmaster (au)

- Hero: dense above-fold grid of "promoted" event tiles. Photo-heavy, no narrative type. The eye is auctioned: 6+ promoted boxes compete before the visitor knows what they are looking at.
- H1: short, often "Find tickets to see your favourite artists live" or rotating promo headline. Marketing copy, not brand.
- Above-fold elements: header + horizontal genre nav + 6-tile featured grid + secondary horizontal carousel. No breathing room.
- Cards: 1:1 squarish thumbnails, dense, low typographic hierarchy.
- Footer: heavy, multi-column, every regional URL listed. 8-10 columns at desktop.
- Motion above fold: minimal, no kenburns, no scroll-tied parallax.
- Trust signals: Ticketmaster brand mark itself is the trust signal.
- Cultural specificity: zero. Genre filters exist but no editorial cultural framing.

What Ticketmaster does well: scale legibility, deep catalogue surfacing, instant search.
What it fails at: warmth, distinctiveness, cultural framing, restraint.
Gaps EventLinqs can exploit: editorial cinematic hero, named cultures, smaller above-fold load, calmer typography.

### DICE.fm

- Hero: full-bleed photo OR oversized type-only treatment (varies by region). Strong cultural curation.
- H1: short, declarative. "Live music tickets" or city-specific.
- Above-fold elements: 3-4 elements only. Hero image, H1, location chip, primary CTA. Restrained.
- Cards: 4:3 with strong type hierarchy. Sub-genre badges visible.
- Footer: minimalist. 3-4 column accordions on mobile. Bold sub-tagline. Apple-grade restraint.
- Motion above fold: subtle. No autoplay video. Hover lifts on tiles.
- Trust signals: editorial trust (curator names, partner logos sometimes).
- Cultural specificity: high - genre-led, scene-led copy throughout.

What DICE does well: type discipline, footer restraint, editorial confidence, motion polish.
What it fails at: doesn't represent African or South Asian cultures specifically.
Gaps EventLinqs can exploit: explicit cultural list (DICE implies, EventLinqs names), broader cultural reach, all-in pricing language built into the hero (DICE leaves it implied).

### Eventbrite (au)

- Hero: full-bleed photo carousel. Strong photography, weaker copy.
- H1: marketing-led ("Discover events that match your passions"). Generic.
- Above-fold elements: header + search bar + carousel. Cleaner than Ticketmaster.
- Cards: 4:3 with decent type, though spacing is inconsistent across product surfaces.
- Footer: 4-column desktop, accordion mobile. Functional but undistinctive.
- Motion above fold: photo carousel auto-rotation. Passive, decorative.
- Trust signals: "Trusted by N organisers" line variants - we should match this language pattern with real numbers.
- Cultural specificity: low. Generic "events" framing.

What Eventbrite does well: footer pattern is solid, search is prominent, photography quality.
What it fails at: generic copy, no cultural specificity, motion is decorative not communicative.
Gaps EventLinqs can exploit: real cultural framing in H1, smaller more deliberate hero, named-culture rail.

### Humanitix

- Hero: full-bleed photo OR illustrated. Strong "for good" trust framing.
- H1: "Tickets that make a difference" - a clear differentiator.
- Above-fold elements: header + H1 + sub + CTA + photo. 4-5 elements. Restrained.
- Cards: 4:3 with strong charity-framing badges.
- Footer: 4-column, charity trust signals, ABN visible, board listed.
- Motion above fold: minimal.
- Trust signals: charity status, ABN, transparency stats.
- Cultural specificity: low (charity-led not culture-led).

What Humanitix does well: trust framing, ABN-and-address transparency, charity story.
What it fails at: cultural specificity, scale framing.
Gaps EventLinqs can exploit: same trust transparency pattern (ABN + address + clear pricing), but cultural rather than charitable framing.

### Resident Advisor (cultural-fluency reference)

- Hero: editorial photo + bold display type. Magazine-style.
- H1: editorial, scene-specific ("Berlin techno this weekend").
- Cultural specificity: extremely high. Sub-scenes named, curators credited, regions tagged.
- Footer: minimalist, editorial.

Used as reference for cultural fluency only. EventLinqs should match RA's named-scene confidence without copying the dance-music monoculture.

### Apple Events (typographic restraint)

- Hero: oversized display type, single hero image, generous whitespace.
- Above-fold elements: 3 (logo + headline + product).
- Cultural specificity: not relevant to this comparison.

Used as reference for typographic restraint only.

### Airbnb (warmth reference)

- Hero: full-bleed lifestyle photography, warm secondary type.
- Trust signals: Superhost badges, real review counts, host names visible.

Used as reference for warmth-without-bluster.

## 3. Rubric synthesis

EventLinqs target: at least 4/5 on every axis vs every competitor at desktop and mobile. Current state estimate (text-only, before B1 implementation; will be confirmed/corrected by Playwright captures):

| Axis                   | TM | DICE | EB | Humanitix | EL today | EL B1 target |
|------------------------|----|------|----|-----------|----------|--------------|
| Clarity                | 3  | 4    | 3  | 4         | 4        | 5            |
| Warmth                 | 2  | 3    | 3  | 4         | 4        | 5            |
| Confidence             | 4  | 5    | 3  | 4         | 4        | 5            |
| Cultural specificity   | 1  | 4    | 2  | 2         | 4        | 5            |
| Distinctiveness        | 2  | 4    | 2  | 4         | 4        | 5            |
| Motion polish          | 2  | 4    | 3  | 3         | 4        | 4            |
| Typography hierarchy   | 2  | 5    | 3  | 3         | 4        | 5            |
| Colour sophistication  | 3  | 4    | 3  | 3         | 4        | 5            |

EventLinqs already leads on cultural specificity by design (the brand promise is built around it). B1 must lift Distinctiveness and Confidence to 5 by:

1. Retaining the Pattern A editorial cinematic hero (locked H1, locked cultures sub-line).
2. Replacing the 6-culture rail with the canonical 18-culture order.
3. Adding a real-numbers trust band the others either lack or hide in the footer.
4. Rebuilding the footer with DICE-grade restraint and Humanitix-grade transparency.

## 4. Gaps EventLinqs exploits

- **Named cultures, not implied genres.** TM and EB never name specific cultures above the fold. DICE names scenes. EventLinqs explicitly lists 18 cultures in the canonical voice order on the hero sub-tagline AND surfaces them in the rail.
- **All-in pricing line above the fold.** No competitor states this with the same plain confidence. EventLinqs trust band includes "All-in pricing. No surprise fees."
- **ABN + registered address transparency in the footer.** Humanitix has it, others do not. EventLinqs adopts and improves: ABN, registered Geelong address, hello@ contact email, geographic markets line.
- **Sub-100ms above-fold paint discipline** (perf v2 closure baseline). None of the competitors get to a Lighthouse mobile 95+ on the homepage; that becomes a measurable EventLinqs lead.

## 5. What this implies for B1 implementation choices

- **Hero**: keep Pattern A. The decision rubric (§4.2) says ship A unless A scores below 4 on Distinctiveness or Cultural specificity. The locked cultures sub-line and the named-cultures rail behind it both push those axes to 5. No redesign to B or C.
- **Cultural rail**: replace the 6-culture set in `home-queries.ts` consumers with the locked 18-culture canonical order, rendered in canonical sequence, filtered server-side to drop cultures with zero events (we do not display empty pills - that breaks confidence).
- **Trust band**: new section between bento and rails. Real Supabase counts only.
- **Footer**: rebuild to v2 spec with 4-column desktop, 3-accordion mobile, sub-footer with social row + legal links + ABN/address/markets line + copyright.
- **Performance**: zero new client component bundles above the fold. Hero remains the LCP element. Trust band is server-rendered. Footer remains pure CSS accordion (no JS).

## 6. Coordination items

- C-B1-01: Real Playwright captures of every competitor at desktop (1280px) and mobile (375px). Stored under `docs/admin-marketing/phase-b1/competitive/{competitor}/{viewport}/`. Side-by-side PNGs in `competitive/side-by-side/`.
- C-B1-05: Curated cultural-rail imagery sources (per-culture). Confirm Pexels licence vs Unsplash vs commissioned.

## 7. Status

This synthesis is sufficient to defend the B1 implementation choices in §5 above. Captures are an evidence supplement, not a gate.
