-- ============================================================================
-- THE SOCIAL ENGINE (the foundation's item 11, START-16OCT/EVENTLINQS-FOUNDATION-LOCKED-27OCT.md, locked 27 October
-- 2026; docs/SOCIAL-ENGINE.md). Ported from Bookedproof's engine (bp-int-pf1, src/lib/social and its bp_social_*
-- migrations, read only), as EventLinqs code: plan, words, approval, the post, results and cadence.
--
-- "Results are credited by WI3's counted clicks and EventLinqs ticket sales; likes are never the measure."
--
-- 1. social_posts: one planned post per event, network and format (a 4:5 feed card or a story), each with ITS OWN
--    share link (public.share_links, minted for this post alone), so every arrival, press out and ticket sold through
--    it is this post's (share_link_events). facts are the listing's own words the post may state.
-- 2. social_drafts: the post's words as numbered versions. A version whose words state a number none of the facts
--    holds, leave out the post's own link, or carry a long dash or an exclamation mark is refused.
-- 3. social_approvals: a person's approval of the newest version. Refused for an event that is not published and
--    public, has ended or has sold out, and inside the gap of the rule in force for that network and format.
-- 4. social_postings: the post as it went, by hand on the network until Meta's review allows publishing by its API:
--    its address on Instagram or Facebook, when, and who recorded it. One per post, naming its approval.
-- 5. social_cadence_rules: how far apart posts go, and the hours of the week posts sold the most tickets, versioned
--    and read by date (social_cadence_at), so no change is retroactive. The starting rows are research, not taste:
--    Buffer's study of 2.1 million posts from 102K Instagram accounts ("Posting 10+ posts/week = ~24% more reach per
--    post", https://buffer.com/library/how-often-to-post-on-instagram/, read 27 October 2026) puts feed posts 12 hours
--    apart to start, at most 14 a week; it "looked at Instagram feed posts ... not Instagram Stories", so stories start
--    at 2 hours. Learned rows replace them from EventLinqs' own posts (src/lib/social/cadence.ts).
--
-- Staff only: no visitor or signed in user reads or writes any of these. Row security on with no policy, the service
-- role alone granted, select and insert only, so every row is history that is added to and never rewritten (the 21
-- October grant rule). An event's delete takes its posts with it (docs/EVENT-LIFECYCLE.md, CASCADE).
--
-- Reversal: drop the five tables and the four functions. Nothing else reads them.
-- ============================================================================

create table if not exists public.social_cadence_rules (
  id uuid primary key default gen_random_uuid(),
  -- Null on a starting row, which stands for every network until one learns its own.
  platform text check (platform is null or platform in ('instagram', 'facebook')),
  format text not null check (format in ('feed', 'story')),
  version integer not null check (version >= 1),
  gap_hours integer not null check (gap_hours between 1 and 168),
  -- Hours of the week (0 is Monday at midnight, Melbourne's clock) each opening a three hour band, best first.
  slots integer[] not null default '{}',
  basis text not null check (basis in ('starting', 'learned')),
  learned_from integer not null default 0,
  floor_posts integer not null check (floor_posts >= 1),
  settle_hours integer not null check (settle_hours >= 1),
  reason text not null check (length(btrim(reason)) >= 20),
  set_at timestamptz not null,
  set_by text not null check (length(btrim(set_by)) > 0),
  created_at timestamptz not null default now(),
  constraint social_cadence_rules_slots check (0 <= all (slots) and 167 >= all (slots) and cardinality(slots) <= 6),
  constraint social_cadence_rules_feed_gap check (format <> 'feed' or gap_hours >= 12),
  constraint social_cadence_rules_whose check (
    (basis = 'starting' and platform is null and cardinality(slots) = 0 and learned_from = 0)
    or (basis = 'learned' and platform is not null and learned_from >= floor_posts)
  )
);

create unique index if not exists social_cadence_rules_once
  on public.social_cadence_rules (coalesce(platform, '-'), format, version);

comment on table public.social_cadence_rules is
  'Item 11. How far apart posts go on one network and format, and the hours of the week they sold the most tickets: a starting row per format, then each network''s own once its own posts are enough. Versioned, read by date.';

insert into public.social_cadence_rules (platform, format, version, gap_hours, slots, basis, learned_from, floor_posts, settle_hours, reason, set_at, set_by)
select null, 'feed', 1, 12, '{}', 'starting', 0, 12, 48,
       'Before twelve of our own feed posts have each gone 48 hours, there is no baseline: feed posts go at least 12 hours apart (Buffer, 2.1 million posts: 10 or more a week reached about 24 percent more a post), and no hour is said to be better than another.',
       timestamptz '2026-10-27 00:00:00+11', 'item 11, the starting rule'
 where not exists (select 1 from public.social_cadence_rules where platform is null and format = 'feed' and version = 1);

insert into public.social_cadence_rules (platform, format, version, gap_hours, slots, basis, learned_from, floor_posts, settle_hours, reason, set_at, set_by)
select null, 'story', 1, 2, '{}', 'starting', 0, 12, 48,
       'Before twelve of our own stories have each gone 48 hours, there is no baseline: stories go at least 2 hours apart (Buffer''s study did not cover stories), and no hour is said to be better than another.',
       timestamptz '2026-10-27 00:00:00+11', 'item 11, the starting rule'
 where not exists (select 1 from public.social_cadence_rules where platform is null and format = 'story' and version = 1);

create or replace function public.social_cadence_at(p_platform text, p_format text, p_at timestamptz)
returns public.social_cadence_rules
language sql
stable
set search_path = public, pg_temp
as $rule$
  select r.* from public.social_cadence_rules r
   where r.set_at <= p_at and r.format = p_format and (r.platform = p_platform or r.platform is null)
   order by (r.platform is not null) desc, r.set_at desc, r.version desc
   limit 1
$rule$;

-- What is left of an event now: an EventLinqs-ticketed event by its active tiers' places (capacity less sold and held),
-- a curated listing by its booking links (every live one sold out). Never from a cache.
create or replace function public.social_event_sold_out(p_event uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $left$
  select case
    when exists (select 1 from public.ticket_tiers t where t.event_id = p_event and t.is_active)
      then (select coalesce(sum(greatest(0, t.total_capacity - t.sold_count - t.reserved_count)), 0) <= 0
              from public.ticket_tiers t where t.event_id = p_event and t.is_active)
    when exists (select 1 from public.event_booking_links l where l.event_id = p_event and l.availability <> 'dead')
      then not exists (select 1 from public.event_booking_links l
                        where l.event_id = p_event and l.availability in ('on_sale', 'not_yet'))
    else false
  end
$left$;

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook')),
  format text not null check (format in ('feed', 'story')),
  -- This post's own share link, minted for it alone, so what it brings is its own.
  share_link_id uuid not null unique references public.share_links(id) on delete restrict,
  link text not null check (link ~* '^https://[^[:space:]]+/e/[0-9A-Za-z-]+$'),
  -- The listing's own words the post may state: its name, date, time, venue, city, price line and summary.
  facts text[] not null check (cardinality(facts) >= 1),
  planned_at timestamptz not null default now(),
  planned_by uuid references auth.users(id) on delete set null,
  unique (event_id, platform, format)
);

comment on table public.social_posts is
  'Item 11. One planned post per event, network and format, with its own share link so its arrivals, presses out and tickets are counted as its own.';

create table if not exists public.social_drafts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  version integer not null check (version >= 1),
  caption text not null check (length(btrim(caption)) between 1 and 2200),
  written_by text not null check (written_by in ('kit', 'person')),
  written_by_user uuid references auth.users(id) on delete set null,
  drafted_at timestamptz not null default now(),
  constraint social_drafts_person_named check (written_by = 'kit' or written_by_user is not null),
  unique (post_id, version)
);

comment on table public.social_drafts is
  'Item 11. A post''s words as numbered versions: the Launch Kit''s own caption first, then any a person writes. A number the listing does not hold is refused.';

create or replace function public.social_draft_holds_its_facts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $draft$
declare
  v_post public.social_posts;
  v_next integer;
  v_said text;
begin
  select * into v_post from public.social_posts where id = new.post_id;
  select coalesce(max(version), 0) + 1 into v_next from public.social_drafts where post_id = new.post_id;
  if new.version <> v_next then
    raise exception 'refused: the next version of these words is %, not %, so nothing is kept over another.', v_next, new.version
      using errcode = '23514';
  end if;
  if position(v_post.link in new.caption) = 0 then
    raise exception 'refused: the words must carry the post''s own link, so what it brings is counted.' using errcode = '23514';
  end if;
  if new.caption ~ ('[' || chr(8211) || chr(8212) || '!]') then
    raise exception 'refused: the words carry a long dash or an exclamation mark.' using errcode = '23514';
  end if;
  -- Every run of digits the words state, the post's own link taken out, is a run of digits one of its facts states.
  v_said := replace(new.caption, v_post.link, ' ');
  if exists (
    select 1 from regexp_matches(v_said, '([0-9]+)', 'g') as m
     where not exists (select 1 from unnest(v_post.facts) f, regexp_matches(f, '([0-9]+)', 'g') as h where h[1] = m[1])
  ) then
    raise exception 'refused: these words state a number the listing does not hold, so they are not kept.' using errcode = '23514';
  end if;
  return new;
end;
$draft$;

drop trigger if exists social_drafts_hold_their_facts on public.social_drafts;
create trigger social_drafts_hold_their_facts
  before insert on public.social_drafts
  for each row execute function public.social_draft_holds_its_facts();

create table if not exists public.social_approvals (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.social_drafts(id) on delete cascade,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now()
);

comment on table public.social_approvals is
  'Item 11. A person''s approval of the newest words of a post, refused where the event is not public, has ended or has sold out, or inside the gap of the rule in force.';

create or replace function public.social_approval_is_due()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $due$
declare
  v_draft public.social_drafts;
  v_post public.social_posts;
  v_event record;
  v_rule public.social_cadence_rules;
  v_last timestamptz;
begin
  select * into v_draft from public.social_drafts where id = new.draft_id;
  select * into v_post from public.social_posts where id = v_draft.post_id;
  if exists (select 1 from public.social_drafts d where d.post_id = v_post.id and d.version > v_draft.version) then
    raise exception 'refused: newer words have been written for this post since, so approve the newest.' using errcode = '23514';
  end if;
  if exists (select 1 from public.social_postings p where p.post_id = v_post.id) then
    raise exception 'refused: this post has gone already.' using errcode = '23514';
  end if;

  select e.status, e.visibility, e.end_date into v_event from public.events e where e.id = v_post.event_id;
  if v_event.status::text <> 'published' or v_event.visibility::text <> 'public' then
    raise exception 'refused: the event is not published and public, so nothing is posted for it.' using errcode = '23514';
  end if;
  if v_event.end_date <= new.approved_at then
    raise exception 'refused: the event has ended, so nothing is posted for it.' using errcode = '23514';
  end if;
  if public.social_event_sold_out(v_post.event_id) then
    raise exception 'refused: it has sold out, so nothing more is posted for it.' using errcode = '23514';
  end if;

  v_rule := public.social_cadence_at(v_post.platform, v_post.format, new.approved_at);
  if v_rule.id is null then
    raise exception 'refused: no rule of how far apart posts go stands at that moment.' using errcode = '23514';
  end if;
  -- The last post on this network and format: one that went, or one approved in the last day and not yet recorded.
  select max(t) into v_last from (
    select g.posted_at as t
      from public.social_postings g join public.social_posts p on p.id = g.post_id
     where p.platform = v_post.platform and p.format = v_post.format and g.posted_at <= new.approved_at
    union all
    select a.approved_at
      from public.social_approvals a
      join public.social_drafts d on d.id = a.draft_id
      join public.social_posts p on p.id = d.post_id
     where p.platform = v_post.platform and p.format = v_post.format and p.id <> v_post.id
       and a.approved_at <= new.approved_at and a.approved_at > new.approved_at - interval '24 hours'
       and not exists (select 1 from public.social_postings g where g.post_id = p.id)
  ) x;
  if v_last is not null and new.approved_at < v_last + make_interval(hours => v_rule.gap_hours) then
    raise exception 'refused: the last % % went at %, and they go at least % hours apart, so this one waits until %.',
      v_post.platform, v_post.format, v_last, v_rule.gap_hours, v_last + make_interval(hours => v_rule.gap_hours)
      using errcode = '23514';
  end if;
  return new;
end;
$due$;

drop trigger if exists social_approvals_are_due on public.social_approvals;
create trigger social_approvals_are_due
  before insert on public.social_approvals
  for each row execute function public.social_approval_is_due();

create table if not exists public.social_postings (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.social_posts(id) on delete cascade,
  approval_id uuid not null unique references public.social_approvals(id) on delete cascade,
  post_url text not null check (post_url ~* '^https://(www\.)?(instagram\.com|facebook\.com|fb\.com)/[^[:space:]]+$'),
  posted_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

comment on table public.social_postings is
  'Item 11. A post as it went on the network: its address, when, and who recorded it, naming the approval of the words it carried.';

create or replace function public.social_posting_is_approved()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $went$
declare
  v_approval public.social_approvals;
  v_draft public.social_drafts;
begin
  select * into v_approval from public.social_approvals where id = new.approval_id;
  select * into v_draft from public.social_drafts where id = v_approval.draft_id;
  if v_draft.post_id is distinct from new.post_id then
    raise exception 'refused: that approval is of another post''s words.' using errcode = '23514';
  end if;
  if exists (select 1 from public.social_drafts d where d.post_id = new.post_id and d.version > v_draft.version) then
    raise exception 'refused: newer words have been written since that approval, so approve the newest first.' using errcode = '23514';
  end if;
  if new.posted_at < v_approval.approved_at or new.posted_at > v_approval.approved_at + interval '24 hours' then
    raise exception 'refused: a post goes within a day after its approval, so approve it again.' using errcode = '23514';
  end if;
  if new.posted_at > now() + interval '5 minutes' then
    raise exception 'refused: a post is recorded once it has gone, not before.' using errcode = '23514';
  end if;
  return new;
end;
$went$;

drop trigger if exists social_postings_are_approved on public.social_postings;
create trigger social_postings_are_approved
  before insert on public.social_postings
  for each row execute function public.social_posting_is_approved();

-- ---------------------------------------------------------------------------
-- ROW SECURITY AND GRANTS: staff only, through the service role, added to and never rewritten.
-- ---------------------------------------------------------------------------
alter table public.social_cadence_rules enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_drafts enable row level security;
alter table public.social_approvals enable row level security;
alter table public.social_postings enable row level security;

revoke all on public.social_cadence_rules from public, anon, authenticated, service_role;
revoke all on public.social_posts from public, anon, authenticated, service_role;
revoke all on public.social_drafts from public, anon, authenticated, service_role;
revoke all on public.social_approvals from public, anon, authenticated, service_role;
revoke all on public.social_postings from public, anon, authenticated, service_role;
grant select, insert on public.social_cadence_rules to service_role;
grant select, insert on public.social_posts to service_role;
grant select, insert on public.social_drafts to service_role;
grant select, insert on public.social_approvals to service_role;
grant select, insert on public.social_postings to service_role;

revoke all on function public.social_cadence_at(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.social_event_sold_out(uuid) from public, anon, authenticated;
grant execute on function public.social_cadence_at(text, text, timestamptz) to service_role;
grant execute on function public.social_event_sold_out(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_cell record;
  v_t text;
begin
  foreach v_t in array array['social_cadence_rules', 'social_posts', 'social_drafts', 'social_approvals', 'social_postings'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity) then
      v_missing := v_missing || ' ' || v_t || '.rls';
    end if;
  end loop;
  for v_cell in
    select t.tbl, r.role, p.priv, (r.role = 'service_role' and p.priv in ('SELECT', 'INSERT')) as expected
      from (values ('public.social_cadence_rules'), ('public.social_posts'), ('public.social_drafts'),
                   ('public.social_approvals'), ('public.social_postings')) as t(tbl)
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, v_cell.tbl, v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' ' || v_cell.tbl || '.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;
  foreach v_t in array array['social_drafts_hold_their_facts', 'social_approvals_are_due', 'social_postings_are_approved'] loop
    if not exists (select 1 from pg_trigger where tgname = v_t and not tgisinternal) then
      v_missing := v_missing || ' trigger.' || v_t;
    end if;
  end loop;
  if (select count(*) from public.social_cadence_rules where basis = 'starting') <> 2 then
    v_missing := v_missing || ' starting_rows';
  end if;
  if has_function_privilege('anon', 'public.social_event_sold_out(uuid)', 'EXECUTE') then
    v_missing := v_missing || ' social_event_sold_out.anon_execute';
  end if;

  if v_missing <> '' then
    raise exception 'Social engine migration post-condition failed:%', v_missing;
  end if;
end
$post$;
