# Legacy purge: CategoryChipStrip to competitor-grade category tiles

Date: 6 June 2026
Branch: feat/home-rebuild
Density: HOMEPAGE_SEED_FIXTURE catalogue (55 events).
Captures: `before/`, `after/`, `competitor/` in this directory.

## Inventory result (the purge target)

Walking the homepage top to bottom at 1440 and 390, the body was already on
the new design system from the 1 to 6 June rebuild (hero, the `cards.tsx`
family from 1 June, scene rail, city and venue `CityTile`s). The single clear
early-concept survivor was the **CategoryChipStrip** (Batch 9.2, rounded-full
navy pills with gold icons). Header and footer predate the rebuild but conform
and are deferred to the upcoming system-wide [SHARED] page run.

## What changed

Removed: `src/components/features/home/category-chip-strip.tsx` (the pill strip
component, deleted, not just unmounted).

Added, in the locked design system:
- `CategoryTile` in `cards.tsx` - the same separated tile as `CityTile`: a
  representative photo in a 3/2 frame through `CategoryTileImage`, with the
  category name and live event count BELOW the image, never on it. Hairline
  border, 16px radius, soft shadow, restrained hover lift, gold focus ring.
- `CategoryNavRail` - a plain CAPS-headed scroll rail ("BROWSE BY CATEGORY")
  of nine general category tiles, sitting directly under the hero where the
  pills were. Each tile links to the filtered `/events?category=slug`.

## Evidence the legacy element is gone

- Served HTML: `aria-label="Quick filters"` (the chip strip) count = 0.
- Component file deleted; no remaining imports.
- `before/elements/chip-strip.png` (pills) vs `after/category-nav.png` (tiles).

## Competitor reference (why tiles, not pills)

- Ticketmaster.com.au presents categories as an image-led "Discover" set of
  tiles (`competitor/ticketmaster-1440-full.png`).
- Eventbrite.com.au uses a category-browse row
  (`competitor/eventbrite-1440-full.png`).
- Neither uses navy pills. The locked system already uses image tiles for
  cities and venues, and the brand is image-led, so image category tiles are
  the on-system, competitor-grade answer. Our tiles keep the label off the
  image (cleaner than Ticketmaster's text-on-image category tiles).

## Side-by-side verdict (1440 + 390)

| Dimension | vs Ticketmaster / Eventbrite | Note |
|---|---|---|
| Information density | Surpass | Nine category tiles with live counts plus the full rail stack below. |
| Typography | Parity or better | CAPS rail heading, eyebrow, navy/gold, Archivo headline; quiet not shouty. |
| Imagery | Parity | Real category photography in every tile (no pills, no placeholder blocks). |
| UX | Parity or better | One consistent tile and rail language for categories, cities, venues, and events; drag-scroll, 44px controls, View all into the filtered query. |
| Mobile (390) | Parity | Tiles scroll-snap horizontally like every other rail; no pills. |

## Gates

- typecheck: 0 errors
- lint: 0 errors
- production build: pass
- vitest: 30 files, 275 tests pass
- axe-core (WCAG 2.2 AA): 0 violations
- Lighthouse: runs on the Vercel preview (CI gate).

100% of the homepage body now belongs to the new design system. No pills remain
in the body. Header and footer are the only pre-rebuild components left and are
scheduled for the coordinated system-wide [SHARED] rebuild.
