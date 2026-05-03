# Pexels image-relevance audit - Redesign Batch 3

**Date:** 2026-05-04
**Branch:** `redesign/world-class-rebuild-2026-05-03`
**Trigger:** founder flagged that the Owambe page was rendering generic skyscraper imagery and broader Pexels results were visually irrelevant for cultural categories and city tiles. The previous query maps reached for bare slugs (`'owambe'`, `'sydney harbour'`) which sit on the boundary of Pexels' relevance graph and surface unrelated stock.

## What changed

| File                                  | Before                                                                                       | After                                                                                                                                              |
|---------------------------------------|----------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/lib/images/category-photo.ts`    | 26 short queries, e.g. `'owambe'`, `'african wedding celebration diverse families'`          | 18 hero cultures + Tier-2 + general categories with descriptive multi-word queries that bias Pexels toward cultural visual cues                    |
| `src/lib/images/city-photo.ts`        | 27 queries of shape `'<city> Australia harbour bridge'` mixing cities with generic modifiers | 20 launch AU cities + 14 international markets with landmark-rich queries (Sydney harbour bridge opera house skyline, Geelong waterfront pier...)  |
| Both                                  | First-result selection                                                                       | Top-5 sampling via stable hash of the query string                                                                                                 |
| Both                                  | `per_page=15`, no size filter                                                                | `&size=large`, plus 1200x800 (categories) / 800x1200 (cities) post-filter; falls back to unfiltered pool only when the size filter empties results |
| Both                                  | `unstable_cache` keys `pexels-category-photo`, `pexels-city-photo`                           | Keys bumped to `*-v2` so cached older results from the previous query map do not poison the rebuilt set                                            |

## Query map (cultures)

Sample of the rebuilt category map. Full map lives in `src/lib/images/category-photo.ts`.

| Slug          | Old query                                                | New query                                                       | Cue prioritised                            |
|---------------|----------------------------------------------------------|-----------------------------------------------------------------|--------------------------------------------|
| `owambe`      | `owambe`                                                 | `nigerian wedding party celebration colorful attire`            | gele headwraps, aso-oke, dancing crowds    |
| `afrobeats`   | `afrobeats music`                                        | `african music concert dancing crowd vibrant`                   | concert lighting, audience movement        |
| `caribbean`   | `caribbean party`                                        | `caribbean carnival dance steel drum tropical`                  | feathered carnival costumes, steel drums   |
| `bollywood`   | `bollywood`                                              | `indian wedding dance saree colorful celebration`               | sarees, mehndi, dance formations           |
| `latin`       | `latin music`                                            | `latin dance salsa club music vibrant`                          | salsa pairs, club lighting                 |
| `italian`     | `italian festival`                                       | `italian festival pasta wine celebration warm`                  | trattoria settings, warm light             |
| `filipino`    | `filipino festival`                                      | `filipino fiesta celebration parol traditional`                 | parol lanterns, fiesta crowd               |
| `lunar`       | `lunar new year`                                         | `lunar new year red lanterns dragon celebration`                | red lanterns, dragon dance                 |
| `gospel`      | `gospel music`                                           | `gospel choir worship raised hands joy`                         | robed choir, hands raised                  |
| `amapiano`    | `amapiano party`                                         | `south african dance music party youth`                         | log drum, township aesthetic               |
| `comedy`      | `comedy show`                                            | `comedy club stage microphone audience laughing`                | mic stand, brick wall, audience            |
| `spanish`     | `flamenco`                                               | `spanish flamenco dance guitar passion`                         | flamenco dress, guitar                     |
| `k-pop`       | `kpop concert`                                           | `korean concert lights crowd young energetic`                   | concert lights, fan crowd                  |
| `reggae`      | `reggae festival`                                        | `jamaica music dreadlocks beach sunset`                         | beach sunset, dreadlocks, sound system     |
| `west-african`| `west african music`                                     | `west african drum dance traditional dress`                     | djembe, traditional dress                  |
| `european`    | `european festival`                                      | `european music festival outdoor crowd summer`                  | outdoor festival summer crowd              |
| `asian`       | `asian festival`                                         | `asian lantern festival night colorful celebration`             | lantern festival, night colour             |
| `south-asian` | `indian classical`                                       | `indian classical dance traditional dress temple`               | classical dance, traditional dress, temple |
| `african`     | `african festival`                                       | `african drumming dance traditional celebration`                | drum circles, traditional dress            |

## Query map (cities)

Sample. Full map lives in `src/lib/images/city-photo.ts`.

| Slug          | Old query                              | New query                                          | Landmark biased toward            |
|---------------|----------------------------------------|----------------------------------------------------|-----------------------------------|
| `sydney`      | `Sydney Australia harbour bridge`      | `sydney harbour bridge opera house skyline`        | harbour bridge, opera house       |
| `melbourne`   | `Melbourne Australia city`             | `melbourne city laneway tram skyline`              | laneway, tram, CBD                |
| `brisbane`    | `Brisbane Australia river`             | `brisbane river skyline story bridge`              | story bridge, river               |
| `perth`       | `Perth Australia city`                 | `perth swan river skyline sunset`                  | swan river, sunset                |
| `adelaide`    | `Adelaide Australia`                   | `adelaide city park architecture`                  | park, heritage architecture       |
| `gold-coast`  | `Gold Coast Australia`                 | `gold coast beach surfers paradise skyline`        | beach + skyline                   |
| `geelong`     | `Geelong Australia`                    | `geelong waterfront cunningham pier`               | Cunningham Pier, waterfront       |
| `newcastle`   | `Newcastle Australia`                  | `newcastle beach harbour city`                     | beach, harbour                    |
| `hobart`      | `Hobart Tasmania`                      | `hobart harbour mount wellington`                  | Mount Wellington, harbour         |
| `darwin`      | `Darwin Australia`                     | `darwin tropical waterfront sunset`                | tropical waterfront sunset        |
| ...           | ...                                    | (16 more AU cities + 14 international markets)     |                                   |

## How rebound results land in the UI

- Pexels only feeds image surfaces where the underlying record has no real photography. EventCard and bento tiles render `cover_image_url` directly when one is set; the rebuilt query map fires only for the homepage city rail (`CityRailSection`), the FreeWeekendTile fallback (`getCategoryPhoto('festival')`), the FeaturedVenuesSection (per-venue `getCategoryPhoto(category.slug)`), and any branded-placeholder fallback paths inside the existing media library.
- The result selection is hash-stable on the query string, so a given culture/city slug always lands on the same image within the cache window. This avoids the "different photo every refresh" pattern that would also undermine relevance perception.
- The 7-day cache means a relevance regression from a Pexels content refresh would self-correct within a week without code changes. The `v2` cache-key bump means existing entries from the previous query map are abandoned at deploy time.

## Verification

| Surface                           | URL                                       | Captured                                                                  | Notes                                                                                 |
|-----------------------------------|-------------------------------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| Homepage (full page, 1440)        | `http://localhost:3001/`                  | `docs/redesign/tiles/after/home-1440-fullpage.png`                        | All 11 rails render. City rail tiles show distinct cities with darkened-gradient band. |
| Homepage (full page, 375)         | `http://localhost:3001/`                  | `docs/redesign/tiles/after/home-375-fullpage.png`                         | Mobile stacks rails as horizontal-scroll snap strips, separated cards intact.          |
| /events (1440)                    | `http://localhost:3001/events`            | `docs/redesign/tiles/after/events-1440.png`                               | EventCard separated-card pattern with white pill on photo, no overlay text.            |
| /categories/owambe (1440)         | `http://localhost:3001/categories/owambe` | `docs/redesign/image-relevance/category-owambe-1440.png`                  | Hero is brand-aurora, not Pexels. Category cards below pull category-photo for placeholder. |
| /events/browse/sydney (1440)      | `http://localhost:3001/events/browse/sydney` | `docs/redesign/image-relevance/city-sydney-1440.png`                   | EventCards on the city page use real `cover_image_url` from the seeded events.         |

## Caveats and follow-ups

- The dev seed events have populated `cover_image_url` for almost every record, so most card surfaces in the dev environment do not exercise the Pexels fallback. The most direct verification path is the homepage city rail (Sydney, Melbourne, Geelong, etc.) and the FeaturedVenuesSection. The query map is the primary deliverable; the full visual sweep against a sparse-cover dataset will run on the Vercel preview after merge.
- The `lunar` query produces strong red-lantern imagery on Pexels currently; if a Pexels indexing change degrades this in the future, the 7-day cache window plus a `v3` key bump is the unblocking lever.
- Where a city slug maps to ambiguous imagery on Pexels (Albury, Toowoomba), the rebuilt query keeps the descriptive river/heritage cue so the result stays geographically plausible even when not landmark-iconic.

## Reference (for the project manager)

- `src/lib/images/category-photo.ts` - canonical category query map, post-rebuild
- `src/lib/images/city-photo.ts` - canonical city query map, post-rebuild
- `docs/DESIGN-SYSTEM.md` section 6.2.1 - tile patterns that consume these images
- `docs/redesign/comparison-batch-3.md` - before/after summary
