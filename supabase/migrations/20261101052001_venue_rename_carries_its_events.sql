-- A VENUE'S NEW NAME REACHES ITS EVENTS (WINDOW 4's car 31 gate, 1 November 2026 05:11; Lawal's law 4, one defect is
-- a class). Venue links and the sitemap are built from events.venue_name, and /venues/<handle> now resolves a venue by
-- its own name and redirects an earlier handle to it. Six TEST venues were renamed without their events, so the
-- sitemap published the old handles and each answered 308: indexing went red. Production had 0 such mismatches only
-- because its one rename script updated the events first; nothing held it. Now the database does: when a venue's name
-- changes, every event at it that carried the old name takes the new one. An event whose venue_name was deliberately
-- different (an address shown for an outdoor listing) is left as it is.

create or replace function public.venue_rename_carries_its_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.events
       set venue_name = new.name
     where venue_id = new.id
       and venue_name is not distinct from old.name;
  end if;
  return new;
end;
$$;

revoke all on function public.venue_rename_carries_its_events() from public, anon, authenticated;

drop trigger if exists trg_venue_rename_carries_its_events on public.venues;
create trigger trg_venue_rename_carries_its_events
  after update of name on public.venues
  for each row execute function public.venue_rename_carries_its_events();

do $post$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_venue_rename_carries_its_events') then
    raise exception 'trg_venue_rename_carries_its_events is missing';
  end if;
end
$post$;
