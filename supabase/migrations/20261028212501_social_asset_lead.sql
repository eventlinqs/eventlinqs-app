-- WHICH PHOTOGRAPH LEADS (Lawal's final directive of 28 October 2026, section 2: "Make the strongest photograph the
-- hero image"). Follows 20261028205501. Additive: one column, its grant, and the reader's order.
--
-- A person sets lead_rank on a night's photographs (1 leads, then 2, ...); the planner, the slide route and the sweep
-- take the night's own photograph with the lowest rank, then the newest approved, then one carried by the organiser's
-- yes. Without ranks the newest approved leads, as before. Changing the rank changes no permission, so it needs no
-- approval of its own.

alter table public.social_assets
  add column if not exists lead_rank smallint check (lead_rank is null or lead_rank between 1 and 99);

comment on column public.social_assets.lead_rank is 'Which of a night''s photographs leads: 1 first. Set by a person (the directive: the strongest photograph is the hero).';

grant update (lead_rank) on public.social_assets to service_role;

create or replace function public.social_usable_images(p_events uuid[], p_at timestamptz)
returns table (event_id uuid, asset_id uuid, asset_url text, attribution_text text, focal_x numeric, focal_y numeric, source_width integer, source_height integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $imgs$
  select distinct on (ev.id) ev.id, a.id, a.asset_url, a.attribution_text, a.focal_x, a.focal_y, a.source_width, a.source_height
    from unnest(p_events) as ev(id)
    join public.social_assets a on public.social_asset_usable_row(a, ev.id, p_at)
   order by ev.id, (a.event_id = ev.id) desc, a.lead_rank asc nulls last, a.approved_at desc
$imgs$;

revoke all on function public.social_usable_images(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.social_usable_images(uuid[], timestamptz) to service_role;

do $post$
begin
  if not has_column_privilege('service_role', 'public.social_assets', 'lead_rank', 'UPDATE')
     or has_column_privilege('service_role', 'public.social_assets', 'asset_url', 'UPDATE')
     or has_function_privilege('anon', 'public.social_usable_images(uuid[], timestamptz)', 'EXECUTE') then
    raise exception 'Lead rank post-condition failed: the grants are not as the rule needs';
  end if;
end
$post$;
