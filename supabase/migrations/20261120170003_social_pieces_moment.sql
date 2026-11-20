-- A LIFECYCLE PIECE KNOWS ITS MOMENT AND ITS DAY (train AI-2, law 37 (l), Lawal, 20 November 2026, 14:06): the planner
-- writes one piece per run, moment, format and day ('<moment>|<format>|<YYYY-MM-DD>|<run key>'), so a run's first day,
-- running days and final day are each their own piece, posted on their own day and never planned twice. Follows
-- 20261120150002. Additive: one column, and social_pieces_once made again with it; every row today has none, so every
-- existing piece keeps exactly the key it has.
alter table public.social_pieces
  add column if not exists moment_key text check (moment_key is null or moment_key ~ '^[a-z_]+\|(feed|story)\|[0-9]{4}-[0-9]{2}-[0-9]{2}\|.{3,200}$');
comment on column public.social_pieces.moment_key is
  'A lifecycle piece''s moment (law 37 (l)): moment|format|day|run key. Its day binds the schedule: the piece posts that day or not at all. Null for every other piece.';

drop index if exists public.social_pieces_once;
create unique index social_pieces_once
  on public.social_pieces (campaign_id, kind, city, coalesce(partner_name, ''), coalesce(poster_day, '0001-01-01'::date), coalesce(moment_key, ''));

-- POST-CONDITION: the index stands with the moment in it.
do $post$
begin
  if position('moment_key' in (select pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'social_pieces_once')) = 0 then
    raise exception 'social_pieces_once does not carry moment_key';
  end if;
end $post$;
