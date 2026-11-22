-- A VENUE'S RECORDED ALIASES (the PM's 18:46 of 22 November 2026, fix 1): the caption standard's place check
-- (src/lib/social/piece-quality.ts) held AMCF's final day story because its place line said 'Federation Square' while the
-- listing's venue_name reads 'Fed Square'; the venue row itself is named 'Federation Square'. One venue, two names. The
-- check now accepts the listing's venue_name, the venue row's own name, or any alias recorded here; a place that is none
-- of them is still refused. Not null with an empty default: no row changes meaning, and no new table, so no grant.
alter table public.venues add column if not exists aliases text[] not null default '{}'::text[];

comment on column public.venues.aliases is
  'Other names this venue is published under (Fed Square for Federation Square). The caption standard accepts the venue''s name or any of these on a post''s place line.';

-- Federation Square, as Fed Square: the name AMCF's own listing gives it (events.venue_name on its three nights).
update public.venues
   set aliases = array_append(aliases, 'Fed Square')
 where id = '0d7a0801-e265-4920-96e1-94838ae52e7e' and name = 'Federation Square' and not ('Fed Square' = any(aliases));
