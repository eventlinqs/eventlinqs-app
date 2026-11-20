-- THE PLATFORM SENTINEL KEEPS EVERY RUN (P0 of 20 November 2026; the PM's 15:41: 'the sentinel writes every run with
-- its failing check to a table, so the next critical is named from data, not from Lawal's inbox'). Follows
-- 20261120160001. health_sentinel_runs held the visitor sentinel's runs only (sentinel in ('visitor')); it now takes the
-- platform sentinel's ('platform') too, and the admin reads the newest stored run instead of running the whole battery
-- inside a page (the slow /admin/today of 15:38). Changed in place: the constraint in force is found by its definition,
-- dropped and made again with both names; no row changes.
do $c$
declare k text;
begin
  select conname into k from pg_constraint
   where conrelid = 'public.health_sentinel_runs'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'sentinel'
   limit 1;
  if k is null then raise exception 'REFUSED: no sentinel check constraint found on health_sentinel_runs'; end if;
  execute format('alter table public.health_sentinel_runs drop constraint %I', k);
end $c$;
alter table public.health_sentinel_runs add constraint health_sentinel_runs_sentinel_check check (sentinel in ('visitor', 'platform'));

-- POST-CONDITION
do $post$
begin
  if position('platform' in (select pg_get_constraintdef(oid) from pg_constraint where conname = 'health_sentinel_runs_sentinel_check')) = 0 then
    raise exception 'the platform sentinel cannot keep its runs';
  end if;
end $post$;
