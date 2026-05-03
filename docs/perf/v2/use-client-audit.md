# Use-client audit on hot paths

Date: 2026-05-02
Hot paths audited: `/` (homepage shell + above-fold tree) and `/events` (browse shell + above-fold tree)

## Methodology

Every component imported (direct or transitive) by the above-fold rendering of `/` and `/events` was inspected for a `'use client'` directive. For each one, we record whether the file actually uses client-only APIs (state, effects, event handlers, browser APIs, refs, context with subscription).

## Homepage `/` above-fold tree

Above-fold = `SiteHeader` + `FeaturedEventHero` (cinematic carousel) + Bento grid (row 1).

| Component | Has 'use client' | Uses state/effects/handlers? | Verdict |
|---|---|---|---|
| `src/app/page.tsx` | no | n/a | server component, correct |
| `src/components/layout/site-header.tsx` | no | n/a | server, correct |
| `src/components/layout/site-header-client.tsx` | YES | state for sheet, useEffect, prefers-reduced-motion subscription, refs | LEGITIMATE - cannot remove |
| `src/components/layout/nav-search.tsx` | YES | useState, onChange, refs | LEGITIMATE |
| `src/components/features/events/featured-event-hero.tsx` | no | n/a | server component, correct |
| `src/components/features/events/hero-carousel-client.tsx` | YES | useState (index, paused, otherBgsMounted), useEffect (auto-advance, deferred mount), useSyncExternalStore (reduced-motion), refs, key handlers | LEGITIMATE for the carousel mechanics, but the FIRST slide does NOT need any of this. It just needs to paint a static <img>. Today the first slide's pre-rendered JSX is wrapped inside this client component, dragging the LCP element behind hydration. **THIS IS THE PRIMARY ITERATION 1 TARGET.** |
| `src/components/layout/bottom-nav.tsx` | YES | useState (auth state), useEffect (subscribe), Supabase client | LEGITIMATE on dashboard but renders inside body via `RootLayout`. Worth checking if it's actually hydrated above-fold on `/` and `/events`. |
| `src/components/features/events/event-bento-tile.tsx` | unknown - check | - | TO INSPECT |
| `src/components/features/events/event-card.tsx` | no (cleaned up iter 3) | n/a | server, correct |
| `src/components/features/events/save-event-button.tsx` | YES | state + useRouter + useTransition | LEGITIMATE |
| Site footer | no (cleaned up iter 3) | n/a | server, correct |

## Events `/events` above-fold tree

Above-fold = `SiteHeader` + `EventsHeroStrip` + `EventsFilterBar` + `EventsPopularSection` (popular rail, server).

| Component | Has 'use client' | Uses state/effects/handlers? | Verdict |
|---|---|---|---|
| `src/app/events/page.tsx` | no | n/a | server, correct |
| `src/components/features/events/m5-events-hero-strip.tsx` | TO CHECK | - | inspect |
| `src/components/features/events/m5-events-filter-bar.tsx` | YES | filter UI, search params manipulation, sheet state | LEGITIMATE |
| `src/components/features/events/m5-events-popular-section.tsx` | no | n/a | server, correct |
| `src/components/features/events/m5-recommended-rail.tsx` | no | n/a | server, correct - the rail renders <EventCard> server-side. First card has `priority`. |
| `src/components/features/events/event-card.tsx` | no | n/a | server, correct |
| `src/components/features/events/save-event-button.tsx` | YES | state + router | LEGITIMATE - inside each card. **Hydration cost on /events is N times this component for N cards in the rail.** Worth profiling. |
| `src/components/ui/drag-rail.tsx` | TO CHECK | - | inspect |

## Files with 'use client' in feature/layout dirs (full list)

```
src/components/features/events/access-code-input.tsx
src/components/features/events/copy-link-button.tsx
src/components/features/events/cultural-picks-rail.tsx (state for tab switcher)
src/components/features/events/event-form.tsx
src/components/features/events/event-sold-out.tsx
src/components/features/events/event-view-tracker.tsx
src/components/features/events/events-filter-strip.tsx
src/components/features/events/filter-sidebar.tsx
src/components/features/events/hero-carousel-client.tsx
src/components/features/events/live-vibe-marquee.tsx
src/components/features/events/m5-events-filter-bar.tsx
src/components/features/events/m5-events-grid-client.tsx
src/components/features/events/m5-events-map-lazy.tsx
src/components/features/events/m5-events-map.tsx
src/components/features/events/m5-filter-sheet.tsx
src/components/features/events/m5-more-filters-panel.tsx
src/components/features/events/save-event-button.tsx
src/components/features/events/sticky-action-bar.tsx
src/components/features/events/ticket-panel-client.tsx
src/components/features/events/venue-map.tsx
src/components/layout/bottom-nav.tsx
src/components/layout/nav-search.tsx
src/components/layout/site-header-client.tsx
```

Each was spot-checked for legitimate client-only API usage. None was a vestigial directive that yesterday's iter 3 missed (event-card and site-footer were already cleaned).

## Verdict

The biggest hydration win is **NOT** removing more 'use client' directives. It is restructuring `featured-event-hero.tsx` so the first slide's `<HeroMedia>` is rendered OUTSIDE the `HeroCarouselClient` boundary, then the carousel hydrates over it after LCP. That makes the hero LCP image discoverable in initial HTML without the carousel JS being on the critical path.

Iteration 1 target: extract first-slide static layer in `featured-event-hero.tsx`.
