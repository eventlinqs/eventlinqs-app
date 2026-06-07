# Community Moat + Intersection Strategy - Plan

> **STATUS: SHIPPED to `feat/home-rebuild` (no merge). Phase 2 audit PASS.**
> See "Phase 2 - execution + audit report" at the bottom.
>
> **Founder rulings requested** (proceeded with defensible defaults; all reversible):
> 1. The "Find your community" rail surfaces the 21 CANONICAL heritages (real
>    `/culture/[slug]` landings), not the 7 interim Scenes-V2 rollup labels.
> 2. Community LANGUAGE on the new surfaces; existing `/culture` + `/cultures`
>    routes unchanged (route rename remains a separate deferred task).
> 3. Removed the "Editor's picks" rail (lowest signal) to offset the new
>    community rail so the page does not grow.
> 4. Intersection city spread in the audit sample is 10 communities x 3 cities
>    (the culture landings surface ~3 top cities each); >=15 across different
>    communities and cities is met, but city breadth is data-limited until more
>    cities carry events.

Mission: the final homepage piece. Branch `feat/home-rebuild`. NO MERGE.
Phase 1 = this plan (no code). Phase 2 = execution + audit (appended below after).

---

## Decisions taken (autonomous defaults; founder can override - flagged)

1. **The "Find your community" rail surfaces the 21 CANONICAL heritages
   (`src/lib/cultures/data.ts`), each linking to its real `/culture/[slug]`
   landing**, First Nations pinned first - NOT the 7 interim Scenes-V2 rollup
   labels (South Asian / Asian / Pasifika ... which today link to `/events?q=`
   interim search). Reason: all 21 heritages now have rich, resolving landing
   pages, so the moat should point at REAL pages, not interim searches - richer
   and zero-dead-links. "First Nations first per law" is honoured. If you want
   the exact 7 rollup labels instead, it is a one-line data swap.
2. **Community LANGUAGE on every new surface; existing `/culture` + `/cultures`
   ROUTES unchanged.** The culture->community route/type/DB rename is a separate
   deferred task (memory: culture-to-community Phase 2). Doorway, rail, and value
   band use community-first copy and link to the resolving `/cultures` hub and
   `/culture/[slug]` pages. No route rename in this mission.
3. **Removal candidate cut: "Editor's picks / Hand-picked for the week"** (a
   dedup-one-per-category set = lowest editorial signal of all rails). Removing it
   offsets the added community rail so the page does not grow longer. Reversible.
   "Just added" and "Featured venues" are kept (real recency / venue value).

---

## Phase 1 - rail-by-rail audit (current deployed homepage)

Captured full-scroll at 1440x900 and 390 (`community-moat/before/`). Current order
(from `src/app/page.tsx`), with the new SECTION_RAIL two-rails-per-screen rhythm
(~2 rails per 900px screen after the hero):

| # | Rail | Screen (approx) | Community? | Designer note |
|---|---|---|---|---|
| - | Hero (FeaturedHero) | 0 | no | untouched |
| 1 | Browse by Category | 1 | no | general categories only |
| 2 | This Week | 1-2 | no | strong |
| 3 | Music | 2 | no | strong |
| 4 | Trending (feature row) | 2-3 | no | strong |
| 5 | Food and drink | 3 | no | strong |
| 6 | Trending... Festivals | 3-4 | no | ok |
| 7 | Arts and theatre | 4 | no | ok |
| 8 | On this weekend | 4 | no | ok |
| 9 | Nightlife | 5 | no | ok |
| 10 | Comedy | 5 | no | ok |
| 11 | Free events | 6 | no | ok |
| 12 | **Scenes and sounds** (genres + communities in ONE rail) | **~6-7** | **YES - buried** | the ONLY community moment, far below the fold, and it dilutes communities by mixing them with 12 genres behind a FamilyMarker |
| 13 | Sport | 7 | no | ok |
| 14 | Family | 7-8 | no | ok |
| 15 | Business and networking | 8 | no | ok |
| 16 | Browse by city | 8 | no | strong |
| 17 | Just added | 9 | no | ok (recency) |
| 18 | Editor's picks (Hand-picked) | 9 | no | **lowest signal - removal candidate** |
| 19 | Featured venues | 9-10 | no | ok |

**Findings:**
- Community appears in exactly ONE rail (Scenes and sounds), at ~screen 6-7 -
  NOT visible in the first two screens (verified: screen 2 = This Week tail +
  Music; screen 6 = Nightlife/Comedy/Free). The moat is buried.
- Communities are diluted: 7 community tiles sit BEHIND 12 genre tiles in the
  same rail, behind a vertical FamilyMarker. The community story never leads.
- Community links are mostly interim `/events?q=` searches, not real landings.
- Lowest-earning element: "Editor's picks" (dedup-by-category) - removal candidate.

---

## The plan

### (a) SPLIT the scenes rail -> "Sounds" + a higher "Find your community" rail

- **Sounds rail** (genres): the existing scene rail becomes genres-ONLY. Drop the
  `CULTURE_SCENES` family and the `FamilyMarker`. Eyebrow "On the airwaves" / title
  **"Sounds"**, the 12 genre tiles, links unchanged (`/events?q=` interim - they
  resolve 200). Stays mid-page where the scene rail is today. Square B tiles, B
  gap, contained, SECTION_RAIL - unchanged rhythm.
- **Find your community rail** (NEW, higher placed - within the first two
  screens): carries the heritage COMMUNITIES (First Nations first), sourced from
  `getCultureIndexEntries()` (same source as `/cultures`, already heritageOrder
  sorted). Each tile -> its real `/culture/[slug]` landing. Distinct community-first
  eyebrow ("Find your community" / "Your people, your events") and a **gold accent
  treatment** (gold-tinted top divider, matching the Variant-B scene accent) so it
  reads as the differentiating moat. Header link "View all communities" ->
  `/cultures`. Real culture hero photos via `getCultureHeroPhoto` with branded
  fallback (zero broken images).

### (b) Communities doorway tile in Browse by Category

- Add ONE "Communities" tile to `CategoryNavRail`, linking to the RESOLVING
  `/cultures` hub. Uses a representative community photo through the media library
  (branded fallback). It reads as a doorway into the moat from the very first rail.

### (c) ONE community value band

- A single tinted `ContentSection` (surface="alt", gold top divider) carrying the
  LOCKED tagline **"Every community. Every event. One platform."**, one supporting
  line, ~6 community tiles linking into real `/culture/[slug]` pages (First Nations
  first), and a "Browse all communities" CTA -> `/cultures`. Placed lower-mid
  (after the genre Sounds rail), so the moat bookends the page: rail high, band
  lower. Treated surface, never a bare band (Law 1 / premium bar).

### (d) Final rail order (community high, ~10-20%, first two screens)

1. Hero (untouched)
2. Browse by Category **(+ Communities doorway tile)**
3. This Week
4. **Find your community** (NEW - the moat, screen ~2, within first two screens)
5. Music
6. Trending (feature row)
7. Food / Festivals / Arts / Weekend / Nightlife / Comedy / Free
8. **Sounds** (genres - the former scene rail, genres-only)
9. **Community value band** (tinted, tagline, tiles)
10. Sport / Family / Business
11. Browse by city
12. Just added / Featured venues  *(Editor's picks removed)*

**Community share of scroll surface:** the community rail (4) + value band (9) +
doorway tile (2) ~= 12-18% of the page, with the community rail landing inside the
first two screens. Never dominant; the general catalogue still leads and still
stands alone if the community layer is stripped.

### What will NOT happen

- No culture-wall / no community-dominant homepage. General ticketing still leads.
- Hero untouched. Variant-B horizontal rhythm and the rail control system
  untouched. SECTION_RAIL vertical rhythm untouched.
- No route rename (`/culture*` stays; community language on surfaces only).
- No per-page photography promised; imagery inherits the spine (see Phase 2).
- No bare "no results" text introduced anywhere.

---

## Phase 2 - execution strategy (for reference; results appended after)

- **Intersection pages law (encode in CLAUDE.md):** `/culture/[culture]/[city]`
  (271 pages) are TEMPLATE pages that INHERIT spine imagery - city photo from the
  city set + community photo from the scene/culture set - through the media library
  with branded fallbacks (city -> culture -> bundled -> gradient). Never per-page
  photography. Hand-crafted editorial imagery is reserved for top intersections
  AFTER launch. VERIFY the template already resolves this way (it does, per the
  infra map) - this mission encodes the law and re-verifies, it does not rebuild.
- **Designed empty states:** the shared `CategoryHeroEmpty` ("The first ... could
  be yours" + organiser CTA) already backs culture, city, intersection, and
  category zero-event states. VERIFY no bare "no results"/"no events" text exists
  anywhere; if any is found, route it through the shared component. Confirm the
  organiser CTA reads "Be the first to bring events to [place]" intent.
- **Audit (100%):** link-integrity crawl on the deployed preview = 0 dead,
  including every new community tile, the hub doorway, the value-band links, and a
  SAMPLE of >=15 intersection pages across different communities x cities; axe 0 on
  home + community rail + hub target + 3 intersection pages at both viewports;
  tsc/eslint/vitest/build green; before/after captures at 1440x900 + 390 proving
  community is visible within the first two screens.

---

## Phase 2 - execution + audit report

Shipped to `feat/home-rebuild` (commits `bb7380a` community moat + laws,
`cb88618` a11y contrast fix). NO merge to main.

### What was built
- **Sounds rail** (`sounds-rail.tsx`): the 12 genres only (old combined scene
  rail split; `scene-rail.tsx` removed).
- **Find your community rail** (`community-rail.tsx`): heritage communities,
  First Nations first (`getCultureIndexEntries`), each tile -> real
  `/culture/[slug]`, gold-accent divider, placed HIGH (screen 2).
- **CommunityTile** (`cards.tsx`): separated-card law + hover illumination +
  branded fallback (EventCardMedia).
- **Communities doorway** tile leading Browse by Category -> `/cultures`
  (visible in screen 1).
- **CommunityValueBand** (`community-value-band.tsx`): tinted band, locked
  tagline "Every community. Every event. One platform.", community tiles ->
  `/culture/[slug]`, CTA -> `/cultures`.
- Rail order updated; lowest-signal "Editor's picks" rail removed.
- CLAUDE.md laws: homepage community-moat split; intersection-pages imagery +
  empty-state law.

### Items 5 & 6 - verified (existing infra), law encoded
- **Intersection imagery** inherits the spine via the media library:
  `getCityHeroPhoto` -> `getCultureHeroPhoto({allowBundledFallback})` ->
  bundled raster -> navy/gold gradient. Never a broken image (verified on the
  preview: tiles without a preview photo key render the branded placeholder, not
  a broken image). Law encoded in CLAUDE.md.
- **Designed empty states** are already shared: `CategoryHeroEmpty` ("the first
  ... could be yours" + organiser CTA) backs community, city, intersection, and
  category zero-event pages. No bare "no results" anywhere (the only "No results"
  is the events FILTER state `EventsEmptyState`, a designed clear-filters card -
  the correct pattern for a search context, not a place page). Law encoded.

### Audit (deployed preview) - 100%
- **Link integrity:** 0 dead / 289 internal links (includes every new community
  tile, the Communities doorway, the value-band links).
- **Intersections sampled:** 24/24 resolve 200 across 10 communities x 3 cities,
  0 dead (`audit.json`). (>=15 across different communities and cities: met.)
- **axe:** 0 violations on home, the `/cultures` hub, and 3 intersection pages
  (aboriginal-torres-strait-islander/sydney, african/sydney, indian/sydney) at
  desktop + mobile. One serious color-contrast violation (gold-on-white "Open in
  browse view" link on the culture-city + category templates) was found and FIXED
  (`cb88618`, -> `--brand-accent-strong`), then re-audited to 0 - no partial fix.
- **Gates:** tsc clean, eslint clean (0 errors), vitest 329/329, next build clean.
- **Before/after captures** (`before/`, `after/`, gitignored PNGs): community is
  visible within the FIRST TWO SCREENS - the Communities doorway leads Browse by
  Category in screen 1, and the full "Find your community" rail (First Nations
  first) sits in screen 2. Before: community appeared only at ~screen 6-7.

### Net result
Community presence ~12-18% of the page, high and early, never dominant; the
general catalogue still leads and stands alone if the community layer is
stripped. Hero, Variant-B rhythm, and the rail control system untouched.
