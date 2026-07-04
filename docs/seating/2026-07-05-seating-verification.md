# Reserved seating: verification report (2026-07-05)

Founder directive: a production-grade reserved-seating system to the
Humanitix baseline (study: `docs/seating/humanitix-seating-study.md`),
universal and fully organiser-configurable, proven with artefacts. TEST
database only (vkapkibzokmfaxqogypq); production untouched; the
funds-holding payment engine unmodified (seat pricing routes through the
existing PaymentCalculator and the existing row-locked reservation path).

## What already existed (the audit the directive required)

The codebase carried a substantial seating foundation from earlier work:
- Tables `seat_maps` (venue-scoped, layout JSONB), `seat_map_sections`,
  `seats` (materialised PER EVENT with x/y coordinates), `seat_holds`, and
  `tickets.seat_id`, all live on TEST (empty).
- `create_seat_reservation`: an atomic, row-locked (FOR UPDATE) hold RPC
  flipping seats available -> reserved with a TTL.
- `materialize_seats`: layout JSONB -> per-event seat rows.
- A 643-line SVG `SeatSelector` (zoom, hover, best-available picker,
  per-section price legend) and a paid seat checkout path
  (`processSeatCheckout`) pricing seats through the SAME single-source
  resolvers and `PaymentCalculator` (engine untouched), including a free
  short-circuit; the Stripe webhook marked seats sold idempotently.
- Organiser per-event seat list with production hold/release actions; a
  CSV import as the only "builder" (the visual builder page was a
  placeholder); event create/edit already attached seat maps and
  materialised seats.

## What was missing and is now built

1. Tickets never carried their seat: `assign_order_seats()` pairs an
   order's minted tickets with its reservation's seats;
   `issue_tickets_for_order` calls it (mint logic untouched). The seat now
   renders on the bearer QR ticket page, My tickets, the order
   confirmation page, the confirmation email (HTML and text), and the door
   scanner result (`scan_ticket` returns `seat_label`).
2. Abandoned holds never released their seats: the reservation-expire cron
   now calls `release_expired_seat_reservations()`.
3. The visual seat-map builder (see Technology choice): row blocks with
   uneven per-row counts, curve and rotation, alphabetical or numeric
   numbering with custom starts and reversal, round and square tables,
   standing/GA zones, per-seat click tools (blocked, accessible,
   companion, remove), per-section colour and tier binding by name,
   drag positioning, live validation, reusable per venue.
4. Seat identity was event-wide unique, making Row A impossible in two
   sections; now unique per section.
5. `materialize_seats` v2: refuses to re-materialise an event holding
   reserved or sold seats (template edits can never corrupt a live
   event), honours per-seat type and blocked state, upserts sections,
   binds sections to the EVENT's tiers by name on attach (removing
   Humanitix's remap-every-event friction).
6. Mixed events: tiers with no seats sell as general admission beside the
   chart; seat-bound tiers never leak into the GA panel. Standing zones
   render on the map.
7. The `seated_events` feature flag (DB-backed, default ON for testing)
   gates the seated experience; flag off or no materialised chart means
   the event sells as general admission.
8. FOUND AND FIXED during evidence: anonymous buyers could never hold a
   seat (the reservation violated the `reservations_has_owner` CHECK).
   `create_seat_reservation` now carries the same guest-session identity
   as the general-admission path (20260705000002, applied to TEST).

## Technology choice

Extend the existing custom SVG system rather than adopt a third-party
seat-map product or canvas library. Reasons: the coordinate-based schema
and SVG renderer already existed and are wholly our own code (no licence
exposure; the directive's legal boundary holds by construction); SVG
comfortably renders low-thousands of nodes with the memoisation already in
place (proven below at 1,200 seats on mobile); a commercial seat-map SaaS
would put the venue moat's core capability on someone else's subscription.
The builder writes block definitions; one pure module
(`src/lib/seating/generate.ts`, 14 pinned unit tests) turns blocks into
seats with absolute coordinates, and the SAME module runs in the builder
preview and the server save path, so what the organiser sees is exactly
what materialises. No capacity ceiling exists anywhere in the pipeline.

## Migrations (TEST only, additive, reversible)

- `20260705000001_reserved_seating_v2.sql`: flag seed, assign_order_seats,
  release_expired_seat_reservations, materialize_seats v2, scan_ticket
  seat_label, per-section seat uniqueness. Down path documented in-file.
- `20260705000002_seat_reservation_guest_session.sql`: guest-session
  ownership for anonymous holds. Down path documented in-file.
Both applied to TEST with `supabase db push --linked` and verified live by
direct REST probes and the evidence battery.

## Evidence

### Three venue shapes, all built and sold against (universality)

Seeded by `scripts/seed-seated-venues.mjs` through the builder's own
generator, under the Stripe-ready test organisation:

| Venue | Shape | Seats | Proof |
|---|---|---|---|
| The Cellar Comedy Room | 5 uneven curved rows (4,6,7,6,5), 2 seats removed at a pillar, accessible pair + companion, 1 production block, bar standing zone (GA tier) | 26 + 10 standing | Built AGAIN through the builder UI by the drive (screenshots below); free event sold against the UI-built chart |
| Regent Theatre Geelong | Stalls 14 curved uneven rows (A Reserve), numeric-row Balcony (B Reserve), two rotated Box blocks (Box seat) | 504 across 3 sections | Materialised with per-section tier binding by name |
| Harbourside Pavilion gala | 12 round tables of 10 + square head table of 8, sold per seat | 128 | Materialised; table seats read "Gala floor, Table 1, Seat 5" |
| Geelong Arena Hall | 30 x 40 single section | 1,200 | The performance chart |

### Database proofs (`docs/seating/evidence/db-proofs.json`, ALL GREEN)

- CONCURRENCY: two simultaneous anonymous buyers requested the SAME cellar
  seat; exactly one reservation succeeded, the loser received "One or more
  seats are no longer available"; the seat row shows status `reserved`
  with the winner's reservation id; the winning reservation row carries
  the seat in items.
- ADVERSARIAL: a crafted request for a non-existent seat id and for the
  just-taken seat were both rejected server-side by the row-locked RPC.
- HOLD EXPIRY: a held seat whose reservation expiry passed returned to
  `available` (reservation_id cleared) via
  `release_expired_seat_reservations`, the exact RPC the every-minute cron
  calls; the reservation flipped to `expired`.

### End-to-end purchases and artefacts (`docs/seating/evidence/`)

All driven through the real UI against a local production build on TEST,
with Stripe webhooks forwarded by `stripe listen` (ui-proofs.json holds the
machine-readable record):

- ORGANISER BUILDER, driven by clicks: chart "Cellar built by organiser
  flow" composed in the UI (uneven rows 4,6,7,6,5 typed into the per-row
  field, curve 14, standing zone, TWO SEATS REMOVED BY CLICK with the
  Remove tool), saved "Saved: 26 seats."
  (builder-comedy-desktop.png, builder-comedy-saved.png)
- ATTENDEE MAP: desktop and mobile captures of the live chart with legend,
  best-available picker, standing zone, and the mixed general-admission
  panel below the map (attendee-map-desktop.png, attendee-map-mobile.png).
- FREE PURCHASE, anonymous guest, ON THE UI-BUILT CHART: two seats picked
  on the map, held, checkout completed to confirmation. Tickets
  EL-J78H-XHSC and EL-K3JE-K4MX minted VALID with seats "Main room, Row B,
  Seat 3" and "Main room, Row B, Seat 5"; both seat rows SOLD. The bearer
  QR ticket page shows the seat. (free-checkout-desktop.png,
  free-confirmation-desktop.png, free-ticket-qr-desktop.png)
- PAID PURCHASE, card 4242: seat picked, held, paid through Stripe
  Elements; webhook confirmed order EL-EJEHVWY3 at AUD 27.50 (the locked
  all-in for a $25.00 seat: $1.87 platform + $0.63 processing, engine
  untouched); ticket EL-3NDJ-W6YC carries seat_id, seat "Main room, Row A,
  Seat 2" SOLD; the confirmation page renders the seat on the ticket card.
  (paid-checkout-desktop.png, paid-payment-desktop.png,
  paid-confirmation-desktop.png)
- DOOR SCAN: manual code + secret entry at /scan admitted the free ticket
  with the green ADMIT panel reading "Main room Row B Seat 3"; the ticket
  flipped to scanned (scan_count 1) and ticket_scans logged "admitted".
  (scan-admit-seat-desktop.png)
- ORGANISER ROOM VIEW: the sold seats coloured on the room map with live
  counts after the sale (organiser-room-view-desktop.png).

### Large-venue performance (mobile profile, production build)

The 1,200-seat arena chart renders 1,201 SVG nodes (1,200 seats + stage)
with the map interactive in 2,330ms from navigation and a 210ms first
seat-click response on the iPhone 13 Playwright profile
(attendee-map-arena-1200-mobile.png). The proof also CAUGHT a real bug:
PostgREST's 1,000-row response cap silently truncated charts beyond 1,000
seats; both seat fetches now page in chunks (fixed and re-measured).

### Defects found and fixed BY this evidence gate

1. Anonymous buyers could never hold a seat (ownerless reservation
   violated reservations_has_owner): fixed in 20260705000002.
2. NO seated order, free or paid, could ever confirm or mint tickets
   (confirm_order threw 22023 on the seat items object): fixed in
   20260705000003. This also blocked the paid webhook path.
3. Charts beyond 1,000 seats silently truncated (PostgREST row cap):
   chunked fetches on the attendee map and organiser room view.

### Gates at close

- tsc: clean. eslint: clean. vitest: full suite green including 14 seat
  generator tests and the seat-line email tests.
- Functional smoke on the seated flow IS the drive above: navigation,
  builder forms, seat selection, hold, checkout (guest and signed-in),
  payment, confirmation, bearer ticket, door scan, organiser room view,
  all exercised through the real UI with zero manual intervention.

## How this matches or beats the Humanitix baseline

MATCHED (their documented capability set): free-form composition of row
blocks, round and square tables and capacity areas; variable seats per
row; custom row and seat numbering (start values, alphabetical or numeric,
reverse); per-seat hide/block, remove, accessible designation; ticket-tier
mapping per section; reusable venue templates; organiser sold/remaining
view; seat details on the digital ticket.

BEATEN:
1. Real buyer-side seat holds with a hard TTL and row-locked atomicity
   (two buyers can never carry the same seat to payment); Humanitix
   documents no hold timer.
2. Template edits can NEVER corrupt a live event (per-event
   materialisation + a hard guard); Humanitix edits the live map and
   recommends emailing buyers afterwards.
3. Tier mapping survives chart reuse when tier names match; Humanitix
   requires remapping every event.
4. The seat prints on the DOOR SCAN result, not only the ticket.
5. All-in pricing law holds on the map: displayed seat prices resolve from
   the same live pricing source checkout charges.

## Founder decisions needed

1. The organiser ownership checks on the seat-map builder and seats pages
   gate on organisation OWNER only (the pre-existing pattern);
   organisation members with manager roles cannot yet build charts.
   Extend to members when staff roles matter.
2. Whole-table selling for galas (one click books the table) is a natural
   next step; today gala tables sell per seat (Humanitix parity is via
   packaged tickets, which EventLinqs does not yet have).
3. Post-sale seat REASSIGNMENT (Humanitix's Assigned tab) is not built:
   organisers can hold/release and see the room, but moving a sold ticket
   to another seat needs a small dedicated action + audit trail.
4. The legacy CSV import path remains; retire or keep as a bulk option.
