-- A VENUE'S RECORDED ALIASES (the PM's 18:46 of 22 November 2026, fix 1): the caption standard's place check
-- (src/lib/social/piece-quality.ts) held AMCF's final day story because its place line said 'Federation Square' while the
-- venue row reads 'Fed Square'. One venue, two names. The check now accepts the venue's own name or any alias recorded
-- here; a place that is neither is still refused. Nullable-free with an empty default: no row changes meaning, no grant.
alter table public.venues add column if not exists aliases text[] not null default '{}'::text[];

comment on column public.venues.aliases is
  'Other names this venue is published under (Federation Square for Fed Square). The caption standard accepts the venue''s name or any of these on a post''s place line.';

-- Fed Square, as Federation Square: the name AMCF's chair writes for it (his email of 11 October 2026: 'at Federation Square from 20 to 22 November').
update public.venues
   set aliases = array_append(aliases, 'Federation Square')
 where id = '0d7a0801-e265-4920-96e1-94838ae52e7e' and name = 'Fed Square' and not ('Federation Square' = any(aliases));
