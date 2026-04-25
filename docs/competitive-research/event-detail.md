# Event Detail — Competitive Teardown

**Captured:** 2026-04-26
**Viewports:** 1280x800 desktop, 375x667 mobile
**Sources:**
- ticketmaster.com.au/anyma-tickets/artist/3175130
- dice.fm/event/eoyg3o-mayan-warrior-san-francisco...
- eventbrite.com.au/e/bambi-sundays-rb-sessions...
**Screenshots:** `.playwright-mcp/current/{tm,dice,eb}-event-{desktop,mobile}.jpeg`

---

## Ticketmaster (Anyma)

### Desktop
- **Hero:** full-bleed cinematic photo (Greek-ruins concept art) ~480px tall.
- Breadcrumb inset top-left over image: Home / Music / Dance/Electronic / Anyma Tickets.
- Bottom-left over image: tiny eyebrow "Dance/Electronic" + bold white display "Anyma Tickets" + heart-save circle.
- **Tab navigation under the image:** PRESALES (active) / CONCERTS / EXPERIENCE / GALLERY / SETLISTS / ACCESSIBILITY / NEWS / FAQS / REVIEWS / FAN... — overflow scroll, ten tabs deep.
- **Content:** "PRESALES" section header (small black bar above eyebrow), then a card per presale window with date/time.
- **Banner ad ("Find endless possibilities in New South Wales") inside the page** — egregious.

### Mobile
- Same hero, tabs, breadcrumb.
- Mobile tabs scroll horizontally; PRESALES underline marker.
- **Bottom: Qantas tourism banner ad** locked at viewport bottom — they ad-bombed the event detail page on mobile.
- No sticky purchase CTA (because this is an artist-page, not a date-bound event — but the pattern is the same on date-specific URLs).

### Strengths
- Tab navigation aggregates an artist's whole catalogue (presales, accessibility, FAQ, reviews) in one URL.
- Cinematic hero scale.

### Weaknesses
- Banner ads on the event detail page = trust-killer.
- 10 tabs = decision paralysis; user has to scroll the tab bar.
- No sticky buy CTA on mobile.
- No transparent pricing on the hero — fans have to drill into a date to see fees.

---

## DICE (Mayan Warrior San Francisco)

### Desktop — gold-standard reference for our event detail
- **Background tinted to match the cover artwork** (extracted dominant gradient — dark green → orange for this event). This makes every event page feel bespoke without a per-event design pass.
- **Two-column layout:**
  - **Left (~360px):** square poster art with overlaid heart-save + share icons. Below: "Top track / RY X — YaYaYa" with an audio-preview play arrow. Below that: trust signal "DICE protects fans and artists from touts. Tickets will be securely stored in the app." + "Got a code?" link.
  - **Right (rest):** massive H1 "Mayan Warrior San Francisco (Full Art Car)" (~64px, weight 800, white, line-height ~1.0). Below: venue, **date in lime/yellow brand accent** ("Sat 25 Apr, 2:00 pm GMT-7"), category icon + city.
- **Inset price card:** dark inset rounded panel: `From $29.62` (large) + `The price you'll pay. No surprises later.` (small) + lime "BUY NOW" pill on right. **The transparent-pricing promise is the headline of the card — every other competitor hides this.**
- **About section** plain rich text below.

### Mobile
- Poster image full-width.
- Title + venue + date stack below.
- Sticky bottom card: `From $29.62 / The price you'll pay. No surprises later.` + lime BUY NOW. Universal sticky-CTA pattern.

### Strengths (verbatim — adopt these)
- **Backdrop tinted to artwork** = every event page feels custom without manual design.
- **"The price you'll pay. No surprises later."** baked into the buy card — converts trust into a visual.
- **Audio preview / Top track** = a Spotify-grade differentiator no other ticketing platform has.
- **Sticky bottom CTA on mobile** with the same transparent-pricing line.
- **Tout protection copy** baked into the page.

### Weaknesses
- All-dark canvas excludes audiences.
- "Top track" only works for music events.
- Lime/green accent reads punk, not premium for diaspora-headliner artists.

---

## Eventbrite (Bambi Sundays R&B)

### Desktop
- **Hero:** organiser-uploaded flyer artwork displayed on a soft grey letterbox (object-contain) — preserves the artwork. About 480px tall. **Honours the organiser's design** instead of cropping it.
- Title H1 below image: "Bambi Sundays 'R&B Sessions' • Every Sunday @ Bar Bambi" (large, weight 700).
- Top-right inline icons: share + heart save.
- **Organiser card:** circular avatar + "TOP ORGANIZER" badge + "by Bambi Sundays" + Follow button + social proof line "42 followers • 15 events • 1.4k total attendees".
- **Right-rail ticket card (sticky):** "Free / Multiple dates" + coral "Check availability" CTA.

### Mobile
- Flyer artwork on grey card.
- Share + heart icons inline.
- Title (3 lines).
- Organiser row with TOP ORGANIZER badge + Follow button.
- Location + date rows with icons.
- **Sticky bottom:** "Free / Multiple dates" + coral "Check availability" pill — same pattern as DICE.

### Strengths
- **Organiser flyer respected (object-contain)** — diaspora promoters care about their flyer aesthetic.
- **TOP ORGANIZER badge + follower count + total-attendees** = three layers of social proof on one row.
- Sticky purchase CTA mobile + sticky right rail desktop.

### Weaknesses
- Coral CTA + cream background reads casual, not premium.
- "Check availability" is a weak CTA verb (DICE's "BUY NOW" is more confident).

---

## Synthesis — Event Detail Pattern Library

| Pattern | Source | EventLinqs verdict |
|---|---|---|
| Backdrop tinted to artwork | DICE | **ADOPT.** Hollywood-grade without per-event design work. |
| Transparent pricing line on the buy card | DICE | **ADOPT verbatim.** "The price you'll pay. No fees added later." |
| Sticky bottom-fixed buy CTA on mobile | DICE + EB | **ADOPT.** Universal pattern. |
| Sticky right-rail ticket card on desktop | EB | **ADOPT.** Reduces scroll for buy intent. |
| Organiser flyer respected (contain over cover) | EB | **ADOPT.** Critical for diaspora promoters. |
| Organiser social proof row (badge + followers + total attendees) | EB | **ADOPT and elevate.** Add "Verified by EventLinqs" tier above "TOP ORGANIZER". |
| Audio preview / "Top track" | DICE | **PARK to Phase 2.** Wire to organiser upload of a 30-second snippet. |
| Tab navigation (10+ tabs) | TM | **REJECT.** Overwhelms; we'll use vertical sections. |
| Banner ads on event detail | TM | **REJECT permanently.** No ads, ever. |

## EventLinqs Event Detail — Target Spec (preview)

The full per-page target lives in `eventlinqs-target-spec.md`, but the headline:

1. Backdrop tinted via cover-art dominant colour (CSS custom property set server-side).
2. Two-column desktop layout: poster (object-contain so organiser flyers are honoured) + content + sticky right-rail buy card.
3. Single primary CTA: "Get tickets — AUD $XX" (ink-900 text on gold-500 pill, all-in price already shown).
4. Pricing line under price: "All-in. No fees added at checkout."
5. Organiser row with verified-tier badge, follower count, total attendees, Follow button.
6. Sticky bottom CTA on mobile, dismissed by Get Tickets tap (becomes a sheet drawer).
7. Sections (no tabs): About / Lineup / Venue + map / FAQs / Refund policy / Related events.
8. Share section: WhatsApp first (diaspora primary), then X / Instagram Story / Copy link.
9. Schema.org Event markup, dynamic OG image.
