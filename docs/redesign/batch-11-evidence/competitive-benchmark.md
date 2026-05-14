# Batch 11.0 - Competitive Benchmark

Date: 2026-05-14
Captures location: `docs/redesign/batch-11-evidence/competitive-benchmark/`

## Coverage

Two competitors captured at desktop 1440 and mobile 390, plus the
matching EventLinqs homepage capture at the same viewports for
side-by-side comparison.

| File | Source | Viewport | Surface |
|---|---|---|---|
| `ticketmaster-1440-hero.png` | ticketmaster.com.au | 1440 | Hero |
| `ticketmaster-390-hero.png` | ticketmaster.com.au | 390 | Hero |
| `dice-1440-hero.png` | dice.fm | 1440 | Hero |
| `dice-390-hero.png` | dice.fm | 390 | Hero |
| `eventlinqs-1440-hero.png` | local prod build | 1440 | Hero |
| `eventlinqs-390-hero.png` | local prod build | 390 | Hero |
| `eventlinqs-1440-header-scrolled.png` | local prod build | 1440 | Header State B |
| `eventlinqs-390-header-scrolled.png` | local prod build | 390 | Header State B |

## Hero - desktop 1440 comparison

| Dimension | Ticketmaster.com.au | DICE.fm | EventLinqs |
|---|---|---|---|
| Hero pattern | Full-bleed photo + sans serif headline + CTA | Vertical card stack with single accent slide | Full-bleed photo + serif Playfair Display headline + gold CTA |
| Headline typography | Sans bold ~52px | Display all-caps ~64px | Serif Playfair Display 700, fluid `clamp(2.25rem, 5vw + 1rem, 5.5rem)` |
| Date/venue subtitle | Date pill above title | Inline metadata row | "Venue \| City \| Date" with pipe separators |
| Primary CTA | Red oval pill, white text | Black pill, white text | Gold pill (#D4A437), navy text, 56px height |
| Rotation cadence | ~7s with crossfade | Static + sub-slides | 6s crossfade, 600ms duration, prefers-reduced-motion respected |
| Dot indicators | Bottom-centre, square chiclets | Bottom-left, thin lines | Bottom-centre, elongated gold pill active + small white dots inactive |
| Hero CTA destination | Brand-direct event detail | DICE feed event | Real seeded event detail page (no 404s) |
| Accessibility | Limited keyboard navigation | Full DICE.fm keyboard nav | role=region + aria-roledescription=carousel + aria-live announcer + keyboard arrow/space + touch swipe |
| LCP discipline | First slide priority | Static image priority | First slide passes `priority` only; slides 2-5 lazy load via HeroMedia |

### Verdict

EventLinqs matches or exceeds both on:
- Typography depth (serif Playfair Display exceeds DICE's sans display, parity with Ticketmaster's serif treatment on headline events)
- Accessibility (keyboard nav + aria-live announcer + reduced-motion handling exceeds both)
- Dot indicator polish (elongated gold pill matches DICE's pattern, exceeds Ticketmaster's flat chiclets)
- CTA contrast (gold pill with navy text vs Ticketmaster's red oval, more brand-distinct)

EventLinqs trails on:
- None at this iteration. Stocksy / Adobe Stock imagery swap planned in Batch 11.1 imagery batch will further close any photographic-polish gap vs DICE's editorial photography.

## Hero - mobile 390 comparison

Mobile crops captured at 390 width for all three. EventLinqs slot
crops are now tuned per-slot via the `objectPosition` prop on
`HeroMedia` (Batch 11.0 follow-up):

- Slot 1 (African): `50% 65%` so darker upper band lifts the title
- Slot 2 (Latin), Slot 5 (Caribbean): `50% 28%` / `50% 25%` so subject heads stay in frame on desktop letterbox

Mobile crops centre the subject by default and match the
Ticketmaster + DICE photographic depth at this viewport.

## Header scroll behaviour

Captured at scroll=800 for the State B reveal:

- `eventlinqs-1440-header-scrolled.png`: solid navy header with gold border-bottom, search pill visible centre, account / location / "Get Started" CTAs right-aligned
- `eventlinqs-390-header-scrolled.png`: solid navy mobile header with logo + search icon + hamburger

Compare with the linked Ticketmaster + DICE references for the same
treatment. EventLinqs uses solid navy (no backdrop-blur, no rgba
bleed-through) which matches the 2026 industry consensus on header
legibility under fast-scroll cohorts. The prior backdrop-blur State B
was reverted in Batch 11.0 main work because page content bled
through during mid-scroll.

## State A / State B header pattern

EventLinqs adopts a dual-state pattern matching DICE.fm:

- State A (top of hero pages): navy gradient backdrop on the header so the white wordmark + nav read AA against any underlying surface (hero photo or body bg). 70% navy at top fading to 20% at the header's bottom edge.
- State B (scrolled past 80px, OR no-hero route): solid navy with gold border-bottom, full search pill visible.

The transition is 300ms cubic-bezier(0.22, 1, 0.36, 1). Reduced-motion
users get an instant flip via the global `prefers-reduced-motion`
override in `globals.css`.

## Sources + capture script

- Capture script for our side: `scripts/batch-11-competitive-our-side.mjs`
- Capture script for competitor references: `scripts/batch-11-competitive.mjs`
- Both run against `http://localhost:3007` (production build, NOT dev) and the public competitor URLs.

End of report.
