-- THE STUDIO BRIDGE (Lawal's directive of 13:53 and 14:03 on 27 November 2026; the PM's 14:12 and 14:20, car N step 2b).
-- The social studio runs as a scheduled cloud Claude session that designs on a Claude Design canvas and renders its
-- artboards to PNG; its only road to production is SQL (its HTTP egress to storage and to the site is blocked). So it
-- writes three things here, and the site's own run moves them into storage and the creative intake, where every existing
-- check (facts, rights, the founder's approval) runs as now:
--   studio_briefs   the dated research a piece rests on (the sources read, each with its link, date, metrics and limits);
--   studio_pieces   one row a piece: its brief, its canvas, its captions, nights, facts, link and slot;
--   studio_uploads  one rendered PNG a slide, 1080 x 1350 (feed) or 1080 x 1920 (story), at most 4 MB.
-- THE RESEARCH GATE (step 3; rule 1): a piece needs a brief read no more than 7 days before it and a canvas link, or the
-- database refuses it. A slide must be a real PNG of its format's size, read from its own header, and is never changed.

create table if not exists public.studio_briefs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('weekly', 'refresh')),
  read_at timestamptz not null,
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  findings text not null check (length(trim(findings)) >= 20),
  created_by text not null check (length(trim(created_by)) >= 2),
  created_at timestamptz not null default now()
);

create table if not exists public.studio_pieces (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.studio_briefs (id),
  piece_key text not null unique check (piece_key ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  format text not null check (format in ('feed', 'story')),
  canvas_url text not null check (canvas_url ~ '^https://'),
  slides integer not null check (slides between 1 and 20),
  captions jsonb not null check (jsonb_typeof(captions) = 'object'),
  destinations text[] not null default array['instagram', 'facebook'] check (destinations <@ array['instagram', 'facebook'] and cardinality(destinations) >= 1),
  event_ids uuid[] not null default '{}',
  facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array'),
  link text not null check (link ~ '^https://www\.eventlinqs\.com\.au/'),
  objective text not null check (objective in ('discovery', 'engagement', 'conversion')),
  preferred_at timestamptz not null,
  latest_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  intake_id uuid,
  moved_at timestamptz,
  error text
);

create table if not exists public.studio_uploads (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.studio_briefs (id),
  piece_key text not null references public.studio_pieces (piece_key),
  slide_no integer not null check (slide_no between 1 and 20),
  format text not null check (format in ('feed', 'story')),
  png bytea not null check (octet_length(png) between 33 and 4194304),
  sha256 text generated always as (encode(sha256(png), 'hex')) stored,
  canvas_url text not null check (canvas_url ~ '^https://'),
  rests_on jsonb not null default '{"kind": "own_design"}'::jsonb check (rests_on ? 'kind'),
  created_at timestamptz not null default now(),
  moved_at timestamptz,
  moved_to text,
  error text,
  unique (piece_key, slide_no, format)
);

-- A slide is a PNG of its format's size, read from its own IHDR header; once written, its bytes never change.
create or replace function public.studio_upload_is_its_png()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  w integer;
  h integer;
begin
  if tg_op = 'UPDATE' then
    if new.png is distinct from old.png or new.piece_key is distinct from old.piece_key or new.slide_no is distinct from old.slide_no
       or new.format is distinct from old.format or new.brief_id is distinct from old.brief_id then
      raise exception 'refused: a studio slide is never changed; upload a new one.' using errcode = '42501';
    end if;
    return new;
  end if;
  if substring(new.png from 1 for 8) <> '\x89504e470d0a1a0a'::bytea then
    raise exception 'refused: slide % of % is not a PNG.', new.slide_no, new.piece_key using errcode = '23514';
  end if;
  w := (get_byte(new.png, 16) << 24) | (get_byte(new.png, 17) << 16) | (get_byte(new.png, 18) << 8) | get_byte(new.png, 19);
  h := (get_byte(new.png, 20) << 24) | (get_byte(new.png, 21) << 16) | (get_byte(new.png, 22) << 8) | get_byte(new.png, 23);
  if (new.format = 'feed' and (w, h) <> (1080, 1350)) or (new.format = 'story' and (w, h) <> (1080, 1920)) then
    raise exception 'refused: slide % of % is % x %, not the % size.', new.slide_no, new.piece_key, w, h, new.format using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists trg_studio_upload_is_its_png on public.studio_uploads;
create trigger trg_studio_upload_is_its_png
  before insert or update on public.studio_uploads
  for each row execute function public.studio_upload_is_its_png();

-- THE RESEARCH GATE: a piece rests on a brief read no more than 7 days before it, and names its canvas.
create or replace function public.studio_piece_has_its_research()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b public.studio_briefs;
begin
  if tg_op = 'UPDATE' and new.brief_id is not distinct from old.brief_id then
    return new;
  end if;
  select * into b from public.studio_briefs where id = new.brief_id;
  if b.id is null or b.read_at < now() - interval '7 days' then
    raise exception 'refused: piece % has no research read in the last 7 days (rule 1, the social studio).', new.piece_key using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists trg_studio_piece_has_its_research on public.studio_pieces;
create trigger trg_studio_piece_has_its_research
  before insert or update of brief_id on public.studio_pieces
  for each row execute function public.studio_piece_has_its_research();

-- Service role only (the 21 October 2026 grant rule): the studio writes through its own connector, the site's run moves.
alter table public.studio_briefs enable row level security;
alter table public.studio_pieces enable row level security;
alter table public.studio_uploads enable row level security;
revoke all on public.studio_briefs, public.studio_pieces, public.studio_uploads from anon, authenticated, service_role;
grant select, insert on public.studio_briefs to service_role;
grant select, insert, update on public.studio_pieces to service_role;
grant select, insert, update on public.studio_uploads to service_role;
