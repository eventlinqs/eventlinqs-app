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
imagery, UX, and mobile. Parity is the floor; the goal is to surpass. Anything
not clearly at the bar gets reworked before delivery.

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
- World-class glide: eased arrow scroll, CSS scroll-snap, a partial next-card
  peek at every viewport, drag on touch and pointer, `prefers-reduced-motion`
  respected. No auto-rolling anywhere, including the hero. Manual only.

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
