# M5-DESIGN-SPEC.md

Status: AUTHORITATIVE. Design specification for EventLinqs M5 Public Pages
and beyond. Derived from verified competitor evidence (visual screenshots,
DOM measurements) and business intelligence (financials, acquisition data,
user satisfaction). Every CC prompt for M5 work onwards must reference
this document.

Save to: `C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app\docs\M5-DESIGN-SPEC.md`

This document does not invent design principles from training data. Every
specification below is tied to a measurement in
`research/competitors/REPORT.md` or a finding in
`docs/COMPETITIVE-INTELLIGENCE.md`.

Date: 23 May 2026.

---

## Strategic design position

**EventLinqs is a commercial marketplace with DICE-quality execution.**

Concrete meaning of this position:

- **Marketplace information density on browse and homepage** (matches the
  Humanitix, Eventbrite, and Ticketmaster pattern, NOT the DICE single-hero
  approach). Multiple events visible above the fold, multiple category rows,
  rich discovery.
- **DICE-quality typography, spacing, motion, photography on every
  individual element** within that density. Each event card is designed
  with the care DICE puts into a whole page.
- **Community-first content layers** (cultural calendar, sensitivity
  markers, partnership badges, First Nations positioning) overlay the
  marketplace surface area. These are EventLinqs's design moat - none
  of the competitors have them.

The earlier "DICE is the gold standard" framing has been retired. DICE was
acquired by Fever in June 2025 precisely because beautiful design alone did
not scale. The commercial winners (Ticketmaster $25B revenue, Eventbrite
88M MAU) are marketplaces. EventLinqs combines both.

---

## Token specifications

### Typography

Locked: Manrope sans-serif (already in repo). Retain.

The earlier "add a serif display face" recommendation is REJECTED. None of
the four competitors use serif. Measurements from
`research/competitors/REPORT.md` show all use sans-serif with heavy weights.

Heading scale (all Manrope, weight 800 for display, 700 for h1-h2, 600 for
h3-h4, 500 for body):

```css
--type-hero-display: 96px / 0.95;     /* desktop only; mobile uses --type-h1 */
--type-hero-display-mobile: 48px / 1.0;
--type-h1: 56px / 1.05;               /* desktop */
--type-h1-mobile: 36px / 1.1;
--type-h2: 40px / 1.15;
--type-h2-mobile: 28px / 1.2;
--type-h3: 28px / 1.25;
--type-h3-mobile: 22px / 1.3;
--type-h4: 22px / 1.3;
--type-h4-mobile: 18px / 1.35;
--type-body: 17px / 1.55;             /* desktop */
--type-body-mobile: 16px / 1.55;
--type-small: 14px / 1.4;
--type-micro: 12px / 1.35;
```

Why these values, evidence-cited:

- Heavy weights match the competitor convention: Ticketmaster Averta
  700-800, Humanitix Satoshi 900 on h1/h2, Eventbrite Neue Plak Condensed
  600+. DICE display at 106px is the upper bound.
- Hero display 96px desktop (slightly below DICE's 106px ceiling) gives
  premium presence without being aspirational/empty like DICE's whitespace
  hero. Suits EventLinqs marketplace surface area.
- Body 17px desktop (heavier than the Tailwind default 16px) matches
  Ticketmaster's 18px body confidence.
- Mobile scales aggressive (96 → 48 for display) match DICE's mobile
  scaling pattern.

Weight values: 800 for display, 700 for h1-h2, 600 for h3-h4, 500 for body.
NEVER use weight 400 - it reads as cheap on the competitor benchmark scale.

### Spacing

The earlier "generous whitespace" claim is RETIRED. Measurements show
Ticketmaster uses 0px padding on hero and main container, DICE uses moderate
hero padding (60px top, 80px bottom). Confident spacing, not lavish.

```css
--space-section-y-desktop: 80px;
--space-section-y-mobile: 48px;
--space-container-x-desktop: 32px;
--space-container-x-mobile: 16px;
--space-card-gap: 24px;               /* matches Humanitix's measured grid gap */
--space-card-padding-y: 20px;
--space-card-padding-x: 20px;
--space-hero-padding-top: 64px;       /* below DICE's 80px on the more dense surface */
--space-hero-padding-bottom: 80px;    /* matches DICE */
--space-element-gap: 16px;            /* between content blocks within a section */
--space-tight-gap: 8px;               /* between meta items like date and venue */
```

Concrete rule: NEVER add padding to make something "feel premium." Premium
comes from typography, photography, and motion - not from negative space
inflation.

### Colour

Locked palette (already in repo):

```css
--canvas: #FAFAF7;        /* warm off-white, differentiates from competitors' pure white */
--navy: #0A1628;          /* primary text, dark surfaces */
--gold: #D4A437;          /* accent only, NEVER large blocks */
--text-primary: #1F2937;  /* heading near-black */
--text-body: #4B5563;     /* body grey */
--text-muted: #9CA3AF;
--border: #E5E7EB;
--surface-subtle: #F3F4F6;
```

Usage rules, evidence-cited:

- **Canvas #FAFAF7 warm off-white**: differentiates from Ticketmaster /
  DICE / Eventbrite / Humanitix who all use pure white or near-white. The
  off-white reads as editorial-warm, not tech-cold.
- **Navy #0A1628** for primary text and dark surfaces. NEVER pure black -
  black reads as DICE imitation and is overdetermined.
- **Gold #D4A437** for accent only:
  - Primary CTA backgrounds (1 per surface max)
  - Featured badges
  - Star ratings
  - Links on dark navy surfaces
  - Never more than 3% of any viewport at any time
  - NEVER gold-on-gold blocks (avoids luxury-brand pastiche)
- Cards: warm off-white surface against canvas, navy text, gold accents
  for ratings or featured indicators only.

### Motion

```css
--motion-quick: 200ms cubic-bezier(0.16, 1, 0.3, 1);
/* For entering states: hover, modal entry, dropdown open */

--motion-exit: 150ms cubic-bezier(0.7, 0, 0.84, 0);
/* For leaving states: hover off, modal close, dropdown close */

--motion-page: 300ms cubic-bezier(0.16, 1, 0.3, 1);
/* For page-level transitions, slower for content-heavy entries */
```

Evidence: DICE has 0.2s ease on buttons - the only competitor with non-zero
motion. Ticketmaster has 0s (no motion). EventLinqs matches DICE's 0.2s and
sets a clear easing convention. Ease-out-expo `cubic-bezier(0.16, 1, 0.3, 1)`
is the Linear / Vercel reference curve.

Apply to: button hovers, card hovers, focus rings, modal open/close,
dropdown open/close, image fade-ins. NEVER apply to layout shifts or
content reflows (causes CLS penalty on Lighthouse).

### Image aspect ratios

```
Event card image:    1:1 square              (matches DICE; works for cultural events)
Event hero image:    16:9 landscape          (cinematic; matches Ticketmaster hero)
Organiser avatar:    1:1 circular            (industry standard)
City tile:           3:2 landscape           (differentiates from event cards visually)
Featured banner:     2:1 landscape           (matches Eventbrite's "Hand-picked Happenings" format)
Cultural calendar:   1:1 square              (consistent with event cards)
```

All images served as AVIF with WebP fallback (matches Ticketmaster, DICE,
Humanitix - all use WebP minimum).

---

## Information architecture

### Homepage

Above the fold:

1. **Hero band** (16:9 image, gradient overlay, gold CTA button)
   - Featured cultural event of the day
   - Title at `--type-hero-display`, subtitle at `--type-h3`
   - One primary CTA (gold), one secondary (navy outline)

2. **"Tonight in [city]"** row
   - 4 events visible at desktop, horizontal scroll
   - Each card uses 1:1 image, title at `--type-h4`, meta at `--type-small`
   - Date/venue meta uses tight gap (`--space-tight-gap: 8px`)

First scroll:

3. **Cultural Calendar widget** (the genuine differentiator)
   - Shows current cultural moment (e.g., "NAIDOC Week 7-14 July")
   - 2-3 events tagged with cultural context
   - Sensitivity markers (e.g., "Aboriginal & Torres Strait Islander led")
   - Partnership badge if applicable

4. **Featured organisers row**
   - 3-4 verified organisers with their next event
   - Organiser avatar (1:1 circular), name, event count, next event card

Second scroll:

5. **Browse by city tiles** (3:2 landscape, 4 cities desktop)
6. **Browse by category** (icon + label, 8 categories desktop)

Third scroll:

7. **This Weekend** event row
8. **Free events** row
9. **Music & Live** category row

Footer: locked per memory entry 14 (NO trust band, contextual trust signals
only).

### Event detail page

Inspired by DICE's structure (Image 7 in research/competitors/dice/),
adapted for marketplace breadth:

**Above the fold (desktop):**

Left column (40% width):
- Square 1:1 hero image
- Save / share icon row beneath
- "More from this organiser" link (community-first signal)

Right column (60% width):
- Event title at `--type-h1`
- Subtitle: date, venue, category tags (at `--type-h3`)
- **PRICE BLOCK in navy with gold accent:**
  - "From AUD $X.XX" at `--type-h2`
  - "The price you'll pay. EventLinqs takes 2% + $0.50 / ticket. Organiser
    receives $Y per ticket sold." at `--type-small`
  - Primary gold CTA button: "Get tickets" full width
- Trust signal row beneath CTA (small icons: Stripe secure, verified
  organiser, refund policy)
- Sensitivity markers (e.g., "21+ event", "wheelchair accessible",
  "Auslan interpreted") - these are EventLinqs's competitive moat,
  none of the four competitors render these prominently

**Below the fold:**

- "About" description (rich text, `--type-body`)
- Refund policy block (plain English, visible without secondary click) -
  attacks Ticketmaster's hidden policy
- Lineup with artist headshots (1:1 circular avatars)
- Venue block: map preview, address, doors-open time
- Cultural context block ("Part of NAIDOC Week" / "In partnership with
  [community organisation]")
- "More events by this organiser" row
- "Similar events" row (algorithmic discovery)

### Card design (the most-rendered atom on the platform)

Standard event card:

```
+----------------------------------+
| [1:1 image, AVIF]                |
| Aspect ratio padding for SSR     |
+----------------------------------+
| Title (h4, 22/600/1.3)           | <- 20px top padding
| Date · Venue (small, 14/500)     | <- 4px gap
| From $X (body, 17/600)           | <- 8px gap (price prominent)
| [Gold "Tickets" badge if low]    | <- conditional
+----------------------------------+
```

Hover behaviour:
- 200ms ease-out (`--motion-quick`)
- Image scale: 1.02 (subtle)
- Card elevation: 0 → 4px navy/8% shadow
- Title colour: navy → navy with gold underline
- Cursor: pointer

NEVER use:
- Generic Tailwind `transition-all`
- Pure black on white (always navy + warm off-white)
- Centred text on cards (left-aligned only, matches DICE / Eventbrite)
- Drop shadows greater than 8px (reads as 2018)

---

## What EventLinqs has that no competitor has

These design elements are the moat. They appear on the platform and
nowhere else:

1. **Cultural Calendar widget** on homepage and embedded in event detail
2. **Sensitivity markers** on event cards (icons + tooltip)
3. **Partnership badges** ("In partnership with [community organisation]")
4. **Aboriginal and Torres Strait Islander Flag SVG** in footer + first
   position in heritage filtering
5. **Transparent fee row** on every event detail ("Total includes $X fee,
   organiser receives $Y") - goes beyond DICE's "no surprises" claim
6. **Editorial photography brief** for hero images (locked per memory
   entry 22)

CC prompts must check that these elements are present on relevant pages.
A homepage without the Cultural Calendar widget is incomplete.

---

## Quality gates (for every M5+ component CC ships)

Every CC prompt for a public-facing component must verify:

1. Typography values match this spec (no hardcoded font-sizes outside the
   token set)
2. Spacing values match this spec (no arbitrary px values)
3. Colour values use the locked palette tokens (no raw hex outside the
   defined set)
4. Motion uses `--motion-quick` or `--motion-exit` (no bare CSS transitions)
5. Images use HeroMedia, EventCardMedia, CityTileImage, or OrganiserAvatar
   components (per `docs/MEDIA-ARCHITECTURE.md`, locked)
6. Lighthouse 95+ desktop AND mobile (locked per memory entry 23)
7. axe-core 0 violations
8. Playwright screenshots at 1440 + 375 viewports BEFORE and AFTER any
   visual commit (per memory entry 30)
9. Competitive Benchmark Gate output included (per memory entry 21)
10. No em-dashes, no en-dashes anywhere (per memory entry 2)
11. AU English throughout

Failure on any of these is a prompt re-issue, not a "good enough" merge.

---

## Implementation priority order for M5

Sequence informed by user-engagement leverage (most-viewed pages first):

1. **Homepage** - the first impression, highest reach
2. **Event detail page** - the conversion surface (DICE-quality is most
   critical here per Image 7 reference)
3. **City landing pages** - regional discovery
4. **Browse / search results** - marketplace depth visibility
5. **Organiser landing pages** - community-first signal
6. **About / pricing / legal pages** - trust building (already
   production-quality per memory entry 17, light refresh only)

---

## Source citations

All design decisions trace to specific evidence in:

- `research/competitors/REPORT.md` - the visual + structural measurements
  pass from 23 May 2026 (8 screenshots, 16 page captures, computed CSS
  for typography/spacing/colour/motion)
- `docs/COMPETITIVE-INTELLIGENCE.md` - the business intelligence pass
  citing SEC filings, Trustpilot reviews, App Store ratings, and
  acquisition news
- Locked memory entries (positioning, voice, hardening, media
  architecture, performance, competitive set definition)

If any future design recommendation contradicts these documents, the
documents win. Update them rather than overriding them.

---

## Change log

- 23 May 2026: Initial creation post the competitor research pass v1 and
  business intelligence pull. Replaces all earlier draft design
  recommendations made from training data.
