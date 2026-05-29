# Culture to Community Migration: Full Audit (Report Only)

Date: 2026-05-30. Status: REPORT ONLY, nothing changed. Awaiting founder go-ahead and decisions.

Founder vision (locked): the platform organises around COMMUNITY, not culture. A community is who you associate with (heritage, music genre, faith, scene). "Culture" boxes people; "community" is open and inclusive. Same treatment as the diaspora removal.

## Headline magnitude

- 1304 raw case-insensitive "cultur" occurrences across 100 files.
- "Culture" is a four-layer concept, not just copy:
  1. Visible copy (headings, labels, body, alt, OG images, email) - the sweep target.
  2. Routes and query params (`/cultures`, `/culture/[slug]`, `/culture/[slug]/[city]`, `?culture=`, `?sub_culture=`).
  3. Code identifiers (the `CultureSlug` type, `src/lib/cultures/**` and `src/lib/cultural-moments/**` modules, ~30 consumers, exported helpers, cache keys).
  4. The database: a `cultures` table plus `events.culture_primary` and `events.sub_culture` columns with FK `events_culture_primary_fkey`, seeded by 9 migrations.
- Only layer 1 is a copy sweep. Layers 2 to 4 are a coordinated engineering and database migration. Layer 4 (DB) is owned by another tab this round and is out of scope per the standing instruction "do not touch migrations, do not run supabase db push".

## Recommended phasing

- Phase 1 (this PR, safe, high value): all user-facing copy. Nav "Cultures" becomes "Communities". Headings, body, alt text, OG and Twitter images, non-locked JSON-LD, non-locked email. Routes, params, identifiers and DB unchanged. Delivers the visible vision change without breaking URLs, types, or data.
- Phase 2 (separate, coordinated): route rename plus redirects, query-param rename, identifier and module rename, and the DB table and column rename. Needs the DB-owning tab, `supabase db push`, and `[SHARED]` coordination on `next.config.ts` and CLAUDE.md.

## Locked and pending strings (DO NOT sweep without a decision)

### Main tagline "Every culture. Every event. One platform." (founder flagged as pending, leave for now)
- src/app/page.tsx:77, 84, 91 (metadata title, OG, Twitter)
- src/app/cultures/page.tsx:21 (OG description); :71 partial in hero title "Every culture. Every event."
- src/app/about/page.tsx:224 (get-involved heading)
- src/components/features/home/home-hero.tsx:117
- src/components/features/home/split-state-hero.tsx:47 (partial "Every culture. Every event.")
- src/components/features/events/featured-hero-static-shell.tsx:63 (gold-styled "culture")
- src/components/features/events/hero-carousel-client.tsx:190 (gold-styled "culture")
- src/components/templates/CityLandingPage.tsx:104
- src/components/features/home/home-schema-jsonld.tsx:30 (WebSite JSON-LD description)
- Auth emails footer: confirm-signup.html:48, magic-link.html:48, password-reset.html:48, email-change.html:48, reauthentication.html:39

### Sub-tagline "The ticketing platform built for every culture." (DECISION NEEDED)
CLAUDE.md currently locks this. The founder only named the MAIN tagline as the pending exception. It is the single highest-frequency string and appears in:
- src/components/layout/site-footer.tsx:219
- src/app/about/page.tsx:90 (hero title "Built for every culture"), :91 (subtitle)
- src/app/layout.tsx:33 (title), :43 (OG title), :51 (Twitter description)
- src/lib/help-content.ts:34, :38, :66
- src/app/api/webhooks/stripe/route.ts:1343 (HTML order email), :1417 (plain-text order email)
- src/components/features/home/home-hero.tsx:126 (h1)
- src/components/features/events/featured-event-hero.tsx:43 (lead sentence of HERO_SUBCOPY)
- src/components/templates/OrganisersLandingPage.tsx:191
- src/app/press/page.tsx:98
- src/app/legal/terms/page.tsx:37, src/app/legal/privacy/page.tsx:34
- src/app/events/page.tsx:33 (metadata)
- Numerous meta descriptions across about, careers, press, blog, cities

If the founder relocks to "...built for every community.", all of the above swap in lockstep.

### First Nations and sensitive usage (recommend NO change, founder and community sign-off only)
- src/lib/cultures/data.ts:97 "The oldest living cultures on earth", :98 "First Nations culture, led by First Nations people.", :102 to :104 story paragraphs, :123 keyword "Indigenous culture events"
- src/lib/cultural-moments/calendar.ts:45 NAIDOC blurb "the history, culture and achievements of First Nations peoples" (standard NAIDOC formulation)
- src/components/features/home/cultural-calendar-widget.tsx:149 "Culturally safe space", :287 First Nations description
- src/components/layout/site-footer.tsx:276 Acknowledgement of Country "connection to land, waters, and culture" (Reconciliation Australia standard wording)

These use "culture" in its proper anthropological and First Nations sense, not the boxing brand sense. The community-first rationale does not cleanly apply.

### Real organisation proper nouns in editorial (DO NOT touch)
In src/lib/cultures/intersection-editorial.ts there are dozens of real entity names: "Italian Cultural Institute", "Iranian Cultural Society", "Multicultural Council", "Greek Cultural Festival", "Lebanese Australian Cultural Society", "Hawaii State Foundation on Culture and the Arts", and many more. Renaming these would be factually wrong.

---

## Surface-by-surface inventory (user-facing copy, the Phase 1 sweep target)

Format: file:line - current -> proposed. AU English, no em or en dashes, no exclamation marks. Items marked LOCKED or FLAG are excluded from the sweep pending decisions.

### 1. Navigation and global chrome
- src/components/layout/site-header-client.tsx:30 - nav { label: 'Cultures', href: '/cultures' } -> label 'Communities' (href change is Phase 2)
- src/components/layout/site-footer.tsx:29 - 'By culture' -> 'By community'
- src/components/layout/site-footer.tsx:44 - 'All cultures' -> 'All communities'
- src/components/layout/site-footer.tsx:231 - DesktopColumn title "Cultures" -> "Communities"
- src/components/layout/site-footer.tsx:245 - MobileAccordion title "Cultures" -> "Communities"
- src/components/layout/site-footer.tsx:219 - sub-tagline (DECISION)
- src/components/layout/header-search-overlay.tsx:42 - tab label 'Cultures' -> 'Communities' (tab id and query value are Phase 2)
- src/components/features/home/category-chip-strip.tsx:103 - chip 'Cultural Communities' -> 'Communities'

### 2. Homepage and home components
- cultural-picks-section.tsx:121 'Made for every culture' -> 'Made for every community'; :124 'Cultural picks' -> 'Community picks'; :132 'Explore culture' -> 'Explore communities'
- section-skeletons.tsx:65 aria 'Cultural picks - loading' -> 'Community picks - loading'; :67 eyebrow and title to match above
- cultural-moments-bento.tsx:57 'Cultural moments ahead' -> 'Community moments ahead'
- cultural-calendar-widget.tsx:319 eyebrow 'Cultural Calendar' -> 'Community Calendar' (note :149, :287 First Nations FLAG)
- HeroCarousel.tsx:45 'AFRICAN CULTURE' -> 'AFRICAN COMMUNITY'; :61 'PACIFIC CULTURE'; :75 'SOUTH ASIAN CULTURE'; :87 'MIDDLE EASTERN CULTURE'; :98 'CARIBBEAN CULTURE' (all kickers); :126 sr-only 'Featured cultural events' -> 'Featured community events'
- HeroCarouselClient.tsx:132 aria-label 'Featured cultural events' -> 'Featured community events'
- home-hero.tsx:131 'cultural rhythms' -> 'community rhythms'; :117 LOCKED tagline; :126 sub-tagline DECISION
- split-state-hero.tsx:53 'Where the culture gathers.' -> 'Where the community gathers.'; :56 'Find cultural events.' -> 'Find community events.'; :85 alt 'Cultural events on EventLinqs' -> 'Community events on EventLinqs'; :47 partial tagline FLAG
- email-signup-panel.tsx:110 'cultural event updates' -> 'community event updates'
- featured-event-hero.tsx:51 'Made for every culture' -> 'Made for every community'; :214 'Every culture, every event' -> 'Every community, every event'; :219 'Made for every culture' -> 'Made for every community'; :43 sub-tagline DECISION
- cultural-picks-rail.tsx:38 aria 'Cultural picks categories' -> 'Community picks categories'
- featured-hero-static-shell.tsx:63 and hero-carousel-client.tsx:190 LOCKED tagline

### 3. Marketing and static pages
about/page.tsx: :34 'Culture-led, not generic' -> 'Community-led, not generic'; :36 body 'cultural heritages ... learn each culture' -> 'heritages ... learn each community'; :58 stat label 'Cultural heritages' -> 'Heritages'; :74 'Every culture, marketed properly' -> 'Every community, marketed properly'; :76 '21 cultural heritages' -> '21 heritages'; :90 hero 'Built for every culture' (sub-tagline DECISION); :91 subtitle (sub-tagline DECISION); :110 'every cultural event' -> 'every community event'; :117 'takes every culture seriously' -> 'takes every community seriously'; :185 'cultural events that mattered' -> 'community events that mattered'; :224 LOCKED tagline; :228 'cultural calendar' -> 'community calendar'; :11, :16 meta (sub-tagline DECISION)
careers/page.tsx: :29 'Outsized cultural reach' -> 'Outsized community reach'; :57 'Strong written culture' FLAG (workplace sense, recommend keep); :85 '(Africa-rooted cultures)' -> '(Africa-rooted communities)'; :91 '(Asia and Lunar cultures)' -> '(Asia and Lunar communities)'; :101 'home for every culture' -> 'home for every community'; :102 'cultural ticketing' -> 'community ticketing'; :119 'every cultural event' -> 'every community event'; :122 'real cultural depth' -> 'real community depth'; :11, :16 meta (sub-tagline DECISION)
press/page.tsx: :29 '18 cultural rhythms ...' -> '18 community rhythms ...' (rephrase to avoid double "community"); :65 'Culture-first discovery' -> 'Community-first discovery'; :67 'cultural rhythm' -> 'community rhythm'; :98 sub-tagline DECISION; :107 '18 cultural rhythms' -> '18 community rhythms'; :154 'cultural organisers' -> 'community organisers'; :163 'cultural rhythm' -> 'community rhythm'; :11 meta (sub-tagline DECISION)
blog/page.tsx: :45, :66, :81 'Culture spotlight' -> 'Community spotlight'; :53 'culturally rich homepage' -> 'community-rich homepage'; :81 'cultural rhythms' -> 'community rhythms'; :99 'culture spotlights' -> 'community spotlights'; :11, :16 meta 'culture spotlights' and sub-tagline DECISION
cities/page.tsx: :19, :23 meta 'culturally-relevant events' -> 'community events'; :72 subtitle same; :77 'culture rails' -> 'community rails'; :85 'culturally-relevant events' -> 'community events'
legal/terms/page.tsx:37 sub-tagline DECISION; legal/privacy/page.tsx:34 sub-tagline DECISION
not-found.tsx:18 'back to the culture' -> 'back to your community'
account/page.tsx:58 link label 'Cultures' -> 'Communities' (href Phase 2)
(auth)/signup/page.tsx:24 'events from every culture' -> 'events from every community'
events/page.tsx:33 meta 'by date, culture, city' -> 'by date, community, city' plus sub-tagline DECISION

### 4. Landing templates and feature components
- culture-organiser-cta.tsx:76 'respects {name} culture' -> 'respects {name} community'
- related-cultures-rail.tsx:79 pill 'Culture' / 'Cross-cultural' -> 'Community' / 'Cross-community'
- browse-by-culture-rail.tsx:29 railLabel '{city} by culture' -> 'by community'; :31 eyebrow 'By culture' -> 'By community'; :32 title '{city} by culture' -> 'by community'
- city-organiser-cta-panel.tsx:31 'Reach every culture across the city' -> 'Reach every community across the city'
- CultureCityLandingPage.tsx:375 railLabel and :378 title 'Other cultures in {city}' -> 'Other communities in {city}'
- CategoryLandingPage.tsx:252 'understands the culture' -> 'understands the community'
- OrganisersLandingPage.tsx:204 'Cultural business summits ...' -> 'Community business summits ...'; :191 sub-tagline DECISION
- faith/[faith]/page.tsx already community-first ("Faith community", "Communities within X"); only route href Phase 2

### 5. Data and editorial content libraries
src/lib/cultures/data.ts heroHeadlines (pattern "X culture, every season" -> "X community ..."): :203 Indian, :238 Chinese, :409 Greek, :443 Italian, :477 Korean, :511 Japanese, :545 Pasifika, :579 Maori, :613 Persian, :645 Turkish, :678 Arab; :581 and :583 Maori "distinct culture" -> "distinct community"; :97, :98, :102 to :104, :123 First Nations FLAG; :616 contains "diaspora-pop" PRE-EXISTING VIOLATION (see below)
src/lib/faiths/data.ts: :58 'across every culture' -> 'across every community'; :87, :116, :145 same; :174 'culture and community' -> 'heritage and community'; :62 'Faith is a dimension, not a culture' -> 'not a community label'; :178 'heritage and culture as its own community' -> 'heritage as its own community'; :192 'cultural concert promoters' -> 'community concert promoters'
src/lib/cities/data.ts: :81 'every culture in one harbour' -> 'every community in one harbour'; :83 'every culture in this city has a stage' -> 'every community ...'; :327 'Every culture in one postcode.' -> 'Every community in one postcode.'; :116, :138 'Cultural festivals/family days' -> 'Community ...'; :417 'food and culture' -> 'food and community'; "multicultural", "surf culture", "civic culture" idioms recommend keep; CITY_EVENT_TYPES :545 slug 'cultural' label 'Cultural' is an EVENT TYPE genre, keep (not heritage taxonomy)
src/lib/hero-categories.ts: :43 'sound of every culture' -> 'sound of every community'; :59 'global culture artists' -> 'global headline artists'; :64 keyword 'global culture events' -> 'global community events'; :77 'serious culture party' -> 'serious community party'; :78 "doesn't understand the culture" -> "the community"; :187 'cultures that made us' -> 'communities that made us'; :193 'cultural exhibitions/anniversaries/identity' -> 'community ...'; :194 'cultural curation' -> 'community curation'; :209, :240 SEO keywords 'cultural gala/celebration/networking' -> 'community ...'; :135 'celebration culture' and :169 'fete culture' idioms FLAG
src/lib/help-content.ts: :34 sub-tagline DECISION; :38 'built for every culture ...' DECISION plus 'cultural business events' -> 'community business events'; :42 'cultural communities' -> 'communities'; :66 'every culture ... cultural events as a small subset' DECISION plus 'community events as a small subset'; :74 'cultural communities across Australia' -> 'communities across Australia'; :142 'cultural festivals' -> 'community festivals'
src/lib/content/category-highlight-slides.ts: :27 'Made for every culture' -> 'Made for every community'; :28 'Cultural picks' -> 'Community picks'; :31 'culture sessions' -> 'community sessions'; :51 'What the culture is buying' -> 'What the community is buying' (tone FLAG)
src/lib/cultural-moments/calendar.ts: :55 Holi 'every culture welcome' -> 'every community welcome'; :81 Mardi Gras 'every culture' -> 'every community'; :45 NAIDOC First Nations FLAG
src/lib/cultures/intersection-editorial.ts: Gospel refrain "lift every culture's voice" at :1078, :1083, :1088, :1093, :1098 -> "lift every community's voice"; :1076 'Where every culture lifts a song' -> 'Where every community lifts a song'; :963 'continent of culture' optional. Dozens of real org proper nouns DO NOT touch. Generic adjective "cultural events/nights" low priority, optional.

### 6. SEO, metadata, structured data, OG images
- src/app/opengraph-image.tsx:3 alt 'Where the culture gathers' -> 'Where the community gathers'; :68 baked-in image text same (regenerates the PNG)
- src/app/twitter-image.tsx:3 alt and :68 image text same
- src/components/features/home/home-schema-jsonld.tsx:49 Organization JSON-LD 'built for every culture ... 14 cultural communities' -> 'built for every community ... 14 communities' (NOT locked; note stale count 14, taxonomy is 21); :30 LOCKED tagline
- src/app/layout.tsx:33, 34, 43, 44, 51 all LOCKED tagline or sub-tagline DECISION
- src/app/sitemap.ts route URLs Phase 2 (see routes section)

### 7. Email copy
- Auth templates (5) footers and Stripe order emails (route.ts:1343, :1417): all LOCKED tagline or sub-tagline. No non-locked email copy to change.

---

## Routes, query params, sitemap, redirects (Phase 2)

Routes today:
- /cultures (index) - src/app/cultures/page.tsx
- /culture/[culture] - src/app/culture/[culture]/page.tsx
- /culture/[culture]/[city] - src/app/culture/[culture]/[city]/page.tsx

Proposed: /communities, /community/[community], /community/[community]/[city].

Redirects required so old links do not 404 (301/308):
- /cultures -> /communities
- /culture/:slug -> /community/:slug
- /culture/:slug/:city -> /community/:slug/:city
Mechanism: either next.config.ts redirects() (SHARED file, needs coordination) or thin /culture/** route files calling permanentRedirect().

Internal redirect map: src/lib/cultures/redirects.ts maps retired v1 slugs to /culture/<slug> targets (lines 21 to 26) and has a load-bearing guard at line 46 `target.startsWith('/culture/')` that preserves the city segment. If targets move to /community/, that guard MUST change to '/community/' or every retired-slug-with-city redirect silently drops the city.

Query params: ?culture= and ?sub_culture= (src/lib/events/search-params.ts:12-13, types.ts:58/64) appear in shared URLs and analytics, and back the DB columns. Renaming to ?community= needs the /events parser and analytics updated together, and ideally aligns with the DB column rename.

Sitemap: src/app/sitemap.ts:38 (/cultures), :117 (/culture/[slug]), :162 (/culture/[slug]/[city]) hardcode the path segments and must change with the route rename.

Newsletter contract: src/app/api/newsletter/subscribe/route.ts:19 Zod enum includes 'culture'. Callers pass source: 'culture'. Rename atomically with callers or add 'community' alongside during transition, or validation breaks.

---

## Identifier and database layer (Phase 2, DB owned by another tab)

- Type CultureSlug, interfaces CultureContent, SubCulture (src/lib/cultures/data.ts), consumed by ~30 files.
- Modules src/lib/cultures/** (4 files) and src/lib/cultural-moments/** (2 files), src/lib/images/culture-photo.ts, sub-culture-photo.ts.
- Exported helpers: getCulture, getAllCultures, isCultureSlug, getCultureIndexEntries, getTier1Cultures, CULTURE_SLUGS, CULTURE_TO_TAGS, getCultureTags, buildCultureTagOrFilter, getCultureHeroPhoto, getSubCulturePhoto, CULTURAL_MOMENTS, CulturalMoment.
- Component and file renames: features/culture/** dir, CultureLandingPage, CultureCityLandingPage, PhotographicCultureHero, SubCultureTileImage, BrowseByCultureRail, RelatedCulturesRail, SubCulturesRail, CulturesByCityRail, AllEventsGridByCulture, CultureOrganiserCtaPanel, plus the home cultural-* component files.
- Cache keys: 'culture-index-page-v1', 'cultures-index', 'pexels-culture-hero-v1', 'pexels-culture', 'pexels-sub-culture-v1'.
- DATABASE: cultures table (src/types/database.ts:213), events.culture_primary and events.sub_culture columns, FK events_culture_primary_fkey. Seeded by migrations 20260504000002_culture_taxonomy.sql and others. Renaming requires a new migration and supabase db push, owned by another tab. OUT OF SCOPE this round.

The heritage slug literals themselves (e.g. aboriginal-torres-strait-islander, african) do NOT contain the word "culture" and survive any rename unchanged.

---

## Pre-existing issues surfaced during the audit (not part of the rename)

1. src/lib/cultures/data.ts:616 contains "diaspora-pop". "diaspora" is forbidden in public copy per CLAUDE.md. This is a live brand-rule violation in rendered copy.
2. src/lib/images/culture-photo.ts and sub-culture-photo.ts use a stale v1 slug set (south-asian, east-asian, mediterranean, middle-eastern, latin, plus comedy/wellness/pride) that does not match the v2 21-heritage CultureSlug union. Heritage hero and sub-tile photos for v2 slugs (indian, chinese, lebanese-levantine, persian-iranian, arab, turkish, maori, vietnamese, etc.) return null.
3. Stale counts: "14 cultures" / "14 cultural communities" in index-page-data.ts comments, home-schema-jsonld.tsx:49, and account/page.tsx hint. Taxonomy is now 21 heritages plus 5 faith communities.

---

## Cross-session coordination flags

- This branch is feat/reservation-sweeper. The sweep touches Session 3 owned marketing files (page.tsx, about, careers, press, blog, organisers templates) and shared files (next.config.ts for redirects, CLAUDE.md which documents the locked culture taxonomy Decisions A-G). Per CLAUDE.md this normally requires PM coordination. Proceeding on direct founder authorisation.
- CLAUDE.md itself must be updated: it locks the culture taxonomy ("founder Decisions A-G locked 2026-05-16", CultureSlug as source of truth, sub-tagline "built for every culture"). The community vision supersedes this and CLAUDE.md needs a matching update via a [SHARED] commit.
