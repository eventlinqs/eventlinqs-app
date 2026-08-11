-- The waitlist bridge, part 3: make the weekly city digest attributable.
--
-- WHY. The digest is the ONE mechanism that puts a brand new organiser's
-- event in front of strangers on day one. It linked straight to
-- /events/<slug>, so every click it produced was invisible: the organiser
-- could not tell that the platform had sold them a ticket, and the platform's
-- own claim ("every share is measured against real ticket sales") did not
-- hold for the one channel the platform itself controls.
--
-- Adding 'digest' to the allowed share channels lets the digest carry a
-- tracked short link per event, so its clicks, orders and tickets land in the
-- organiser's reach panel beside WhatsApp and the poster QR.
--
-- WHY NOT REUSE 'email'. 'email' means the organiser mailed their own list.
-- Folding the platform digest into it would destroy the only number that
-- answers "which channel filled the room", which is the product's claim.
--
-- SAFETY. One check constraint on one column, widened, never narrowed. No
-- existing row can violate the new constraint because it is a strict
-- superset of the old one. No data is written, moved or deleted. No payment,
-- order, ticket or payout table is touched.
--
-- Apply with `supabase db push --linked` from PowerShell against the TEST
-- project. NEVER the Dashboard SQL editor, NEVER the Supabase MCP, NEVER
-- against Production without Lawal running it himself.

begin;

alter table public.share_links
  drop constraint if exists share_links_channel_check;

alter table public.share_links
  add constraint share_links_channel_check check (channel in (
    'instagram', 'facebook', 'linkedin', 'x', 'whatsapp', 'messenger',
    'email', 'sms', 'copy', 'native', 'qr', 'digest', 'other'
  ));

commit;
