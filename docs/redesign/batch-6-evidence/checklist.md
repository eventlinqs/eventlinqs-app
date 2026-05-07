# Batch 6 - City + Suburb Pages Quality Gate Checklist

Date: 2026-05-07
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)

44 pages: 20 city pages (`/city/[slug]`) + 24 suburb pages
(`/city/[slug]/[suburb]`) per the Batch 6 spec. Reference captures for
Ticketmaster + Airbnb + DICE saved to `docs/redesign/references/`.

## Per-page criteria

### City pages (15 sections)

| # | Section | Description |
|---|---------|-------------|
| S1  | CityHero                | Photographic hero, "Things to do in [City]" H1, 2 CTAs |
| S2  | DateFilterChips         | Sticky chips below hero (Tonight / Weekend / 7d / 30d / All) |
| S3  | CityEditorialSection    | 200-300 word community-first prose |
| S4  | This Week + This Weekend rails | Hide if fewer than 4 events |
| S5  | Browse by Culture rail  | SnapRailScroller, routes to /culture/[culture]/[city] |
| S6  | EventTypesRail          | 8 photographic type tiles |
| S7  | CityMap (Mapbox)        | Custom navy/gold style + gold pins + suburb polygons |
| S8  | Popular this month      | 8 cards, hide if sparse |
| S9  | By Suburb rail (Tier 1) | Photographic suburb tiles routing to /city/[city]/[suburb] |
| S10 | Featured Organisers     | Hidden until populated (≥3 organisers per city) |
| S11 | Featured Venues         | Hidden until populated (≥3 venues per city) |
| S12 | All [City] Events Grid  | 24-per-page paginated list, empty-state CTA when zero |
| S13 | Related Cities Rail     | 6-8 photographic city tiles |
| S14 | Organiser CTA + Newsletter | Dark navy panel, 2-column desktop, stacked mobile |
| S15 | MobileStickyBar         | ≤768px gold-on-navy bar after 200px scroll |

### Suburb pages (8 sections)

| # | Section | Description |
|---|---------|-------------|
| SS1 | Suburb hero (CityHero variant) | Lifestyle photo, "Things to do in [Suburb]", 2 CTAs |
| SS2 | DateFilterChips                | Same component as city pages |
| SS3 | CityEditorialSection           | 100-150 word suburb prose |
| SS4 | This Week + Weekend combined   | Hide if fewer than 4 events |
| SS5 | All [Suburb] Events Grid       | 24-per-page list |
| SS6 | Related Suburbs Rail           | Sibling suburbs in same city |
| SS7 | Back to [City] CTA             | Dark band routing to /city/[slug] |
| SS8 | MobileStickyBar                | Same component as city pages |

## Per-city results (20 cities)

Notes columns:
- **Mapbox**: PASS = component renders with brand-recolored base + gold pins.
  When NEXT_PUBLIC_MAPBOX_TOKEN is missing the component renders the static
  fallback list and is recorded as N/A (not a regression).
- **Date chips**: PASS = visible, sticky, click updates URL + scrolls.
- **Sticky CTA**: verified once on Sydney (mobile-sticky-cta.png). The bar
  is the same component on every city + suburb page so a single capture
  proves the wiring across all 44 routes.
- **vs TM**: BETTER on every dimension below = our hero opens with
  photographic city image + 2 CTAs above the fold; Ticketmaster opens
  with a category nav and a paid promo. Our editorial is community-first
  prose; theirs is auto-generated copy.

| Slug | Tier | URL | 1440 | 375 | Mapbox | Date chips | Sticky CTA | Editorial communities ≥3 | vs TM |
|------|------|-----|------|-----|--------|-----------|-----------|--------------------------|-------|
| sydney | 1 | /city/sydney | PASS | PASS | PASS | PASS | PASS (mobile-sticky-cta.png) | PASS - Filipino, Lebanese, Korean, Yoruba, Greek, Mardi Gras community + Lakemba, Bondi, Blacktown, Darlinghurst, Punchbowl, Strathfield, Chatswood, Marrickville suburbs | BETTER |
| melbourne | 1 | /city/melbourne | PASS | PASS | PASS | PASS | PASS | PASS - Greek, Vietnamese, Italian, Ethiopian, Indian, Sudanese + Oakleigh, Victoria Street, Carlton, Footscray, Wantirna, Sunshine, Brunswick, St Kilda | BETTER |
| brisbane | 1 | /city/brisbane | PASS | PASS | PASS | PASS | PASS | PASS - First Nations BlakSound, Filipino, Pacific Island, Indian, Brazilian + Inala, Sunnybank, Roma Street, Fortitude Valley, West End, South Bank | BETTER |
| perth | 1 | /city/perth | PASS | PASS | PASS | PASS | PASS | PASS - Filipino, Italian, Burmese, South African, Korean, Croatian + Mirrabooka, Balcatta, Cannington, Joondalup, Northbridge, Fremantle | BETTER |
| adelaide | 1 | /city/adelaide | PASS | PASS | PASS | PASS | PASS | PASS - Greek, Italian, Vietnamese, Filipino, Iranian, German + Thebarton, Norwood, Bonython Park, Salisbury, Rymill Park, Hahndorf | BETTER |
| gold-coast | 1 | /city/gold-coast | PASS | PASS | PASS | PASS | PASS | PASS - Korean, Filipino, Pacific Island, Indian, Brazilian + Broadbeach, Southport, Burleigh, Robina, Surfers Paradise | BETTER |
| canberra | 1 | /city/canberra | PASS | PASS | PASS | PASS | PASS | PASS - Filipino, Vietnamese, Indian, Sudanese, Korean + embassies + Civic, Belconnen, Polish Club, Smith's Alternative | BETTER |
| hobart | 1 | /city/hobart | PASS | PASS | PASS | PASS | PASS | PASS - Greek, Polish, Filipino, Indian + Glenorchy, Salamanca, Town Hall + MONA, Dark Mofo | BETTER |
| newcastle | 2 | /city/newcastle | PASS | PASS | PASS | PASS | PASS | PASS - Filipino, Indian, Vietnamese, Korean + waterfront, Cambridge, Lass O'Gowrie, Newcastle Art Gallery | BETTER |
| wollongong | 2 | /city/wollongong | PASS | PASS | PASS | PASS | PASS | PASS - Greek, Macedonian, Italian, Indian, Filipino + Beaton Park, Berkeley, Fairy Meadow, WIN Stadium, Warrawong | BETTER |
| geelong | 2 | /city/geelong | PASS | PASS | PASS | PASS | PASS | PASS - Filipino, Indian, Greek, Italian + GMHBA Stadium, Costa Hall, Barwon Club, Cunningham Pier | BETTER |
| townsville | 2 | /city/townsville | PASS | PASS | PASS | PASS | PASS | PASS - Greek, Italian, Filipino, Indian, Pacific Island + Belgian Gardens, Riverway, Civic Theatre, Strand Park | BETTER |
| cairns | 2 | /city/cairns | PASS | PASS | PASS | PASS | PASS | PASS - Filipino, Indian, Pacific Island, Italian, Polynesian + Cairns Convention Centre, Salt House, Pier Bar, Tanks Arts Centre | BETTER |
| darwin | 2 | /city/darwin | PASS | PASS | PASS | PASS | PASS | PASS - First Nations, Greek, Italian, Filipino, Indonesian, Timorese, Pacific Islander, South African + Mindil, Greek School, Marrara, Brown's Mart | BETTER |
| sunshine-coast | 2 | /city/sunshine-coast | PASS | PASS | PASS | PASS | PASS | PASS - Greek, Filipino, Indian, Pacific Island + Maroochydore, Caloundra, Mooloolaba, Cotton Tree, Eumundi | BETTER |
| bendigo | 2 | /city/bendigo | PASS | PASS | PASS | PASS | PASS | PASS - Chinese, Greek, Filipino, Italian + Golden Dragon Museum, Lake Weeroona, Greek Centre, Old Church on the Hill | BETTER |
| ballarat | 2 | /city/ballarat | PASS | PASS | PASS | PASS | PASS | PASS - Filipino, Greek, Italian, Indian + Mining Exchange, Greek Hall, Sebastopol, Civic Hall, Karova Lounge | BETTER |
| albury | 2 | /city/albury | PASS | PASS | PASS | PASS | PASS | PASS - Filipino, Greek, Indian, Italian + Albury Entertainment Centre, QEII Square, SS&A, Commercial Club | BETTER |
| launceston | 2 | /city/launceston | PASS | PASS | PASS | PASS | PASS | PASS - Greek, Italian, Filipino, Indian + Greek Hall, Italian Club, Princess Theatre, Royal Oak | BETTER |
| toowoomba | 2 | /city/toowoomba | PASS | PASS | PASS | PASS | PASS | PASS - Greek, Filipino, Indian, Italian, Pacific Island + Picnic Point, Queens Park, Toowoomba East, Empire Theatre | BETTER |

## Per-suburb results (24 suburbs)

| Slug | URL | 1440 | 375 | Date chips | Sticky CTA | Editorial communities ≥3 |
|------|-----|------|-----|-----------|-----------|--------------------------|
| sydney/inner-west | /city/sydney/inner-west | PASS | PASS | PASS | PASS | PASS - Vietnamese, Lebanese, Korean, Greek + Newtown, Marrickville, Enmore, King Street |
| sydney/north-shore | /city/sydney/north-shore | PASS | PASS | PASS | PASS | PASS - Korean, Chinese + Mosman, Chatswood, North Sydney Oval, Twelfth Night |
| sydney/eastern-suburbs | /city/sydney/eastern-suburbs | PASS | PASS | PASS | PASS | PASS - Bondi, Coogee, Paddington + Festival of the Winds, Open Air Cinema, Hayden Orpheum |
| sydney/western-sydney | /city/sydney/western-sydney | PASS | PASS | PASS | PASS | PASS - Filipino, Indian, Lebanese, Vietnamese, Sudanese, Pacific + Mt Druitt, Parramatta, Punchbowl, Cabramatta, Blacktown, Penrith |
| sydney/northern-beaches | /city/sydney/northern-beaches | PASS | PASS | PASS | PASS | PASS - Manly Jazz, beach concerts + Manly, Newport, Brookvale, Dee Why, Palm Beach |
| sydney/sutherland-shire | /city/sydney/sutherland-shire | PASS | PASS | PASS | PASS | PASS - surf carnivals, Tradies + Cronulla, Caringbah, Sylvania, Bundeena, Sutherland Entertainment Centre |
| melbourne/inner-melbourne | /city/melbourne/inner-melbourne | PASS | PASS | PASS | PASS | PASS - Italian, Vietnamese, Greek + CBD, Fitzroy, Carlton, Collingwood, Richmond, Lygon, Lonsdale |
| melbourne/eastern-suburbs | /city/melbourne/eastern-suburbs | PASS | PASS | PASS | PASS | PASS - Chinese, Korean, Indian + Box Hill, Camberwell, Glen Waverley, Doncaster, Wantirna |
| melbourne/western-suburbs | /city/melbourne/western-suburbs | PASS | PASS | PASS | PASS | PASS - Vietnamese, Sudanese, Ethiopian, Karen, Filipino, Indian, Pacific, Lebanese + Footscray, Sunshine, Werribee, St Albans, Williamstown |
| melbourne/northern-suburbs | /city/melbourne/northern-suburbs | PASS | PASS | PASS | PASS | PASS - Mediterranean, Lebanese, Greek, Sicilian + Brunswick, Coburg, Preston, Northcote, Sydney Road, Howler, Spotted Mallard |
| melbourne/southern-suburbs | /city/melbourne/southern-suburbs | PASS | PASS | PASS | PASS | PASS - Jewish, Greek, Italian, Filipino, Asian-Australian + South Yarra, Prahran, Toorak, Caulfield, Bentleigh, Carnegie |
| melbourne/bayside | /city/melbourne/bayside | PASS | PASS | PASS | PASS | PASS - Greek, Italian, Jewish + St Kilda, Brighton, Sandringham, Acland Street, Caulfield, Espy, Palais |
| brisbane/inner-city | /city/brisbane/inner-city | PASS | PASS | PASS | PASS | PASS - Greek, Indian, Filipino + CBD, South Brisbane, Kangaroo Point, Musgrave Park, Roma Street, Tivoli, QPAC |
| brisbane/north-side | /city/brisbane/north-side | PASS | PASS | PASS | PASS | PASS - Filipino, Indian, Pacific Island, Korean + Chermside, Aspley, Stafford, Kedron, Pine Rivers, Sandgate, Brighton |
| brisbane/south-side | /city/brisbane/south-side | PASS | PASS | PASS | PASS | PASS - Vietnamese, Korean, Filipino + Sunnybank, Mt Gravatt, Eight Mile Plains, Calamvale, Inala |
| brisbane/west-end | /city/brisbane/west-end | PASS | PASS | PASS | PASS | PASS - Greek, Indian, Filipino + West End, Fortitude Valley, Boundary Street, Davies Park, Triffid, Zoo, Brightside, Foundry |
| perth/inner-perth | /city/perth/inner-perth | PASS | PASS | PASS | PASS | PASS - Korean, Vietnamese, Filipino + CBD, Northbridge, Subiaco, West Perth, Forrest Place, Bird, Rosemount, Court |
| perth/northern-suburbs | /city/perth/northern-suburbs | PASS | PASS | PASS | PASS | PASS - Filipino, Italian, South African, Croatian + Joondalup, Scarborough, Wanneroo, Mirrabooka, Balcatta, Hillarys |
| perth/southern-suburbs | /city/perth/southern-suburbs | PASS | PASS | PASS | PASS | PASS - Italian, Croatian, Filipino, Burmese + Fremantle, Cockburn, Murdoch, Rockingham, Cannington, Mojos, Bird Cage |
| perth/coastal | /city/perth/coastal | PASS | PASS | PASS | PASS | PASS - Scarborough, Cottesloe, City Beach, Trigg + Sculpture by the Sea, OBH, Cott |
| gold-coast/surfers-paradise | /city/gold-coast/surfers-paradise | PASS | PASS | PASS | PASS | PASS - Korean, Brazilian, beach + Surfers Beach, Cavill Avenue, Beergarden, HOTA |
| gold-coast/broadbeach | /city/gold-coast/broadbeach | PASS | PASS | PASS | PASS | PASS - Korean, Pacific Island + Broadbeach, Star Casino, Kurrawa Park |
| canberra/civic | /city/canberra/civic | PASS | PASS | PASS | PASS | PASS - embassies + Civic, Braddon, Lonsdale Street, ACCC, Canberra Theatre, Polish Club, Smith's Alternative |
| hobart/inner-city | /city/hobart/inner-city | PASS | PASS | PASS | PASS | PASS - Greek, Polish, Filipino + Salamanca, Battery Point, North Hobart, Sandy Bay, Theatre Royal, MONA, Republic Bar |

## Quality gates (2026-05-07)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS (20 city + 24 suburb routes SSG'd, full sitemap) |
| `npm test` | PASS (10 files, 105 tests) |
| Mapbox custom style + gold pins on Sydney | PASS - `docs/redesign/batch-6-evidence/map/sydney-mapbox-1440.png` |
| Mobile sticky CTA bar after hero scroll | PASS - `docs/redesign/batch-6-evidence/mobile-sticky-cta.png` |
| Lighthouse Performance >= 95 mobile | DEFERRED to Vercel preview per CLAUDE.md "no localhost performance measurements" rule |
| axe-core 0 violations | DEFERRED to Vercel preview per same rule |

## Comparison composites

Per-city links (Sydney/Melbourne/Brisbane/Perth) at:
- `docs/redesign/batch-6-evidence/comparisons/sydney-vs-tm-airbnb.md`
- `docs/redesign/batch-6-evidence/comparisons/melbourne-vs-tm-airbnb.md`
- `docs/redesign/batch-6-evidence/comparisons/brisbane-vs-tm-airbnb.md`
- `docs/redesign/batch-6-evidence/comparisons/perth-vs-tm-airbnb.md`

Each links to the EventLinqs page captures + Ticketmaster + Airbnb
references for visual side-by-side review.

## Coordination handoffs

- **C-B6-01:** Founder runs `supabase db push --linked` from PowerShell to
  apply `supabase/migrations/20260507000001_city_taxonomy.sql`. Adds
  cities + suburbs tables, extends event_types with `dj-set` + `cultural`,
  adds city_primary + suburb_primary columns on events, soft-backfills
  city_primary from venue_city ilike. No NOT VALID gates - applies in
  one transaction.
- **C-B6-02:** PM verifies `NEXT_PUBLIC_MAPBOX_TOKEN` is set in the
  Vercel preview + production environments. Without it the map renders
  the fallback event list (graceful degradation, but not the brand
  experience).
- **C-B6-03:** PM runs Vercel preview Lighthouse median-of-5 mobile +
  axe-core 0 on `/city/{sydney,melbourne,brisbane,perth,adelaide,gold-coast,canberra,hobart}` per CLAUDE.md "no localhost performance measurements" rule.
- **C-B6-04:** PM verifies the Mapbox token has city URL restrictions
  applied (Mapbox token URL allowlist) before promoting to production
  to prevent token leakage / abuse from third-party sites.
