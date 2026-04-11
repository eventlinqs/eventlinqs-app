# Benchmark: Events Listing Page

## Overview

The events listing page is how attendees discover events. It must answer "What's happening near me?" instantly and let users drill down efficiently with filters. Eventbrite, DICE, and Songkick all handle this differently. This document captures their patterns and defines the EventLinqs target.

---

## Eventbrite Events Listing Page

### Layout

**Header area:**
- Location input (auto-detected or user-entered city/postcode) — "Events near [City]"
- Search bar — searches event names, organiser names, categories
- Date picker — "Today", "Tomorrow", "This weekend", "This month", custom date range
- Category filter dropdown — Music, Food & Drink, Sports & Fitness, Arts, etc.

**Filter chips (horizontal scrolling row below header):**
- Chips: Free | Today | This Weekend | Online | Music | Arts | Sports | Family | ...
- Active chip highlighted in accent color (blue underline or filled)
- Chip row scrolls horizontally on mobile — no wrapping
- "More filters" chip at the end opens a full filter modal

**Sort options:**
- Dropdown: "Relevance" (default) | "Date" | "Distance" | "Price: Low to High" | "Price: High to Low"
- Only visible on desktop; mobile hides behind filter modal

### Event Cards

**Aspect ratio:** 16:9 event thumbnail image (object-cover)

**Card layout (desktop — 3 per row):**
- Image top (16:9)
- Event name (2-line max, truncated with ellipsis)
- Date + time
- Venue name / "Online"
- Organiser name
- Price: "Free" or "From $15" or "From $15 – $80"
- Interest indicator (how many people have saved this event): "234 interested"

**Card layout (mobile — 1 per row, horizontal card):**
- Thumbnail left (square crop, ~100px)
- Event details right: name, date, venue, price
- Compact — fits 3 cards without scrolling on iPhone SE

**Hover state (desktop):**
- Card lifts with box-shadow elevation
- "Save" heart icon appears in top-right of image
- No auto-playing video

**Click behavior:**
- Click anywhere on card → event detail page
- Click heart → save event to wishlist (requires login or prompts login)

### Pagination vs Infinite Scroll

Eventbrite uses **Load More button** (not infinite scroll):
- Shows 20 events initially
- "Load More" button at bottom loads 20 more
- No automatic infinite scroll (intentional — avoids accidental pagination on mobile)
- URL updates with page parameter: `/events?page=2`

### Skeleton Loaders

While events are loading:
- Card-shaped skeleton placeholders with shimmer animation
- 6 skeletons shown (matching expected card count per row × 2 rows)
- Shimmer is a gradient that sweeps left-to-right at 1.5s interval
- Image placeholder is grey rectangle; text lines are grey bars of varying width

---

## DICE Events Listing

### Philosophy

DICE is music-first and city-first. Their listing page is more curated than Eventbrite's marketplace:

**Layout:**
- Hero banner: "What's On in [City]" with a featured event or tour announcement
- Horizontal scroll carousels by genre: "Trending in London" / "Electronic" / "Hip-Hop" / "New Releases"
- No grid of all events — discovery is algorithmic, not alphabetical

**Card design:**
- Square images (1:1 aspect ratio) — feels more Instagram-native
- Artist name prominent, event name secondary
- Date and venue below
- Price pill in bottom-left of image: "£15" (not "From £15")
- If DICE Waiting List (anti-scalping queue) is active: "Join the list" instead of price

**Filter model:**
- Genre chips at top (horizontal scroll)
- Date filter: This week / This month / Next 3 months
- City selector in header (not embedded in page)
- No price filter (DICE doesn't want users filtering by price — pushes towards discovery)

**Mobile-first design:**
- All carousels are swipeable (touch-drag, momentum scroll)
- "See all" link at the end of each carousel
- Full screen on mobile, no sidebar

---

## Songkick Events Listing

Songkick focuses on artist-following and concert discovery:

**Primary model:**
- Users follow artists, Songkick surfaces upcoming concerts by those artists
- Events listing is personalized: "Upcoming for You" (followed artists near you)
- Fallback for non-logged-in: popular events in detected city

**Card design:**
- Landscape artist photo (not event photo) — 16:9
- Artist name + support acts
- Date, venue, city
- Source: "Tickets from $35 via Ticketmaster" — Songkick is a discovery layer, links to ticketer
- "Tracked" badge for followed artists

**No checkout:**
- Songkick does not sell tickets — it aggregates and links
- Useful reference for discovery UX only, not checkout

---

## EventLinqs Events Listing — Target

### URL: `/events`

### Layout

**Filter header (sticky, always visible on scroll):**
- Left: Location selector (auto-detect with override)
- Center: Search input (expands on focus)
- Right: Date picker

**Filter chips row (below sticky header):**
- Chips: All | Free | Today | This Weekend | Music | Arts | Sports | Food | Nightlife | Family | Online | ...
- Horizontal scroll on mobile, wrap on desktop
- Active chip: accent color fill (#4A90D9) with white text
- "Filters" button opens full modal with: Category, Date range, Price range, Distance radius, Venue type

**Sort dropdown (desktop only, top-right):** Relevance | Date | Distance | Price

### Card Design

**Desktop (3 per row):**
- 16:9 image (object-cover) — consistent visual rhythm
- Category pill overlay on image (bottom-left): "Music" / "Arts" etc.
- Sold-out badge (if applicable): red "SOLD OUT" pill overlay
- Title (2-line max)
- Date formatted: "Sat 15 Apr · 8:00 PM"
- Venue name and city
- Price: "Free", "From $15", "From $15 – $200"
- Save/heart button (top-right of card, always visible, not hover-only — mobile has no hover)

**Mobile (1 per row, horizontal):**
- Thumbnail left (100×100px, object-cover)
- Details right: title, date, venue, price
- Heart icon far right

### Infinite Scroll vs Load More

Use **"Load More" button** (Eventbrite's approach) — not automatic infinite scroll. Reasons:
- Automatic infinite scroll makes it impossible to reach the footer
- Back button + scroll position is unreliable with infinite scroll
- "Load more" is explicit user intent

Load 20 events initially. Load 20 more per click. Show "Showing 40 of 312 events" counter.

### Empty State

When no events match filters:
- Illustration (simple SVG, not a photo — loads instantly)
- Headline: "No events found near you"
- Sub-text: "Try a different date, category, or expanding your search radius"
- CTA: "Browse all events" — clears filters

Never show a blank page.

### Skeleton Loaders

- Card-shaped skeletons: grey rectangle (image area) + 3 grey text lines
- Shimmer animation: `@keyframes shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }`
- Show 6 skeletons (fills first two rows at 3-column desktop layout)
- Replace with real cards on data resolve — no layout shift (cards pre-sized to skeleton dimensions)

### Image Handling

- All event images: WebP format with AVIF fallback
- `srcset` for responsive images: 400w (mobile card), 800w (desktop card), 1600w (hero)
- `loading="lazy"` for below-fold cards
- `loading="eager"` for first 6 cards (above fold)
- Placeholder: low-quality blurred version (blur hash or CSS gradient) while loading

### Location-Based Filtering

- On page load: request geolocation permission (browser API)
- If granted: show events within 50km radius by default
- If denied: fall back to IP-based city detection
- Manual override: location selector in header allows typing any city
- Distance shown on cards when location is active: "2.1 km away"

### Performance Targets

- Initial 20 cards render in under 2.5 seconds (LCP)
- Filter changes update results within 300ms (using URL search params + Next.js server actions)
- Skeleton → content transition with no layout shift (CLS < 0.1)
- Total JS bundle for this page under 150KB gzipped
