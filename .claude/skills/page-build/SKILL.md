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

6. **Inherit the design system exactly.** No new colours, sizes, or type. Navy
   #0A1628 and gold #D4A437, light and airy. Archivo display, Hanken Grotesk
   body, Manrope UI. Image-alone cards with details below; text on an image only
   in the restrained hero. CAPS rail headings, one faint divider per rail, tight
   spacing. Tokens and patterns come from `src/app/page.tsx`.

7. **Media architecture.** All imagery flows through the media components
   (`EventCardMedia`, `HeroMedia`, `CityTileImage`, `OrganiserAvatar`). No raw
   `<img>`, no `background-image` for content, no `next/image` in feature code.
   Above-fold hero is a priority AVIF raster. Follow `docs/MEDIA-ARCHITECTURE.md`.

8. **Production-readiness.** Handle every state. Touch targets 44px or larger.
   Run a production build, then verify Lighthouse 95+ on desktop AND mobile,
   axe-core 0 violations, and Playwright before and after at 1440, 768, and 390.

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

## Glide standard (locked)

The rail arrow glide lives in `src/components/ui/snap-rail.tsx` (`useScrollState`)
and is the only rail-scroll behaviour. Do not reintroduce native `scrollBy`
smooth or a fixed-step jump:

- Distance-eased rAF glide: cubic ease-out, ~400 to 550ms scaled by distance,
  always landing on a card snap boundary. Snap is suspended for the glide so the
  per-frame `scrollLeft` writes do not fight the snap engine, then restored.
- Arrows page by the live visible-card count (measured pitch = child offset
  delta), never a hardcoded step.
- Arrow press state (`active:scale-90`), end-of-rail disabled fades, and a
  symmetric left/right edge gradient so the peek invites scroll both ways.
- Keyboard ArrowLeft/Right on the focused rail drive the same glide.
- Natural touch/trackpad scrolling is untouched; any pointer/touch/wheel input
  cancels an in-flight glide and hands the rail straight back to the user.
- `prefers-reduced-motion` jumps to the destination instantly.
- The rail must feel like it has weight and lands softly: never linear, never
  abrupt.

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

## QA agent brief

Spin up a separate best-in-class reviewer. It does not mark the page complete
until ALL of these hold:

- Every state handled: loading, empty, error, populated.
- Touch targets 44px or larger, keyboard reachable, focus visible.
- axe-core 0 violations.
- Lighthouse 95+ on desktop AND mobile on a production build (never localhost
  dev, never a single run when a median is available).
- Playwright before and after at 1440, 768, and 390.
- Benchmark gate passes against the competitor equivalent.
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
- Merging without approval, or using `--admin` to bypass a red gate.

## Red flags, stop and fix

- "I know what this page should look like." Capture the evidence first.
- "Close enough to the competitor." Match or beat, with a written verdict.
- "I will add the empty state later." States are part of the build, not after.
- "Lighthouse passed locally on dev." Production build only.
