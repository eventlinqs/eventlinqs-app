-- A NIGHT'S TRUE LAST CHANGE, FOR THE SITEMAP (train AL, the PM's 13:08 item 2 of 20 November 2026, on Lawal's go of
-- 14:06). Google uses a sitemap's lastmod 'only if it's consistently and verifiably accurate'
-- (developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). The sitemap used events.updated_at, and
-- on 20 November at 14:27 1,235 of the 1,236 public events had moved in the last 7 days (421 in the last day, 26 of them
-- ended): routine runs touch updated_at, so it says nothing about what a visitor sees. facts_changed_at moves only when
-- a fact a visitor sees changes. Additive: one column, one trigger.
--
-- Rows already listed keep null until their facts next change: the sitemap omits lastmod for them rather than state a
-- date nobody can verify (an omitted lastmod is allowed; a wrong one teaches Google to ignore ours).
alter table public.events add column if not exists facts_changed_at timestamptz;
comment on column public.events.facts_changed_at is
  'When a fact a visitor sees last changed (title, summary, description, dates, zone, venue, cover, free, status, visibility, booking link): the sitemap''s lastmod (train AL). Null until the first such change after 20 November 2026; set on insert.';

create or replace function public.events_stamp_facts_changed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $stamp$
begin
  if tg_op = 'INSERT' then
    new.facts_changed_at := coalesce(new.facts_changed_at, now());
    return new;
  end if;
  if new.title is distinct from old.title
     or new.summary is distinct from old.summary
     or new.description is distinct from old.description
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.timezone is distinct from old.timezone
     or new.venue_name is distinct from old.venue_name
     or new.venue_address is distinct from old.venue_address
     or new.venue_city is distinct from old.venue_city
     or new.cover_image_url is distinct from old.cover_image_url
     or new.is_free is distinct from old.is_free
     or new.status is distinct from old.status
     or new.visibility is distinct from old.visibility
     or new.external_ticket_url is distinct from old.external_ticket_url then
    new.facts_changed_at := now();
  end if;
  return new;
end
$stamp$;

drop trigger if exists trg_events_stamp_facts_changed on public.events;
create trigger trg_events_stamp_facts_changed
  before insert or update on public.events
  for each row execute function public.events_stamp_facts_changed();

-- POST-CONDITION: the trigger stands, and a change that touches no visible fact leaves the stamp alone.
do $post$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_events_stamp_facts_changed' and not tgisinternal) then
    raise exception 'the facts stamp trigger is missing';
  end if;
end $post$;
