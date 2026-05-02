# Phase B1 - Homepage Hollywood Pass - Scope

**Track:** B (Marketing Polish)
**Phase:** B1
**Owner:** Session 3 - admin-marketing
**Branch:** feat/m7-admin-panel
**Status:** Active
**Date opened:** 2026-05-02
**Predecessor:** Brand sweep closure 2026-05-02 (`docs/brand-sweep/closure-report.md`)
**Successor (gated):** Phase B2 - Organiser Landing Polish

---

## 1. Why this phase, why now

The homepage is the single highest-leverage surface EventLinqs has. Every visitor's first impression. Every organiser's confidence signal. Every culture's moment of recognition. Brand sweep has fixed the words; B1 fixes everything else.

Outside reviewers should react in three beats: (1) this is bigger than I thought, (2) this is more refined than I expected, (3) I belong here. If any reviewer reads "another ticketing site" within the first scroll, B1 has not landed.

The performance constraint is non-negotiable: every homepage Lighthouse gate documented in `docs/perf/v2/closure-report.md` must continue to pass. Visual ambition that breaks measured perf is reverted, not accepted.

## 2. Out of scope (explicit)

- Phase B2 (`/organisers` polish) - separate gate
- Phase B3 (`/pricing`, `/about`, `/contact` polish) - separate gate
- Phase B4 (`/events` browse + category + city pages)
- Phase B5 (event detail + checkout polish)
- Anything in admin (Track A)
- Payment, observability, infra (other sessions)
- Image optimisation work that requires `next.config.ts` changes (cross-session SHARED file - if needed, separate `[SHARED]` commit + project manager handoff)
- New `next/image` upstream pipeline work (perf v2 owns that)

## 3. Reference set

These are the only competitor surfaces against which B1 outputs are scored:

- Ticketmaster (au) - homepage + browse + footer
- DICE.fm - homepage + browse + footer
- Eventbrite (au) - homepage + browse + footer
- Humanitix - homepage + browse + footer
- Resident Advisor - homepage + cultural-fluency reference
- Apple Events surfaces - typographic restraint reference
- Airbnb - warmth/trust reference

Side-by-side scoring rubric (every axis 1-5; EventLinqs target ≥ 4 on every axis vs every competitor):

| Axis | What to look at |
|---|---|
| Clarity | Can a first-time visitor say what this product does in 4 seconds? |
| Warmth | Does it feel like a place humans go, or a database? |
| Confidence | Does the type/imagery/spacing communicate authority without bluster? |
| Cultural specificity | Is there evidence on the page that this is for someone, not "everyone"? |
| Distinctiveness | Could you swap our screenshot with a competitor's and not notice? |
| Motion polish | Does motion communicate, or decorate? |
| Typography hierarchy | Is the eye guided, or auctioned? |
| Colour sophistication | Does the palette feel intentional, or stock? |

## 4. Deliverables

### 4.1 Competitive research (research-only, no implementation)

Output: `docs/admin-marketing/phase-b1/competitive/findings.md` plus per-competitor screenshots under `competitive/{competitor}/{viewport}/` (when capture is reachable - see coordination items).

For each competitor, capture homepage and footer at desktop (1280px) and mobile (375px). Document:

- Hero treatment (full-bleed photo, video, illustrated, type-only)
- H1 length and rhythm
- Number of above-fold elements
- Card aspect ratio and density
- Footer column count and density
- Use of motion above the fold
- Trust signal placement
- Cultural specificity (or absence)

Then synthesise: what each does well, what each fails at, what gaps EventLinqs can exploit. This document is the input to every other B1 decision.

**Capture path:** Real Playwright captures need a browser context the session can drive. If the deferred Playwright tools are not authenticated/available at the time captures are required, this becomes a `[COORDINATION]` item and B1 proceeds with text-only synthesis from the prior brand-sweep research notes - the implementation work below is not blocked on screenshots.

### 4.2 Hero treatment evaluation

`src/components/features/events/featured-event-hero.tsx` is the current implementation. It shipped through perf v2 with a measured cold-cache regression on /home mobile that is documented and accepted. B1 may improve the hero only if every measured Lighthouse gate stays green.

Three patterns evaluated against the reference set:

| Pattern | Description | Risk |
|---|---|---|
| A. Editorial cinematic | Single AVIF hero, layered gradient, large display H1, ambient kenburns post-paint. Today's pattern, polished. | Lowest perf risk. Highest fidelity ceiling. |
| B. Cultural collage | Composite of 3-4 small culture-tagged event tiles arranged as a hero. Static, very fast. | Risk of feeling busy. Loses the cinematic moment. |
| C. Type-first DICE-style | No photo above the fold; oversized display type with cultures list ticker. Photo enters below fold. | Lightest weight. Bold but loses warmth. |

Decision protocol: prototype A first (lowest risk, leverages existing pipeline). If A scores ≥ 4 on every rubric axis vs all four competitors at desktop AND mobile, ship A. If A fails on Distinctiveness or Cultural specificity, revisit. We do not ship Pattern B or C without a written rationale and a measured Lighthouse run that proves we did not regress.

Locked copy (per voice doc, not changed by B1):

- H1: `Every culture. Every event. One platform.`
- Sub-tagline: `The ticketing platform built for every culture.`

Hero CTAs follow the locked CTA verb list: primary `Find your next event` (`/events`), secondary `Sell tickets. Keep more.` linking to `/organisers`. (Confirm against current implementation; alter only if the current CTAs miss the verb list.)

### 4.3 Cultural rail upgrade

Target component: the homepage section currently called "Cultural Picks" / `cultural-picks-section.tsx`.

Constraints:

- Cultures list MUST be rendered in the locked canonical order: Afrobeats · Caribbean · Bollywood · Latin · Italian · Filipino · Lunar · Gospel · Amapiano · Comedy · Spanish · K-Pop · Reggae · West African · European · Asian · African · South Asian
- Separator: middle dot (·) where the list is inline
- Imagery: every culture tile must use cultural-authentic imagery routed through `<EventCardMedia>` or `<CategoryTileImage>` per `docs/MEDIA-ARCHITECTURE.md`
- No stock-photo blandness (Pexels imagery is allowed if curated, not auto-fetched)
- Hover state reveals "X events across Y cities" (real numbers from Supabase `events` count by `culture_tag`)
- Touch targets ≥ 44px
- Respects `prefers-reduced-motion`

The rail is a horizontal scroll-snap component on mobile (1.25-card peek pattern, per design system §6.3) and a 4-up grid on desktop with horizontal scroll arrow controls.

### 4.4 By-City rail polish

Target: existing By-City rail / `city-rail-section.tsx`.

- Curated imagery per city - swap any obviously stock-feeling photo
- City-specific event count overlay on each tile
- Featured event preview on hover (single line: "Tonight: {event title}")
- All imagery routed through `<CityTileImage>` per media architecture
- Same scroll-snap pattern as cultural rail

City list: 20 launch cities, current order preserved unless a coordination decision moves it.

### 4.5 Trust band

A new section between the lineup grid and below-fold rails. Static, server-rendered, ~80px tall.

Real numbers only (no fake metrics):

- "Trusted by N organisers across M cultures, K cities" - sourced live from Supabase
- Stripe verified badge
- Payment security badge (PCI-DSS via Stripe)
- GDPR compliance badge

Press logos placeholder is a commented-out section, not visible. Same for testimonials. We never fake social proof.

### 4.6 Footer rebuild

Target: `src/components/layout/site-footer.tsx`.

Mobile pattern (DICE-inspired, per DESIGN-SYSTEM §6.8):

- 3 collapsed accordions: Find events, For organisers, Company
- Below: language picker (English (AU)) - placeholder UI only, real i18n later
- Social row (Instagram, TikTok, X, LinkedIn, Facebook)
- Trust bar: ABN 30 837 447 587, registered address (Geelong VIC), `hello@eventlinqs.com`
- Copyright

Desktop pattern (4 columns):

1. App - logo wordmark + sub-tagline + iOS/Android placeholders (commented out until apps ship)
2. Find events - by city, by culture, this week, free events
3. For organisers - sell tickets, pricing, organiser guide, success stories
4. Company - about, careers (placeholder), press (placeholder), contact, accessibility, help

Sub-footer:

- Social icon row
- Legal links: Terms, Privacy, Refund policy, Cookie policy
- Trust line: "All-in pricing. No surprise fees."
- ABN + registered address + copyright

No em-dashes, no exclamation marks, sentence case for column heads. Copy reviewed against `docs/brand-sweep/voice.md` before commit.

Geographic markets line: "AU, UK, US, EU - more cultures, more cities, soon."

### 4.7 Performance discipline

For every commit that touches a homepage component, the author:

1. Runs `npm run build` to confirm zero new warnings
2. Notes the LCP element (must remain the hero raster) and confirms `priority`/`fetchPriority` still applied
3. Checks no new client component bundles are introduced above the fold
4. Confirms no layout shift on hero load (CLS < 0.1)
5. Confirms images use `<HeroMedia>`/`<EventCardMedia>`/`<CityTileImage>` only - no raw `next/image` introduced

Lighthouse runs are deferred to phase closure (Vercel preview warm cache, median-of-5, mobile profile). Any single change that fails the gate is reverted - not accepted.

The B1 phase commits to "do not regress" - homepage Lighthouse mobile Performance ≥ 95 on warm-cache preview (matching the perf v2 closure baseline), A11y 100, BP 100, SEO 100, axe 0. The known cold-cache caveat documented in perf v2 closure remains in place.

### 4.8 Visual regression

Before/after screenshots at 7 viewports (320, 375, 414, 768, 1024, 1280, 1920) for the homepage stored under `docs/admin-marketing/phase-b1/audit/screenshots/`. Side-by-side PNGs vs Ticketmaster + DICE homepage at desktop and mobile in `docs/admin-marketing/phase-b1/competitive/side-by-side/`.

Same coordination caveat as A1: capture requires a reachable browser; if the founder is not running dev/preview at gate time, this becomes a `[COORDINATION]` item. Implementation does not block on it.

## 5. Files in scope (this session owns each one)

- `src/app/page.tsx`
- `src/components/features/events/featured-event-hero.tsx`
- `src/components/features/events/hero-carousel-client.tsx` (only if pattern A polish requires)
- `src/components/features/home/cultural-picks-section.tsx`
- `src/components/features/home/city-rail-section.tsx`
- `src/components/marketing/**` (new - any new marketing-only component)
- `src/components/layout/site-footer.tsx`
- `src/components/layout/site-footer-bottom-bar.tsx` (if exists)
- `docs/admin-marketing/phase-b1/**`

Files NOT touched in B1 (deferred to later B-phases):

- `src/app/organisers/page.tsx` (B2)
- `src/app/pricing/page.tsx` (B3)
- `src/app/about/page.tsx` (B3)
- `src/app/contact/page.tsx` (B3)

## 6. Brand voice gates

Every line of copy on every B1 surface is checked against `docs/brand-sweep/voice.md` before commit:

- No em-dashes, no en-dashes, no exclamation marks
- No `diaspora` in any visible copy
- No `seamless`, no `world-class`, no `curated`, no `vibe`, no `happenings`
- Australian English (`organise`, `colour`, `centre`, `realise`)
- CTA verbs from the locked list only
- Headline word counts within budget per voice §6

## 7. Quality gates (pre-commit, every commit)

- `npm run lint` - zero new
- `npx tsc --noEmit` - zero
- `npm run build` - success
- `npm test` - green
- All M6 Phase 2 tests still green
- ESLint media-architecture rules hold (no raw `<img>`, no `next/image` outside library, no `bg-image: url(...)`)

## 8. Coordination items expected at gate

- C-B1-01: Real competitor Playwright captures when a browser context is reachable
- C-B1-02: Vercel preview Lighthouse runs (median-of-5, mobile profile) for closure measurement
- C-B1-03: Visual regression captures at 7 viewports
- C-B1-04: If hero treatment selection requires a `next.config.ts` `images.remotePatterns` change, it ships as a separate `[SHARED]` commit and waits for project manager confirmation
- C-B1-05: Curated cultural-rail imagery sources confirmed - Pexels licence vs Unsplash vs commissioned

## 9. Definition of done for B1

- Hero treatment selected, justified in writing, and shipped without regressing perf
- Cultural rail and city rail polished with real imagery and real counts
- Trust band live with real numbers
- Footer rebuilt to v2 spec with no voice-rule breaches
- Quality gates green on every commit
- Visual regression captured (or `[COORDINATION]` flagged)
- Lighthouse closure run captured (or `[COORDINATION]` flagged)
- Closure report at `docs/admin-marketing/phase-b1/closure-report.md`
- Progress log entries appended
- `[GATE]` posted, session STOPS, awaits project manager review before B2
