-- AN UNLISTED WALK-IN EVENT'S GUIDE IS READ BY WHOEVER HAS ITS LINK (window 4, written 24 October 2026).
--
-- FOUND BY THE AMCF PAGE PROOF ON TEST, 24 October 13:16: the unlisted listing answered 200 with noindex and
-- carried none of its guide, no days, no acts, no highlights. The event row of a published unlisted event is
-- readable by anyone ("Unlisted published events are viewable", 20260101000001), so its page renders for
-- whoever has the link (src/app/events/[slug]/page.tsx); but the page reads the guide with the public client
-- (src/components/events/walk-in/walk-in-event-page.tsx) and the guide's only public policy admits PUBLIC
-- events ("Walk-in guides of published public events are public", 20261021000020). Every unlisted walk-in page
-- therefore showed an empty programme to everyone but its organiser.
--
-- THE FIX is the guide's twin of the events table's own unlisted policy, written the same way: published,
-- unlisted, and walk-in. Private stays unreadable, as its event row does, and a draft stays its organiser's
-- ("Organisers read their own walk-in guides"). No grant changes: event_guides is already granted select to
-- anon and authenticated (20261021000020), and no table is created.
--
-- THE VERSION sorts after 20261023000001 (on production since 23 October) and before 20261023000010 (WI2,
-- not yet on production), so production applies the two in order whichever branch merges first.

drop policy if exists "Walk-in guides of published unlisted events are readable by their link" on public.event_guides;
create policy "Walk-in guides of published unlisted events are readable by their link"
  on public.event_guides for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.events e
       where e.id = event_guides.event_id
         and e.status = 'published'
         and e.visibility = 'unlisted'
         and e.entry_mode = 'walk_in'
    )
  );
