-- A WITHDRAWN YES CARRIES NO IMAGE (window 3's 21:16 of 28 October 2026, at window 2's note). Follows
-- 20261028205501_social_media_rights.sql (window 3, car 3), whose social_asset_usable_row is the one rule every reader
-- asks (social_usable_images, social_brand_images, the approval, posting and schedule triggers), and
-- 20261028220201_claim_acceptance.sql, which added organiser_permissions.withdrawn_at; 205501 cannot name that column,
-- so the line lands here. The body is window 3's from 205501 with one line added in the yes join:
--   and p.withdrawn_at is null
-- organiser_permission_withdraw already withdraws every current image under the yes in the same transaction, so this
-- holds the rule for any row entered later too. organiser_permission_for already skips a withdrawn yes (220201).
--
-- Reversal: re-create the function from 20261028205501.

create or replace function public.social_asset_usable_row(a public.social_assets, p_event uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $row$
  select a.asset_url !~ '/storage/v1/object/public/event-images/stock/'
     and a.approval_status = 'approved'
     and a.scope in ('social', 'both')
     and a.withdrawal_status = 'current'
     and (a.expires_at is null or a.expires_at > p_at)
     and a.asset_type in ('photo', 'artwork')
     and case
           -- A named night: its organiser's own image, for this night, or under their yes for current and future
           -- events when this night is theirs.
           when p_event is not null then
             a.asset_state = 'organiser_authorised'
             and (
               a.event_id = p_event
               or exists (
                 select 1 from public.organiser_permissions p
                   join public.events e on e.id = p_event
                  where p.id = a.permission_id
                    and p.scope = 'current_and_future'
                    and lower(btrim(p.host_name)) = lower(btrim(e.venue_name))
                    and p.withdrawn_at is null
               )
             )
           -- No night: only a photograph licensed for EventLinqs' own promotion, itself tied to no night.
           else a.asset_state = 'separately_licensed' and a.event_id is null
         end
$row$;

revoke all on function public.social_asset_usable_row(public.social_assets, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.social_asset_usable_row(public.social_assets, uuid, timestamptz) to service_role;

-- POST-CONDITION
do $post$
begin
  if position('withdrawn_at is null' in pg_get_functiondef('public.social_asset_usable_row(public.social_assets, uuid, timestamptz)'::regprocedure)) = 0 then
    raise exception 'withdrawn yes post-condition failed: social_asset_usable_row does not refuse a withdrawn yes';
  end if;
  if has_function_privilege('anon', 'public.social_asset_usable_row(public.social_assets, uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.social_asset_usable_row(public.social_assets, uuid, timestamptz)', 'EXECUTE') then
    raise exception 'withdrawn yes post-condition failed: social_asset_usable_row is callable beyond the service role';
  end if;
end
$post$;
