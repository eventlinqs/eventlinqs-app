# CLAUDE.md - EventLinqs

Read this first, every session. These are the laws. They override default
instincts and need no re-prompting. If a law and a user instruction conflict,
the user wins; otherwise these hold. Founder and approver: Lawal Adams.
"Approval" below means his sign-off.

## What EventLinqs is

EventLinqs is a complete, general ticketing platform for Australia, built to
surpass Ticketmaster and Eventbrite. Treat the fusion of both as the bar to
beat, not to match. Every event type lives here: sports, music, comedy,
theatre, family, festivals, food, corporate. Community is a differentiating
layer on top, roughly 10 to 20 percent of any surface, never the dominant
identity.

Stack: Next.js, Supabase, Tailwind v4, Stripe, Vercel.

## Law 1: no generic

No generic text, layouts, placeholders, or template aesthetics anywhere, ever.
Every surface is luxury-grade and world-class. If a screen could belong to any
other product, it is wrong: rework it until it could only be EventLinqs.

## Law 2: evidence-driven

Derive structure and layout from captured competitor evidence, never from
assumption. For any page, first capture the equivalent Ticketmaster and
Eventbrite page with Playwright at 1440 and 390.

- Phase A: build what you SEE, to that standard or better. Match information
  density, hierarchy, imagery quality, and polish.
- Phase B: then layer the EventLinqs touch on top: the community rail, scene
  discovery, and the native artist and genre layer.

Never skip Phase A. Never invent a layout the evidence does not support.

## Law 3: Australia-smart

Every taxonomy, scene, category, content, and copy decision is verified against
current Australian market data before it ships. Never inherit taxonomy from an
old draft without re-verifying it.

- Demographics (ABS): 32 percent of people are overseas-born. India is the
  largest overseas-born group; China, New Zealand, the Philippines and Nepal
  are among the fastest-growing.
- Ticketing (LPA): contemporary music is about 54 percent of ticketing revenue;
  comedy is the fastest-growing category.

## Scene layer (locked, national)

Scenes are the EventLinqs differentiator layered on top of the general
catalogue, in this order:

1. First Nations (position one)
2. South Asian
3. Asian
4. Pasifika & Maori
5. Afrobeats & Amapiano (Owambe within)
6. Latin
7. Pride
8. Mediterranean
9. Faith & Worship (Gospel within)
10. Caribbean

Business & Networking is a general category, never a scene.

## Design system

Inherit exactly. No new colours, sizes, or type.

- Colour: navy #0A1628 and gold #D4A437. Light and airy. No heavy black bands.
- Type: Archivo display, Hanken Grotesk body, Manrope UI. DICE typography
  influence only, never resemble DICE.
- Cards: image alone, all details below the image. Never text on a card image.
  The hero is the only place text sits on an image, and only restrained.
- Rails: CAPS headings, one faint divider per rail, tight spacing.
- Source of truth for tokens and patterns: `src/app/page.tsx` (the homepage).

Copy:

- No em-dashes and no en-dashes, ever. Use hyphens, colons, commas, pipes.
- Australian English (-ise, -our, -re) and Australian content.
- Community-first language, never culture-first. Banned words: diaspora,
  friends-launch.
- No exclamation marks in user-facing copy.

## Motion

The engine is CSS-first: IntersectionObserver-driven reveals plus CSS keyframes
and transitions, 150 to 300ms, ease-out, `prefers-reduced-motion` always
honoured. Framer Motion is not a default dependency; reach for it only with
founder approval for a single component that genuinely needs orchestration the
CSS engine cannot express. Speed is part of the design: Lighthouse 95+ on mobile
remains law, so motion never costs the gate.

Motion reads premium and almost invisible: Ticketmaster restraint, never showy.
The bar is alive and breathing, best in the world. Motion is FELT, not watched:
tune it alive, never busy.

The choreography (deliver all of it with the CSS engine):

- Page entrance: hero content staggers in once (headline, meta, CTA, 60 to 80ms
  apart). The hero LCP image itself never animates (media architecture law).
- Scroll reveals: every below-the-fold section fade-rises as it enters the
  viewport, cards staggered 50 to 80ms left to right, once only, subtle (12 to
  16px rise), never blocking reading.
- Hover: cards lift 2 to 4px with the shadow deepening and a 1.02 to 1.03 image
  scale at 150 to 200ms; buttons get press states; tasteful link interactions.
- Rails: the eased arrow glide stays, the next-card peek invites the scroll.
- Sticky header: a smooth elevation and background transition on scroll.
- Loading: designed skeletons settle into real content with zero layout shift.
- `prefers-reduced-motion` disables all of it cleanly.

- Forbidden: GSAP, scroll-hijacking (Lenis), parallax overload, glassmorphism,
  glow kits (Aceternity, MagicUI), bento grids, auto-rolling carousels.

## Tooling

- UI primitives: shadcn and Radix, for accessibility. Icons: Lucide. Rails:
  native CSS scroll-snap.
- No new UI libraries without founder approval.

## Workflow

- Plan mode for any new build. Think and plan before touching code.
- Verify-first: before any task, state how the result will be verified. Never
  assume; confirm against the real environment.
- Visual changes: Playwright before and after at 1440, 768, and 390.
- Benchmark gate on every page: side-by-side against the competitor equivalent
  in `docs/design/competitor-page-specs.md`, with an explicit pass or fail on
  density, typography, imagery, UX, and mobile. Not clearly at the bar means
  iterate before delivering.
- Production-readiness on every page: Lighthouse 95+ on desktop AND mobile,
  measured as a median of repeated runs on the Vercel preview or warmed
  production, never a single localhost run. axe-core 0 violations. Touch
  targets 44px or larger.
- Migrations: write the migration file only. Lawal applies it with
  `supabase db push --linked` in PowerShell. Never the Dashboard SQL editor,
  never the Supabase MCP.
- CI gates are the merge authority. No `--admin`, no skipping gates.
- Delivery: commit, push, hand back the Vercel preview URL. Never merge without
  approval.
- Disk guard: check free space before any build or deploy step. Under 1.5 GB
  free, stop and report.

## Authority docs

- `docs/EventLinqs_Scope_v5.md`: scope. Build nothing that contradicts it.
- `docs/design/competitor-page-specs.md`: the per-page bar for the benchmark
  gate.
- `docs/MEDIA-ARCHITECTURE.md`: imagery and media component rules.

## Skills

- `page-build`: the standard page build. Reality audit, capture the competitor
  equivalent, Phase A mirror, Phase B EventLinqs touch, QA, benchmark, deliver.
- `seed-events`: seed realistic Australian events across all categories and
  scenes from a local image library, optimised and wired through the media
  components.
