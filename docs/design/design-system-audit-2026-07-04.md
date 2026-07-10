# Design System Audit - 2026-07-04 (Fable 5 design upgrade, Phase 2)

Audit of actual token adoption across the codebase against the system defined
in `src/app/globals.css`. Verdict: the token system is well-designed and
well-documented, but adoption is partial. This document is the Phase 2 work
order; each item is checked off as it lands on `feat/design-upgrade-2026-07-04`.

## Findings and fixes (priority order)

### P2-1 Glassmorphism is live despite the ban - REMOVE
`backdrop-blur` / `backdrop-filter` ships in 12+ places, including a dedicated
`GlassCard` primitive, against the constitution's explicit ban:
- `src/components/ui/glass-card.tsx` (primitive; used by `event-bento-tile`, `featured-event-hero`)
- `src/components/layout/mobile-bottom-nav.tsx:91` (frosted nav)
- `src/components/layout/header-search-overlay.tsx:240` (blur(40px))
- `src/components/layout/site-header-account-dropdown.tsx:235` (blur(20px))
- `src/components/features/events/hero-carousel-client.tsx:216,264,274`
- `src/components/features/events/featured-hero-static-shell.tsx:89`
- `src/components/features/home/trending-events-bento.tsx:90,112`
- `src/components/features/home/surprise-me-modal.tsx:102`
- `src/components/features/venues/venue-profile-hero.tsx:90,111`
- `src/components/features/events/event-sold-out.tsx:226`
- `src/app/communities/page.tsx:203`, `src/app/cities/page.tsx:213`
Fix: replace every frosted surface with solid navy/white equivalents per the
chrome law. Retire `GlassCard` (rename/replace with a solid `PanelCard`).

### P2-2 Five golds ship - CONSOLIDATE to tokens
- `#D4A017` (gold-500 token, also hardcoded in seat-selector, icons, og images)
- `#E8B738` (gold-400 token, hardcoded in og/twitter image)
- `#D4A437` (rogue: city-map, duotone defs)
- `#D4AF37` (rogue: m5-events-map, venue-map BRAND_GOLD)
- `#C9A227`/`#dab43a` (admin gold, ~15 files)
Plus two gold rgba families: rgba(212,164,55,...) vs rgba(212,160,23,...).
Fix: everything maps to gold-400/gold-500 tokens (icons/OG images keep literal
hexes matching the tokens; satori cannot read CSS vars - add a comment pinning
them to the token values).

### P2-3 Rail headings break the 24px law - ONE EDIT
`src/components/ui/SectionHeader.tsx` hardcodes `text-2xl sm:text-3xl` (30px
at desktop; the law is 24px). Fix: `.type-rail-heading`. Also sweep the ~20
template files re-rolling `font-display text-2xl sm:text-3xl` rail headings.

### P2-4 Container drift
`ContentSection` default and the dashboard shell cap at `max-w-6xl`; canonical
is `max-w-7xl` (1400px). Verify the width prop semantics, then align. Also
`venue-revenue` page (5xl), `organiser-profile-hero` (5xl), `PageHero` (4xl
title measure is fine).

### P2-5 No radius/shadow tokens - INTRODUCE
1,129 rounded-* across 237 files: cards ship as lg, xl, AND 2xl; ~20 arbitrary
navy `shadow-[...]` variants re-authored per component. Fix: add tokens to
globals.css:
- `--radius-card: 1rem` (rounded-2xl for media cards/tiles), `--radius-control:
  0.5rem` (buttons/inputs), `--radius-pill: 9999px`
- `--shadow-card-rest`, `--shadow-card-hover`, `--shadow-modal` (the navy-tinted
  family already used by tile-lift/card-hover-lift)
Adopt in shared primitives first (Button, FormField, cards.tsx, modals).

### P2-6 Rogue palettes
- `event-state-banner.tsx` hand-rolls error/warning palettes -> map to
  `--color-error`/`--color-warning` derived tints.
- Banned `#4A90D9` live in seat-maps action palette + auth emails; banned
  `#1A1A2E` in auth emails -> map to brand tokens.
- Admin surface runs a parallel hardcoded palette (`#0A0F1A`/`#131A2A`/
  `#C9A227`) across ~40 files. Phase 2 scope: tokenise (define once), do NOT
  re-skin admin; the dark admin theme vs the light-and-airy law needs a founder
  ruling (Phase 5 critique item).

### P2-7 State coverage gaps
- No route-level `error.tsx` anywhere except the global root. Add designed
  error boundaries for checkout and dashboard at minimum.
- `/login`, `/signup`: no loading.tsx (minor; forms are light).
- Checkout error UX is the weakest of any money surface.

### P2-8 Type utilities almost unused
`.type-*` classes appear in ~11 files; everything else re-rolls raw Tailwind
sizes. Phase 2 scope: shared primitives (SectionHeader, PageHero) + every
surface touched in Phase 3 adopts `.type-*`; a full sweep of legacy surfaces is
follow-on work.

### P2-9 Buttons/inputs re-rolled
Shared `Button` (3 variants x 2 surfaces) imported in only 21 files; admin has
its own button system; hero carousels hand-roll glass pills (see P2-1); FormField
adoption partial. Phase 2 scope: every Phase 3 surface uses the shared
primitives; hero pills become solid.

## Competitive context (Phase 1 summary pointer)
See `docs/design/competitive-analysis-2026-07-04.md`. Key design read-across:
- Fee transparency IS the trust design battleground (Humanitix/TryBooking lead
  with numbers; Eventbrite/DICE/Oztix hide them and it reads evasive).
- Nobody in the AU market ships a designed share loop; Luma's colour-matched OG
  card is the world benchmark. The event page share affordance + OG card is
  open ground.
- DICE proves the demand-engine organiser pitch converts when QUANTIFIED.
- Who's-going on the open web is uncontested white space.
- Publishing per-city counts that argue against you (Luma) is a density
  own-goal; never render a count below its credibility floor.
