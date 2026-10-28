-- APPROVED PIECES SCHEDULE THEMSELVES; PUBLISHING WAITS FOR META (the release checklist B5 and PM note 7; the project
-- manager's 20:17 of 28 October 2026 from Lawal's 20:16: "approved posts schedule themselves once Meta allows
-- publishing").
--
-- Follows 20261028205501. Additive: one table, one switch row, two triggers.
--
-- A piece's NEWEST revision, once a person approves it (F8), is given its moment on each network by the planner's own
-- cadence (src/lib/social/cadence.ts), as a schedule row. Nothing is published by scheduling (F9). A schedule becomes
-- published only when:
--   the switch social_auto_publish is on (feature_flags; it is OFF and stays off until Lawal's Meta app review passes
--   and he turns it on: C:\dev\GO-LIVE-LIST.md),
--   its approval is still of the newest revision (an edit, a regeneration or the image sweep voids it),
--   every image on that revision is still usable for its slide at that moment (20261028205501's rule),
--   and the network's own reference for the post is recorded.
-- Anything else is held with its reason. Until then the founder posts by hand from /admin/social and records the
-- post's address, exactly as today.

create table if not exists public.social_piece_schedules (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.social_pieces(id) on delete cascade,
  approval_id uuid not null references public.social_piece_approvals(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook')),
  go_at timestamptz not null,
  state text not null default 'scheduled' check (state in ('scheduled', 'published', 'held')),
  held_reason text check (held_reason is null or length(btrim(held_reason)) between 3 and 500),
  published_ref text check (published_ref is null or published_ref ~* '^https://(www\.)?(instagram\.com|facebook\.com|fb\.com)/[^[:space:]]+$'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (piece_id, platform, approval_id),
  constraint social_piece_schedules_state_is_whole check (
    (state = 'scheduled' and held_reason is null and published_ref is null and published_at is null)
    or (state = 'held' and held_reason is not null and published_ref is null and published_at is null)
    or (state = 'published' and held_reason is null and published_ref is not null and published_at is not null)
  )
);

create index if not exists social_piece_schedules_due on public.social_piece_schedules (go_at) where state = 'scheduled';

comment on table public.social_piece_schedules is
  'B5: an approved piece''s moment on a network. Published only with the switch social_auto_publish on, its approval still of the newest revision and every image still usable; otherwise held with the reason. Planning and scheduling never publish (F9).';

insert into public.feature_flags (flag, enabled, description)
values ('social_auto_publish', false, 'Approved weekly campaign pieces publish themselves at their scheduled moment. OFF until Meta approves the app (instagram_business_content_publish, pages_manage_posts) and Lawal turns it on; until then he posts by hand from /admin/social.')
on conflict (flag) do nothing;

-- The approval a schedule names is of the newest revision, and the moment is after it.
create or replace function public.social_piece_schedule_is_due()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $due$
declare
  v_approval public.social_piece_approvals;
begin
  select * into v_approval from public.social_piece_approvals where id = new.approval_id;
  if v_approval.id is null or v_approval.piece_id is distinct from new.piece_id then
    raise exception 'refused: that approval is of another piece.' using errcode = '23514';
  end if;
  if exists (select 1 from public.social_piece_revisions r where r.piece_id = new.piece_id and r.version > v_approval.revision) then
    raise exception 'refused: the piece has changed since that approval, so approve it again.' using errcode = '23514';
  end if;
  if exists (select 1 from public.social_piece_postings p where p.piece_id = new.piece_id) then
    raise exception 'refused: this piece has gone already.' using errcode = '23514';
  end if;
  if new.go_at < v_approval.approved_at then
    raise exception 'refused: a piece goes after its approval, never before.' using errcode = '23514';
  end if;
  if new.state <> 'scheduled' then
    raise exception 'refused: a schedule starts as scheduled.' using errcode = '23514';
  end if;
  return new;
end
$due$;

drop trigger if exists social_piece_schedules_are_due on public.social_piece_schedules;
create trigger social_piece_schedules_are_due
  before insert on public.social_piece_schedules
  for each row execute function public.social_piece_schedule_is_due();

-- Published only with the switch on, the approval still newest, every image still usable, at its moment or after.
create or replace function public.social_piece_schedule_may_publish()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $go$
declare
  v_approval public.social_piece_approvals;
  v_rev public.social_piece_revisions;
  v_slide jsonb;
begin
  if old.state <> 'scheduled' then
    raise exception 'refused: a schedule that was published or held stays as it is; schedule the piece again.' using errcode = '23514';
  end if;
  if new.state = 'published' then
    if not coalesce((select enabled from public.feature_flags where flag = 'social_auto_publish'), false) then
      raise exception 'refused: publishing is switched off (social_auto_publish) until Meta approves the app.' using errcode = '23514';
    end if;
    if new.published_at < new.go_at then
      raise exception 'refused: a piece is published at its moment, never before.' using errcode = '23514';
    end if;
    select * into v_approval from public.social_piece_approvals where id = new.approval_id;
    if exists (select 1 from public.social_piece_revisions r where r.piece_id = new.piece_id and r.version > v_approval.revision) then
      raise exception 'refused: the piece has changed since that approval, so approve it again.' using errcode = '23514';
    end if;
    select * into v_rev from public.social_piece_revisions where piece_id = new.piece_id and version = v_approval.revision;
    for v_slide in select * from jsonb_array_elements(v_rev.slides) loop
      if coalesce(v_slide->>'photo', '') <> ''
         and not public.social_asset_usable(v_slide->>'photo', nullif(v_slide->>'eventId', '')::uuid, new.published_at) then
        raise exception 'refused: an image on this piece is no longer usable; it is drawn again in type and approved again.' using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end
$go$;

drop trigger if exists social_piece_schedules_may_publish on public.social_piece_schedules;
create trigger social_piece_schedules_may_publish
  before update on public.social_piece_schedules
  for each row execute function public.social_piece_schedule_may_publish();

alter table public.social_piece_schedules enable row level security;
revoke all on public.social_piece_schedules from public, anon, authenticated, service_role;
grant select, insert on public.social_piece_schedules to service_role;
grant update (state, held_reason, published_ref, published_at) on public.social_piece_schedules to service_role;
revoke all on function public.social_piece_schedule_is_due() from public, anon, authenticated;
revoke all on function public.social_piece_schedule_may_publish() from public, anon, authenticated;

-- POST-CONDITIONS
do $post$
declare
  v_missing text := '';
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'social_piece_schedules' and c.relrowsecurity) then
    v_missing := v_missing || ' social_piece_schedules.rls';
  end if;
  if has_table_privilege('anon', 'public.social_piece_schedules', 'SELECT') or has_table_privilege('authenticated', 'public.social_piece_schedules', 'SELECT')
     or has_table_privilege('service_role', 'public.social_piece_schedules', 'DELETE')
     or has_column_privilege('service_role', 'public.social_piece_schedules', 'go_at', 'UPDATE')
     or has_column_privilege('service_role', 'public.social_piece_schedules', 'approval_id', 'UPDATE')
     or not has_column_privilege('service_role', 'public.social_piece_schedules', 'state', 'UPDATE') then
    v_missing := v_missing || ' social_piece_schedules.grants';
  end if;
  if coalesce((select enabled from public.feature_flags where flag = 'social_auto_publish'), true) then
    v_missing := v_missing || ' social_auto_publish.must_start_off';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'social_piece_schedules_are_due' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgname = 'social_piece_schedules_may_publish' and not tgisinternal) then
    v_missing := v_missing || ' social_piece_schedules.triggers';
  end if;
  if v_missing <> '' then
    raise exception 'Scheduled publishing post-condition failed:%', v_missing;
  end if;
end
$post$;
