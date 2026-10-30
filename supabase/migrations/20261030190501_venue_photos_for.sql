-- THE CARD CHAIN'S BATCH READ (the project manager's 18:00 of 30 October 2026, (2); window 3's 17:51 ask). A card page
-- lists up to 120 nights, so the chain's second link is read once a page: venue ids in, each venue's best approved
-- photograph out, never a query per card.
--
-- The rule moves here and venue_photo_for now asks this function, so the single read and the page read can never
-- disagree about which photograph may be shown.
--
-- source_url carries the file page the event page's credit links to (the PM's 18:57 (1)). A venue's own photograph may
-- record the email that carried its yes as a mailto: address; a visitor never sees that, so only an https page is
-- answered.
--
-- Additive: one new read and one function restated with the same answer. Nothing existing is altered. Its own file,
-- not an edit of 20261030171501, so a copy of that file already read for the logged apply stays true. Proved on TEST
-- by scripts/verify/venue-images-proof.sql (red on 20261030171501 alone, green with this file), rolled back.

create or replace function public.venue_photos_for(p_venues uuid[], p_use text)
returns table (venue_id uuid, image_url text, attribution_text text, licence text, licence_url text, author text, source_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (i.venue_id)
         i.venue_id, i.image_url, i.attribution_text, i.licence, i.licence_url, i.author,
         case when i.source_url ~* '^https://' then i.source_url end
    from public.venue_images i
   where i.venue_id = any (p_venues)
     and i.approval_state = 'approved'
     and i.verified_depicts_venue
     and p_use = any (i.permitted_uses)
   order by i.venue_id, i.is_primary desc, i.quality_score desc nulls last, i.approved_at desc
$$;

revoke all on function public.venue_photos_for(uuid[], text) from public;
grant execute on function public.venue_photos_for(uuid[], text) to anon, authenticated, service_role;

create or replace function public.venue_photo_for(p_venue uuid, p_use text)
returns table (image_url text, attribution_text text, licence text, licence_url text, author text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.image_url, f.attribution_text, f.licence, f.licence_url, f.author
    from public.venue_photos_for(array[p_venue], p_use) f
$$;

revoke all on function public.venue_photo_for(uuid, text) from public;
grant execute on function public.venue_photo_for(uuid, text) to anon, authenticated, service_role;
