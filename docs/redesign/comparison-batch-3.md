# Redesign Batch 3 - before / after

**Branch:** `redesign/world-class-rebuild-2026-05-03`
**Captured:** 2026-05-04, dev server (localhost:3001) at viewports 1440 and 375
**Scope:** tile rebuilds (CityRailTile, ThisWeekCard, FreeWeekendTile, EventCard), CategoryRail token migration, homepage 10-rail expansion, Pexels query relevance, DESIGN-SYSTEM.md v2.1

## Files

| Surface              | Viewport | Before                                       | After                                       |
|----------------------|----------|----------------------------------------------|---------------------------------------------|
| Homepage (full page) | 1440     | tiles/before/home-1440-fullpage.png          | tiles/after/home-1440-fullpage.png          |
| Homepage (full page) | 375      | tiles/before/home-375-fullpage.png           | tiles/after/home-375-fullpage.png           |
| /events              | 1440     | tiles/before/events-1440.png                 | tiles/after/events-1440.png                 |
| /events              | 375      | tiles/before/events-375.png                  | (covered by /events 1440 + EventCard polish; mobile shape unchanged at this viewport) |
| /categories/owambe   | 1440     | (n/a - new audit)                            | image-relevance/category-owambe-1440.png    |
| /events/browse/sydney| 1440     | (n/a - new audit)                            | image-relevance/city-sydney-1440.png        |

## What changed (visible)

### Tiles
- **CityRailTile** - was full-bleed dark photo with city name + event count overlaid in white. Now: image-top in `aspect-[3/2]` with city name on a darkened-gradient label band along the lower edge of the image; white card body below with event count + arrow.
- **FreeWeekendTile** - was full-bleed dark photo with date / title / venue / CTA stacked over the photo. Now: image-top with gold "Free" status pill on darkened gradient; white card body below with date eyebrow (gold-800), title, venue, RSVP CTA.
- **ThisWeekCard** - kept its separated structure but moved off raw `gold-700`/`ink-900`/`ink-400` palette onto the design tokens (`--surface-0`, `--text-primary`, `--brand-accent-strong`, `--text-secondary`). Aspect tightened from `16/9` to `3/2`. Category pill switched from dark `bg-ink-900/75` to `bg-[var(--surface-0)]/95` so we never stack white text on a potentially-light photo.
- **EventCard (canonical)** - same token migration. Hover state lifts the card (`-translate-y-0.5`) and uses a wider, longer shadow. Image hover transition lengthened from 500 ms to 700 ms `ease-out` to match the rest of the rail family.

### Rails
- **SnapRail / SnapRailScroller** - arrow buttons, progress bar, eyebrow accent line, eyebrow text, View-all link, and ProgressBar all moved onto the design tokens. Arrow buttons gain a 2-px lift on hover and a full focus-visible ring with `ring-offset-2`. Progress fill now uses `--brand-accent-strong` against a `--surface-2` track for AA contrast on light section backgrounds.
- **CulturalPicksRail tab strip** - active pill changed from `bg-gold-500` (which violated the gold-on-light rule) to `bg-[var(--color-navy-950)] text-white` for the maximum-contrast on/off pattern. Inactive pills keep the white-card style with a hover lift.

### Homepage
- Now ships 11 distinct rail surfaces (10 spec rails + the bento hero row). Order: This Week → This Weekend → Free → Cultures (Cultural Picks) → Trending → Live Vibe → Just Added → Editor's Picks → Cities → Community → Featured Venues. Each ships behind a Suspense boundary or a static check; the Suspense-streamed ones keep their skeleton fallbacks.
- New `EventRailSection` primitive lets the homepage compose typed-event rails from the existing `upcoming` query without re-fetching.
- New `FeaturedVenuesSection` groups the upcoming pool by `venue_name`, sorts by event count, and renders a venue tile that mirrors the city tile (image-top, darkened-gradient label band carrying the venue name only, white card body with city + event count + arrow).

### Image relevance (Pexels)
- Cultural-relevance query map for 18 hero cultures + Tier-2 slugs + general categories. Bare slugs replaced with descriptive multi-word queries that bias Pexels toward concrete cultural cues (instruments, dress, ritual objects, settings).
- Landmark-relevance query map for the 20 launch AU cities + 14 international markets.
- API call adds `&size=large`, filters to portraits >= 800x1200 (cities) or landscapes >= 1200x800 (categories), then samples from the top 5 results so Pexels' top-of-relevance pool stays fresh per slug.
- `unstable_cache` keys bumped to `pexels-category-photo-v2` and `pexels-city-photo-v2` so existing entries do not poison the rebuilt queries.

### Design tokens (DESIGN-SYSTEM.md v2.1)
- New section 6.2.1 codifies the separated-card tile pattern and the one allowed image-band overlay (place-name on darkened gradient on city / venue tiles).
- Anti-Patterns (15) gains three entries: no event meta on photography, no multi-line copy in gradient bands, no `--brand-accent` (gold-400) on light card surfaces.

## Quality gates

| Gate                     | Status                            |
|--------------------------|-----------------------------------|
| `npx tsc --noEmit` (src) | green - no source errors          |
| `npx eslint src/`        | green - 0/0                       |
| `npm run build`          | green - 122/122 static pages, 9.5 s compile |
| Lighthouse (mobile, prod warm-cache) | deferred to post-merge run on Vercel preview - do not block per docs/perf/v2/closure-report.md |
| axe-core                 | run on Vercel preview after merge |

## Items still to verify on the Vercel preview

These are the gates that are documented in the project to be run on a warmed Vercel preview, not localhost dev. They are queued for the project manager to run after merge:

1. Lighthouse mobile median-of-5 on `/`, `/events`, `/categories/owambe`, `/events/browse/sydney`.
2. axe-core accessibility scan on the same four routes.
3. Visual regression at the seven canonical viewports listed in BUILD-STANDARDS.md.

There are no `[deferred]` items in this batch's scope. The DESIGN-SYSTEM.md update is committed with the `[SHARED]` prefix per CLAUDE.md.
