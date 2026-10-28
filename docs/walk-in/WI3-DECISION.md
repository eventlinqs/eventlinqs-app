# WI3: one event, every place it sells. The data half (window 3, 27 October 2026)

The project manager's 12:18 and 12:30 of 27 October 2026, on Lawal's 12:16 and 12:23: every curated listing,
free or ticketed, shows its full details and one clear button to the organiser's own page or booking site; one event
sold on two, three or more platforms is ONE listing with every place it sells, never one card per platform. "He wants
to sell tickets. That's all that matters to him."

Governing laws (CLAUDE.md Law 0): Definition of Done, Law 7 (sources fetched and cited), Law 5 (no dead links: never
a dead button), Verification and gates (Migrations, the 21 October grant rule), Law 8 (authorship).

## What stood

`events.external_ticket_url` (20260815000001): one external URL an organiser's event sells at; read by the sale gate,
the reservation guard, the fee, the visibility filters, the short link and attribution, and written by no product
path. The listings import (WI2) refused every row that needed a booking ("WI3 lists these").

## Sources (Law 7), read 27 October 2026

- Bandsintown, https://help.artists.bandsintown.com/en/articles/2580594-how-do-i-add-multiple-ticket-links-to-an-event:
  "the only ticket type options available are Tickets, Presale, VIP, Free and Sold Out." and "All of the links,
  including those you provide, are surfaced on the Bandsintown platform." The page does not say how several links
  are ordered: UNSOURCED, so the order below is the 12:30's own rule.
- Google, https://developers.google.com/search/docs/appearance/structured-data/event ("Last updated 2026-09-08 UTC"):
  offers, "A nested Offer, one for each ticket type"; offers.price, "The lowest available price available for your
  tickets, including service charges and fees"; availability InStock, SoldOut, PreOrder; offers.url, "The URL of a
  page providing the ability to buy tickets." Several sellers of one event are not addressed: UNSOURCED (the 12:30
  (8), window 2's).

## Decided three ways, criteria first

Criteria: (1) one event, one card, every place it sells; (2) every reader that refuses a checkout on an externally
ticketed event keeps working, reading ONE source; (3) never a dead button, never chosen by what pays EventLinqs;
(4) the database holds it, not each call site; (5) granted under the 21 October rule.

A. A table of links, the button chosen by the database, and `external_ticket_url` its mirror kept by the database
   both ways (a direct write becomes the organiser's own link; null takes every link away). Meets 1 to 5. Chosen.
B. A table of links read by the page, `external_ticket_url` left as the organiser's own field. Loses on 2: two
   sources, and a curated ticketed listing would not be refused a checkout by the sale gate.
C. Several URL columns on events. Loses on 1 and 4: a fixed number of platforms, and no place for availability,
   price and who set it.

A third entry mode ("ticketed elsewhere", the 12:18's words) is NOT added: the 12:30 (newer) expresses it by the
links themselves, and a third mode would leak into the organiser's editor, which branches on tickets or walk in
everywhere (src/app/(dashboard)/dashboard/events/actions.ts, event-form.tsx).

## Built

- `supabase/migrations/20261027130001_wi3_event_booking_links.sql`: `event_booking_links` (provider, url, kind,
  availability, price with its check, is_primary only for the organiser, set_by, pointed_to_by_organiser, position);
  `event_booking_button(event)`; the mirror both ways; every existing external URL its organiser's primary link;
  row security and grants; its own post-conditions.
- `src/lib/events/booking-links.ts`: providerOf, buttonOf, alsoOn, priceToShow (within 24 hours), sameEvent (the
  same venue, a start within two hours, titles alike), bookingLinksSql (the import's writer: curated links only,
  never over what an organiser set).

## Proved

- `tests/unit/events/booking-links.test.ts`, 10 of 10.
- `scripts/verify/wi3-booking-links-proof.sql` through `replay-under-new-default.mjs` on TEST, under Supabase's own
  opt-in, rolled back: "PROOF PASSED, 0 failure(s)", T1 to T10 (docs/walk-in/wi3-proof-run.txt).

## Open, each named

- The title share for one event, a half of the shorter title's words: UNSOURCED, no page gives one. Reversal: a merge
  the project manager undoes, or a duplicate card a visitor reports, moves it.
- Window 4: the import's multi URL rows (the 12:30 (9)) call `bookingLinksSql` and `sameEvent`. BUILT 27 October 2026 (window 4) as
  `supabase/migrations/20261027184501_listing_series_booking_links.sql`: the import takes "Tickets" and "Free;
  registration required" rows with `booking_urls` and `price_from` (src/lib/listings/listing-rows.ts), keeps them on
  `event_series.booking_links`, and the listings run makes such a night a tickets event and writes its curated links,
  so the database sets the button and `external_ticket_url`. The hero and sticky bar name that one button
  (`heroSaleWords`). Not built: `sameEvent` across two files (each file's rows are one event per row), and a link that
  changes after its night is made (window 6's daily check writes availability and price).
- Window 2: the page reads the links (`buttonOf`, `alsoOn`, `priceToShow`, `PROVIDER_NAMES`).
- Window 6: the daily link check writes availability and price; the claim writes the organiser's primary.

Reversal condition: if an event shows a dead button, two cards for one event, or a checkout while any link stands,
the proof's T5, T6, T8 or the sale gate's own tests fail.
