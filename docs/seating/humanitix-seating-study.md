# Humanitix reserved-seating study (2026-07-05)

The founder-chosen reference standard for the EventLinqs reserved-seating
build. Studied as a user via Humanitix's public help centre (experience and
concepts ONLY; no source code, markup, styling, or assets were inspected,
scraped, or reproduced; the EventLinqs implementation is entirely our own).

Sources:
- [Build a seating map and manage assigned seating](https://help.humanitix.com/en/articles/8893240-build-a-seating-map-for-your-event)
- [Complete guide: how to build a seating map](https://help.humanitix.com/en/articles/8905642-complete-guide-how-to-build-a-seating-map)
- [Event guide: galas and awards nights](https://help.humanitix.com/en/articles/8906272-event-guide-galas-awards-nights)
- [How to move an attendee to a different seat](https://help.humanitix.com/en/articles/8914357-how-to-move-an-attendee-to-a-different-seat)

## 1. The organiser builder (their capability set)

Four object types on a free-form canvas recreating a bird's-eye venue view:
1. ROWS: seating blocks with configurable row count and seats per row; rows
   editable individually (variable seats per row = irregular rooms); row
   alignment; starting row letter (A-Z) and seat start number; labels shown
   left/right/both; reversible label order.
2. ROUND TABLES and 3. SQUARE TABLES: seat count adjustable per table; table
   type + prefix naming; seat labels numeric or alphabetical with starting
   value and rotation direction; per-seat label overrides.
4. AREAS: capacity-based zones for standing or non-assigned seating, named.

Canvas interactions: drag positioning, rotate (free angle), duplicate a
block, delete, and a multi-select tool to batch-edit, hide, or remove seats
inside a block. Decorative OBJECTS (shapes, icons, text) annotate bars,
exits, stages.

Seat-level controls: HIDE a seat (visible, not purchasable: their
block/hold device), REMOVE a seat (gone entirely: how irregular rows are
carved), OVERRIDE any seat label, and per-seat notes ("Enter via Door G")
that flow onto tickets and reports. Accessible seats are designated and
managed through the mapping interface.

## 2. Ticket mapping and capacity validation

Ticket types are MAPPED to seating blocks/tables ("mapping tells the system
where buyers can sit based on the ticket type"). Multiple ticket types may
share a seat pool; each seat sells once. The builder cross-checks ticket
type capacity against mapped seat counts and raises "see issue" warnings,
with an Auto Match All fix or manual adjustment. This is their
price-tiers-per-section model: pricing lives on the ticket type, sections
inherit it through mapping.

## 3. Attendee experience

Buyers pick ticket TYPES first, then choose seats on an interactive map at
checkout (only when the organiser enables pick-your-own; otherwise the
organiser assigns manually). The map shows available versus unavailable
states, renders responsively on mobile, and is visible even when selection
is disabled. Seat notes surface on the digital ticket.

## 4. After sales begin

An ASSIGNED tab lists every holder with their seat; search by attendee or
buyer; reassign by clicking a new seat; assign unassigned tickets. Seat
locations sync automatically to digital tickets and reporting on change.
The map remains EDITABLE after sales start; changes apply immediately but
buyers are NOT notified automatically (they recommend a manual email).
Recurring events keep separate seat inventories per date.

## 5. Templates and reuse

A saved map automatically becomes a template copyable to other events in
the account. Only the LAYOUT copies; ticket mapping must be redone per
event (their acknowledged friction point).

## 6. Galas and tables

Tables built as round/square objects; whole-table sales via PACKAGED
tickets ("Table of 10") with group pricing, individual guest details still
collected; or per-seat sales with self-selection or manual assignment.

## 7. Where EventLinqs matches, and where we beat it

MATCH (the baseline capability set): free-form sections of rows, round and
square tables, and capacity areas; variable seats per row; custom row and
seat numbering (alphabetical, numeric, start values, reverse); per-seat
hide/block, remove, accessible designation and label override; ticket-tier
mapping per section with capacity cross-check; reusable venue templates;
organiser sold/remaining view; post-sale reassignment; seat details on the
digital ticket.

BEAT (our structural advantages):
1. REAL SEAT HOLDS AT CHECKOUT. Humanitix documents no buyer-side hold
   timer; EventLinqs already holds selected seats atomically (row-locked
   RPC) with a visible expiry, so two buyers can never carry the same seat
   to payment.
2. VENUE-SCOPED TEMPLATES WITH SAFE EDITING. Our charts are instantiated
   per event (seats copied at attach time), so editing a venue template can
   never corrupt a live event's sold seats: stronger than their
   edit-live-map-and-email-buyers posture.
3. ALL-IN PRICING ON THE MAP. Seat prices shown on hover/selection are the
   same live tier prices checkout charges (single-sourced resolver), with
   the ACCC all-in total before payment.
4. TIER MAPPING PRESERVED ON REUSE where tier names match, removing their
   acknowledged remap-every-event friction.
5. SEAT ON THE QR CHECK-IN VIEW for door staff, not only on the ticket.
