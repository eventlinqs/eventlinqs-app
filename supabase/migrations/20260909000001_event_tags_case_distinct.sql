-- Event tags: two tags may never differ only by case. Close-out UX1.3.
--
-- WHY. The first real outside organiser event on production carried both
-- "#African" and "#african". Each rendered as its own pill and each linked to
-- its own /events?q= search, so one idea was split across two tags. The cause
-- was `Array.from(new Set(...))` in the event form: a JavaScript Set compares
-- strings exactly, so the deduplication that looked like it was happening never
-- was.
--
-- The application now normalises at the server action
-- (src/lib/events/normalise-tags.ts). This migration is the half no writer can
-- bypass: existing rows are repaired, and a CHECK constraint refuses the shape
-- for ever after, whoever writes it and by whatever route.
--
-- ORDER MATTERS. The repair runs BEFORE the constraint is added. TEST currently
-- holds 80 events with tags and 0 collisions, but PRODUCTION holds at least one
-- colliding row (the event that reported this defect), so a constraint added
-- first would fail the founder's push on production and pass on TEST. That is
-- exactly the class of divergence this repository keeps paying for, so the
-- repair is unconditional and idempotent rather than conditional on what a
-- given database happens to hold.

-- ---------------------------------------------------------------------------
-- 1. The invariant, as a function, because a CHECK constraint may not contain
--    a subquery and this one must look at every element of a jsonb array.
-- ---------------------------------------------------------------------------
create or replace function public.event_tags_normalised(tags jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select
    tags is null
    or jsonb_typeof(tags) <> 'array'
    or (
      select
        coalesce(bool_and(value = btrim(value) and value <> ''), true)
        and count(*) = count(distinct lower(value))
      from jsonb_array_elements_text(tags) as t(value)
    );
$$;

comment on function public.event_tags_normalised(jsonb) is
  'Close-out UX1.3: an event tag list is trimmed, carries no empties, and holds no two tags differing only by case. Backs the events_tags_normalised CHECK constraint.';

-- ---------------------------------------------------------------------------
-- 2. Repair every existing row, using the SAME rule the server action applies:
--    trim, strip a leading hash the organiser typed out of habit, drop empties,
--    and remove case-insensitive duplicates KEEPING THE FIRST SPELLING so the
--    organiser's own capitalisation survives (RnB, Afrobeats, First Nations).
--    Original order is preserved.
-- ---------------------------------------------------------------------------
with cleaned as (
  select
    e.id,
    coalesce(
      (
        select jsonb_agg(v.tag order by v.ord)
        from (
          select distinct on (lower(n.tag)) n.tag, t.ord
          from jsonb_array_elements_text(e.tags) with ordinality as t(value, ord)
          cross join lateral (select btrim(ltrim(btrim(t.value), '#')) as tag) as n
          where n.tag <> ''
          order by lower(n.tag), t.ord
        ) as v
      ),
      '[]'::jsonb
    ) as tags
  from public.events e
  where e.tags is not null
    and jsonb_typeof(e.tags) = 'array'
)
update public.events e
set tags = cleaned.tags
from cleaned
where e.id = cleaned.id
  and e.tags is distinct from cleaned.tags;

-- ---------------------------------------------------------------------------
-- 3. The guarantee. Added validated, so it proves the repair worked on the
--    database it is applied to rather than trusting that it did.
-- ---------------------------------------------------------------------------
alter table public.events
  drop constraint if exists events_tags_normalised;

alter table public.events
  add constraint events_tags_normalised check (public.event_tags_normalised(tags));

comment on constraint events_tags_normalised on public.events is
  'Close-out UX1.3: #African and #african may never both exist on one event.';
