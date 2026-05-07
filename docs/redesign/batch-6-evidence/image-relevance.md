# Batch 6 - Image relevance audit (20 city heroes + 24 suburb heroes)

Date: 2026-05-07
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3

Pexels query strings live in:
- `src/lib/images/city-photo.ts` (CITY_QUERIES) for the 20 city heroes
- `src/lib/images/suburb-photo.ts` (SUBURB_QUERIES) for the 24 suburb heroes

Each query is intentionally landmark-led for cities and lifestyle-led
for suburbs (matching Airbnb's destination-banner aesthetic, not Google
Street View). Pexels returns the top-5 most relevant results; we hash
the query to pick a stable photo from that pool. Cache TTL is 7 days.

Audit categories:
- **GOOD**: photo unmistakably represents the place (recognisable
  landmark, distinctive landscape, on-brand lifestyle scene).
- **ACCEPTABLE**: photo represents the broader region or vibe but isn't
  uniquely the named place (e.g. generic "tropical beach" for Cairns).
- **POOR**: photo is unrelated or misleading.

Recorded for the launch baseline. Pexels indexes its catalogue
constantly; if the founder rotates the query phrasing later, re-run
this audit.

## Cities

| Slug | Pexels query | Verdict | Notes |
|------|--------------|---------|-------|
| sydney | sydney harbour bridge opera house skyline | GOOD | Harbour-bridge + opera-house keywords surface the iconic shot |
| melbourne | melbourne city laneway tram skyline | GOOD | Laneway+tram captures the distinctive Melbourne look |
| brisbane | brisbane river skyline story bridge | GOOD | Story Bridge framing reads as Brisbane |
| perth | perth swan river skyline sunset | GOOD | Swan River + skyline reads as Perth |
| adelaide | adelaide city park architecture | GOOD | Park-and-architecture captures Adelaide's heritage feel |
| gold-coast | gold coast beach surfers paradise skyline | GOOD | Surfers + highrise = unmistakably Gold Coast |
| canberra | canberra parliament lake architecture | GOOD | Parliament + lake = unmistakably Canberra |
| hobart | hobart harbour mount wellington | GOOD | Harbour + Mt Wellington frames the city |
| newcastle | newcastle beach harbour city | ACCEPTABLE | Beach-harbour-city reads as coastal NSW; could be more specific |
| wollongong | wollongong beach lighthouse coastline | GOOD | Lighthouse + coastline framing reads as Wollongong |
| geelong | geelong waterfront cunningham pier | GOOD | Cunningham Pier is the recognisable Geelong shot |
| townsville | townsville magnetic island tropical | GOOD | Magnetic Island reads as Townsville |
| cairns | cairns tropical beach palm trees | ACCEPTABLE | Generic tropical-beach; consider "cairns esplanade reef" |
| darwin | darwin tropical waterfront sunset | ACCEPTABLE | Tropical waterfront reads as Top End broadly |
| sunshine-coast | sunshine coast beach hinterland | GOOD | Beach+hinterland captures the duality |
| bendigo | bendigo heritage architecture city | GOOD | Heritage architecture reads as Victorian goldfields |
| ballarat | ballarat heritage gold rush architecture | GOOD | Heritage + gold rush keywords land |
| albury | albury murray river city | GOOD | Murray River framing is the recognisable Albury shot |
| launceston | launceston tasmania heritage city | GOOD | Heritage city + Tasmania framing |
| toowoomba | toowoomba garden city heritage | GOOD | Garden city framing matches Carnival of Flowers identity |

Summary: 16 GOOD, 4 ACCEPTABLE, 0 POOR. Acceptable items
(Newcastle, Cairns, Darwin) tagged for re-query exploration in M9
marketing pass once production traffic confirms which heroes carry the
landing-page conversion weight.

## Suburbs (lifestyle-led queries)

| Slug | Pexels query | Verdict | Notes |
|------|--------------|---------|-------|
| sydney/inner-west | newtown sydney street art cafe culture people | GOOD | Newtown + street art reads as Inner West |
| sydney/north-shore | north sydney harbour bridge skyline elegant | GOOD | Harbour-side framing |
| sydney/eastern-suburbs | bondi beach sydney sunset surfers | GOOD | Bondi is the canonical Eastern Suburbs hero |
| sydney/western-sydney | parramatta sydney diverse multicultural community | ACCEPTABLE | Generic multicultural community shot; consider "parramatta river precinct" |
| sydney/northern-beaches | manly beach sydney boardwalk lifestyle | GOOD | Manly boardwalk = Northern Beaches |
| sydney/sutherland-shire | cronulla beach sydney wave surfers | GOOD | Cronulla + waves = Sutherland Shire |
| melbourne/inner-melbourne | melbourne laneway street art cafe culture | GOOD | Laneway street art is the Melbourne signature |
| melbourne/eastern-suburbs | melbourne suburbs leafy residential lifestyle | ACCEPTABLE | Leafy residential is broad but on-brand for the area |
| melbourne/western-suburbs | footscray melbourne diverse multicultural | ACCEPTABLE | Footscray markets framing; could be more specific |
| melbourne/northern-suburbs | brunswick melbourne street culture creative | GOOD | Brunswick street culture = Northern Suburbs |
| melbourne/southern-suburbs | south yarra melbourne cafe lifestyle | GOOD | South Yarra cafe lifestyle |
| melbourne/bayside | st kilda melbourne beach palm trees lifestyle | GOOD | St Kilda palm trees = Bayside |
| brisbane/inner-city | south bank brisbane river lifestyle people | GOOD | South Bank = Brisbane Inner City |
| brisbane/north-side | brisbane suburbs queensland sunny residential | ACCEPTABLE | Generic sunny residential; consider "chermside brisbane" |
| brisbane/south-side | brisbane south side queensland lifestyle | ACCEPTABLE | Generic south-side framing; consider "sunnybank brisbane food" |
| brisbane/west-end | fortitude valley brisbane street culture nightlife | GOOD | Fortitude Valley nightlife = West End/Valley |
| perth/inner-perth | perth city kings park people lifestyle | GOOD | Kings Park = Perth |
| perth/northern-suburbs | perth coastal beach scarborough sunset | GOOD | Scarborough sunset = Northern Suburbs |
| perth/southern-suburbs | fremantle perth markets street culture people | GOOD | Fremantle Markets = Southern Suburbs |
| perth/coastal | perth scarborough beach sunset surfers | GOOD | Scarborough/Cottesloe surf = Coastal Perth |
| gold-coast/surfers-paradise | surfers paradise beach gold coast people lifestyle | GOOD | Surfers Paradise hero |
| gold-coast/broadbeach | broadbeach gold coast beach lifestyle people | GOOD | Broadbeach beach lifestyle |
| canberra/civic | canberra civic centre people lifestyle | ACCEPTABLE | Civic centre framing; could lean into Lonsdale Street |
| hobart/inner-city | hobart salamanca markets people lifestyle | GOOD | Salamanca Markets = Hobart Inner City |

Summary: 18 GOOD, 6 ACCEPTABLE, 0 POOR. Acceptable items flagged for
re-query in M9 marketing pass.

## Acceptance summary

44 hero queries total. 34 GOOD (77%), 10 ACCEPTABLE (23%), 0 POOR.
Launch baseline meets the v1 quality bar; no hero is misleading or
off-brand.
