# EventLinqs - Event Detail (live, current state)

Source: https://www.eventlinqs.com/events/gospel-on-the-river-brisbane-worship-night
Scraped: 16 May 2026 (firecrawl, location AU, onlyMainContent, waitFor 3000)
Status: 200 OK
Screenshot: screenshots/event-detail-gospel.png

---

## Structure (top to bottom)

- Sticky header: title, "Sat, 23 May · Riverstage · Brisbane", "Free entry", [Get tickets]
- Hero image (Pexels raster) + repeated title + "Free entry" + [Get tickets]
- Category: Religion
- H1: **Gospel on the River: Brisbane Worship Night**
- "Saturday 23 May 2026 at 5:00 pm AEST · Riverstage · Brisbane" + [Get tickets] "Free entry"
- Trust micro-row: **Secure checkout · Community organiser · Refund policy**
- **About this event**: "Open-air gospel concert | massed choir, family-friendly" + full description
- **When**: Sat 23 May 2026 5:00 pm AEST, ends 9:00 pm AEST, Timezone Australia/Brisbane
- **Where / Venue**: Riverstage, City Botanic Gardens, Brisbane QLD + interactive Google Map + [Open in Maps]
- **Organised by: Gospel Brisbane** (avatar initials "GO") + bio + hashtags (#gospel #worship #christian #family #community)
- **Share this event**: WhatsApp, Facebook, X, Email, Copy link
- **Tickets** section: Reserved Seat "Front-section reserved seat AUD 35.00" qty stepper | Free Admission "Open-air gospel concert | RSVP for seat" Free qty stepper | "Select tickets to continue"
- **You might also like**: 4 related Brisbane events

## Meta
- Title: "Gospel on the River: Brisbane Worship Night - Sat, 23 May - Riverstage, Brisbane - EventLinqs"
- og:url https://eventlinqs.com/events/... (correct, NOT localhost here)
- og:image -> the Pexels event image (correct here)

---

ANALYST NOTE: This is the strongest page on the platform. It is genuinely competitive with Eventbrite/Humanitix event detail pages: clear date/venue/price hierarchy, a real interactive map, an organiser identity block with bio and hashtags, full share row (WhatsApp first - correct for the audience), mixed free/paid ticket tiers with steppers, and a related-events rail. The trust micro-row ("Secure checkout · Community organiser · Refund policy") is exactly the right pattern and should be echoed on the pricing page. Notably the OG tags here are correct (real event image, eventlinqs.com url) - so the localhost bug is page-template specific (marketing/index pages), not global, which narrows the fix. Gaps vs. world-class: no "X people viewing" / urgency, no organiser rating or events-hosted count, no add-to-calendar, no FAQ/accessibility/what-to-bring block, no all-in fee preview before the ticket step (the pricing promise "what the buyer sees is what they pay" is not yet demonstrated on the surface where it matters most - the ticket selector).
