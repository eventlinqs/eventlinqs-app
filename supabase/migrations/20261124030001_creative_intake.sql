-- THE CREATIVE INTAKE (Lawal, 23 November 2026, 13:15, the Creative Production Engine, sections E and F; the PM's 12:18,
-- items 2 and 3: "One record per finished piece ... The engine checks every record at intake and again before publishing";
-- and 13:16, car F: "a finished design is never a publication"). One row per finished piece: its nights, its brief, its
-- images in order with what each rests on, its approved caption for each network, its destinations, its booking
-- destination, its marketing objective and its timeline (preferred, latest useful, expiry), its state and its last check
-- with every reason. src/lib/creative/intake.ts holds the gates; a passed record becomes a social piece of kind 'creative'
-- (src/lib/social/store.ts drawIntakePiece), which Car A approves, schedules and publishes as it does every piece.
-- Additive: one table, one kind added to social_pieces, and social_pieces_once kept for every kind but 'creative', whose
-- pieces are one per intake record (creative_intake.piece_id is unique), never one a city a week.

create table if not exists public.creative_intake (
  id uuid primary key default gen_random_uuid(),
  -- The brief the piece was made from (its table arrives with the reference library and playbook car).
  brief_id uuid not null,
  event_ids uuid[] not null check (cardinality(event_ids) between 1 and 10),
  format text not null default 'feed' check (format in ('feed', 'story')),
  -- In order: [{ url, rests_on: { kind: grant | asset | organiser_artwork | approved_file, grant_id | asset_id } }].
  images jsonb not null check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) between 1 and 10),
  -- The approved caption for each network, both always written: { instagram, facebook }.
  captions jsonb not null check (jsonb_typeof(captions) = 'object' and captions ? 'instagram' and captions ? 'facebook'),
  destinations text[] not null check (cardinality(destinations) between 1 and 2 and destinations <@ array['instagram', 'facebook']::text[]),
  -- Each night's facts as the piece states them (title, start, end, venue, organiser), compared with the record at each check.
  facts jsonb not null check (jsonb_typeof(facts) = 'array' and jsonb_array_length(facts) between 1 and 10),
  -- The booking destination on www the counted /go hop lands on.
  link text not null check (link ~ '^https://www\.eventlinqs\.com\.au/[^[:space:]]*$'),
  objective text not null check (objective in ('discovery', 'engagement', 'conversion')),
  preferred_at timestamptz not null,
  latest_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'received' check (state in ('received', 'held', 'passed', 'handed_off', 'expired')),
  checked_at timestamptz,
  checked_stage text check (checked_stage is null or checked_stage in ('intake', 'publish')),
  check_reasons text[] not null default '{}',
  piece_id uuid unique references public.social_pieces (id) on delete restrict,
  received_at timestamptz not null default now(),
  constraint creative_intake_timeline_in_order check (preferred_at <= latest_at and latest_at <= expires_at),
  constraint creative_intake_a_hold_says_why check (state not in ('held', 'expired') or cardinality(check_reasons) > 0),
  constraint creative_intake_handed_off_names_its_piece check (state <> 'handed_off' or piece_id is not null)
);

create index if not exists creative_intake_by_state on public.creative_intake (state, received_at desc);

comment on table public.creative_intake is
  'The creative intake: one record per finished piece, checked at intake and again before publishing (src/lib/creative/intake.ts). A failure holds it with its reasons and nothing takes its place; a passed record is handed to Car A as a creative piece, unapproved.';

-- Server jobs only (the engine runs with the service role); no visitor or signed in reader. A record as received is never
-- altered: the service role may change only its state, its check and its piece.
alter table public.creative_intake enable row level security;
revoke all on public.creative_intake from public, anon, authenticated, service_role;
grant select, insert on public.creative_intake to service_role;
grant update (state, checked_at, checked_stage, check_reasons, piece_id) on public.creative_intake to service_role;

-- The creative piece: one more kind, the lists as 20261118230001 left them with 'creative' added.
alter table public.social_pieces drop constraint if exists social_pieces_kind_check;
alter table public.social_pieces add constraint social_pieces_kind_check
  check (kind in ('week_ahead', 'discovery_reel', 'weekend_carousel', 'venue_spotlight', 'organiser_campaign', 'partner_kit',
                  'brand_campaign', 'daily_poster', 'tonight_tomorrow', 'category_spotlight', 'coming_up', 'free_week', 'tonight',
                  'creative'));

-- One of each kind a city a campaign, as 20261120170003 made it, for every kind but 'creative' (one per intake record).
drop index if exists public.social_pieces_once;
create unique index social_pieces_once
  on public.social_pieces (campaign_id, kind, city, coalesce(partner_name, ''), coalesce(poster_day, '0001-01-01'::date), coalesce(moment_key, ''))
  where kind <> 'creative';

-- POST-CONDITIONS
do $post$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'creative_intake' and c.relrowsecurity) then
    raise exception 'creative_intake has no row security';
  end if;
  if has_table_privilege('anon', 'public.creative_intake', 'SELECT') or has_table_privilege('authenticated', 'public.creative_intake', 'SELECT')
     or has_table_privilege('service_role', 'public.creative_intake', 'DELETE')
     or has_column_privilege('service_role', 'public.creative_intake', 'captions', 'UPDATE') then
    raise exception 'creative_intake is granted wider than its rule';
  end if;
  if position('moment_key' in (select pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'social_pieces_once')) = 0 then
    raise exception 'social_pieces_once does not carry moment_key';
  end if;
end $post$;
