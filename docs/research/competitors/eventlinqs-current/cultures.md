# EventLinqs - /cultures Index (live, current state)

Source: https://www.eventlinqs.com/cultures
Scraped: 16 May 2026 (firecrawl, location AU, onlyMainContent, waitFor 3000)
Status: 200 OK
Screenshot: screenshots/cultures.png

---

## Structure

- Hero raster + eyebrow "Browse by culture"
- H1: **Every culture. Every event.**
- Sub: "Browse 14 communities across Australia and beyond. Find what moves you."
- **Cultural Communities** (10): "Ten communities at the heart of the platform. Each gets its own landing with rails, sub-cultures, and city pages."
  - African ("Every rhythm. Every region. One platform.") - Coming soon
  - South Asian ("Bollywood, bhangra, garba and beyond.") - Coming soon
  - Caribbean ("Carnival energy, all year round.") - Coming soon
  - Latin ("Salsa, bachata, reggaeton: the heat lives here.") - Coming soon
  - East Asian ("K-pop, Lunar, anime, J-rock: the full spectrum.") - Coming soon
  - Filipino ("Fiesta. Family. Forever.") - Coming soon
  - Mediterranean ("Italian, Greek, Spanish, Portuguese: la dolce vita.") - Coming soon
  - Middle Eastern ("Arabic, Persian, Turkish, Israeli: one stage.") - Coming soon
  - European ("From Polish to French to Ukrainian, all here.") - Coming soon
  - Pacific ("Maori, Samoan, Tongan, Fijian: islands in the room.") - Coming soon
- **Cross-Cultural** (4): "Communities the platform serves alongside the core ten."
  - Gospel - Coming soon
  - Comedy - Coming soon
  - Wellness - Coming soon
  - Pride - Coming soon

## Meta
- Title: "Browse by Culture | EventLinqs"
- og:url -> http://localhost:3000/cultures (BUG)

---

ANALYST NOTE: Conceptually excellent, executionally hollow. The taxonomy (10 core cultural communities + 4 cross-cultural) is differentiated and on-brand, and the one-line culture taglines are genuinely good copy ("Carnival energy, all year round", "islands in the room"). But EVERY SINGLE tile says "Coming soon" - all 14 culture landing pages are unbuilt. This is the single biggest credibility gap on the platform: the entire brand promise is "Every culture. Every event. One platform.", the homepage routes users here, and the destination is 14 dead ends. A discerning visitor reads this as vapourware. Two further issues: (1) the canonical cultures list in CLAUDE.md (Afrobeats · Caribbean · Bollywood · Latin · Italian · Filipino · Lunar · Gospel · Amapiano · Comedy · Spanish · K-Pop · Reggae · West African · European · Asian · African · South Asian) does NOT match the 14 shown here (African / South Asian / East Asian / Mediterranean groupings instead) - cross-surface inconsistency. (2) localhost OG url leak again. Priority: at minimum ship 2-3 flagship culture pages before any launch, or reframe "Coming soon" so it does not read as broken.
