-- EVERY PHOTOGRAPH A NIGHT MAY CARRY ON SOCIAL NOW, RANKED (train AI-2, law 37 (k) and (l) of 20 November 2026: "photos
-- are ranked among every one authorised for social use ... never the first one found, and a photo authorised only for
-- the listing is never posted"). Follows 20261028222201. Additive: one new reader beside social_usable_images, which keeps
-- returning the one leading image per night for every caller it has today.
--
-- The rule stays social_asset_usable_row's (scope social or both, approved, current, unexpired, the organiser's own for
-- this night or under their yes), CALLED here and never restated, so the lifecycle planner, the slide route and the
-- posting triggers cannot disagree. The planner chooses among these rows: lead_rank first (set by a person who looked,
-- law 37 (k)), never an image it has posted before.
create or replace function public.social_usable_images_all(p_events uuid[], p_at timestamptz)
returns table (event_id uuid, asset_id uuid, asset_url text, asset_type text, lead_rank smallint, source_width integer, source_height integer, focal_x numeric, focal_y numeric, approved_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $all$
  select ev.id, a.id, a.asset_url, a.asset_type, a.lead_rank, a.source_width, a.source_height, a.focal_x, a.focal_y, a.approved_at
    from unnest(p_events) as ev(id)
    join public.social_assets a on public.social_asset_usable_row(a, ev.id, p_at)
   order by ev.id, a.lead_rank asc nulls last, a.approved_at desc, a.id
$all$;
revoke all on function public.social_usable_images_all(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.social_usable_images_all(uuid[], timestamptz) to service_role;

-- POST-CONDITION: the reader calls the one rule, and only the server may run it.
do $post$
begin
  if position('social_asset_usable_row' in pg_get_functiondef('public.social_usable_images_all(uuid[], timestamptz)'::regprocedure)) = 0 then
    raise exception 'social_usable_images_all does not call social_asset_usable_row';
  end if;
  if has_function_privilege('anon', 'public.social_usable_images_all(uuid[], timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.social_usable_images_all(uuid[], timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.social_usable_images_all(uuid[], timestamptz)', 'EXECUTE') then
    raise exception 'social_usable_images_all grants are wrong';
  end if;
end $post$;
