-- A CHALLENGED PHOTOGRAPH REACHES A PERSON (the project manager's 16:42 of 30 October 2026: venues and organisers can
-- challenge a photograph). A challenge takes a photograph off every night at once, and 20261030171501's queue listed
-- only candidates and pending photographs, so a challenged one left the site and reached nobody. It now waits in Lawal's
-- queue with what was said, for staff to approve it again or refuse it, which venue_image_approve and venue_image_refuse
-- already do.
--
-- The return type gains a column, so the function is dropped and made again in this one file. Nothing reads it but the
-- service role. Proved on TEST by scripts/verify/venue-images-proof.sql, red without this file, rolled back.

drop function if exists public.venue_photo_queue();

create function public.venue_photo_queue()
returns table (
  id uuid, venue_id uuid, venue_name text, venue_city text, image_url text, source text, source_url text, licence text,
  attribution_text text, quality_score smallint, width integer, height integer, match_method text, match_distance_m numeric,
  permission_evidence text, challenge_reason text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.venue_id, v.name, v.city, i.image_url, i.source, i.source_url, i.licence, i.attribution_text, i.quality_score,
         i.width, i.height, i.match_method, i.match_distance_m, i.permission_evidence, i.challenge_reason
    from public.venue_images i
    join public.venues v on v.id = i.venue_id
   where i.approval_state in ('candidate', 'pending', 'challenged')
   order by v.name, i.created_at
   limit 2000
$$;

revoke all on function public.venue_photo_queue() from public, anon, authenticated;
grant execute on function public.venue_photo_queue() to service_role;
