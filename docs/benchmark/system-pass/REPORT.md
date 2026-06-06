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

## Surface 2: /events browse and discovery - DONE

Goal: benchmark the browse surface against the captured competitors and apply
evidence-based refinement. No churn; the page is already mature (the m5 browse
system: hero strip, sticky filter bar, popular rail, grid + map, pagination).

### Evidence (captured competitors, 1440 + 390)
- Ticketmaster (MUSIC browse): solid blue header + category sub-nav, an H1, a
  few filter dropdowns, then a 2-up large-card grid with a gift-card ad rail.
  `design-captures/ticketmaster/browse-discovery-*`.
- Eventbrite (browse): left Filters sidebar (Category, Date, Neighborhood), a
  single-column list of horizontal cards, a right-side map.
  `design-captures/eventbrite/browse-discovery-*`.

### Reality audit
Strong, complete surface. Hero strip (H1 + count + search), sticky filter bar
(date presets, Grid/Map toggle, More-filters sheet with price/date/distance/
sort, category chips), popular rail, a 4-up real-photography grid (24/pg),
pagination, ISR-tuned for LCP. Empty state is fully handled (icon, copy, Clear
filters + Browse all CTAs). Grid cards use the no-blur "light" save button and
opaque badges. All states covered.

### Evidence-based refinement (the change)
The sticky filter bar was glassmorphism: `bg-white/95 backdrop-blur-sm`, the
exact treatment CLAUDE.md forbids and that surface 1 purged from the header.
Both competitors use solid, opaque filter/sub-nav bars. Fixes:
1. Filter bar -> solid `bg-white` (was `bg-white/95 backdrop-blur-sm`). On
   scroll the bar is now fully opaque; grid cards no longer bleed through it.
2. Filter sheet scrim -> solid dim `bg-ink-900/60` (was `bg-ink-900/40
   backdrop-blur-sm`). Modal overlay now dims without a frosted blur.
No layout change; density, cards, and imagery untouched (already above bar).

### Captures
- Before: `surface-2/before/events-{1440,768,390}.png`,
  `events-empty-{1440,768,390}.png` (empty-state proof).
- After: `surface-2/after/events-{1440,768,390}.png` plus
  `events-scrolled-filterbar-1440.png` (solid bar over scrolled grid).

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | 4-up real-photo grid (24/pg) vs TM 2-up + ad and EB single-column list. |
| Typography | Parity | H1 display, chip labels, card titles at the locked scale. |
| Imagery | Surpass | Every card real photography, image-alone, details below; no ads. |
| UX | Surpass | Date presets + category chips + price/distance/sort sheet + Grid/Map, all keyboard reachable with aria-pressed; solid sticky bar; full empty state. |
| Mobile (390) | Parity | Horizontal-scroll chips, single-column grid, sticky solid bar, 44px targets. |

### Cross-surface follow-up (logged, not churned here)
Remaining `backdrop-blur` glassmorphism lives on other surfaces and is left to
their passes: event-sold-out badge, sticky-action-bar, hero-carousel/featured
hero buttons, save-button "dark" variant, this-week-strip (surfaces 0/3). The
SaveEventButton "dark" frosted variant is unused on browse (cards use "light").

### Gates
lint 0 errors, build pass (509 pages), vitest 275 pass, axe-core 0 violations
(/events desktop + mobile). Lighthouse on the Vercel preview (CI gate); change
is two CSS tokens, no new JS or imagery, so surface-0 headroom holds.

---

## Surface 3: Event detail page - DONE

Goal: benchmark /events/[slug] against the captured competitors and apply
evidence-based refinement. No churn; the page is already the strongest surface
in the app on craft.

### Evidence (captured competitors, 1440 + 390)
- Ticketmaster/Moshtix: small poster thumbnail + a text detail list, a "DON'T
  MIST OUT / Join the waitlist" strip, Afterpay banner. Flat, low-craft.
  `design-captures/ticketmaster/event-detail-*`.
- Eventbrite: poster-art hero, category/owner badge, H1, organiser row with
  follower count + Follow ("TOP ORGANIZER"), right-side sticky ticket panel
  (orange "Get tickets"), location + date, About, FAQ accordion.
  `design-captures/eventbrite/event-detail-*`.

### Reality audit
Far ahead of both competitors on craft (the competitor-page-specs note says so
outright): full-bleed cinematic hero (HeroMedia + navy gradient), category
badge, H1, date/venue, social-proof badge, Get-tickets CTA + all-in price, trust
signals; then About, When/Where cards, venue map, organiser card, tags,
WhatsApp-first share; a sticky ticket panel with inline tiers (or seat selector,
sold-out, or not-on-sale states); related-events grid; cancelled/postponed/past
state banners; private/draft guards. All states handled.

### Evidence-based refinement (the change)
Glassmorphism purge, continuing the surface 1/2 thread and the CLAUDE.md law.
Both competitors use solid elements. Fixes:
1. Hero category badge: was `GlassCard variant="dark"` (backdrop-blur-2xl) ->
   solid navy pill (`bg-ink-900/85` + gold border, no blur). Dropped the now
   unused GlassCard import from the route.
2. StickyActionBar: desktop `bg-white/85 backdrop-blur-md` and mobile
   `bg-white/95 backdrop-blur-md` -> solid `bg-white`. Docstring de-glassed.
3. SaveEventButton "dark" variant: `bg-white/20 backdrop-blur-md` -> solid
   `bg-ink-900/70` (reads on dark imagery; shared with the homepage bento tile,
   so that surface gains the same compliance).
Translucency without backdrop-filter (e.g. card badges at /95) is not
glassmorphism and was left as-is. No layout or content change.

### Deferred (need data or migrations - out of scope for a no-migration sweep)
- Organiser social proof (follower count + Follow) - EB has it, we defer it;
  needs a follows table.
- Know-before-you-go / FAQ accordion - EB has it; needs event FAQ data.
- "Tickets not yet on sale" conversion dead-end (seen on the captured event) -
  filter these from discovery or convert to notify-me; a discovery/data change,
  not a detail-page UI fix. Logged in [[project_system_pass_sweep]].

### Captures
- Before: `surface-3/before/detail-{1440,768,390}.png`
- After: `surface-3/after/detail-{1440,768,390}.png` +
  `detail-scrolled-stickybar-1440.png`

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | Full detail set (hero, about, when/where, map, organiser, share, tiers, related) vs TM's thumbnail list. |
| Typography | Surpass | Display H1 clamp(2-4rem), sectioned eyebrows; competitors run flat system type. |
| Imagery | Surpass | Cinematic full-bleed hero vs EB poster card and TM thumbnail. |
| UX | Surpass | Inline multi-tier panel, all-in pricing promise, sticky summary, venue map, WhatsApp share, every sale/lifecycle state handled. |
| Mobile (390) | Surpass | Hero + stacked content + solid bottom action bar; 44px targets. |

### Gates
lint 0 errors, build pass, vitest 275 pass, axe-core 0 violations (event detail
desktop + mobile). Lighthouse on the Vercel preview (CI gate); change is CSS-only
(removed backdrop-filter), no new JS or imagery.

---

## Surface 4: Search results (/events?q=) - DONE

Goal: the search-results experience. Same route as /events browse (surface 2),
so the surface-specific question is query framing: does the page acknowledge
what the user searched for?

### Evidence
Search results on both competitors are their browse/discovery layout with a
query applied and an explicit "search results for X" framing
(`design-captures/*/browse-discovery-*`). Ours reused the browse shell verbatim:
the hero kept the generic "Find your next event" heading and a bare "N events
available" count regardless of `q` - the only query signal was the pre-filled
search box.

### Evidence-based refinement (the change)
1. Query-aware hero: when `?q=` is present the H1 becomes `Results for "<q>"`
   (trimmed, capped at 80 chars, React-escaped) instead of the generic browse
   heading. Empty/whitespace `q` falls back to "Find your next event".
2. Query-aware empty state: a no-result search now reads `No results for "<q>"`
   (was the generic "No events match these filters"), keeping the
   widen/clear/browse guidance and dual CTAs. The query threads through the
   grid (which already had `params`) into EventsEmptyState.
No change to the grid, cards, filter bar, or density - those are the surface-2
browse system, already above bar and now query-framed on top.

### Captures
- Before: `surface-4/before/search-{1440,768,390}.png` (q=afrobeats, generic heading)
- After: `surface-4/after/search-{1440,768,390}.png` (q=afrobeats -> "Results for
  ...") and `search-empty-{1440,768,390}.png` (q=quokkazzz -> "No results for ...")

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | Inherits the 4-up browse grid; results render at the same density as browse. |
| Typography | Parity | "Results for ..." H1 at the display scale; competitors frame search similarly. |
| Imagery | Surpass | Real-photo result cards vs competitor list rows. |
| UX | Surpass | Query echoed in H1 + box + empty state; full filter set still applies to a search; clear/browse recovery from zero results. |
| Mobile (390) | Parity | Same query framing; single-column results; sticky solid filter bar. |

### Gates
lint 0 errors, build pass, vitest 275 pass, axe-core 0 violations (search
populated + empty, desktop + mobile). Lighthouse on the Vercel preview (CI gate);
change is a conditional heading string + one prop, no new JS or imagery.

---

## Remaining (run in fresh sessions, one surface each)
5. City page
6. Organiser landing (/organisers)
7. Checkout flow surfaces
8. Order confirmation and ticket view
9. Category landing template (/categories/[slug])

Each: run the page-build skill, capture the competitor equivalent at 1440+390,
Phase A mirror, Phase B touch, inherit the locked design system and rail
standard, full gates, benchmark gate, commit per surface, do not merge.
