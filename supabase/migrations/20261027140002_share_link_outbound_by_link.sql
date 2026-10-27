-- ============================================================================
-- THE OUTBOUND PRESS COUNTED, PER BOOKING LINK (window 6, 27 October 2026; the project manager's 12:18 and 12:37 of
-- that day).
--
-- A curated listing carries one clear button to the organiser's own page or booking site, and an "Also on" line for
-- the other places it sells (WI3, event_booking_links, 20261027130001). Every press goes through
-- /out/<event slug>?l=<link id> (src/app/out/[slug]/route.ts, src/lib/broadcast/outbound.ts), which books one
-- share_link_events row before the visitor leaves. The 12:37: "the share_link_events row records the link's provider,
-- so the per-platform count ... comes from one row each."
--
-- 1. The kind check of 20260704000002 (its inline check, named share_link_events_kind_check by Postgres) allows
--    'outbound' as well. Never 'click': 'click' is an ARRIVAL through a link and is what an organiser's reach panel
--    reads as people reached, and a press out to another site must not be counted as one.
-- 2. booking_link_id, the link pressed, and provider, its platform copied at the press, so a count per platform needs
--    no join and survives the link being removed later (on delete set null keeps the count). Both set on an outbound
--    row and on no other kind.
--
-- Additive: every existing row satisfies both checks unchanged, and nothing reads the new kind until the code that
-- writes it is deployed. No table is made, so no grant is written (the 21 October 2026 grant rule applies to a new
-- public table); the two columns inherit the table's row security and grants.
--
-- Reversal: drop the outbound rows, the two columns and their check, and put the kind check back to its three kinds.
-- ============================================================================

begin;

alter table public.share_link_events drop constraint if exists share_link_events_kind_check;
alter table public.share_link_events
  add constraint share_link_events_kind_check check (kind in ('view', 'click', 'conversion', 'outbound'));

alter table public.share_link_events
  add column if not exists booking_link_id uuid references public.event_booking_links (id) on delete set null;
alter table public.share_link_events add column if not exists provider text;

alter table public.share_link_events drop constraint if exists share_link_events_outbound_names_its_link;
alter table public.share_link_events
  add constraint share_link_events_outbound_names_its_link check (
    (kind = 'outbound' and provider is not null)
    or (kind <> 'outbound' and booking_link_id is null and provider is null));

create index if not exists share_link_events_outbound_by_link
  on public.share_link_events (booking_link_id)
  where kind = 'outbound';

commit;
