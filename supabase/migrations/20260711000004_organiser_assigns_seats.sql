-- Organiser-assigns seating mode (seating parity audit 2026-07-11). Additive
-- only: a per-event toggle where buyers purchase a seated event WITHOUT
-- picking seats (GA-style quantity) and the organiser assigns seats manually
-- from the sold list. Assignment rides the existing reassign_ticket_seat RPC,
-- which already supports tickets with no current seat (old_seat null path).
-- The payment engine is untouched. DOWN: drop the column.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS organiser_assigns_seats BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.events.organiser_assigns_seats IS
  'Reserved-seating mode: when true, buyers purchase tiers without picking seats and the organiser assigns seats post-sale from the seat management screen. Ticket, QR and door scan resolve the seat live once assigned.';
