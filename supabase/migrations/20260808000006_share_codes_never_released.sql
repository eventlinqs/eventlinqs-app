-- A SHARE CODE IS NEVER RELEASED.
--
-- THE DEFECT. share_links.event_id was declared
--   references public.events(id) on delete cascade
-- so deleting an event deleted its share_links rows, and deleting the rows
-- freed the codes. A code freed is a code that can be minted again for a
-- DIFFERENT event, which means a poster in a venue window, a QR on a flyer, or
-- a link in somebody's chat history can silently start pointing at a stranger's
-- event.
--
-- That is not a hypothetical. Luma publishes exactly this behaviour in their
-- own help centre, as a documented consequence of changing an event address:
-- "your old URL becomes available for others to claim. If another event or
-- calendar takes it, the old link points to their page instead of forwarding to
-- yours." Founder ruling, 8 August 2026: we do not repeat it.
--
-- THE FIX. The link row outlives the event.
--   * event_id becomes nullable and the foreign key becomes ON DELETE SET NULL,
--     so deleting an event empties the reference and leaves the row standing.
--   * The existing UNIQUE index on code is then what reserves the string
--     permanently: the row is still there, so the code is still taken, so it can
--     never be handed to a second event.
--   * retired_at records when the event went, so /e/[code] can tell the
--     difference between "no such code" and "that event is no longer listed"
--     and say the honest thing to a person holding an old flyer.
--
-- WHAT THIS DOES NOT DO. It does not resurrect codes already released by a
-- cascade before this migration ran. Those rows are gone and nothing here can
-- know what they were.
--
-- Applied by Lawal with `supabase db push --linked`. Never the Dashboard SQL
-- editor, never the MCP.

alter table public.share_links
  drop constraint if exists share_links_event_id_fkey;

alter table public.share_links
  alter column event_id drop not null;

alter table public.share_links
  add constraint share_links_event_id_fkey
  foreign key (event_id) references public.events(id) on delete set null;

alter table public.share_links
  add column if not exists retired_at timestamptz;

comment on column public.share_links.event_id is
  'The event this code belongs to. NULL once that event is deleted: the row survives so the UNIQUE code can never be reissued to a different event.';

comment on column public.share_links.retired_at is
  'Set when the linked event is deleted, so a person opening an old flyer gets an honest "no longer listed" rather than a 404.';

-- Stamp retired_at the moment an event goes, in the same transaction as the
-- cascade, so the two can never disagree.
create or replace function public.retire_share_links_for_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.share_links
     set retired_at = now()
   where event_id = old.id
     and retired_at is null;
  return old;
end;
$$;

drop trigger if exists share_links_retire_on_event_delete on public.events;
create trigger share_links_retire_on_event_delete
  before delete on public.events
  for each row
  execute function public.retire_share_links_for_event();

-- share_link_events rows point at the LINK, not the event, so attribution
-- history survives an event deletion untouched and the reach panel keeps
-- reconciling. No change needed there; recorded so nobody goes looking.
