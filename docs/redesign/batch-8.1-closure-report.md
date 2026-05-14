# Batch 8.1 Closure Report - Event Detail Page Launch-Grade Polish

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: CODE COMPLETE - STOP for project manager review

## Mission

The event detail page is the highest-conversion surface on EventLinqs.
Per the Batch 8.1 brief, it needed launch-grade SEO (Schema.org Event
JSON-LD as a launch blocker), state-aware rendering for the five
event states, multi-tier purchase rail, save-heart integration with
the existing `saved_events` table, and WhatsApp-first share.

## Honest scope decision

The existing `/events/[slug]/page.tsx` (709 lines) already shipped in
prior modules covers most ED1-ED11 sections substantially:
- Cinematic hero with HeroMedia + KenBurns
- Multi-tier ticket panel (TicketPanelClient + tier inventory cache)
- Reserved seating flow (SeatSelector)
- Sold-out fallback (EventSoldOut)
- Sticky action bar
- Queue gate (middleware)
- Dynamic pricing (Redis price map)
- Related events grid
- Venue map (lazy-loaded)

Rather than rebuild from scratch (which would risk regressing the
existing checkout / queue gate / seat selector flows that the brief
explicitly told us not to touch), Batch 8.1 added the missing
launch-blocker pieces and integrated them cleanly. This is the
honest, lower-risk path that delivers the brief's actual conversion
and SEO impact without re-introducing bugs in already-working flows.

## What shipped

### Three new components

`src/components/features/events/event-schema-jsonld.tsx` - Schema.org
Event JSON-LD payload generator. Maps event state to schema.org status,
event_type to attendance mode, ticket tiers to `AggregateOffer` with
lowPrice/highPrice/offerCount/availability. Renders Place +
PostalAddress + GeoCoordinates for venue when present. Renders
Organization for organizer with deep link to /organisers/[slug]. Per
the brief this is the launch blocker for SEO competitiveness against
Ticketmaster/DICE/Eventbrite.

`src/components/features/events/event-share-bar.tsx` - WhatsApp-first
share controls. Order: WhatsApp > Facebook > X > Email > Copy link.
Each platform link uses standard share-intent URL with title + date +
URL pre-populated. Copy link uses `navigator.clipboard` with brief
check-mark confirmation. Mobile shows icon-only buttons; desktop adds
labels.

`src/components/features/events/event-state-banner.tsx` - top-of-page
banner for cancelled / postponed / past events. Replaces the previous
full-page-replacement treatment so cancelled and past events still
render the full page with a banner above the hero. SEO impact: every
cancelled event URL retains its archive + customer-service value
instead of becoming a placeholder page. Past banner deep links to
the organiser's upcoming events as the primary recovery CTA.

### Page integrations

`src/app/events/[slug]/page.tsx` updates:

- **generateMetadata rewritten** to the brief's SEO contract:
  - Title: `[Event Name] - [Date] - [Venue] - EventLinqs`
  - Description: 155-char city + summary, click-through optimised
  - Canonical: `/events/${slug}`
  - Open Graph: 1200x630 cover image, og:type=website, alt text
  - Twitter Card: summary_large_image
  - Keywords array

- **EventSchemaJsonLd** rendered alongside EventViewTracker so the
  rich-results pipeline picks up every event.

- **EventStateBanner** replaces full-page-replacement for cancelled /
  completed / postponed. Private / draft / scheduled keep their hard
  block (those events shouldn't surface).

- **SaveEventButton** (existing component, integrates with M5
  `saved_events` table) added to the hero CTA row in `variant='dark'`.

- **EventShareBar** replaces the previous CopyLinkButton.

- **Hero CTA state-aware**: cancelled / past replace 'Get tickets'
  with 'Browse upcoming events' and hide the price label.

### Behaviours preserved unchanged

Per the brief's "DO NOT touch existing checkout flow" rule, all of
these continue to work as before:

- Cinematic hero + HeroMedia + KenBurns + dark gradient
- Multi-tier ticket panel (TicketPanelClient + tier inventory)
- Reserved seating flow (SeatSelector)
- Sold-out fallback (EventSoldOut)
- Sticky action bar (StickyActionBar)
- Queue gate via middleware
- Dynamic pricing (Redis price map)
- Related events grid
- Tags + venue map
- Stripe checkout link path

## Quality gates (2026-05-09)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS - all routes SSG'd, no regressions |
| `npm test` | PASS (10 files, 105 tests) |

## Visual verification

Saved to `docs/redesign/batch-8.1-evidence/`:

- 6 event detail screenshots (3 events × 1440 + 375):
  `event-{slug}-{1440,375}.png`
- 2 sticky purchase rail captures at scroll position 1200:
  `sticky-rail-owambe-sydney-{1440,375}.png`
- 1 SEO verification dump:
  `seo-verification-owambe-sydney-lagos-to-sydney-wedding-after-party.txt`
  - Confirms title format: `Owambe Sydney: Lagos to Sydney Wedding After-Party - Sat, 9 May - Hordern Pavilion, Sydney - EventLinqs`
  - Confirms canonical, og:title, og:description, og:image (1200x630
    with alt), og:url, twitter:card=summary_large_image, twitter:image
  - Confirms Schema.org Event JSON-LD payload with all required
    fields: name, startDate, endDate, eventStatus
    (https://schema.org/EventScheduled), eventAttendanceMode
    (https://schema.org/OfflineEventAttendanceMode), Place +
    PostalAddress + GeoCoordinates, Organization organizer,
    AggregateOffer with offerCount=2 lowPrice=65.00 highPrice=280.00
    availability=InStock

Visual spot-check on Owambe Sydney 1440: the hero shows the title
"Owambe Sydney: Lagos to Sydney Wedding After-Party" with date,
venue (Hordern Pavilion Sydney), gold "Get tickets" CTA + dark
SaveEventButton (gold heart) in the hero CTA row. The sticky right
rail shows multi-tier ticket selector ("General Admission $65" and
"VIP Table $280") with quantity selectors. Below is "About this
event", When/Where info cards, venue map placeholder, organiser
card. The "Share this event" section shows WhatsApp + Facebook + X
+ Email + Copy link buttons in that order. Footer renders cleanly.

## Per-section status (ED1-ED11)

| # | Section | Status | Notes |
|---|---------|--------|-------|
| ED1  | Hero (state-aware) | PASS | Existing cinematic hero + new SaveEventButton + state-aware CTA |
| ED2  | Sticky purchase rail (multi-tier + state) | PASS | Existing TicketPanelClient with tier inventory + dynamic pricing |
| ED3  | Quick info bar | PARTIAL | When/Where info cards present; age restriction badge present; full quick-info bar with Duration/Accessibility/Language pending future polish |
| ED4  | Event description | PASS | summary + description with prose rendering |
| ED5  | Event highlights / What to expect | DEFERRED | event.highlights JSON not in current schema; awaits M11 data layer |
| ED6  | Interactive map (Mapbox) | PASS | Existing VenueMap (lazy-loaded next/dynamic chunk) |
| ED7  | Venue info | PASS | venue_name + full address + 'View venue page' link (route placeholder until /venues/[handle] ships in 8.2) |
| ED8  | Organiser info | PASS | name + brief description; 'View organiser page' deep link (route placeholder until /organisers/[handle] ships in 8.3) |
| ED9  | Similar events rail | PASS | Existing RelatedEventsGrid (4 events same organiser/category/city) |
| ED10 | Related cultures rail | DEFERRED | Cultural deep links wire-up deferred to 8.2/8.3 sequence |
| ED11 | Share & save bar (WhatsApp first) | PASS | EventShareBar component shipped; SaveEventButton in hero |
| ED12 | Reviews / testimonials | OUT OF SCOPE | Brief explicitly removes from Batch 8.1 scope |

## State handling verification

| State | Detection | Render |
|-------|-----------|--------|
| upcoming | default | Standard hero + Get tickets + multi-tier rail |
| sold-out | inventory.available === 0 | EventSoldOut component in ticket panel; AggregateOffer.availability=SoldOut in JSON-LD |
| cancelled | event.status === 'cancelled' | Top banner red w/ refund info; full page renders; Schema.org eventStatus=EventCancelled |
| postponed | event.status === 'postponed' | Top banner yellow w/ new-date placeholder; isTicketingSuspended; Schema.org eventStatus=EventPostponed |
| past | event.status === 'completed' | Top banner gray; hero CTA replaced with 'Browse upcoming events'; full page renders for archive value |

The dev seed has only upcoming events available for visual verification;
sold-out / cancelled / postponed / past visual captures are deferred
until founder seeds events in those states or PM verifies on Vercel
preview with production-like data.

## Files modified

```
src/app/events/[slug]/page.tsx                                   (modified)
src/components/features/events/event-schema-jsonld.tsx           (new)
src/components/features/events/event-share-bar.tsx               (new)
src/components/features/events/event-state-banner.tsx            (new)

scripts/batch-8-1-screenshots.mjs                                (new)
docs/redesign/batch-8.1-evidence/event-{slug}-{1440,375}.png     (6 captures)
docs/redesign/batch-8.1-evidence/sticky-rail-{slug}-{1440,375}.png (2 captures)
docs/redesign/batch-8.1-evidence/seo-verification-{slug}.txt     (1 dump)
docs/redesign/batch-8.1-closure-report.md                        (this file)
docs/sessions/admin-marketing/progress.log                       (appended)
```

## Coordination handoffs

- **C-B8.1-01:** PM runs Vercel preview SEO validator on a sample
  event URL to confirm the Schema.org Event JSON-LD passes Google's
  Rich Results test - the local DOM dump confirms all required
  fields are present.
- **C-B8.1-02:** PM verifies the WhatsApp share intent URL renders
  the expected title + date + URL preview on real iOS Safari +
  Android Chrome.
- **C-B8.1-03:** PM verifies the SaveEventButton tap on a fresh
  authenticated session writes a row to `saved_events`. The button
  itself is unchanged from M5 - this is just smoke-testing the new
  hero placement.
- **C-B8.1-04:** PM seeds at least one cancelled event and one
  postponed event in the dev DB so the EventStateBanner can be
  visually verified end-to-end. Local seed currently has only
  upcoming events.
- **C-B8.1-05:** Future-batch reminder: ED5 (highlights), ED10
  (related cultures rail), reviews (ED12 out of scope) await M11
  data-layer expansions. /organisers/[handle] (Batch 8.2) and
  /venues/[handle] (Batch 8.3) close the deep-link gaps in ED7 + ED8.

## [GATE] Batch 8.1 event detail launch polish complete - STOP for review
