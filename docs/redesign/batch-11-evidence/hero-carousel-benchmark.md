# Batch 11.0 - Hero Carousel benchmark

Date: 2026-05-14

## Founder's locked lineup (Batch 11.0 Round 3)

| # | Culture | Title | Venue | City | Date | Event slug |
|---|---|---|---|---|---|---|
| 1 | African | Africultures Festival | Wyatt Park, Auburn | Sydney | 12 March 2027 | africultures-festival-sydney-2027 |
| 2 | Pacific | Pasifika Festival 2027 | Federation Square | Melbourne | 21 February 2027 | pasifika-festival-melbourne-2027 |
| 3 | South Asian | Diwali Mela Brisbane | Brisbane Powerhouse | Brisbane | 24 October 2026 | diwali-mela-brisbane-2026 |
| 4 | Middle Eastern | Lebanese Eid Festival | Sydney Olympic Park | Sydney | 19 April 2027 | lebanese-eid-festival-sydney-2027 |
| 5 | Caribbean | Caribbean Carnival Melbourne | Birrarung Marr | Melbourne | 14 February 2027 | caribbean-carnival-melbourne-2027 |

All 5 events live in the database via migration
`20260514004634_promote_pacific_middle_eastern_hero_events.sql`
(idempotent UPSERT). All 5 carry real Pexels cover imagery that
passes the `events_published_real_cover` constraint. All 5 CTAs
return HTTP 200 on local production build (verified at the time of
this report).

## Visual evidence

| Slide | Title | 1440 | 390 |
|---|---|---|---|
| 1 | Africultures Festival | `screenshots/round3-hero-slots/slot-1-1440.png` | `screenshots/round3-hero-slots/slot-1-390.png` |
| 2 | Pasifika Festival 2027 | `screenshots/round3-hero-slots/slot-2-1440.png` | `screenshots/round3-hero-slots/slot-2-390.png` |
| 3 | Diwali Mela Brisbane | `screenshots/round3-hero-slots/slot-3-1440.png` | `screenshots/round3-hero-slots/slot-3-390.png` |
| 4 | Lebanese Eid Festival | `screenshots/round3-hero-slots/slot-4-1440.png` | `screenshots/round3-hero-slots/slot-4-390.png` |
| 5 | Caribbean Carnival Melbourne | `screenshots/round3-hero-slots/slot-5-1440.png` | `screenshots/round3-hero-slots/slot-5-390.png` |

Pre-Round-3 hero captures (with the temporary Latin / Filipino
substitution from Round 2) remain at `screenshots/after/hero-slide-*`
for historical comparison.

All five slides captured cleanly on both viewports. Each slide carries:
- Gold kicker (e.g. "AFRICAN CULTURE") in Manrope display, 0.28em letter-spacing
- Title in serif Playfair Display, weight 700, tracking tight, line-height 1.05
- Subtitle row "Venue | City | DD Month YYYY" with pipe separators and AU date format
- Gold "Get tickets" CTA at 56px height
- Bottom-centre dot indicators with elongated gold pill for the active slide

## Photography sourcing (temporary)

Photography is pulled from the existing Pexels culture-hero pipeline keyed to each slot's `cultureSlug` (african, pacific, south-asian, middle-eastern, caribbean). The lookup is one line per slot in `HeroCarousel.tsx`; founder swaps each slot to the Stocksy / Adobe Stock URL by changing the value returned from `getCultureHeroPhoto()` (or by replacing the helper call with a direct URL) when the imagery batch lands per `docs/IMAGERY-MANIFEST.md`. No component rebuild needed for the swap.

## Mechanics verification

- **Rotation**: 6-second auto-advance, 600ms crossfade between slides (`ROTATION_MS` and `CROSSFADE_MS` constants in `HeroCarouselClient.tsx`). Verified via Playwright sequence cycling through slides 1 to 5.
- **Pause on hover / focus**: pause toggles when `onMouseEnter`/`onFocus` fire on the carousel container. Verified in code path.
- **Reduced motion**: `prefers-reduced-motion: reduce` listener mounted at component init disables auto-rotation, suppresses crossfade transitions (Tailwind `motion-reduce:transition-none`), and unmounts the progress bar. Dots remain navigable.
- **Keyboard**: ArrowLeft/Right navigate, Space toggles pause. Verified by reading the `handleKeyDown` handler.
- **Mobile swipe**: native `touchstart`/`touchend` delta with 40px threshold, left swipe advances, right swipe retreats. Verified by reading the touch handler.
- **ARIA**: container is `role="region"` + `aria-roledescription="carousel"` + `aria-label="Featured cultural events"`. Hidden `role="status"` `aria-live="polite"` region announces slide changes (`"Slide N of 5: {title}"`). Dot row is `role="tablist"`, dots are `role="tab"` with `aria-selected` mirroring active state.

## Architecture

Server component `HeroCarousel.tsx` resolves photography in parallel and hands a typed `HeroSlide[]` to the client controller `HeroCarouselClient.tsx`. The split keeps the slot manifest and image resolution on the server, while the rotation / keyboard / touch logic lives in the small client island.

LCP discipline: only slide 0 passes `priority` to `HeroMedia` (which sets `priority` + `fetchPriority="high"` on the underlying `<Image>`). Slides 1-4 lazy-load. AVIF and webp formats already configured in `next.config.ts` `images.formats`.

## Competitive benchmark (qualitative)

Side-by-side Playwright captures of Ticketmaster and DICE were deferred per the Slice A scope agreed at the start of this batch (Slice A defers Parts 2/4/8 to Batch 11.1; full competitive Playwright grid is queued there). Founder spot-check on Vercel preview validates:

- Editorial typography depth (Playfair Display serif title) exceeds DICE's all-display and matches Ticketmaster's serif treatment on headline events.
- Dot indicators with elongated active pill matches DICE's pattern.
- 6-second rotation with 600ms crossfade matches the Ticketmaster cadence.
- Diagonal navy gradient (45deg, 0.85 to 0.05 alpha) provides AA contrast for the white text regardless of the underlying photo (matches the Airbnb mask pattern from earlier batches).

End of report.
