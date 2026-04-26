# Search — Competitive Teardown

**Captured:** 2026-04-26
**Viewports:** 1280x800 desktop, 375x667 mobile
**Sources:**
- ticketmaster.com.au — header search panel + `/search?q=` results page
- dice.fm — `/search?q=` results page (header search input is global)
- eventbrite.com.au — header search + `/d/australia--melbourne/all-events?q=` results

---

## Ticketmaster — Search panel + results

### Desktop input
- Search lives **inside the royal-blue header band** as three white pill cards: Location | Dates | Search input + dark-blue Search pill on the right.
- Heavy real estate spend — search is the loudest element on the page.
- No autosuggest panel observed on first focus; suggestions only appear after typing.

### Desktop results (`/search?q=anyma`)
- Results page reuses the same blue header band.
- Tabs above results: Events | Artists | Venues | Articles — switches result type within one page.
- Result cards: 3-up grid, square cover art with overlaid date chip top-left ("FRI 12 SEP / 7:30 PM"), then title + venue + city below the image.
- Right-rail ad slot present.
- No filter rail beyond the three header pills (Location / Dates / Query).
- "Did you mean…?" surfaces above the grid for typos.

### Mobile
- Search becomes three stacked rows in a sheet (Location → Dates → Query).
- Results stack 1-up with full-bleed cover art and inline date chip.
- Banner ad immediately below the first row of results.

### Strengths
- Tabs (Events / Artists / Venues / Articles) is the right way to disambiguate a query like "Anyma" that maps to an artist, a brand, or a city.
- Date chip overlaid on cover art reads at a glance.

### Weaknesses
- Three-pill header search is loud and dated — the visual weight equals the hero.
- No autosuggest at focus. Empty input state is wasted.
- Result-page right-rail ad cannibalises real estate from the very query that brought the user here.

---

## DICE — Search

### Desktop input
- Single text input pinned in the header: placeholder `Search by event, venue or city`. White canvas, single line, magnifier icon on the right.
- On focus, opens a **dropdown panel below the input**: recent searches + popular searches + categories. No image previews, just typed lines.

### Desktop results (`/search?q=mayan+warrior`)
- Results page is the same canvas as `/browse/[city]` — no special template.
- H1: "Search results for 'Mayan Warrior'" small caps, then the same square 1:1 cover-art grid (4 across) used everywhere else.
- Filter pills: City | Date | Price (same as browse).
- No tabs to switch between result types — DICE assumes most queries are events.

### Mobile
- Magnifier opens a full-screen search sheet with the same recent / popular sections.
- Results inherit the universal mobile card pattern: 1-up cover-art, title, date, venue, sticky city pill.

### Strengths
- Consistent template — search results, browse, and city-scoped pages all use the same component, so the user never re-learns a layout.
- Recent searches surfaced on focus with no typing required.
- Single input is unambiguous.

### Weaknesses
- No type-disambiguation (event vs artist vs venue) — searching for an artist returns shows but not an artist profile.
- All-dark canvas same problem as elsewhere.

---

## Eventbrite — Search

### Desktop input
- Header search is **two side-by-side inputs**: query (with magnifier icon) + location chip ("Melbourne") + coral Search pill.
- On focus, autosuggest panel: "Looking for…" with category pill suggestions (Music, Nightlife, etc.) and "Suggested events" rows with thumbnail + title + date below.
- Returns query + city in the URL: `/d/australia--melbourne/all-events?q=afrobeats`.

### Desktop results
- Reuses the city/category page template: blue panel hero with the query as the title ("afrobeats events in Melbourne, Australia"), sub-genre carousel below, then a dense 4-column event grid.
- Filter row: Melbourne pill | Date pill | Free pill | Online/In-person pill — four controls.
- "Promoted" cards interleaved into organic results. Subtle pill, but it's there.

### Mobile
- Search input collapses to icon. Tap opens a full-screen sheet.
- Autosuggest with thumbnails works the same on mobile.
- Result page hero collapses to a header strip; grid becomes 1-col then 2-col below the fold.

### Strengths
- **Autosuggest with thumbnails** — the only competitor to show event thumbnails inside the suggest panel. Reduces clicks dramatically.
- Geo-aware query result page title ("afrobeats events in Melbourne") doubles as SEO copy.
- Four filter chips on results are useful without being overwhelming.

### Weaknesses
- Two-input header (query + location) is a friction point on mobile widths above 375 — the location chip steals tap targets.
- "Promoted" interleaved results muddy trust.

---

## Patterns to Carry Forward

| Pattern | Source | Why |
|---|---|---|
| Single search input + location chip beside it | Eventbrite (refined) | Location is the second axis of every event query |
| Autosuggest panel with thumbnail event rows | Eventbrite | Reduces clicks; differentiates from DICE/TM text-only suggest |
| Recent + Popular searches on focus | DICE | Fills the empty-state void |
| Tabs to disambiguate result type (Events / Artists / Venues / Cities) | Ticketmaster | Critical for diaspora artists who tour as both brand and person |
| Geo-aware query result page H1 | Eventbrite | "afrobeats events in Melbourne" reads as both result and SEO |
| Date chip overlaid on cover art | Ticketmaster | At-a-glance scanning |

## Patterns to Reject

- Three-pill search bar inside a coloured band (Ticketmaster) — too loud.
- Right-rail ads on search results (Ticketmaster) — search is the warmest intent on the site, never sell that real estate to ads.
- "Promoted" interleaved into organic results without a clear ceiling (Eventbrite).
- All-dark search results (DICE) — exclusionary to older audiences.
- No autosuggest at focus (Ticketmaster, DICE) — wastes the moment of highest intent.

## Implication for EventLinqs

The search experience must:

1. **Single search input** in the header with a paired location chip (`Melbourne`) — input expands on focus.
2. **Autosuggest panel** on focus with three sections:
   - Recent searches (when signed in or session has history)
   - Popular searches in [user's city] (cold-start fallback)
   - Suggested events with cover-art thumbnail + title + date + city
3. **Result page tabs** above the grid: Events | Artists | Organisers | Venues | Cities — only render tabs that have results for the query.
4. **Filter row on results:** When | Date | Price | Culture-Language — same as the category page (consistency over novelty).
5. **Geo-aware H1** on result pages: `"{query}" events in {city}`.
6. **Date chip overlaid** on result-card cover art for at-a-glance scanning.
7. **No promoted cards interleaved** with organic results. If we ever add sponsored placements they sit in a clearly bordered "Featured" rail above organic results, not inside the grid.
8. **Empty state for typo / zero results:** "No exact matches for 'XYZ'. Did you mean...?" with three suggestions, then "Popular events in {city}" rail below.
