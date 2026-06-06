# System-wide pass: report

Branch: feat/home-rebuild. Density: HOMEPAGE_SEED_FIXTURE.
One surface per session, deep, stop cleanly when context runs low.

Note on artifacts: `docs/design/competitor-page-specs.md`, `design-captures/`,
and the `page-build` + `seed-events` skills landed on main (PR #82, #84) and
were merged into this branch before this surface ran. They are present and in use.

---

## Surface 0: Homepage A-class refinement - DONE

Goal: lift four finish details to the measured Ticketmaster/Eventbrite bar, no
churn, then lock the standard into the page-build skill.

### Evidence (measured live, Playwright, 1440 + 390)
- Rail/section headings: Ticketmaster 24px w700, Eventbrite 24px w700 at 1440
  (22px at 390). Ours was `type-h2` 40px / 28px, about 1.7x oversized.
- Card titles: TM 16px, EB 18px at 1440. Ours 18px - already at bar, untouched.

### Changes shipped
1. Rail-heading type scale re-derived: new `--type-rail` 24px / `--type-rail-mobile`
   22px token and `.type-rail-heading` utility; `snap-rail.tsx` headings moved off
   `type-h2`. Verified rendering: 24px at 1440, 22px at 390.
2. Identical faint top divider (`border-t border-ink-200`) added to Browse by
   Category and This Week; every rail now carries the same divider.
3. Uniform card dimensions: removed `leadFeature` from the Music rail. Every
   category rail now renders one uniform landscape card size, no feature mixing.
4. Rail glide confirmed world-class: eased arrow scroll, CSS scroll-snap, partial
   next-card peek at 1440/768/390, drag on pointer and touch, prefers-reduced-motion
   respected, no auto-rolling anywhere including the hero (manual only).
5. Locked the rail standard into `.claude/skills/page-build/SKILL.md` so every
   future surface inherits it.

### Captures
- After: `docs/benchmark/system-pass/surface-0/after/home-{1440,768,390}.png`,
  plus `after-top-1440.png` and `after-mid-1440.png` (divider + uniform-card proof).
- Before (prior state, oversized headings + Music feature card):
  `docs/benchmark/legacy-purge/after/home-1440.png`.
- Competitor reference: `design-captures/ticketmaster/homepage-*`,
  `design-captures/eventbrite/homepage-*`.

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Typography | Parity | Rail headings now 24/22px, matching both competitors exactly. Card titles 18px at bar. |
| Density | Surpass | More distinct rails of real breadth than either competitor homepage. |
| Imagery | Parity | Real category photography in every card; image-alone, details below. |
| UX | Surpass | One consistent rail and card language; eased glide with peek and drag; manual hero. |
| Mobile (390) | Parity | Rails scroll-snap with peek; headings 22px; dividers identical. |

### Gates
typecheck 0, lint 0 errors, build pass, vitest 275 pass, axe-core 0 violations.
Lighthouse runs on the Vercel preview (CI gate).

---

## Surface 1: Header + footer [SHARED] - DONE

Goal: evidence-based refinement of the shared header and footer, no churn,
and resolve the flagged conflict that the header "uses glassmorphism" which
CLAUDE.md forbids, letting the Ticketmaster and Eventbrite evidence decide.

### Evidence (captured competitors, 1440 + 390)
- Ticketmaster: fully solid blue header bar (nav row + location/date/query
  search rig), opaque, no blur. `design-captures/ticketmaster/homepage-*`.
- Eventbrite: fully solid white header bar, opaque, prominent dual search,
  no blur. `design-captures/eventbrite/homepage-*`.
- Verdict: both competitors use solid, opaque headers. Neither uses
  glassmorphism. Solid is the bar.

### Conflict resolution (the flagged item)
The header's actual CSS already had glassmorphism removed (the Batch 11.0
legibility fix set `backdrop-filter: none` in both states). The conflict
was stale: the component docstring still described "dual-state
glassmorphism" with `blur(20px) saturate(180%)`, the globals.css comment
described "navy frosted glass", a non-existent `@supports` fallback was
documented, and the class was named `.site-header-glass`. The evidence
(solid competitor headers) confirms the solid treatment is correct, so the
fix is to purge the false glass naming and docs so code matches CLAUDE.md
and reality - zero visual change.

### Changes shipped
1. Renamed `.site-header-glass` -> `.site-header-bar` (globals.css x2,
   site-header-client.tsx x1). Rewrote both docstrings to describe the
   actual solid-navy dual-state treatment (State A: transparent + top-fade
   navy gradient over hero; State B: solid navy #0A1628 + gold border).
   Removed the dead `backdrop-filter: none` declarations. No pixel change
   to either header state (proven by before/after captures).
2. Footer regression fixed: the documented founder-spec "For organisers"
   column (Sell tickets, Pricing, Organiser guide, Help centre) was a dead
   export rendered nowhere; the desktop grid was `grid-cols-3` despite the
   "4-col" spec. Restored it as the 3rd desktop column (now `grid-cols-4`)
   and a 4th mobile accordion (clean 2x2). Both competitors surface
   organiser entry points; this closes a real content gap.

### Captures
- Before: `surface-1/before/{home-headerA,home-headerB,footer}-{1440,768,390}.png`
- After: `surface-1/after/{home-headerA,home-headerB,footer}-{1440,768,390}.png`
  (after captured on the production server, no dev overlay)
- Header State A/B after are pixel-identical to before; footer after shows
  the restored 4-column desktop and 2x2 mobile layout.

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Typography | Parity | Nav 14px medium, footer heads 12px caps tracked - matches both. |
| Density | Surpass | 4-col footer with community + organiser breadth neither competitor carries; header nav tight and complete. |
| Imagery | Parity | Header is chrome (logo wordmark); no imagery regressions. |
| UX | Surpass | Solid header reads on any hero (gradient State A), search pill on scroll, full keyboard trap + focus-visible on the mobile sheet; organiser footer entry restored. |
| Mobile (390) | Parity | Solid navy header, icon search always present, 2x2 footer accordions, 44px targets. |

### Gates
lint 0 errors (30 pre-existing warnings in research/capture scripts only),
build pass, vitest 275 pass (footer-links 34 pass), axe-core 0 violations
(full page + scoped header/footer, desktop + mobile). Lighthouse runs on the
Vercel preview (CI gate); changes are a CSS class rename + one footer column,
no new JS or imagery, so the surface-0 Lighthouse headroom holds.

---

## Remaining (run in fresh sessions, one surface each)
2. /events browse and discovery
3. Event detail page
4. Search results = the /events?q= experience
5. City page
6. Organiser landing (/organisers)
7. Checkout flow surfaces
8. Order confirmation and ticket view
9. Category landing template (/categories/[slug])

Each: run the page-build skill, capture the competitor equivalent at 1440+390,
Phase A mirror, Phase B touch, inherit the locked design system and rail
standard, full gates, benchmark gate, commit per surface, do not merge.
