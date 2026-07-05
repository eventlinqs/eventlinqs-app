# Seating edge analysis (2026-07-05)

Where EventLinqs beats the field on reserved seating, feature by feature.
Experience-level study only (no competitor code inspected):
[Humanitix builder guide](https://help.humanitix.com/en/articles/8905642-complete-guide-how-to-build-a-seating-map),
[Humanitix assigned seating](https://help.humanitix.com/en/articles/8893240-build-a-seating-map-for-your-event),
[Humanitix galas guide](https://help.humanitix.com/en/articles/8906272-event-guide-galas-awards-nights),
[Eventbrite reserved seating](https://www.eventbrite.com/organizer/features/reserved-seating/),
[Eventbrite pick your own seat](https://www.eventbrite.co.uk/blog/pick-your-own-seat-for-reserved-seating-events-ds00/),
plus the 2026-07-04 DICE study (dice.fm partner surfaces).

## Feature by feature: them versus us

| Capability | Humanitix | Eventbrite | DICE | EventLinqs now |
|---|---|---|---|---|
| Organiser builder | Rows, round/square tables, areas; drag, rotate, multi-select; per-seat hide/remove/relabel | Drag-and-drop designer; sections, rows, tables; decor objects | None self-serve (seated appears only as a sales-qualification option) | Rows (uneven per-row counts, curve, rotation, custom numbering), round/square tables, standing zones; click tools for blocked/accessible/companion/remove; live validation |
| Buyer seat holds | No documented hold timer | No documented hold timer; seats grey out in real time as others take them | Not applicable on web | Row-locked atomic hold with a visible TTL: two buyers can never carry the same seat to payment (DB-proven) |
| Tables for galas | Sold per seat; whole tables via a separate packaged-ticket workaround | Sold per seat | Not applicable | Sold per seat TODAY (edge 1 below makes it one click) |
| Template reuse | Auto template; ticket mapping must be redone each event | Saved charts | Not applicable | Venue template; tier binding by NAME survives reuse; live events immune to template edits |
| Seat on ticket and door | Ticket and reports | Ticket | Not applicable | Ticket, confirmation, email, bearer QR page AND the door-scan ADMIT panel |
| Real-time feedback | Unavailable seats shown | Real-time grey-out while browsing | Not applicable | Hold-based truth at reserve time (the race is impossible, not just discouraged); no live grey-out while browsing (honest gap, ranked below) |
| Map visual quality | Functional utility grid | Functional, colour-coded tiers | Not applicable | Functional utility grid TODAY (edge 2 below) |
| Growth tie-in | None | None | None | None TODAY (edge 3 below; no competitor has anything here) |

## Ranked edges (impact an organiser notices x effort)

1. **Whole-table gala selling in one click. BUILD.** Galas and dinners are
   a named organiser segment; Humanitix's own guide routes organisers to a
   packaged-tickets workaround and Eventbrite sells chair by chair. A
   "Book the whole table" action on the map (one tap selects every free
   seat at the table, one hold, one checkout) is a pitchable sentence:
   sell tables like a gala, not like a cinema. Effort: moderate (selection
   layer only; the hold RPC already takes up to 20 seats; engine untouched).
2. **A genuinely premium map. BUILD.** Every competitor ships a utility
   grid. A navy and gold staged room with confident hierarchy, refined
   section colours, smooth hover and selection states, and screen-reader
   seat labels is the visible difference in every screenshot an organiser
   compares. Effort: moderate (presentation layer of one component).
   Includes the accessibility edge: every seat individually labelled for
   assistive tech ("Row A Seat 2, available, AUD 25.00"), which neither
   competitor documents.
3. **Share your seat. BUILD.** After a seated purchase the confirmation
   invites "I am in Main room, Row A, Seat 2. Pick a seat near me." with
   the buyer's attributed share link (share-a-ticket). No competitor ties
   seating into a growth loop at all; for community events (tables of
   friends, comedy rows) this is the moment people actually message the
   group chat. Effort: small (confirmation share copy, seat-aware).
4. Smarter best-available: we already pick contiguous runs per row
   (Humanitix documents no equivalent); keep, document, not a build item.
5. Live grey-out while browsing (Eventbrite's edge): real-time channels on
   the map. Honest assessment: our TTL hold makes the race harmless, the
   page refreshes availability on every conflict, and the win is cosmetic
   at our current scale. PARKED behind launch traffic; noted honestly as
   the one axis where Eventbrite remains ahead.
6. Keyboard-driven seat navigation (arrow keys across rows): good, larger
   effort, parked behind the labelled-seat a11y shipped in edge 2.

## Decision

Build edges 1, 2 and 3. Together they make the pitch concrete: sell whole
tables in one tap, on the best-looking seat map in the market, where every
buyer becomes a promoter of the seats around them.
