-- THE MEDIA-RIGHTS RECORD AND THE PHOTOGRAPHY-LED RULE (Lawal's final creative approval of 28 October 2026, 19:52, and
-- its directive's section 8; the engine plan's part D; the release checklist J1 to J6, K2 and K3).
--
-- Follows 20261028141001_social_campaigns.sql (the asset register) and 20261028153001_organiser_permissions.sql (the
-- organiser's yes). Additive: new columns with defaults every existing row meets, one widened kind, and the usable
-- rule rewritten in place under its old signature, so the approval trigger keeps asking the same question.
--
-- 1. THE RECORD. Every asset a post may carry now holds the directive's nine fields: rights holder (rights_holder),
--    original file (original_file), date received (received_on), evidence (permission_evidence, evidence_file),
--    permitted uses (permitted_uses), restrictions, attribution (attribution_text), licence duration (expires_at), and
--    its withdrawal or replacement status (withdrawal_status, withdrawn_at, withdrawal_reason, replaced_by). Someone
--    else's work is refused without the original, the date and the uses. A person may set the crop's focal point, so
--    the subject survives every format's crop.
-- 2. THE RULE (the photography-led direction, Lawal 19:15): a named night carries only its organiser's own image,
--    authorised for that night or under their logged yes for current and future events; a photograph licensed
--    separately (stock, a photographer's licence) appears only on a piece that names no night, so it is never taken
--    for a night it does not show. Nothing withdrawn or replaced is ever usable again.
-- 3. A WITHDRAWAL REACHES WHAT HAS NOT GONE: the posting trigger re-checks every image at the moment the piece went,
--    so an approval given before a withdrawal cannot post it; the hourly sweep (src/app/api/cron/social-image-sweep)
--    regenerates such a piece in type with a decision written by no person, and never touches a piece that has gone.
-- 4. A brand piece (brand_campaign) names no night and carries no picks.

-- ---------------------------------------------------------------------------
-- 1. The record
-- ---------------------------------------------------------------------------
alter table public.social_assets
  add column if not exists original_file text check (original_file is null or length(btrim(original_file)) between 2 and 500),
  add column if not exists received_on date,
  add column if not exists permitted_uses text check (permitted_uses is null or length(btrim(permitted_uses)) between 5 and 1000),
  add column if not exists withdrawal_status text not null default 'current' check (withdrawal_status in ('current', 'withdrawn', 'replaced')),
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawal_reason text check (withdrawal_reason is null or length(btrim(withdrawal_reason)) between 3 and 500),
  add column if not exists replaced_by uuid references public.social_assets(id) on delete restrict,
  add column if not exists focal_x numeric(4, 3) check (focal_x is null or (focal_x >= 0 and focal_x <= 1)),
  add column if not exists focal_y numeric(4, 3) check (focal_y is null or (focal_y >= 0 and focal_y <= 1)),
  add column if not exists source_width integer check (source_width is null or source_width > 0),
  add column if not exists source_height integer check (source_height is null or source_height > 0);

alter table public.social_assets drop constraint if exists social_assets_record_is_whole;
alter table public.social_assets add constraint social_assets_record_is_whole check (
  asset_state in ('native_share', 'original_design')
  or (original_file is not null and received_on is not null and permitted_uses is not null)
);

alter table public.social_assets drop constraint if exists social_assets_focus_is_a_point;
alter table public.social_assets add constraint social_assets_focus_is_a_point check ((focal_x is null) = (focal_y is null));

alter table public.social_assets drop constraint if exists social_assets_withdrawal_is_whole;
alter table public.social_assets add constraint social_assets_withdrawal_is_whole check (
  (withdrawal_status = 'current' and withdrawn_at is null and withdrawal_reason is null and replaced_by is null)
  or (withdrawal_status = 'withdrawn' and withdrawn_at is not null and withdrawal_reason is not null and replaced_by is null)
  or (withdrawal_status = 'replaced' and withdrawn_at is not null and withdrawal_reason is not null and replaced_by is not null and replaced_by <> id)
);

comment on column public.social_assets.original_file is 'The file as the rights holder supplied it (its name or stored path), never a crop.';
comment on column public.social_assets.received_on is 'The day the rights holder supplied it.';
comment on column public.social_assets.permitted_uses is 'What the rights holder allowed, in plain words: an approval for one event is not assumed to cover future events or paid advertising.';
comment on column public.social_assets.withdrawal_status is 'current, withdrawn by the rights holder, or replaced by replaced_by. Never usable again once not current.';

-- An organiser's own post turned organiser authorised by their logged yes (social_log_organiser_yes) is whole from the
-- yes itself: the post is the original, the day of the yes is the day it was given, the yes's words are the uses.
create or replace function public.social_asset_record_from_the_yes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $whole$
declare
  v_perm public.organiser_permissions;
begin
  if new.asset_state = 'organiser_authorised' and new.permission_id is not null then
    select * into v_perm from public.organiser_permissions where id = new.permission_id;
    new.original_file := coalesce(new.original_file, new.asset_url);
    new.received_on := coalesce(new.received_on, (v_perm.granted_at at time zone 'Australia/Melbourne')::date);
    new.permitted_uses := coalesce(new.permitted_uses,
      'EventLinqs listings and social posts, ' || case v_perm.scope when 'current_and_future' then 'now and for future events' else 'for this event' end
      || ', as the organiser''s yes says; not paid advertising.');
  end if;
  return new;
end
$whole$;

-- Named so it runs after social_assets_take_the_yes (triggers fire in name order), which fills permission_id.
drop trigger if exists social_assets_whole_from_the_yes on public.social_assets;
create trigger social_assets_whole_from_the_yes
  before insert or update of asset_state, permission_id on public.social_assets
  for each row execute function public.social_asset_record_from_the_yes();

-- A withdrawal is final and says when: current moves to withdrawn or replaced once, never back, never re-dated.
create or replace function public.social_asset_withdrawal_is_final()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $final$
begin
  if old.withdrawal_status <> 'current' and (new.withdrawal_status, new.withdrawn_at, new.withdrawal_reason, new.replaced_by)
     is distinct from (old.withdrawal_status, old.withdrawn_at, old.withdrawal_reason, old.replaced_by) then
    raise exception 'refused: a withdrawn or replaced asset stays as it was withdrawn.' using errcode = '23514';
  end if;
  if old.withdrawal_status = 'current' and new.withdrawal_status <> 'current' then
    new.withdrawn_at := now();
    if new.withdrawal_status = 'replaced' and not exists (
      select 1 from public.social_assets r
       where r.id = new.replaced_by and r.withdrawal_status = 'current'
         and r.event_id is not distinct from old.event_id
    ) then
      raise exception 'refused: a replacement is a current asset of the same night.' using errcode = '23514';
    end if;
  end if;
  return new;
end
$final$;

drop trigger if exists social_assets_withdrawal_is_final on public.social_assets;
create trigger social_assets_withdrawal_is_final
  before update of withdrawal_status, withdrawn_at, withdrawal_reason, replaced_by on public.social_assets
  for each row execute function public.social_asset_withdrawal_is_final();

-- ---------------------------------------------------------------------------
-- 2. The rule, in one place: usable for this night (or for no night) at this moment
-- ---------------------------------------------------------------------------
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
               )
             )
           -- No night: only a photograph licensed for EventLinqs' own promotion, itself tied to no night.
           else a.asset_state = 'separately_licensed' and a.event_id is null
         end
$row$;

create or replace function public.social_asset_usable(p_url text, p_event uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $ok$
  select p_url is not null
     and exists (select 1 from public.social_assets a where a.asset_url = p_url and public.social_asset_usable_row(a, p_event, p_at))
$ok$;

-- The newest usable image for each night asked (a night's own first, then one carried by its organiser's yes), and
-- with no night asked for, none: a brand piece asks social_brand_images. One reader for the planner, the slide route
-- and the sweep, so the rule is never restated in the application.
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
   order by ev.id, (a.event_id = ev.id) desc, a.approved_at desc
$imgs$;

create or replace function public.social_brand_images(p_at timestamptz)
returns table (asset_id uuid, asset_url text, attribution_text text, focal_x numeric, focal_y numeric, source_width integer, source_height integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $brand$
  select a.id, a.asset_url, a.attribution_text, a.focal_x, a.focal_y, a.source_width, a.source_height
    from public.social_assets a
   where public.social_asset_usable_row(a, null, p_at)
   order by a.approved_at desc
$brand$;

-- ---------------------------------------------------------------------------
-- 3. A withdrawal reaches what has not gone
-- ---------------------------------------------------------------------------
create or replace function public.social_piece_posting_is_approved()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $went$
declare
  v_approval public.social_piece_approvals;
  v_rev public.social_piece_revisions;
  v_slide jsonb;
begin
  select * into v_approval from public.social_piece_approvals where id = new.approval_id;
  if v_approval.id is null or v_approval.piece_id is distinct from new.piece_id then
    raise exception 'refused: that approval is of another piece.' using errcode = '23514';
  end if;
  if exists (select 1 from public.social_piece_revisions r where r.piece_id = new.piece_id and r.version > v_approval.revision) then
    raise exception 'refused: the piece has changed since that approval, so approve it again.' using errcode = '23514';
  end if;
  if new.posted_at < v_approval.approved_at then
    raise exception 'refused: a piece goes after its approval, never before.' using errcode = '23514';
  end if;
  if new.posted_at > now() + interval '5 minutes' then
    raise exception 'refused: a piece is recorded once it has gone, not before.' using errcode = '23514';
  end if;
  select * into v_rev from public.social_piece_revisions where piece_id = new.piece_id and version = v_approval.revision;
  for v_slide in select * from jsonb_array_elements(v_rev.slides) loop
    if coalesce(v_slide->>'photo', '') <> ''
       and not public.social_asset_usable(v_slide->>'photo', nullif(v_slide->>'eventId', '')::uuid, new.posted_at) then
      raise exception 'refused: an image on this piece was withdrawn, replaced or expired after it was approved; it is regenerated without it.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$went$;

-- The sweep's own decision: the image went, so the piece was drawn again in type. Written by no person, and said so.
alter table public.social_piece_decisions alter column decided_by drop not null;
alter table public.social_piece_decisions drop constraint if exists social_piece_decisions_decision_check;
alter table public.social_piece_decisions add constraint social_piece_decisions_decision_check
  check (decision in ('rejected', 'edited', 'regenerated', 'image_withdrawn'));
alter table public.social_piece_decisions drop constraint if exists social_piece_decisions_who;
alter table public.social_piece_decisions add constraint social_piece_decisions_who
  check ((decision = 'image_withdrawn') = (decided_by is null));

alter table public.social_piece_revisions drop constraint if exists social_piece_revisions_made_by_check;
alter table public.social_piece_revisions add constraint social_piece_revisions_made_by_check
  check (made_by in ('planner', 'edit', 'regenerate', 'sweep'));

-- ---------------------------------------------------------------------------
-- 4. The brand piece
-- ---------------------------------------------------------------------------
alter table public.social_pieces drop constraint if exists social_pieces_kind_check;
alter table public.social_pieces add constraint social_pieces_kind_check
  check (kind in ('week_ahead', 'discovery_reel', 'weekend_carousel', 'venue_spotlight', 'organiser_campaign', 'partner_kit', 'brand_campaign'));

-- A brand piece's revisions name no night and pick none.
create or replace function public.social_brand_piece_names_no_night()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $brand$
begin
  if exists (select 1 from public.social_pieces p where p.id = new.piece_id and p.kind = 'brand_campaign')
     and (cardinality(new.event_ids) > 0 or jsonb_array_length(new.picks) > 0
          or exists (select 1 from jsonb_array_elements(new.slides) s where coalesce(s->>'eventId', '') <> '')) then
    raise exception 'refused: a brand piece names no night.' using errcode = '23514';
  end if;
  return new;
end
$brand$;

drop trigger if exists social_brand_pieces_name_no_night on public.social_piece_revisions;
create trigger social_brand_pieces_name_no_night
  before insert on public.social_piece_revisions
  for each row execute function public.social_brand_piece_names_no_night();

-- ---------------------------------------------------------------------------
-- GRANTS: the register still takes an update of its approval columns, and now of its withdrawal columns, nothing else.
-- ---------------------------------------------------------------------------
grant update (withdrawal_status, withdrawn_at, withdrawal_reason, replaced_by) on public.social_assets to service_role;

revoke all on function public.social_asset_usable_row(public.social_assets, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.social_asset_usable(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.social_usable_images(uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.social_brand_images(timestamptz) from public, anon, authenticated;
revoke all on function public.social_asset_record_from_the_yes() from public, anon, authenticated;
revoke all on function public.social_asset_withdrawal_is_final() from public, anon, authenticated;
revoke all on function public.social_brand_piece_names_no_night() from public, anon, authenticated;
grant execute on function public.social_asset_usable_row(public.social_assets, uuid, timestamptz) to service_role;
grant execute on function public.social_asset_usable(text, uuid, timestamptz) to service_role;
grant execute on function public.social_usable_images(uuid[], timestamptz) to service_role;
grant execute on function public.social_brand_images(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_c text;
begin
  foreach v_c in array array['original_file', 'received_on', 'permitted_uses', 'withdrawal_status', 'withdrawn_at', 'withdrawal_reason',
                             'replaced_by', 'focal_x', 'focal_y', 'source_width', 'source_height'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'social_assets' and column_name = v_c) then
      v_missing := v_missing || ' social_assets.' || v_c;
    end if;
  end loop;
  foreach v_c in array array['approval_status', 'approved_by', 'approved_at', 'withdrawal_status', 'withdrawn_at', 'withdrawal_reason', 'replaced_by'] loop
    if not has_column_privilege('service_role', 'public.social_assets', v_c, 'UPDATE') then
      v_missing := v_missing || ' social_assets.update_' || v_c;
    end if;
  end loop;
  foreach v_c in array array['asset_url', 'asset_state', 'event_id', 'rights_holder', 'permitted_uses', 'original_file', 'received_on', 'focal_x', 'permission_id'] loop
    if has_column_privilege('service_role', 'public.social_assets', v_c, 'UPDATE') then
      v_missing := v_missing || ' social_assets.no_update_' || v_c;
    end if;
  end loop;
  if has_table_privilege('service_role', 'public.social_assets', 'DELETE') then
    v_missing := v_missing || ' social_assets.no_delete';
  end if;
  if has_function_privilege('anon', 'public.social_usable_images(uuid[], timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.social_usable_images(uuid[], timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.social_asset_usable_row(public.social_assets, uuid, timestamptz)', 'EXECUTE') then
    v_missing := v_missing || ' functions.staff_only';
  end if;
  foreach v_c in array array['social_assets_whole_from_the_yes', 'social_assets_withdrawal_is_final', 'social_brand_pieces_name_no_night',
                             'social_piece_postings_are_approved', 'social_piece_approvals_are_due'] loop
    if not exists (select 1 from pg_trigger where tgname = v_c and not tgisinternal) then
      v_missing := v_missing || ' trigger.' || v_c;
    end if;
  end loop;
  if public.social_asset_usable('https://x.supabase.co/storage/v1/object/public/event-images/stock/a.avif', null, now()) then
    v_missing := v_missing || ' library_usable';
  end if;
  if exists (select 1 from public.social_assets where withdrawal_status is null) then
    v_missing := v_missing || ' social_assets.withdrawal_default';
  end if;

  if v_missing <> '' then
    raise exception 'Media-rights migration post-condition failed:%', v_missing;
  end if;
end
$post$;
