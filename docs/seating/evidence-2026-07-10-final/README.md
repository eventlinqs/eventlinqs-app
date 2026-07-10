# Seat supremacy re-proof (2026-07-10, final) - zero BEHIND verified

Real-UI proof on the local production build against TEST, after closing the
last three BEHIND rows. Migration 20260710000003 applied to TEST; payment
engine untouched.

## Per-seat notes (BETTER)
- Builder "Add note" tool wrote `Enter via Door G` onto seat A-1 through the
  real canvas (screenshot 01).
- The note is present in the saved chart layout, and materialize_seats carried
  it to `seats.note` on the published event (proof-log: materialise-note).
- The note shows on the order confirmation after a real seated purchase
  (proof-log: note-confirmation "shown on confirmation"; screenshot 03), and on
  my-tickets (screenshot 04). Generator behaviour pinned by a unit test.

## Buyer self-service seat change (EQUAL)
- Per-event opt-in enabled in wizard step 6 (screenshot 02); off by default.
- The "Change my seat" control renders on eligible tickets (3 present on the
  tester's account, screenshot 04).
- Server effect proven deterministically through the exact path changeMySeat
  runs (ownership via order.user_id, then reassign_ticket_seat):
    ownership gate: PASS (order.user_id === buyer)
    options offered to the buyer: 31 available seats
    BUYER SELF-MOVE: A-1 -> A-2
      new seat: sold (order_item bound: true)
      old seat: available (refs cleared: true)
      ticket repointed: true
  A bug was caught and fixed here first: the action originally read a
  non-existent tickets.user_id; ownership is via orders.user_id.

## Capacity reconciliation (EQUAL)
- Wizard step 6 shows a live coverage check comparing the chart's seat count
  against the ticket-tier capacity (a 40-capacity tier covering a 32-seat
  chart reads "your tickets cover all 32 seats").

## Seated purchase regression
- A full seated free purchase completed end to end during this run (proof-log:
  purchase confirmed), zero console errors, so the seated flow is unregressed
  after the changes.

Evidence files: 01-builder-note, 02-wizard-seating-selfservice,
03-confirmation, 04-my-tickets, log.json (this folder).
