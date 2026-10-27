-- ============================================================================
-- THE SOURCE REGISTER AND THE WEEKLY COLLECTION RUN (the foundation's items 4 and
-- 19, START-16OCT/EVENTLINQS-FOUNDATION-LOCKED-27OCT.md, locked 27 October 2026;
-- docs/walk-in/COLLECTION-RUN.md).
--
-- "A source register, each source with its page, how often it changes and when
-- it was last checked." "Weekly collection run that only reads sources whose
-- terms allow it; everything reviewed before publishing."
--
-- 1. listing_sources: one row per venue, promoter, council, festival, tourism
--    board or ticketing page EventLinqs watches. collection says what the
--    source's own terms allow: 'read' (the run may read it; the terms' address,
--    the line quoted and the day it was read are required), 'ask' (we ask the
--    source to submit or claim instead), 'never'. changes is how often its page
--    changes, which sets when the run reads it again.
-- 2. listing_candidates: every event the run found, for a person to review:
--    new (no listing yet), adds_links (an event EventLinqs already lists, which
--    gains a booking link and never a second card, the project manager's 12:30
--    (1)), then accepted or refused by a person, with who and when. Nothing here
--    is published; an accepted candidate goes out through the import
--    (scripts/ops/import-city-listings.mjs), as every listing does.
--
-- Staff only: neither table is read or written by a visitor or a signed in
-- user. Row security on with no policy, and the service role alone granted, by
-- the 21 October grant rule.
-- ============================================================================

create table if not exists public.listing_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('venue', 'promoter', 'council', 'festival', 'tourism', 'ticketing')),
  city_slug text,
  page_url text not null unique,
  collection text not null check (collection in ('read', 'ask', 'never')),
  terms_url text,
  terms_quote text,
  terms_read_on date,
  changes text not null default 'weekly' check (changes in ('weekly', 'monthly', 'rarely')),
  last_checked_at timestamptz,
  last_outcome text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_sources_page_https check (page_url ~* '^https://[^[:space:]]+$'),
  constraint listing_sources_terms_https check (terms_url is null or terms_url ~* '^https://[^[:space:]]+$'),
  -- A source is read only on its own terms, quoted with the day they were read.
  constraint listing_sources_read_needs_terms check (
    collection <> 'read'
    or (terms_url is not null and length(btrim(coalesce(terms_quote, ''))) > 0 and terms_read_on is not null)
  )
);

comment on table public.listing_sources is
  'The source register (foundation items 4 and 19): each page EventLinqs watches for events, what its own terms allow (collection), how often it changes, and when it was last checked. Only read sources are read, and only where robots.txt allows.';

create table if not exists public.listing_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.listing_sources(id) on delete cascade,
  found_at timestamptz not null default now(),
  kind text not null check (kind in ('new', 'adds_links')),
  event_id uuid references public.events(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null,
  venue_address text,
  page_url text not null check (page_url ~* '^https://[^[:space:]]+$'),
  image_url text check (image_url is null or image_url ~* '^https://[^[:space:]]+$'),
  -- [{ url, availability, priceFromCents }], as the page's own Event data states them.
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  status text not null default 'waiting' check (status in ('waiting', 'accepted', 'refused')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  refused_because text,
  -- A new candidate names no event; an adds_links one names its event until that event is deleted (set null, so a
  -- delete is never refused, docs/EVENT-LIFECYCLE.md).
  constraint listing_candidates_new_names_no_event check (kind = 'adds_links' or event_id is null),
  constraint listing_candidates_review_is_whole check (
    (status = 'waiting' and reviewed_at is null)
    or (status <> 'waiting' and reviewed_at is not null)
  ),
  constraint listing_candidates_refusal_says_why check (status <> 'refused' or length(btrim(coalesce(refused_because, ''))) > 0),
  unique (source_id, page_url, starts_at)
);

create index if not exists listing_candidates_waiting on public.listing_candidates (found_at desc) where status = 'waiting';

comment on table public.listing_candidates is
  'What the weekly collection run found, for a person to review before anything is published. adds_links: an event already listed gains a link, never a second card.';

-- ---------------------------------------------------------------------------
-- ROW SECURITY AND GRANTS: staff only, through the service role.
-- ---------------------------------------------------------------------------
alter table public.listing_sources enable row level security;
alter table public.listing_candidates enable row level security;

revoke all on public.listing_sources from public, anon, authenticated, service_role;
revoke all on public.listing_candidates from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.listing_sources to service_role;
grant select, insert, update, delete on public.listing_candidates to service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_cell record;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'listing_sources' and c.relrowsecurity) then
    v_missing := v_missing || ' listing_sources.rls';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'listing_candidates' and c.relrowsecurity) then
    v_missing := v_missing || ' listing_candidates.rls';
  end if;
  for v_cell in
    select t.tbl, r.role, p.priv, (r.role = 'service_role' and p.priv in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) as expected
      from (values ('public.listing_sources'), ('public.listing_candidates')) as t(tbl)
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, v_cell.tbl, v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' ' || v_cell.tbl || '.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'Source register migration post-condition failed:%', v_missing;
  end if;
end
$post$;
