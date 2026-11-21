-- THE SEND RECORD KNOWS WHICH EDITION IT RECORDS (law 45 (a), Lawal, 21 November 2026, 02:09: "We have to have ... the
-- week and the weekend newsletters"; THE WEEK on Wednesday at 07:00 and THE WEEKEND on Friday at 07:00, per city).
--
-- `public.digest_sends` carried one row per city per period, its unique key (city_slug, period_start)
-- (20260704000003), and the cron's idempotence read the city's newest row in the last seven days whatever it recorded.
-- So a Friday weekend edition would read Wednesday's week row as already sent, and the route refused the weekend to
-- subscribers for that reason (src/app/api/cron/weekly-digest/route.ts, the comment of 21 November 2026). With the
-- edition on the row, each edition has its own record and its own idempotence: a week row never stops the weekend, and
-- a second fire of the same edition is a no op.
--
-- 1. edition, 'week' or 'weekend', default 'week', so every row already written reads as what it was: THE WEEK, the only
--    edition ever sent to subscribers.
-- 2. The unique key becomes (city_slug, edition, period_start). The old key was declared inline, so its name is read
--    from the catalogue rather than assumed, and only a unique constraint on exactly (city_slug, period_start) is dropped.
--
-- TRANSACTION SHAPE: one ADD COLUMN IF NOT EXISTS with a constant default (no table rewrite: "When a column is added
-- with ADD COLUMN and a non-volatile DEFAULT is specified, the default is evaluated at the time of the statement and the
-- result stored in the table's metadata", https://www.postgresql.org/docs/current/sql-altertable.html), a check, and the
-- key swapped inside one DO block; no index outside the constraint, so one transaction; re-runnable. No row is hidden or
-- changed in meaning. The table's grants and row security are unchanged (no new table).

alter table public.digest_sends add column if not exists edition text not null default 'week';

alter table public.digest_sends drop constraint if exists digest_sends_edition_known;
alter table public.digest_sends
  add constraint digest_sends_edition_known check (edition in ('week', 'weekend'));

do $key$
declare
  old_name text;
begin
  select c.conname into old_name
    from pg_constraint c
   where c.conrelid = 'public.digest_sends'::regclass
     and c.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname::text)
            from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
         = array['city_slug', 'period_start'];
  if old_name is not null then
    execute format('alter table public.digest_sends drop constraint %I', old_name);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.digest_sends'::regclass and conname = 'digest_sends_city_edition_period_key') then
    alter table public.digest_sends
      add constraint digest_sends_city_edition_period_key unique (city_slug, edition, period_start);
  end if;
end
$key$;

comment on column public.digest_sends.edition is
  'THE WEEK (Wednesday 07:00) or THE WEEKEND (Friday 07:00), law 45 (a). Part of the unique key (city_slug, edition, period_start), so each edition has its own record and a week row never stops a weekend send.';
