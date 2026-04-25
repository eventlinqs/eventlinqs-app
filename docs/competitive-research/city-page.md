# City Page — Competitive Teardown

**Captured:** 2026-04-26
**Viewports:** 1280x800 desktop
**Sources:**
- Ticketmaster — has a "Cities" nav link, opens a list of city hub pages.
- DICE — `/browse/sanfrancisco-60dee10ce5e339918757f0db` is the canonical city page (it doubles as their browse page; city is the primary unit).
- Eventbrite — `/d/australia--melbourne/all-events` and per-city URLs surfaced via the location chip.

Note: city pages on competitors heavily overlap with their category pages (the same templates filtered by city). Observations below capture what's distinct.

---

## Ticketmaster — Cities pattern

- "Cities" appears as a primary nav item — clicking exposes a list of capital cities.
- Each city page is just a category page filtered by metro area; the hero image is generic stage / event photography rather than city-specific imagery.
- No "what's near you" personalisation — assumes user has selected the city via the location chip in the header.
- Trust signals: none unique to the city page.

---

## DICE — City as primary browsing unit

- City IS the URL. `/browse/[city-slug]-[id]` returns a city-scoped browse page, not a city-detail page in the editorial sense.
- Page title: "Popular Events in San Francisco" — H1 reads as a query result, not a destination guide.
- No editorial copy ("a guide to nightlife in SF"). No featured venues. No press / cultural context.
- Filter pills include the city pill, suggesting the user can pivot.

---

## Eventbrite — City pages as SEO surfaces

- `Browsing events in Melbourne` chip in the homepage header does the heavy lifting.
- City-scoped URL pattern `eventbrite.com.au/d/australia--melbourne/all-events`.
- City pages contain category strips ("Music in Melbourne", "Performing Arts in Melbourne"), all using the same circular sub-genre tiles.
- Strong SEO: breadcrumb depth, city in H1, city in meta.

---

## Implication for EventLinqs

None of the three competitors treats a city page as an **editorial destination**. That's our opening.

A premium EventLinqs city page should:

1. **Cinematic city hero** — real local photography (Melbourne diaspora party, Sydney harbour event, Lagos mainland venue). The hero must feel like *that city*, not generic event imagery.
2. **Local-first hierarchy:** `Melbourne` H1, then "Live events in Melbourne" sub-hero in body weight, then a "What's on this week" rail (uses our existing `ThisWeekStrip`).
3. **City-scoped culture rails:** "Afrobeats in Melbourne", "Amapiano in Melbourne", "Comedy in Melbourne" — each one a seven-card rail.
4. **Featured venues block** — venue tile component (logo, photo, upcoming-event count).
5. **"Are you organising in Melbourne?"** secondary CTA — invites organisers without disrupting the fan flow.
6. **SEO:** breadcrumb (Home / Cities / Melbourne), schema.org `Place` + `Event` markup, dynamic OG image (Melbourne hero + event count).

Our existing `CityTile` component is the right primitive for the homepage browse-by-city section that surfaces the link to each city page. We need a real city-detail template behind those tiles to deliver on the click — competitors stop at the click; we'll go further.

## Trust Signals to Add (Unique to EventLinqs)

- "12 verified organisers in Melbourne"
- "1,400+ tickets sold in Melbourne this month"
- "Average all-in price shown on every event"

These are the kind of city-specific trust signals neither TM, DICE, nor EB offers. They reinforce the no-hidden-fees promise on the surface a fan first lands on after a Google search.
