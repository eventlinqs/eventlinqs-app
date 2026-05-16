# EventLinqs - /events Browse (live, current state)

Source: https://www.eventlinqs.com/events
Scraped: 16 May 2026 (firecrawl, location AU, onlyMainContent, waitFor 3000)
Status: 200 OK
Screenshot: screenshots/events.png

---

## Structure

- H1: **Find your next event** | "27 events available"
- Search box
- Date filter pills: Today, Tomorrow, This weekend, Next 7 days, This month, Free
- View toggle: Grid / Map
- "More filters"
- Category dropdown: All categories, Music, Sports, Arts & Culture, Food & Drink, Business & Networking, Education, Charity, Nightlife, Family, Technology, Religion, Fashion, Health & Wellness, Community, Festival, Film, Other, Pride, European, Middle Eastern, Pacific
- **Popular this week** rail (8 cards) - [See all]
- **All events** grid (~27 cards), each: image, organiser eyebrow, title, day+date · city, "From AUD $X" or "Free"

## Sample inventory (price spread)
Amapiano Adelaide $45 (Last chance) | Island Vibes Sydney $35 | Gospel on the River Brisbane Free | Lagos Comedy $45 (x3 cities) | Aso Ebi Affair $45 | Afrobeats Live $95 | Filipino Fiesta Free | Naming Ceremony Free | Reggaeton/Bachata $45 | Brisbane Gospel Choir $35 | Caribbean Sunset Cruise $145 | Bollywood Brunch $85 | Afrobeats Brunch $85 | OPM Night $45 | Reggae on the Lawn Free | Amapiano Day Party $45 | Diwali Mela $35 | Diwali Gala $145 | Diwali Festival Free | Lunar Banquet $145 | Lunar Nights Free | Caribbean Carnival $45 | Pasifika Free | Africultures $45 | Lebanese Eid $25

## Meta
- Title: "Find your next event | EventLinqs"
- og:title "EventLinqs | The ticketing platform built for every culture"
- og:description "Every culture. Every event. One platform. All-in pricing, no surprise fees."
- og:image -> http://localhost:3000/opengraph-image (BUG)

---

ANALYST NOTE: Functional browse page with a sensible filter taxonomy (date pills + category dropdown + grid/map toggle). Inventory is ~27 events with a healthy free/paid mix and a believable AU price ladder ($25 to $145). The category list has a structural smell: it mixes true event categories (Music, Comedy, Family) with cultural-community tags (European, Middle Eastern, Pacific, Pride) in one flat dropdown - culture and category should be two orthogonal filters, not merged. Same localhost OG bug. No empty-state design visible, no sort control surfaced beyond "Popular this week", no result count interplay with filters shown. The page is competent but generic - it does not yet feel different from an Eventbrite search page, which is a missed opportunity given the culture-first positioning. The seed-data repetition (same titles across homepage rails and this grid) will read as thin to a discerning first visitor.
