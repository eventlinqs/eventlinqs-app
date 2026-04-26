# Category Page — Competitive Teardown

**Captured:** 2026-04-26
**Viewports:** 1280x800 desktop
**Sources:** ticketmaster.com.au/discover/concerts, dice.fm/browse/sanfrancisco-..., eventbrite.com.au/b/australia--melbourne/music
**Screenshots:** `.playwright-mcp/current/{tm,dice,eb}-cat-desktop.jpeg`

---

## Ticketmaster — `/discover/concerts`

- **Hero band:** dark stage-light photo (~280px), breadcrumb "Home / Music" inset, single big white display word "MUSIC" with a thin blue underline accent. No copy beneath the title.
- **Filter row:** "All Music" dropdown | "All Dates" dropdown | "This Weekend" pill chip — three controls, very lean.
- **Grid:** 2-column event cards visible on first viewport; sidebar reserved for ad ("PICAR" pink ad slot empty/loading).
- **No sub-genre exploration** — just one category-wide title.
- Filters limited; sort options buried.

### Strengths
- Strong cinematic hero with a single noun title.
- Lean filter row (3 controls).

### Weaknesses
- No sub-genre discovery.
- Empty pink ad-slot pollution.
- Cards stop at 2-wide due to ad rail.

---

## DICE — `/browse/sanfrancisco-...`

- **Filter pills:** SAN FRANCISCO | DATE | PRICE — three dark pills with category icons. Caps treatment.
- **Sub-category icon row:** Gigs / DJ / Party / Art / Comedy / Film / Social / Theatre — small dark pill icons + caption (~80px tall, very compact).
- **Inset card:** large dark-grey rounded panel "Find shows by artists you're into / Connect your Spotify or Apple Music" + Spotify + Apple Music pill buttons + DJ illustration on right. **Genuinely smart — turns the cold-start discovery problem into a personalisation hook.**
- **Section title:** "Popular Events in San Francisco" — large white display, subtitle treatment with city in lighter weight.
- **Cards:** square 1:1 cover-art-driven, 4 across.
- **No ads anywhere.**

### Strengths
- Spotify / Apple Music personalisation card — completely unique to DICE.
- All-black canvas makes cover art carry the page.
- Filter pills are simple, visible, no-overload.

### Weaknesses
- All-dark UI is hostile to 40+ audience.
- Sub-category labels are tiny (~12px), low affordance.

---

## Eventbrite — `/b/australia--melbourne/music`

- **Breadcrumb:** Home / Australia / Melbourne / Events in Melbourne / Music — five deep, but it works for SEO.
- **Hero:** split layout — blue panel left with yellow display "Music events" + sub-line "in Melbourne, Australia" + tagline "Discover the best Music events in your area and online" + photo right (singer w/ guitar). About 320px tall.
- **Filter row:** Melbourne pill dropdown + Date pill dropdown.
- **Sub-genre carousel:** "Explore what's popular within Music" — circular tiles each with an actual photo cropped in a circle (DJ/Dance, Alternative, EDM/Electronic, R&B, Latin, Pop, Punk/Hardcore, Indie). Visible left/right arrow controls + visible scrollbar.
- **Below:** "Most popular events" rail.

### Strengths
- Sub-genre exploration is genuinely useful — diaspora audiences look for sub-genres (Afrobeats, Amapiano, Highlife) more than parent categories.
- Geo-aware breadcrumb + title combo (`Music events in Melbourne, Australia`) is SEO gold.
- Clear arrow controls on the sub-genre rail.

### Weaknesses
- Yellow display on blue is loud, not premium. The split hero looks template-y.
- Visible scrollbar under the sub-genre rail is amateur.
- No price filter, no time-of-day filter.

---

## Patterns to Carry Forward

| Pattern | Source | Why |
|---|---|---|
| Cinematic image hero with single noun title | Ticketmaster | Visual hook |
| Sub-genre / sub-category carousel below filter row | Eventbrite | Diaspora-first discovery |
| Spotify / Apple Music connect on category page | DICE | Personalisation differentiator (parking lot — Phase 2) |
| Filter row with 2-3 controls only above the fold | All three | Reduces overload |
| Geo-aware page title (`X events in Melbourne`) | Eventbrite | SEO + personalisation |

## Patterns to Reject

- Visible horizontal scrollbars (Eventbrite).
- 5-deep breadcrumbs that wrap on mobile (Eventbrite).
- Ad rails competing with the grid (Ticketmaster).
- Dark-only canvas (DICE) — exclusionary to older audiences.

## Implication for EventLinqs

Category page must show, in this order on desktop:
1. Cinematic hero (image cascade per category, gradient overlay) with single-word title + sub-line.
2. Sticky filter row (When / Date / Price / Culture-Language) — 4 controls, never more above the fold.
3. Sub-genre/culture carousel ("Explore Afrobeats, Amapiano, Highlife, Comedy, Gospel, Owambe").
4. Cards in a 3-col grid (4:3 cover, image-dominant).
5. No ads, ever.
