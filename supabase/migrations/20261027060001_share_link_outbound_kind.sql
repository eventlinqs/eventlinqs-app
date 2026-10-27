-- ============================================================================
-- THE OUTBOUND PRESS COUNTED (window 6, 27 October 2026; the project manager's 12:18 of that day).
--
-- A curated listing carries one clear button to the organiser's own page or booking site, through /out/[slug]
-- (src/app/out/[slug]/route.ts, src/lib/broadcast/outbound.ts), which books one share_link_events row before the
-- visitor leaves. Its kind is 'outbound', never 'click': 'click' is an ARRIVAL through a link and is what an
-- organiser's reach panel reads as people reached, and a press out to another site must not be counted as one.
--
-- One change: the kind check of 20260704000002 (its inline check, named share_link_events_kind_check by Postgres)
-- allows 'outbound' as well. Additive: every existing row satisfies it unchanged, and nothing reads the new kind until
-- the code that writes it is deployed. No table is made, so no grant is written (the 21 October 2026 grant rule
-- applies to a new public table).
--
-- Reversal: drop the outbound rows and put the check back to its three kinds; the platform is as it was.
-- ============================================================================

begin;

alter table public.share_link_events drop constraint if exists share_link_events_kind_check;
alter table public.share_link_events
  add constraint share_link_events_kind_check check (kind in ('view', 'click', 'conversion', 'outbound'));

commit;
