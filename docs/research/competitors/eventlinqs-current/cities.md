# EventLinqs - /cities Index (live, current state)

Source: https://www.eventlinqs.com/cities
Scraped: 16 May 2026 (firecrawl, location AU, onlyMainContent, waitFor 3000)
Status: 200 OK
Screenshot: screenshots/cities.png

---

## Structure

- Hero raster + eyebrow "Browse by city"
- H1: **20 cities. From Sydney to Hobart.**
- Sub: "Find culturally-relevant events near you."
- **Capital Cities** (8): "Eight capital and major metro markets. The platform launches with full event catalogues in each."
  - Sydney NSW - 9 events
  - Melbourne VIC - 10 events
  - Brisbane QLD - 6 events
  - Perth WA - Coming soon
  - Adelaide SA - 2 events
  - Gold Coast QLD - Coming soon
  - Canberra ACT - Coming soon
  - Hobart TAS - Coming soon
- **Regional Cities** (12): "Twelve regional centres where culturally-relevant events deserve a stage as much as the capitals."
  - Newcastle, Wollongong, Geelong, Townsville, Cairns, Darwin, Sunshine Coast, Bendigo, Ballarat, Albury, Launceston, Toowoomba - ALL "Coming soon"

## Meta
- Title: "Browse by City | EventLinqs"
- og:url -> http://localhost:3000/cities (BUG)

---

ANALYST NOTE: Same shape as /cultures - strong concept, mostly empty. Only 4 of 20 cities have any events (Sydney 9, Melbourne 10, Brisbane 6, Adelaide 2 = 27 total, consistent with /events). 16 of 20 cities are "Coming soon", including every regional centre and 4 capitals (Perth, Gold Coast, Canberra, Hobart). The claim directly under the Capital Cities heading - "The platform launches with full event catalogues in each" - is contradicted by the tiles themselves (Perth/Canberra/Hobart say Coming soon). That copy/state contradiction is a credibility risk and should be fixed immediately (soften the claim or gate the heading on real data). The regional-cities inclusion is good positioning (anti-metro-centric, on-brand for community-first) but only works once there is real inventory. Same localhost OG leak. Net: the cities index, like cultures, currently advertises absence more than presence.
