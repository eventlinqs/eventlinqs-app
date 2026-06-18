# Surface 6 - Organiser surface, $100K rebuild

**Date:** 2026-06-07
**Canonical page:** `/organisers` (`OrganisersLandingPage`). `/for-organisers`
already 308-redirects in. One canonical page - no fold/merge needed.
**Competitor bar:** Eventbrite "Become an Event Hosting Legend" / organizer
overview (`https://www.eventbrite.com.au/organizer/overview/`).
**Evidence:** `./competitor/eb-organiser-{1440,390}-{full,fold}.png` (fresh
2026-06-07), our before-state `../after/organisers-1440.png`.

---

## Phase 0 - EB forensic deconstruction

### Hero (warm coral gradient, split composition)
- Top utility nav (Organizer logo, Features / Event Types / Resources /
  Pricing, Contact Sales + dark "Get Started" pill), then a breadcrumb
  (Home > Create Events).
- **Split layout:** text left, lifestyle photo right (women at a festival,
  joyful, in a rounded card). Warm peach-to-coral background wash.
- Headline: very large bold near-black display, ~2 lines: "WHERE EVENT
  ORGANIZERS GROW". Subline: "The all-in-one ticketing and discovery platform
  trusted by millions of organizers and attendees worldwide."
- Two CTAs: dark primary pill "Get started for free" + outline "Contact Sales".
- Hero band ~520px tall desktop. Image-to-text ratio ~50/50.

### Section order (top to bottom)
1. **Hero** (above).
2. **"Event hosting made easy"** - feature band: 3 icon+text features
   (Powerful Publishing, Reporting & Analytics, Organizer App) on the left,
   a phone app screenshot on the right.
3. **"Reach the right people"** ("Grow your community on a marketplace where
   millions of people look for things to do") - alternating feature band:
   icon+text features (Attendee Recovery, Marketing Tools) with a concert
   crowd lifestyle photo on the opposite side.
4. **"All the tools event organizers need..."** - dense multi-column feature
   grid (Event Ticketing, Eventbrite Ads, Marketing Tools, Payments), text
   columns under category headers.
5. **"Get paid, earn more"** - feature band (low-cost fees, Boost) with image.
6. **"Solutions for events of all kinds and sizes"** - image tile grid:
   Music Concerts, Corporate Events, Food & Beverage Events, etc. Each tile a
   photo + label. (Image-forward; the strongest visual section.)
7. **"Grow your event organizer business"** - two text columns.
8. **"Creator Spotlight"** - testimonial/quote with a creator photo.
9. **"Trends and insights from industry experts"** - 3 resource/blog cards
   with images.
10. **"Publish your events for free"** - band with a benefit checklist + CTA.
11. **"Hosting a large or corporate event?"** - contact-sales band.
12. **"Support and resources for event organizers"** - resource cards.
13. **"Grow eventfully"** - closing CTA band.
14. Large multi-column footer.

### Vertical rhythm / craft notes
- Generous section padding (~80-110px desktop), every band separated by a
  surface tint change (white / pale grey / warm wash), never a hairline alone.
- Image in nearly every section. **Zero bare text-pillar sections.** This is
  the gap our current page fails: ours is icon+text pillars and a text wall.
- Type hierarchy: large bold section headlines (~40px), readable body, small
  caps-ish category labels.

---

## Our before-state (failing)
- No hero image (light text-only hero).
- 3 icon+text pillars (bare).
- Bare-number 4-step "how it works".
- **Wall-of-text** "Open to every community" (a paragraph + bullet checklist).
- FAQ accordion (acceptable, needs premium restyle).
- Text-only closing CTA band.
- Verdict: text-forward, template-grade. Below the EB bar across the board, as
  the founder ruled.

---

## Phase 1 + 2 - rebuild structure (match frame-for-frame, then surpass)

Navy #0A1628 / gold #D4A437, light and airy. Manrope/Archivo display at full
scale. All imagery via the media library from the licensed platform photo
library (`public/images/hero/*`), built as swappable slots.

1. **Full-bleed photographic hero** (surpasses EB's contained image card):
   `HeroMedia` full-bleed lifestyle photo + navy bottom-up scrim,
   left-anchored eyebrow + display H1 "Sell tickets. Keep more." + subline
   (transparent-fee story) + gold "Start selling tickets" + outline "View
   pricing". Hero-content stagger on enter; LCP image static.
2. **Stats / social-proof band** - real platform truths only: all-in pricing
   (zero hidden fees), payouts within 5 business days, every community + every
   event type, same-business-day go-live. No fabricated numbers, no fake logos.
3. **Alternating image+text band 1: All-in pricing, keep more** - the
   transparent-fee story EB cannot tell. Image one side, copy the other.
4. **Alternating image+text band 2: Real-time tools for event day** -
   dashboard, guest list, check-in scan app. Sides flipped.
5. **Alternating image+text band 3: Self-serve from day one** - sign up in
   minutes, live same business day. Sides flipped back.
6. **Visual how-it-works** - 4 steps restyled premium (numbered nodes on a
   connecting thread), not bare numbers.
7. **Every-community band (Phase B differentiator)** - replaces the text wall
   with an image tile grid (afrobeats, gospel, caribbean, lunar, latin,
   bollywood, filipino, comedy, amapiano, owambe) + labels. Our community-first
   counterpart to EB's "Solutions for events of all kinds".
8. **Premium FAQ accordion** - keep the help-content wiring, restyle.
9. **Closing CTA band** - elevated, gold-threaded, "Ready to sell tickets?".

### New media surface
- `MarketingMedia` in `src/components/media/` for below-fold marketing-band and
  tile photos (raw `<Image>` stays inside the media library per architecture).
  Adds `MEDIA_SIZES.featureBand` + `MEDIA_SIZES.featureTile`.

### Proof gate
Fresh 1440 + 390 captures beside EB; rewritten Surface 6 table every aspect at
SURPASS; Lighthouse 95+ desktop + mobile on production build; axe 0 serious;
tsc/eslint/vitest/build green. Founder preview URL is the final gate.
