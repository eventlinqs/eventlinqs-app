# Batch 9.1 Reference Analysis

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03

## Capture inventory

24 captures across 6 sites x 2 viewports x 2 states (top, scrolled-600px),
all on disk in `docs/redesign/batch-9-1-evidence/references/` and all
verified at >= 100KB. iPhone 13 device profile used for the four
strong-anti-bot mobile sites (TM, DICE, Apple, Stripe) on the retry pass.

## Per-site state-by-state observations + EventLinqs decision

### Ticketmaster (ticketmaster.com.au)

- **Top state (1440):** Solid black bar with TM logo, hard separator, no
  transparency over the hero. The header competes with the hero rather
  than letting it breathe.
- **Scrolled state (1440):** Identical to top - no scroll intelligence.
  The same solid-black bar persists at all scroll positions.
- **Mobile (top + scrolled):** Same solid black header. Hamburger right.

> **Surpass move:** EventLinqs runs cinematic transparency in State A so
> the hero owns the viewport, then transitions to navy frosted glass in
> State B. TM has no scroll state at all; we add a 300ms eased
> transition with a gold edge that visually anchors the brand at every
> scroll depth.

### DICE (dice.fm)

- **Top state (1440):** Transparent header over the hero. Logo and a
  thin nav row, no background.
- **Scrolled state (1440):** Still transparent. Light text crashes into
  light hero content as the user scrolls; legibility breaks down at
  several points on the scroll.
- **Mobile:** Same transparent header. Bottom tab bar handles primary
  routes.

> **Surpass move:** EventLinqs preserves DICE's hero immersion in State A
> but adds a State B with frosted-navy + 30% gold border that retains
> brand presence and never loses legibility on scroll. Mobile combines
> our glass header with the new MobileBottomNav (shipped Batch 9 V2)
> matching DICE's bottom-nav ergonomics while improving the desktop
> story.

### Eventbrite (eventbrite.com.au)

- **Top state (1440):** Solid white header with hard shadow.
  Orange/red wordmark fights the page CTAs.
- **Scrolled state:** Identical to top.
- **Mobile:** Solid white with prominent hamburger. Search bar
  permanently visible eats vertical space.

> **Surpass move:** Eventbrite's solid-white-everywhere is the most dated
> pattern in the comp set. EventLinqs' transparent-over-hero state alone
> already surpasses it; the State B navy-glass + gold edge surpasses on
> brand polish too. Inline search in EventLinqs is conditional (State B
> only on desktop), giving the hero room to breathe in State A and
> recovering vertical space the EB pattern wastes.

### Airbnb (airbnb.com.au)

- **Top state (1440):** Translucent white header with the iconic pill
  search front and centre. Scroll-shrink animation on initial scroll.
- **Scrolled state (1440):** Compact white frosted glass with smaller
  pill search. Loses Airbnb's coral wordmark presence; goes generic.
- **Mobile:** Solid white header, prominent pill search, no bottom nav.

> **Surpass move:** Airbnb is the closest comparable and the only
> competitor doing scroll intelligence. EventLinqs preserves the
> scroll-shrink ergonomic but adds three things Airbnb lacks: (1) full
> transparency over hero in State A (Airbnb stays white-translucent),
> (2) navy-and-gold brand colours that survive scroll (Airbnb goes
> generic-white), (3) a gold border-bottom edge that brand-anchors
> State B. The mobile combo of glass header + MobileBottomNav matches
> nothing in Airbnb's surface.

### Apple (apple.com) - glassmorphism reference

- **Top state (1440):** Translucent silver-grey nav with backdrop-filter,
  thin border, fixed across the page top.
- **Scrolled state (1440):** Identical visual; the translucent + blur
  treatment carries across all scroll positions.
- **Mobile:** Same translucent treatment, smaller geometry.

> **Surpass move:** Apple sets the global glassmorphism reference and
> EventLinqs adopts the same backdrop-filter blur(20px) saturate(180%)
> recipe for State B, plus a 95% opaque solid-navy fallback for non-
> supporting browsers. The differentiator is brand colour - Apple is
> intentionally neutral; EventLinqs adds a 30% gold border-bottom that
> brand-anchors the State B treatment Apple deliberately keeps generic.

### Stripe (stripe.com) - transparent-to-frosted reference

- **Top state (1440):** Transparent header over the bright gradient
  hero. Logo and CTA.
- **Scrolled state (1440):** Transitions to a white frosted state with
  light-grey border-bottom. Smooth.
- **Mobile:** Same dual-state pattern.

> **Surpass move:** Stripe and EventLinqs converge on the same
> dual-state pattern. Stripe goes white frosted on scroll because their
> brand is bright/light; EventLinqs goes navy frosted because our brand
> is dark/cinematic. Both decisions match the rest of each brand's
> surface. The pattern is validated, the colour direction is brand-
> specific. EventLinqs' gold border-bottom is the additional brand
> signal Stripe omits.

## Summary - what makes EventLinqs surpass the comp set

| Dimension | TM | DICE | EB | Airbnb | Apple | Stripe | EventLinqs |
|-----------|----|----|----|----|----|----|----|
| Transparent over hero | No | Yes | No | Translucent | No | Yes | **Yes** |
| Frosted glass on scroll | No | No | No | Yes | Yes | Yes | **Yes** |
| Brand colour preserved on scroll | n/a | n/a | n/a | No | n/a | n/a | **Yes (navy + gold edge)** |
| Eased transition | No | No | No | Yes | n/a | Yes | **Yes (300ms cubic-bezier)** |
| Reduced-motion handling | No | No | No | Partial | Yes | Yes | **Yes (instant)** |
| Solid fallback for no-backdrop-filter | n/a | n/a | n/a | n/a | n/a | n/a | **Yes (rgba 0.95)** |
| Hero presence detection (no-hero routes get State B from initial paint) | No | No | No | No | No | Partial | **Yes** |
| Mobile bottom nav coexistence | No | Yes | No | No | No | No | **Yes (paired with MobileBottomNav)** |
| Inline search conditional on state | No | No | Always | Always | No | No | **State B desktop only** |
| Global / keyboard search shortcut | No | No | No | No | No | No | **Yes** |

EventLinqs lands every dimension. No competitor in the set carries all
of them. The combination is materially better than any individual
competitor.

## Composite design decision (locked)

State A: cinematic transparent over hero, white wordmark, gold dot,
no backdrop filter, no border.

State B: navy `rgba(10, 22, 40, 0.72)` + `backdrop-filter: blur(20px)
saturate(180%)`, 1px gold border-bottom at 30% opacity, white wordmark,
gold dot, compact inline search pill on desktop.

Transition: 300ms `cubic-bezier(0.22, 1, 0.36, 1)` on background-color +
backdrop-filter + border-bottom-color. `prefers-reduced-motion: reduce`
disables the transition (instant state change).

Detection: 1px IntersectionObserver sentinel mounted after the header
in `app/layout.tsx`. No scroll listener overhead. State driven by a
`data-scrolled` attribute on the header root, all visuals via CSS
`[data-scrolled="true"]` selectors. One DOM write per transition, no
React re-render per scroll frame.

Hero presence: `<HeroPresenceProvider>` context in root layout. Hero
wrappers (a thin composition layer that imports `<HeroMedia>` without
mutating it) call `registerHero()` on mount, `unregisterHero()` on
unmount. Header reads `useHeroPresence()`; when no hero is registered,
header forces State B from initial paint. This avoids
white-on-white on text-heavy pages.
