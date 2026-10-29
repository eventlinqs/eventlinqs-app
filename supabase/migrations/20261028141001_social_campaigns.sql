-- THE WEEKLY CAMPAIGN (the release checklist of 28 October 2026, sections A, B, C, F7 to F9, J and K; Lawal's standing
-- order of 13:11, his 13:53 and 14:33; the project manager's 13:13, 14:08 and 14:34).
--
-- "Plan this week" builds ONE campaign for the week from its real nights: the week ahead and the weekend guide per city,
-- a Discovery Reel, a venue spotlight, a separate organiser campaign, and a partner kit per featured host. Every piece
-- carries one audience, one growth objective, one purpose, one call to action and one measured outcome (C1, C2, J10),
-- its Instagram and Facebook versions (J13), the reason each night was picked (K6), and every revision with its
-- decision (K7).
--
-- What the database holds, so no screen or script can argue it away:
--   F7  one campaign a week (unique week_start), one piece of a kind per city and partner: a second press makes nothing.
--   F8  approval and publishing are separate rows; publishing needs its approval; an approval is of the newest revision.
--   F9  planning writes campaigns, pieces, revisions and drafted requests only; nothing is approved or published by it.
--   K1  talking about a night never needs an image licence (path B, original EventLinqs design).
--   K2  every asset a post may carry is recorded in one of four states with its source, rights, attribution, approval,
--       expiry and restrictions; a photograph is usable only when organiser authorised or separately licensed, approved,
--       in scope for social and not expired, and never a library photograph (K3).
-- Staff only, through the service role, added to and never rewritten (the 21 October grant rule, as 20261027233001).
-- Additive: five columns on social_posts with defaults every existing post meets, and new tables.

-- ---------------------------------------------------------------------------
-- C1, C2 and J10 on item 11's night posts
-- ---------------------------------------------------------------------------
alter table public.social_posts
  add column if not exists audience text not null default 'attendees',
  add column if not exists purpose text not null default 'Fill this night',
  add column if not exists next_step text not null default 'Open the night on EventLinqs',
  add column if not exists objective text not null default 'audience_growth',
  add column if not exists outcome text not null default 'Visits to the night through this post''s own link';

alter table public.social_posts drop constraint if exists social_posts_one_audience;
alter table public.social_posts add constraint social_posts_one_audience
  check (audience in ('attendees', 'organisers', 'venues', 'partners'));
alter table public.social_posts drop constraint if exists social_posts_one_purpose;
alter table public.social_posts add constraint social_posts_one_purpose
  check (length(btrim(purpose)) between 3 and 200 and length(btrim(next_step)) between 3 and 200);
alter table public.social_posts drop constraint if exists social_posts_one_objective;
alter table public.social_posts add constraint social_posts_one_objective
  check (objective in ('audience_growth', 'organiser_growth') and length(btrim(outcome)) between 3 and 200);

-- ---------------------------------------------------------------------------
-- The campaign, the founder's leave-outs, and its pieces
-- ---------------------------------------------------------------------------
create table if not exists public.social_campaigns (
  id uuid primary key default gen_random_uuid(),
  -- The Monday the week starts, in Melbourne.
  week_start date not null unique check (extract(isodow from week_start) = 1),
  planned_by uuid references auth.users(id) on delete set null,
  planned_at timestamptz not null default now()
);

comment on table public.social_campaigns is
  'The release checklist, A1 and F7: one weekly campaign, planned once; a second press of Plan this week finds it.';

-- K6: the founder's override. A night left out is not picked again for that week's pieces.
create table if not exists public.social_campaign_exclusions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.social_campaigns(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 3 and 300),
  excluded_by uuid not null references auth.users(id) on delete restrict,
  excluded_at timestamptz not null default now(),
  unique (campaign_id, event_id)
);

create table if not exists public.social_pieces (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.social_campaigns(id) on delete cascade,
  kind text not null check (kind in ('week_ahead', 'discovery_reel', 'weekend_carousel', 'venue_spotlight', 'organiser_campaign', 'partner_kit')),
  city text not null check (city ~ '^[a-z][a-z-]{1,40}$'),
  -- C1, C2, J10: one audience, one objective, one purpose, one call to action, one measured outcome.
  audience text not null check (audience in ('attendees', 'organisers', 'venues', 'partners')),
  objective text not null check (objective in ('audience_growth', 'organiser_growth')),
  purpose text not null check (length(btrim(purpose)) between 3 and 200),
  next_step text not null check (length(btrim(next_step)) between 3 and 200),
  outcome text not null check (length(btrim(outcome)) between 3 and 200),
  -- The real page the piece sends people to.
  link text not null check (link ~* '^https://[^[:space:]]+$'),
  format text not null check (format in ('feed', 'story')),
  partner_name text,
  -- A partner kit's own link, minted for it alone, so what the partner's share brings is counted as theirs (as social_posts).
  share_link_id uuid unique references public.share_links(id) on delete restrict,
  planned_at timestamptz not null default now(),
  constraint social_pieces_partner_link check (share_link_id is null or kind = 'partner_kit')
);

create unique index if not exists social_pieces_once
  on public.social_pieces (campaign_id, kind, city, coalesce(partner_name, ''));

comment on table public.social_pieces is
  'The release checklist, sections B, C, J and K: one piece of a weekly campaign; its words, slides and picks are its revisions.';

-- K7: every version of a piece's content, the first planned, then each edit or regeneration, never rewritten.
create table if not exists public.social_piece_revisions (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.social_pieces(id) on delete cascade,
  version integer not null check (version >= 1),
  -- K6: each night picked, and the reason it was picked.
  event_ids uuid[] not null default '{}',
  picks jsonb not null check (jsonb_typeof(picks) = 'array'),
  -- K5: photo led, graphic led or type led; path B is graphic or type led and needs no image licence (K1).
  mode text not null check (mode in ('photo_led', 'graphic_led', 'type_led')),
  slides jsonb not null check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) between 1 and 10),
  caption text not null check (length(btrim(caption)) between 1 and 2200 and caption !~ ('[' || chr(8211) || chr(8212) || '!]')),
  -- J13: the Instagram and Facebook versions, each its own hook, caption, crop and call to action.
  versions jsonb not null check (jsonb_typeof(versions) = 'object' and versions ? 'instagram' and versions ? 'facebook'),
  -- A partner kit carries the drafted message Lawal sends.
  message text,
  made_by text not null check (made_by in ('planner', 'edit', 'regenerate')),
  made_by_user uuid references auth.users(id) on delete set null,
  made_at timestamptz not null default now(),
  unique (piece_id, version)
);

comment on table public.social_piece_revisions is
  'K7: each version of a piece, planned, edited or regenerated, with its picks and reasons (K6); the newest is the piece.';

-- K7: the founder's decisions on a piece, kept as history: rejected (with why), or a note on an edit or a regeneration.
create table if not exists public.social_piece_decisions (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.social_pieces(id) on delete cascade,
  revision integer not null,
  decision text not null check (decision in ('rejected', 'edited', 'regenerated')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create table if not exists public.social_piece_approvals (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.social_pieces(id) on delete cascade,
  revision integer not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  unique (piece_id, revision)
);

comment on table public.social_piece_approvals is
  'The release checklist, B3 and F8: a person''s approval of a piece''s newest revision, its own state, before anything goes.';

create table if not exists public.social_piece_postings (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null unique references public.social_pieces(id) on delete cascade,
  approval_id uuid not null unique references public.social_piece_approvals(id) on delete cascade,
  -- Where it went: the post's address, or for a partner kit the word that it was sent.
  post_url text not null check (post_url ~* '^https://(www\.)?(instagram\.com|facebook\.com|fb\.com)/[^[:space:]]+$' or post_url = 'sent'),
  posted_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

comment on table public.social_piece_postings is
  'The release checklist, F8 and F9: a piece as it went, naming its approval; planning never writes here.';

-- ---------------------------------------------------------------------------
-- K2: THE ASSET REGISTER. Every asset a post may carry, in one of four states, with its source, rights, attribution,
-- approval, expiry and restrictions. K3: a public image is never reposted without a licence; no library photograph
-- stands for a named night. An original EventLinqs design (path B) is the slide itself and needs no row to be used.
-- ---------------------------------------------------------------------------
create table if not exists public.social_assets (
  id uuid primary key default gen_random_uuid(),
  asset_state text not null check (asset_state in ('organiser_authorised', 'separately_licensed', 'native_share', 'original_design')),
  asset_type text not null check (asset_type in ('photo', 'artwork', 'video', 'post')),
  event_id uuid references public.events(id) on delete cascade,
  -- The stored asset a post uses; for a native share, the organiser's own post to share where the platform allows.
  asset_url text not null check (asset_url ~* '^https://[^[:space:]]+$'),
  source_url text not null check (source_url ~* '^https://[^[:space:]]+$' or source_url ~* '^mailto:[^[:space:]]+$'),
  rights_holder text not null check (length(btrim(rights_holder)) between 2 and 200),
  -- The permission in the holder's own words, or the licence's terms; required wherever someone else's work is used.
  permission_evidence text,
  evidence_file text check (evidence_file is null or length(btrim(evidence_file)) > 0),
  attribution_text text not null check (length(btrim(attribution_text)) between 2 and 200),
  scope text not null check (scope in ('social', 'site', 'both')),
  archival boolean not null default false,
  expires_at timestamptz,
  restrictions text check (restrictions is null or length(btrim(restrictions)) > 0),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'refused')),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint social_assets_permission_is_shown check (
    asset_state in ('native_share', 'original_design') or length(btrim(coalesce(permission_evidence, ''))) >= 10
  ),
  constraint social_assets_approval_is_whole check (
    (approval_status = 'pending' and approved_by is null and approved_at is null)
    or (approval_status <> 'pending' and approved_by is not null and approved_at is not null)
  ),
  -- J6: an archival photograph says so in its credit.
  constraint social_assets_archival_says_so check (not archival or attribution_text ~* 'archiv|earlier|previous|past'),
  -- K3: never a library photograph.
  constraint social_assets_never_the_library check (asset_url !~ '/storage/v1/object/public/event-images/stock/')
);

create unique index if not exists social_assets_once on public.social_assets (asset_url, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.social_assets is
  'K2: the asset register. A post carries someone else''s image only through an approved, unexpired row that is organiser authorised or separately licensed and in scope for social.';

-- True only for an image a post may carry for this night at this moment (K2, K3).
create or replace function public.social_asset_usable(p_url text, p_event uuid, p_at timestamptz)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $ok$
  select p_url is not null
     and p_url !~ '/storage/v1/object/public/event-images/stock/'
     and exists (
       select 1 from public.social_assets a
        where a.asset_url = p_url
          and a.asset_state in ('organiser_authorised', 'separately_licensed')
          and a.approval_status = 'approved'
          and a.scope in ('social', 'both')
          and (a.expires_at is null or a.expires_at > p_at)
          and (a.event_id is null or a.event_id = p_event)
     )
$ok$;

-- J5: the nights shown with no usable image, so a person can ask their organisers for one. Lawal's 14:59: no organiser
-- message is drafted or stored until the project manager's text in his own voice lands, so the words are empty here.
create table if not exists public.social_image_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.social_campaigns(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  host_name text not null check (length(btrim(host_name)) between 1 and 200),
  message text check (message is null or (length(btrim(message)) between 20 and 3000 and message !~ ('[' || chr(8211) || chr(8212) || '!]'))),
  drafted_at timestamptz not null default now(),
  unique (campaign_id, event_id)
);

-- ---------------------------------------------------------------------------
-- The rules on approval and publishing
-- ---------------------------------------------------------------------------
-- An approval is of the newest revision, and every image on it is usable now (F8, K2, K7).
create or replace function public.social_piece_approval_is_due()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $due$
declare
  v_rev public.social_piece_revisions;
  v_slide jsonb;
begin
  select * into v_rev from public.social_piece_revisions where piece_id = new.piece_id order by version desc limit 1;
  if v_rev.id is null or v_rev.version <> new.revision then
    raise exception 'refused: approve the newest version of this piece.' using errcode = '23514';
  end if;
  if exists (select 1 from public.social_piece_postings where piece_id = new.piece_id) then
    raise exception 'refused: this piece has gone already.' using errcode = '23514';
  end if;
  for v_slide in select * from jsonb_array_elements(v_rev.slides) loop
    if coalesce(v_slide->>'photo', '') <> ''
       and not public.social_asset_usable(v_slide->>'photo', nullif(v_slide->>'eventId', '')::uuid, new.approved_at) then
      raise exception 'refused: a slide carries an image with no approved, unexpired licence for its night.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$due$;

drop trigger if exists social_piece_approvals_are_due on public.social_piece_approvals;
create trigger social_piece_approvals_are_due
  before insert on public.social_piece_approvals
  for each row execute function public.social_piece_approval_is_due();

create or replace function public.social_piece_posting_is_approved()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $went$
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
  if new.posted_at < v_approval.approved_at then
    raise exception 'refused: a piece goes after its approval, never before.' using errcode = '23514';
  end if;
  if new.posted_at > now() + interval '5 minutes' then
    raise exception 'refused: a piece is recorded once it has gone, not before.' using errcode = '23514';
  end if;
  return new;
end;
$went$;

drop trigger if exists social_piece_postings_are_approved on public.social_piece_postings;
create trigger social_piece_postings_are_approved
  before insert on public.social_piece_postings
  for each row execute function public.social_piece_posting_is_approved();

-- ---------------------------------------------------------------------------
-- ROW SECURITY AND GRANTS: staff only, through the service role, added to and never rewritten.
-- ---------------------------------------------------------------------------
alter table public.social_campaigns enable row level security;
alter table public.social_campaign_exclusions enable row level security;
alter table public.social_pieces enable row level security;
alter table public.social_piece_revisions enable row level security;
alter table public.social_piece_decisions enable row level security;
alter table public.social_piece_approvals enable row level security;
alter table public.social_piece_postings enable row level security;
alter table public.social_assets enable row level security;
alter table public.social_image_requests enable row level security;

revoke all on public.social_campaigns from public, anon, authenticated, service_role;
revoke all on public.social_campaign_exclusions from public, anon, authenticated, service_role;
revoke all on public.social_pieces from public, anon, authenticated, service_role;
revoke all on public.social_piece_revisions from public, anon, authenticated, service_role;
revoke all on public.social_piece_decisions from public, anon, authenticated, service_role;
revoke all on public.social_piece_approvals from public, anon, authenticated, service_role;
revoke all on public.social_piece_postings from public, anon, authenticated, service_role;
revoke all on public.social_assets from public, anon, authenticated, service_role;
revoke all on public.social_image_requests from public, anon, authenticated, service_role;
grant select, insert on public.social_campaigns to service_role;
grant select, insert on public.social_campaign_exclusions to service_role;
grant select, insert on public.social_pieces to service_role;
grant select, insert on public.social_piece_revisions to service_role;
grant select, insert on public.social_piece_decisions to service_role;
grant select, insert on public.social_piece_approvals to service_role;
grant select, insert on public.social_piece_postings to service_role;
grant select, insert on public.social_image_requests to service_role;
-- An asset is approved or refused by a person after it is entered, so the register alone takes an update, and only of
-- its approval columns.
grant select, insert on public.social_assets to service_role;
grant update (approval_status, approved_by, approved_at) on public.social_assets to service_role;

revoke all on function public.social_asset_usable(text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.social_asset_usable(text, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_cell record;
  v_t text;
begin
  foreach v_t in array array['social_campaigns', 'social_campaign_exclusions', 'social_pieces', 'social_piece_revisions', 'social_piece_decisions',
                             'social_piece_approvals', 'social_piece_postings', 'social_assets', 'social_image_requests'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity) then
      v_missing := v_missing || ' ' || v_t || '.rls';
    end if;
  end loop;
  for v_cell in
    select t.tbl, r.role, p.priv, (r.role = 'service_role' and p.priv in ('SELECT', 'INSERT')) as expected
      from (values ('public.social_campaigns'), ('public.social_campaign_exclusions'), ('public.social_pieces'),
                   ('public.social_piece_revisions'), ('public.social_piece_decisions'), ('public.social_piece_approvals'),
                   ('public.social_piece_postings'), ('public.social_image_requests'), ('public.social_assets')) as t(tbl)
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, v_cell.tbl, v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' ' || v_cell.tbl || '.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;
  if not has_column_privilege('service_role', 'public.social_assets', 'approval_status', 'UPDATE')
     or has_column_privilege('service_role', 'public.social_assets', 'asset_url', 'UPDATE') then
    v_missing := v_missing || ' social_assets.update_columns';
  end if;
  foreach v_t in array array['social_piece_approvals_are_due', 'social_piece_postings_are_approved'] loop
    if not exists (select 1 from pg_trigger where tgname = v_t and not tgisinternal) then
      v_missing := v_missing || ' trigger.' || v_t;
    end if;
  end loop;
  if not exists (select 1 from pg_indexes where indexname = 'social_pieces_once') then
    v_missing := v_missing || ' index.social_pieces_once';
  end if;
  if public.social_asset_usable('https://x.supabase.co/storage/v1/object/public/event-images/stock/a.avif', null, now()) then
    v_missing := v_missing || ' library_usable';
  end if;
  if exists (select 1 from public.social_posts where audience is null or purpose is null or next_step is null or objective is null or outcome is null) then
    v_missing := v_missing || ' social_posts.c2';
  end if;

  if v_missing <> '' then
    raise exception 'Social campaign migration post-condition failed:%', v_missing;
  end if;
end
$post$;
