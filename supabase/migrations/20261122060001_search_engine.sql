-- THE ONE SEARCH ENGINE, IN THE DATABASE (the PM's order of 22 November 2026, 05:25; Lawal, 05:08: "Make the search
-- result the best ... This can never break"). WINDOW 5C.
--
-- THE DEFECT IT ENDS. /events?q=asia+oasis answered 'No results' while Colours of Asia, whose page says 'Organised by
-- Asia Oasis', ran that day: search read the organisation's name, a listing's organisation is the listings
-- organisation no page shows, and the host the page shows lives in events.metadata.host_name. What a page SHOWS and what
-- search READS were two sources, matched by substring (ilike) per word with no ranking, no typo tolerance and no prefix.
--
-- WHAT THIS ADDS.
--   public.event_search: ONE search document per event, written from the fields its page shows, by the same rule the
--     pages name the organiser with (src/lib/listings/shown-organiser.ts: a listing names metadata.host_name, else its
--     venue; an organiser's own event names its organisation and short name), plus its lineup, venue and place,
--     category, scene, community and tags, summary and description, the title's initials and its slug words. Refreshed
--     by trigger on every write to events, organisations, event_artists, artists and event_secondary_categories.
--   public.search_aliases: the words people type for the words events use (rnb, hiphop, nye, melb ...), extended by the
--     learning loop from the search log.
--   public.search_events(q, limit): one ranked answer in three steps. EXACT: every word must match
--     (websearch_to_tsquery, so raw input never raises), the last word as a prefix while it is typed, an alias's meaning
--     as another way; ranked by field weight (A title, organiser, lineup, initials; B venue, place, category, scene,
--     community, tags; C summary, description, slug), then the soonest. CORRECTED, only when nothing matched: each word no
--     document holds becomes the nearest word the names hold ('Did you mean'). RELAXED, only when still nothing: any of
--     the words, those matching more first. It says which step answered and with what query. It ranks candidates only: which of them a visitor may see is decided by the
--     caller with the one public visibility rule (src/lib/events/public-visibility.ts), never copied here; its own bound
--     (published, ended no more than a day ago) only keeps a draft's id from ever being answered to anyone.
--
-- SOURCES, read 22 November 2026:
--   https://www.postgresql.org/docs/current/textsearch-controls.html (websearch_to_tsquery "will never raise syntax
--     errors"; prefix matching with ':*'; ts_rank weights {D, C, B, A} default {0.1, 0.2, 0.4, 1.0})
--   https://www.postgresql.org/docs/current/pgtrgm.html (word_similarity(query, text): the first argument is the query;
--     GIN gin_trgm_ops supports the similarity operators; word_similarity_threshold default 0.6)
--   https://www.postgresql.org/docs/current/fuzzystrmatch.html (levenshtein and levenshtein_less_equal(source, target,
--     max_d): insertion, deletion and substitution, each costing 1; inputs up to 255 characters; fine with UTF-8)
--   https://www.postgresql.org/docs/current/unaccent.html (unaccent([dictionary,] text); its volatility is not stated
--     there, so it is never used in an index expression: the document is computed by trigger and stored)
--   https://supabase.com/docs/guides/database/full-text-search and https://supabase.com/docs/guides/ai/hybrid-search
--     (weighted tsvector with GIN, combined with trigram matching), as cited in the PM's order.
--
-- GRANTS (the founder's ruling of 21 October 2026): each new public table revokes all from anon, authenticated and
-- service_role, then grants exactly what its use needs. Visitors never read the tables: they reach search only through
-- search_events, a security definer function returning ids and scores.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- Lower case, accents removed, '&' between two letters read as 'n' ('R&B' is 'rnb', 'D&B' is 'dnb': the text search parser
-- would split 'r&b' into the letters r and b), every other run of characters but letters and digits one space. Stable
-- (unaccent reads its dictionary), so it is used in the trigger and the query, never in an index expression.
create or replace function public.search_norm(t text) returns text
language sql stable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))),
    '([a-z])&([a-z])', '\1n\2', 'g'), '[^a-z0-9]+', ' ', 'g'))
$$;

-- An event's season: the same title at the same venue, normalised exactly as src/lib/search/reach.ts seasonKey does.
create or replace function public.search_season_key(title text, venue text) returns text
language sql stable set search_path = '' as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(title, ''))), '[^a-z0-9]+', ' ', 'g'))
    || '|' || btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(venue, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

-- The initials of a title's words of three letters or more ('Australian Multicultural Comedy Festival' gives 'amcf').
create or replace function public.search_initials(t text) returns text
language sql stable set search_path = '' as $$
  select coalesce(string_agg(left(w, 1), '' order by n), '')
    from regexp_split_to_table(public.search_norm(t), ' ') with ordinality as x(w, n)
   where length(w) >= 3 and w !~ '^[0-9]+$'
$$;

create table if not exists public.event_search (
  event_id uuid primary key references public.events(id) on delete cascade,
  doc tsvector not null,
  -- the head and middle fields normalised (title, organiser, lineup, initials, venue, place, category, scene, tags):
  -- the words a typo is corrected to
  names text not null,
  season_key text not null,
  shown_organiser text,
  refreshed_at timestamptz not null default now()
);
create index if not exists event_search_doc_idx on public.event_search using gin (doc);
create index if not exists event_search_names_trgm_idx on public.event_search using gin (names extensions.gin_trgm_ops);
alter table public.event_search enable row level security;
revoke all on public.event_search from anon, authenticated, service_role;
grant select on public.event_search to service_role;

create table if not exists public.search_aliases (
  -- what a person types, normalised by search_norm, a word or a phrase
  term text primary key,
  -- the words events use for it, searched as well
  means text not null,
  source text not null default 'seed',
  created_at timestamptz not null default now()
);
alter table public.search_aliases enable row level security;
revoke all on public.search_aliases from anon, authenticated, service_role;
grant select, insert, update, delete on public.search_aliases to service_role;

insert into public.search_aliases (term, means) values
  ('rnb', 'rhythm and blues'),
  ('hiphop', 'hip hop'),
  ('hip hop', 'hiphop'),
  ('nye', 'new years eve'),
  ('new years eve', 'nye'),
  ('xmas', 'christmas'),
  ('melb', 'melbourne'),
  ('standup', 'stand up comedy'),
  ('stand up', 'standup comedy'),
  ('edm', 'electronic dance'),
  ('dnb', 'drum and bass'),
  ('kids', 'family'),
  ('gig', 'live music'),
  ('gigs', 'live music')
on conflict (term) do nothing;

-- Writes (or removes) one event's document. Security definer so a write to events by any role refreshes it; reads only.
create or replace function public.event_search_refresh(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events%rowtype;
  o_name text;
  o_slug text;
  o_short text;
  organiser text;
  organiser_short text;
  lineup text;
  category text;
  secondary text;
  tag_words text;
  slug_words text;
  head text;
  middle text;
  tail text;
begin
  select * into e from public.events where id = p_event;
  if not found then
    delete from public.event_search where event_id = p_event;
    return;
  end if;
  select name, slug, short_name into o_name, o_slug, o_short from public.organisations where id = e.organisation_id;
  -- The shown organiser, by the pages' own rule (shownOrganiser): a listing names its host, else its venue.
  if e.listing_source = 'eventlinqs' or o_slug = 'eventlinqs-listings' then
    organiser := coalesce(nullif(btrim(case when jsonb_typeof(e.metadata) = 'object' then e.metadata ->> 'host_name' end), ''), nullif(btrim(e.venue_name), ''));
    organiser_short := null;
  else
    organiser := nullif(btrim(o_name), '');
    organiser_short := nullif(btrim(o_short), '');
  end if;
  select string_agg(a.name, ' ' order by ea.billing_order nulls last) into lineup
    from public.event_artists ea join public.artists a on a.id = ea.artist_id
   where ea.event_id = e.id;
  select name into category from public.event_categories where id = e.category_id;
  select string_agg(c.name, ' ') into secondary
    from public.event_secondary_categories s join public.event_categories c on c.id = s.category_id
   where s.event_id = e.id;
  select string_agg(replace(t, '-', ' '), ' ') into tag_words
    from jsonb_array_elements_text(case when jsonb_typeof(e.tags) = 'array' then e.tags else '[]'::jsonb end) as x(t);
  slug_words := replace(regexp_replace(coalesce(e.slug, ''), '-[0-9]{4}-[0-9]{2}-[0-9]{2}$', ''), '-', ' ');
  head := concat_ws(' ', e.title, organiser, organiser_short, lineup, public.search_initials(e.title));
  middle := concat_ws(' ', e.venue_name, e.venue_city, e.venue_state, replace(e.city_primary, '-', ' '), replace(e.suburb_primary, '-', ' '),
    category, secondary, replace(e.genre_slug, '-', ' '), replace(e.subgenre_slug, '-', ' '), replace(e.community_primary, '-', ' '),
    replace(e.sub_community, '-', ' '), tag_words);
  tail := concat_ws(' ', e.summary, left(e.description, 4000), slug_words);
  insert into public.event_search (event_id, doc, names, season_key, shown_organiser, refreshed_at)
  values (
    e.id,
    setweight(to_tsvector('english', public.search_norm(head)), 'A')
      || setweight(to_tsvector('english', public.search_norm(middle)), 'B')
      || setweight(to_tsvector('english', public.search_norm(tail)), 'C'),
    public.search_norm(concat_ws(' ', head, middle)),
    public.search_season_key(e.title, e.venue_name),
    organiser,
    now()
  )
  on conflict (event_id) do update set doc = excluded.doc, names = excluded.names, season_key = excluded.season_key,
    shown_organiser = excluded.shown_organiser, refreshed_at = excluded.refreshed_at;
end
$$;
revoke all on function public.event_search_refresh(uuid) from public, anon, authenticated;

create or replace function public.event_search_on_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.event_search_refresh(new.id);
  return null;
end
$$;
drop trigger if exists event_search_refresh on public.events;
create trigger event_search_refresh after insert or update of title, summary, description, slug, venue_name, venue_city,
  venue_state, city_primary, suburb_primary, community_primary, sub_community, genre_slug, subgenre_slug, tags, metadata,
  category_id, organisation_id, listing_source
  on public.events for each row execute function public.event_search_on_event();

create or replace function public.event_search_on_organisation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ev uuid;
begin
  for ev in select id from public.events where organisation_id = new.id loop
    perform public.event_search_refresh(ev);
  end loop;
  return null;
end
$$;
drop trigger if exists event_search_refresh on public.organisations;
create trigger event_search_refresh after update of name, short_name, slug on public.organisations
  for each row execute function public.event_search_on_organisation();

create or replace function public.event_search_on_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.event_search_refresh(new.event_id); end if;
  if tg_op in ('DELETE', 'UPDATE') then perform public.event_search_refresh(old.event_id); end if;
  return null;
end
$$;
drop trigger if exists event_search_refresh on public.event_artists;
create trigger event_search_refresh after insert or update or delete on public.event_artists
  for each row execute function public.event_search_on_link();
drop trigger if exists event_search_refresh on public.event_secondary_categories;
create trigger event_search_refresh after insert or update or delete on public.event_secondary_categories
  for each row execute function public.event_search_on_link();

create or replace function public.event_search_on_artist() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ev uuid;
begin
  for ev in select event_id from public.event_artists where artist_id = new.id loop
    perform public.event_search_refresh(ev);
  end loop;
  return null;
end
$$;
drop trigger if exists event_search_refresh on public.artists;
create trigger event_search_refresh after update of name on public.artists
  for each row execute function public.event_search_on_artist();

revoke all on function public.event_search_on_event() from public, anon, authenticated;
revoke all on function public.event_search_on_organisation() from public, anon, authenticated;
revoke all on function public.event_search_on_link() from public, anon, authenticated;
revoke all on function public.event_search_on_artist() from public, anon, authenticated;

-- THE EXACT STEP: every word must match (the last word as a prefix while it is typed), or an alias's meaning does.
create or replace function public.search_exact(qn text, lim integer)
returns table (event_id uuid, score real)
language plpgsql stable security definer set search_path = '' as $$
declare
  words text[] := regexp_split_to_array(qn, ' ');
  last_word text := words[array_length(words, 1)];
  tsq tsquery := websearch_to_tsquery('english', qn);
  head_q tsquery;
  prefix_q tsquery;
  alias_q tsquery;
begin
  if length(last_word) >= 2 then
    prefix_q := to_tsquery('simple', last_word || ':*');
    if array_length(words, 1) > 1 then
      head_q := websearch_to_tsquery('english', array_to_string(words[1:array_length(words, 1) - 1], ' '));
      if numnode(head_q) > 0 then
        prefix_q := head_q && prefix_q;
      end if;
    end if;
  end if;
  -- Each alias term found in the query as a whole word or phrase gives the query with its meaning in its place.
  select websearch_to_tsquery('english', string_agg(btrim(replace(' ' || qn || ' ', ' ' || a.term || ' ', ' ' || a.means || ' ')), ' or '))
    into alias_q
    from public.search_aliases a
   where (' ' || qn || ' ') like ('% ' || a.term || ' %');
  return query
  select s.event_id,
         (coalesce(ts_rank(s.doc, case when numnode(tsq) > 0 then tsq else coalesce(prefix_q, alias_q) end), 0)
           + 0.25 * extensions.word_similarity(qn, s.names))::real
    from public.event_search s
    join public.events ev on ev.id = s.event_id
   where ev.status = 'published' and ev.end_date > now() - interval '1 day'
     and ((numnode(tsq) > 0 and s.doc @@ tsq)
       or (prefix_q is not null and s.doc @@ prefix_q)
       or (alias_q is not null and numnode(alias_q) > 0 and s.doc @@ alias_q))
   order by 2 desc, ev.start_date asc
   limit lim;
end
$$;

-- 'DID YOU MEAN': each word of four letters or more that no document holds, and that is not itself an alias, is replaced by
-- the nearest word the documents' names hold (one edit for a four letter word, two for longer; a shorter word is still being
-- typed and is a prefix in the exact step, and 'rnb' must never become a stranger three letter word; a swap of two letters is two edits, as
-- fuzzystrmatch's levenshtein counts insertion, deletion and substitution only); null when nothing changes.
create or replace function public.search_correct(qn text)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  w text;
  q1 tsquery;
  best text;
  k integer;
  out_words text[] := '{}';
  changed boolean := false;
begin
  foreach w in array regexp_split_to_array(qn, ' ') loop
    q1 := to_tsquery('english', w);
    if length(w) < 4 or numnode(q1) = 0 or exists (select 1 from public.search_aliases a where a.term = w)
       or exists (select 1 from public.event_search s where s.doc @@ q1) then
      out_words := out_words || w;
      continue;
    end if;
    k := case when length(w) = 4 then 1 else 2 end;
    select v.word into best
      from (select distinct regexp_split_to_table(s.names, ' ') as word from public.event_search s) v
     where length(v.word) >= 3 and length(v.word) <= 255
       and extensions.levenshtein_less_equal(v.word, w, k) <= k
     order by extensions.levenshtein(v.word, w), extensions.similarity(v.word, w) desc, v.word
     limit 1;
    if best is null then
      out_words := out_words || w;
    else
      out_words := out_words || best;
      changed := true;
    end if;
  end loop;
  return case when changed then array_to_string(out_words, ' ') end;
end
$$;

-- THE RELAXED STEP: any of the words, those matching more ranked first (the search relaxed by its least important word).
create or replace function public.search_relaxed(qn text, lim integer)
returns table (event_id uuid, score real)
language plpgsql stable security definer set search_path = '' as $$
declare
  tsq tsquery := websearch_to_tsquery('english', array_to_string(regexp_split_to_array(qn, ' '), ' or '));
begin
  if numnode(tsq) = 0 then
    return;
  end if;
  return query
  select s.event_id, ts_rank(s.doc, tsq)::real
    from public.event_search s
    join public.events ev on ev.id = s.event_id
   where ev.status = 'published' and ev.end_date > now() - interval '1 day' and s.doc @@ tsq
   order by 2 desc, ev.start_date asc
   limit lim;
end
$$;

-- ONE RANKED ANSWER: event ids, their score, how they matched ('exact', 'corrected' for 'Did you mean', 'relaxed'), and
-- the query that answered (the corrected one where it was corrected). It ranks candidates only: which of them a visitor
-- may see is decided by the caller with the one public visibility rule (src/lib/events/public-visibility.ts); its own
-- bound (published, ended no more than a day ago) only keeps a draft's id from ever being answered to anyone.
create or replace function public.search_events(p_q text, p_limit integer default 200)
returns table (event_id uuid, score real, matched text, query text)
language plpgsql stable security definer set search_path = '' as $$
declare
  qn text := public.search_norm(left(coalesce(p_q, ''), 200));
  lim integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  fixed text;
  hits integer;
begin
  if qn = '' then
    return;
  end if;
  return query select x.event_id, x.score, 'exact'::text, qn from public.search_exact(qn, lim) x;
  get diagnostics hits = row_count;
  if hits > 0 then
    return;
  end if;
  fixed := public.search_correct(qn);
  if fixed is not null then
    return query select x.event_id, x.score, 'corrected'::text, fixed from public.search_exact(fixed, lim) x;
    get diagnostics hits = row_count;
    if hits > 0 then
      return;
    end if;
  end if;
  return query select x.event_id, x.score, 'relaxed'::text, coalesce(fixed, qn) from public.search_relaxed(coalesce(fixed, qn), lim) x;
end
$$;
revoke all on function public.search_exact(text, integer) from public, anon, authenticated;
revoke all on function public.search_correct(text) from public, anon, authenticated;
revoke all on function public.search_relaxed(text, integer) from public, anon, authenticated;
revoke all on function public.search_events(text, integer) from public;
grant execute on function public.search_events(text, integer) to anon, authenticated, service_role;

-- Every event's document, now.
select public.event_search_refresh(id) from public.events;
