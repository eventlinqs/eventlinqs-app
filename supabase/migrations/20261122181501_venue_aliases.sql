-- ONE ALIAS TABLE, EACH ALIAS WITH ITS SOURCE (Lawal's permanent publishing reliability correction, 19:04 of
-- 22 November 2026, section 1; the PM's 19:05, item 1). The caption standard's place check (src/lib/social/piece-quality.ts)
-- held AMCF's final day story because its place line said 'Federation Square' while the listing's venue_name reads
-- 'Fed Square'; the venue row itself is named 'Federation Square'. One venue, two names. The check now judges the venue a
-- place line names by its identity (src/lib/social/venue-identity.ts): the listing's venue name, the venue row's own name,
-- or an alias recorded here for that venue id. Two venue ids are never equal.
create table if not exists public.venue_aliases (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  alias text not null check (length(btrim(alias)) between 2 and 120),
  -- Where the alias was read: never blank, so every alias can be traced.
  source text not null check (length(btrim(source)) between 8 and 500),
  recorded_at timestamptz not null default now()
);
create unique index if not exists venue_aliases_one_per_venue on public.venue_aliases (venue_id, lower(btrim(alias)));
create index if not exists venue_aliases_by_alias on public.venue_aliases (lower(btrim(alias)));

comment on table public.venue_aliases is
  'Other names a venue is published under, each with its source. The social publish gate accepts a place line naming the venue by its row''s name, its listing''s name or one of these; a name recorded for two venues is never matched.';

-- Server jobs only (the publish gate and the planner run with the service role); no visitor or signed in reader.
alter table public.venue_aliases enable row level security;
revoke all on public.venue_aliases from public, anon, authenticated, service_role;
grant select, insert on public.venue_aliases to service_role;

-- Federation Square, as Fed Square: the name AMCF's own listing gives it (events.venue_name of its event 5d664060).
insert into public.venue_aliases (venue_id, alias, source)
select v.id, 'Fed Square', 'events.venue_name of the African Music and Cultural Festival 2026 listing (5d664060), read on 22 November 2026'
  from public.venues v
 where v.id = '0d7a0801-e265-4920-96e1-94838ae52e7e' and v.name = 'Federation Square'
on conflict do nothing;
