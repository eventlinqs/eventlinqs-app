-- THE MEDIA REGISTRY FIELDS ON EVERY ASSIGNED PHOTO (A5 of C:\dev\START-16OCT\EVENTLINQS-PHOTO-SYSTEM-31OCT.md, from
-- Lawal's directive of 31 October 2026, 08:50; the controller's 09:12 (a), window 1). For every photo shown for a night:
-- identifier (id), source (source), rights holder, licence or permission scope, approved subject, event or venue,
-- permitted placements, attribution, review date and visual quality; duplicates are refused by the existing unique hash
-- index and near-copy trigger, and its usage is the night or series it holds (event_id, listing_series_id).
--
-- Filled ONCE, when the assignment is made, by one before-insert trigger from the photo's own record (a venue photo
-- from public.venue_images; an organiser's photo from its event), so deal_venue_photos and photo_lock_for_event are not
-- touched. The rows already made are filled by the same rule below. The never-edited guard keeps the photo itself
-- (hash, address, role) fixed; these fields describe it and may be corrected by a reviewed script.
--
-- Additive: nullable columns, one function, one trigger, a backfill; no table, so no grant changes (the 21 October
-- 2026 grant rule: the table stays service role only). Proved on TEST by
-- scripts/verify/photo-assignments-registry-proof.sql through scripts/verify/replay-under-new-default.mjs, rolled back.

alter table public.photo_assignments
  add column if not exists venue_id uuid references public.venues (id) on delete set null,
  add column if not exists approved_subject text,
  add column if not exists rights_holder text,
  add column if not exists licence text,
  add column if not exists licence_url text,
  add column if not exists attribution text,
  add column if not exists permitted_placements text[],
  add column if not exists review_by date,
  add column if not exists visual_quality smallint check (visual_quality is null or visual_quality between 0 and 100);

comment on column public.photo_assignments.approved_subject is 'A5: the one subject the photo shows (venue:<id> or event:<id>); A1.';
comment on column public.photo_assignments.rights_holder is 'A5: who holds the rights (the photographer for a licensed photo, the venue or the organiser for their own).';
comment on column public.photo_assignments.licence is 'A5: the licence or permission scope, as the photo''s own record states it.';
comment on column public.photo_assignments.permitted_placements is 'A5: where the photo may appear (event_card, event_page, venue_page, social).';
comment on column public.photo_assignments.review_by is 'A5: when the right to show it is next reviewed.';

create or replace function public.photo_assignments_registry_fill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_img public.venue_images;
begin
  if new.venue_image_id is not null then
    select * into v_img from public.venue_images where id = new.venue_image_id;
    if v_img.id is not null then
      new.venue_id := coalesce(new.venue_id, v_img.venue_id);
      new.approved_subject := coalesce(new.approved_subject, 'venue:' || v_img.venue_id::text);
      new.rights_holder := coalesce(new.rights_holder, nullif(v_img.author, ''),
                                    case when v_img.source = 'venue' then 'the venue' end);
      new.licence := coalesce(new.licence, v_img.licence);
      new.licence_url := coalesce(new.licence_url, v_img.licence_url);
      new.attribution := coalesce(new.attribution, v_img.attribution_text);
      new.permitted_placements := coalesce(new.permitted_placements, v_img.permitted_uses);
      new.visual_quality := coalesce(new.visual_quality, v_img.quality_score);
    end if;
  elsif new.source = 'organiser' and new.event_id is not null then
    new.approved_subject := coalesce(new.approved_subject, 'event:' || new.event_id::text);
    new.venue_id := coalesce(new.venue_id, (select e.venue_id from public.events e where e.id = new.event_id));
    new.rights_holder := coalesce(new.rights_holder, 'the event''s organiser');
    new.licence := coalesce(new.licence, 'organiser_upload');
    new.permitted_placements := coalesce(new.permitted_placements, array['event_card', 'event_page', 'social']);
  end if;
  new.review_by := coalesce(new.review_by, (coalesce(new.assigned_at, now()) + interval '12 months')::date);
  return new;
end;
$$;

revoke all on function public.photo_assignments_registry_fill() from public, anon, authenticated;

drop trigger if exists photo_assignments_registry_fill on public.photo_assignments;
create trigger photo_assignments_registry_fill
  before insert on public.photo_assignments
  for each row execute function public.photo_assignments_registry_fill();

-- The rows already made, by the same rule (only columns the never-edited guard does not watch are written).
update public.photo_assignments a
   set venue_id = coalesce(a.venue_id, i.venue_id),
       approved_subject = coalesce(a.approved_subject, 'venue:' || i.venue_id::text),
       rights_holder = coalesce(a.rights_holder, nullif(i.author, ''), case when i.source = 'venue' then 'the venue' end),
       licence = coalesce(a.licence, i.licence),
       licence_url = coalesce(a.licence_url, i.licence_url),
       attribution = coalesce(a.attribution, i.attribution_text),
       permitted_placements = coalesce(a.permitted_placements, i.permitted_uses),
       visual_quality = coalesce(a.visual_quality, i.quality_score),
       review_by = coalesce(a.review_by, (a.assigned_at + interval '12 months')::date)
  from public.venue_images i
 where i.id = a.venue_image_id;

update public.photo_assignments a
   set approved_subject = coalesce(a.approved_subject, 'event:' || a.event_id::text),
       venue_id = coalesce(a.venue_id, (select e.venue_id from public.events e where e.id = a.event_id)),
       rights_holder = coalesce(a.rights_holder, 'the event''s organiser'),
       licence = coalesce(a.licence, 'organiser_upload'),
       permitted_placements = coalesce(a.permitted_placements, array['event_card', 'event_page', 'social']),
       review_by = coalesce(a.review_by, (a.assigned_at + interval '12 months')::date)
 where a.source = 'organiser' and a.event_id is not null and a.venue_image_id is null;
