---
name: page-build
description: Use when building, rebuilding, or redesigning any user-facing EventLinqs page or major UI surface (homepage, events listing, event detail, checkout, category or scene landing, organiser profile, marketing page), or making a visible change to an existing surface.
---

# page-build

## Overview

The standard way to build a world-class EventLinqs page. The bar is the fusion
of Ticketmaster and Eventbrite, surpassed. You are a principal frontend
engineer and designer: nothing generic ships, and nothing is built from
assumption. Read `CLAUDE.md` first; this skill is how you execute its laws on
one page.

Core principle: build what the evidence SHOWS to that standard (Phase A), then
layer the EventLinqs touch on top (Phase B). Never invent a layout the evidence
does not support.

## Governing laws (read before you build - Law 0)

`CLAUDE.md` is the constitution; this skill executes its laws on one page and
holds the detailed locked specs that elaborate them. Before the first edit, read
the `CLAUDE.md` sections that govern your surface and state which laws govern the
task. A page build is always governed by Law 0, Law 1 (no generic), Law 2
(evidence-driven), the Design system, Motion, Law 5 (zero dead links), and
Verification and gates; a marketing surface adds Law 4. The standards below are
the build-time detail for the Design system and Motion laws, not a second source
of truth - on any conflict, `CLAUDE.md` and the code win.

## Workflow

Work the steps in order. Do not jump ahead.

1. **Reality audit.** Open the current page and read its code. List what exists,
   what is broken, what data is real in the database, and which states (loading,
   empty, error, populated) are handled. Build on reality, never on a guess.

2. **Plan.** Enter plan mode. State the page goal, the sections, and the data
   each needs. State how the result will be verified before writing code.

3. **Capture the competitor evidence.** Use Playwright to capture the equivalent
   Ticketmaster AND Eventbrite page at 1440 and 390. Save the shots. Read
   `docs/design/competitor-page-specs.md` for the locked per-page bar. Judge
   density, hierarchy, typography, imagery, filter and browse UX, and mobile.

4. **Phase A, mirror the evidence.** Build the page to match or beat what you
   captured: same information density and hierarchy, better polish. This is the
   skeleton every general ticketing user expects.

5. **Phase B, layer the EventLinqs touch.** Add what no competitor has: the
   community rail (roughly 10 to 20 percent of the surface, never dominant),
   scene discovery, and the native artist and genre layer. Community is a
   differentiator on top, not the identity.

6. **Inherit the design system exactly** (CLAUDE.md: Design system). No new
   colours, sizes, or type. Navy #0A1628 and gold, light and airy: solid opaque
   surfaces (no glassmorphism), no flat-dark backgrounds (darkness only from a
   photo + navy overlay). Archivo display, Hanken Grotesk body, Manrope UI.
   Image-alone cards with details below; text on an image only in the restrained
   hero. CAPS rail headings, one faint divider per rail, tight spacing. The hero
   is a priority AVIF raster that owns LCP and never animates; rails defer
   scroll-snap to first interaction (Hero and LCP integrity). Tokens and patterns
   come from `src/app/globals.css` and `src/app/page.tsx`.

7. **Media architecture.** All imagery flows through the media components
   (`EventCardMedia`, `HeroMedia`, `CityTileImage`, `OrganiserAvatar`). No raw
   `<img>`, no `background-image` for content, no `next/image` in feature code.
   Above-fold hero is a priority AVIF raster. Follow `docs/MEDIA-ARCHITECTURE.md`.

8. **Production-readiness.** Handle every state. Touch targets 44px or larger.
   Run a production build, then verify Lighthouse 95+ on desktop AND mobile
   (median on the preview or warmed prod, never a single localhost run), axe-core
   0 violations, and Playwright before and after at 1440, 768, and 390. On any
   discovery or navigation surface, prove Law 5 (zero dead links) by running
   `scripts/link-integrity-crawl.mjs` against the preview or a local production
   server: every rendered card, tile, nav, footer, and CTA link must resolve 200.
   Verify by clicking, never by a hand-picked slug.

9. **QA agent.** Dispatch a fresh reviewer (see below). It refuses to pass a
   page that sits below the bar on any dimension. If it fails, iterate.

10. **Deliver.** Commit per page with a clear message, push, and hand back the
    Vercel preview URL with the benchmark verdict. Never merge without approval.

## Benchmark gate

A page is not done until a Playwright side-by-side against the competitor
equivalent passes with an explicit verdict on each of: density, typography,
imagery, UX, loading, and mobile. Parity is the floor; the goal is to surpass.
Anything not clearly at the bar gets reworked before delivery.

Density-proof rule (locked): every benchmark capture and every verdict is taken
at full fixture density (`HOMEPAGE_SEED_FIXTURE=1`), with every rail populated
and flowing and the grid full. Never judge or screenshot a thin-rail or
half-empty surface: a sparse rail flatters the layout and hides the real density
contest against the competitor. Thin-rail evidence is not evidence.

## Rail standard (locked, Surface 0)

Every horizontal rail on every surface follows this, derived from measured
Ticketmaster and Eventbrite homepages at 1440 and 390:

- One faint top divider per rail: `border-t border-ink-200`. Identical on every
  rail, including This Week and Browse by Category.
- CAPS heading at the measured scale: `.type-rail-heading` (24px at 1440, 22px
  at 390, weight 700). Never `.type-h2` (40px) for a rail heading - that is
  about 1.7x the competitor bar (both sit at 24px). Eyebrow stays 12px uppercase.
- Uniform card dimensions within a rail. No feature-card size mixing in a
  category rail (no `leadFeature` on a category rail).
- World-class glide: the raised programmatic glide (see Glide standard below),
  CSS scroll-snap, a partial next-card peek at every viewport, drag on touch and
  pointer, `prefers-reduced-motion` respected. No auto-rolling anywhere,
  including the hero. Manual only.

## Container width standard (locked)

The sitewide content container is **1400px** (`max-w-7xl`, overridden from
Tailwind's 1280 default via `--container-7xl: 87.5rem` in the `:root` block of
`src/app/globals.css`). `max-w-7xl` is the canonical cap used on every surface
(header, footer, heroes, rails, content, checkout, event detail), so the one
token governs them all and they stay aligned. Never hand-pick a different
section max-width; use `max-w-7xl` (or `ContentSection width="wide"`).

Derived from live captures at 1440 and 1920
(`docs/benchmark/system-pass/phase-b/container-width/`): Ticketmaster's general
content container is ~1360px at 1440 (fluid, ~40px gutters, no hard cap until
~1840); Eventbrite browse ~1392px; Eventbrite home capped ~1272px. 1280 sat
narrower than all three. 1400px surpasses the cluster at 1440 and caps cleanly
on ultra-wide (1920 -> 1400 content, ~260px gutters) rather than stretching
rails thin. Mobile and tablet are untouched: at 390/768 content is far below
1400 so the cap never binds, and the `px-4 sm:px-6` gutters are unchanged. If
this number ever changes, re-derive it from fresh live TM + EB captures, never
from taste, and re-verify cards-per-row and rail peek at the new width.

## Hero scale standard (locked)

One hero-scale system, two named tiers defined as tokens in
`src/app/globals.css`; no page's hero may exceed its tier (Design system: Hero
scale).

- `.hero-marketing` - primary + marketing tier, the homepage scale
  (`~42-48vh`, max 480px). The homepage `FeaturedHero` IS this tier and is the
  marketing maximum. Use it on `/organisers` and every "sell the platform"
  surface. A marketing hero may never tower over the homepage hero (the
  `/organisers` rebuild's 82vh full-viewport hero read as a generic template
  beside the platform chrome - fixed to `.hero-marketing`).
- `.hero-content` - content tier, the cinematic cap (`~55-70vh`). Use it on
  `/events/[slug]`, `/city/[slug]`, `/culture/[culture]`.
- Every hero shares ONE treatment: the bottom-up navy scrim, a GOLD eyebrow
  (`text-[var(--brand-accent)]` on the dark hero, never a white eyebrow), the
  homepage display scale (`text-3xl sm:text-4xl lg:text-5xl`, never
  `text-6xl/7xl`), and a bottom-anchored CTA stack. The header over a hero is
  the shared dual-state navy bar, never a per-page variant (Chrome consistency).
- Prove it: capture the homepage hero beside the page's hero at 1440 and 390;
  one visual system or it is not done.

## Glide standard (locked)

The rail arrow glide lives in `src/components/ui/snap-rail.tsx` (`useScrollState`)
and is the only rail-scroll behaviour. Do not reintroduce native `scrollBy`
smooth or a fixed-step jump:

- Distance-eased rAF glide: cubic ease-out, ~400 to 550ms scaled by distance,
  always landing on a card snap boundary. Snap is suspended for the glide so the
  per-frame `scrollLeft` writes do not fight the snap engine, then restored.
- Arrows page by the live visible-card count (measured pitch = child offset
  delta), never a hardcoded step.
- Keyboard ArrowLeft/Right on the focused rail drive the same glide.
- Natural touch/trackpad scrolling is untouched; any pointer/touch/wheel input
  cancels an in-flight glide and hands the rail straight back to the user.
- `prefers-reduced-motion` jumps to the destination instantly.
- The rail must feel like it has weight and lands softly: never linear, never
  abrupt.

## Rail Control System (locked, Mission 3)

The look and placement of rail scroll controls, derived strictly from live
competitor evidence (`docs/benchmark/rail-controls/CATALOGUE.md`: Airbnb +
Ticketmaster + Eventbrite + Humanitix at 1440 / 1180 / 390). NO control decision
is made from taste. The controls live ONLY in `src/components/ui/snap-rail.tsx`
(`RailArrows`, exported); every rail renders that one component - never its own
button markup.

- **Placement: top-right of the rail header, on the headline's horizontal line.**
  Airbnb and Ticketmaster both anchor rail controls in the header. Header-anchored
  is structurally stable: the controls live in normal flow, so they never float,
  jump, vanish on scroll, or shift on window resize. Do not move controls to an
  over-card edge overlay (that pattern is for full-bleed HERO carousels only, e.g.
  Humanitix - and the hero is out of scope).
- **Shape: circular, solid, opaque. Never glassmorphism.** Idle = solid navy
  (`--color-ink-900`) circle, white chevron. Hover = deepens to `--color-navy-950`,
  chevron turns gold (`--color-gold-400`), 0.5px lift, stronger shadow. Press =
  `active:scale-95`. The fill is always opaque (Airbnb #F2F2F2 and Humanitix
  #F9F9FA are both opaque); EventLinqs uses brand navy/gold.
- **Size: >= 44px (`h-11 w-11`).** Ticketmaster runs 44px; this also meets the
  44px touch-target law. Chevron `h-5 w-5`, strokeWidth 2.5.
- **Disabled at either end = muted fill + muted icon** (`--surface-2` /
  `--text-muted`), read off Airbnb (it dims the Previous button to opacity 0.5 +
  grey border at a rail's start). Not a hover/lift; a clearly inert state.
- **NO progress device.** The gold standard (Airbnb) shows arrows alone. The old
  travelling dot / progress bar is REMOVED and replaced with nothing. Do not
  reintroduce a progress indicator beside rail arrows.
- **A rail that does not overflow shows no controls** (`RailArrows` returns null
  when `!canPrev && !canNext`) - arrows appear only when there is somewhere to go.
- **Reachable on mobile.** Because the controls are header-anchored (not over the
  cards), they stay visible and tappable at 44px on mobile at zero layout cost, on
  top of native swipe. (Airbnb/TM hide arrows on mobile; we keep them, evidence-
  consistent with Humanitix keeping hero arrows on mobile, and better for reach.)
- A symmetric left/right edge gradient on the track invites scroll both ways.
- The control look is the SAME on every rail and every page. To change it, edit
  `RailArrows` once; re-derive any new value from fresh competitor captures.

## Motion standard (locked)

The engine is CSS-first: no framer-motion (founder approval only, per CLAUDE.md).
Reuse the shared primitives, never hand-roll per surface:

- Reveal on scroll: wrap below-the-fold blocks in the shared `Reveal`
  (`src/components/ui/reveal.tsx`; IntersectionObserver, fires once, unobserves
  after). Pass `stagger` and render the row/grid container so its direct children
  fade up 50 to 80ms apart left to right, a 12 to 16px rise, 150 to 300ms
  ease-out. Reading is never blocked: content is visible by default and the
  reveal is a progressive enhancement that no-ops without JS, under
  reduced-motion, or for headless audit agents (armed only under
  `html[data-motion="1"]`, set pre-paint by the head bootstrap).
- Hero entrance: stagger the hero CONTENT (headline, meta, CTA) 60 to 80ms apart
  on load. The LCP image never animates (media architecture law).
- Hover: cards use `.card-hover-lift` (2 to 4px lift, shadow deepen, 1.02 to
  1.03 inner image scale, 150 to 200ms). Buttons use the canonical `Button`
  press/hover states. No bespoke hover.
- Sticky header: smooth elevation + background transition on scroll, not a hard
  swap.
- `prefers-reduced-motion`: every reveal, lift, and entrance collapses to the
  final state instantly. Verify with the media query forced on.
- The feel is FELT, not watched. Alive, not busy. Tune timings until a
  scroll-through at 1440 and 390 reads premium, and confirm Lighthouse mobile
  still clears 95+ on the preview (motion never costs the gate).

## Marketing surface standard (locked, Law 4)

Every marketing / landing surface (organiser, pricing, about, city and scene
landings, any "sell the platform" page) MUST carry image-rich, full-craft
treatment to the competitor bar. A text-only marketing surface is a design
defect by definition.

- No bare icon-and-text pillar sections. No wall-of-text bands. Every section
  earns imagery or a strong visual treatment.
- Match the competitor frame for frame, then surpass: full-bleed photographic
  hero with overlay + gold CTA; alternating image-and-text feature bands; a
  stats / social-proof band (real platform truths only - never fabricated
  numbers or fake logos); visual how-it-works; image tiles; premium FAQ; a
  strong closing CTA band.
- Imagery comes from the licensed platform photo library via the media
  components, wired as swappable slots in a per-page `src/lib/images/` config,
  so photo-day upgrades are a one-line change and never touch the template.
- Below-fold marketing photos use `MarketingMedia` (band / tile); the hero uses
  `HeroMedia` (the single priority image). Never construct `<Image>` in feature
  code.
- Reference build: `/organisers` (`OrganisersLandingPage` +
  `organiser-photos.ts` + `MarketingMedia`).

## QA agent brief

Spin up a separate best-in-class reviewer. It does not mark the page complete
until ALL of these hold:

- Every state handled: loading, empty, error, populated.
- Touch targets 44px or larger, keyboard reachable, focus visible.
- axe-core 0 violations.
- Zero dead links (Law 5): the link-integrity crawler returns 0 non-200 on every
  link the surface renders. No card or tile 404s on click.
- Lighthouse 95+ on desktop AND mobile on a production build (never localhost
  dev, never a single run when a median is available).
- Playwright before and after at 1440, 768, and 390.
- Benchmark gate passes against the competitor equivalent, SURPASS/PARITY/BELOW
  per aspect at full fixture density; any BELOW iterates.
- Copy clean: no em-dashes or en-dashes, Australian English, community-first,
  no banned words (diaspora, friends-launch), no generic filler.

The reviewer's default answer is "not yet". It must point at evidence, not
vibes, to pass.

## Common mistakes

- Skipping the capture and building from memory. The evidence is the brief.
- Letting community take over the page. Keep it a layer, not the identity.
- Inventing colours, spacing, or fonts. Inherit from the homepage only.
- Painting event titles or prices onto card photography. Details sit below.
- Claiming done on a dev build or a single Lighthouse run.
- Certifying a surface by a hand-picked slug instead of clicking its cards. If
  density and detail draw from two sources (fixture vs DB), every card can 404
  while the page looks finished (Law 5). One source of truth; verify by clicking.
- Shipping a text-only marketing surface (icon-and-text pillars, a wall of
  text). Image-rich, full-craft treatment is mandatory (Law 4).
- Reintroducing glassmorphism (`backdrop-blur`) or a flat-dark band. Solid
  opaque, light navy-on-canvas; darkness only from a photo + navy overlay.
- Putting static `scroll-snap` back on a rail (kills hero LCP). Snap arms on
  first interaction.
- Merging without approval, or using `--admin` to bypass a red gate.

## Red flags, stop and fix

- "I know what this page should look like." Capture the evidence first.
- "Close enough to the competitor." Match or beat, with a written verdict.
- "I will add the empty state later." States are part of the build, not after.
- "Lighthouse passed locally on dev." Production build only.
