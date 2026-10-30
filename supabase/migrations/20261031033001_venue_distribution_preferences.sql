-- D3 (6), A VENUE's DISTRIBUTION PREFERENCES (the DemandOS directive, section 3: "Distribution preferences").
--
-- A claimed venue says where EventLinqs may carry its nights beyond its own pages: (1) our_posts, EventLinqs' own
-- Instagram and Facebook posts, the daily posters and the owned editions the weekly campaign plans; (2) weekly_roundup,
-- the weekly round-up of its city (the email to subscribers and its WhatsApp edition, which carry the same nights).
-- Both are yes until the venue says no; the listing itself, its event pages and the search stay as they are (they are
-- public facts, and a venue that wants off EventLinqs claims and removes its listing by the existing path). Proved on
-- TEST by scripts/verify/venue-distribution-proof.sql through scripts/verify/replay-under-new-default.mjs (red without
-- this file, green with it), rolled back.
--
-- A no is kept as a row and read by the planner and the digest before they choose a night, so a venue that said no is
-- never planned or sent. A failed read stops the plan or the send rather than counting as 'nobody said no'.
--
-- Nobody reads or writes the table but the service role, and the screen only through the functions below, which
-- refuse anyone who is not one of the claimed venue's own people (public.venue_image_manager, the venue media rule).
--
-- Additive: one new table, granted in this file (the 21 October 2026 grant rule), and three definer functions the
-- service role alone may call. Nothing existing is altered.

create table if not exists public.venue_distribution_preferences (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  our_posts boolean not null default true,
  weekly_roundup boolean not null default true,
  set_by uuid not null references auth.users (id) on delete restrict,
  set_at timestamptz not null default now()
);

alter table public.venue_distribution_preferences enable row level security;
revoke all on table public.venue_distribution_preferences from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.venue_distribution_preferences to service_role;

-- A claimed venue's people set both answers at once; the latest answer stands.
create or replace function public.venue_distribution_set(p_user uuid, p_venue uuid, p_our_posts boolean, p_weekly_roundup boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.venue_image_manager(p_user, p_venue) then
    raise exception 'refused: only the people of a claimed venue may set where its nights are shared' using errcode = '23514';
  end if;
  if p_our_posts is null or p_weekly_roundup is null then
    raise exception 'refused: answer both questions' using errcode = '23514';
  end if;
  insert into public.venue_distribution_preferences as d (venue_id, our_posts, weekly_roundup, set_by, set_at)
  values (p_venue, p_our_posts, p_weekly_roundup, p_user, now())
  on conflict (venue_id) do update
    set our_posts = excluded.our_posts, weekly_roundup = excluded.weekly_roundup, set_by = excluded.set_by, set_at = excluded.set_at;
end;
$$;

-- The answers for these venues; a venue with no row has said nothing, which is yes to both.
create or replace function public.venue_distribution_for(p_venues uuid[])
returns table (venue_id uuid, our_posts boolean, weekly_roundup boolean, set_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.venue_id, d.our_posts, d.weekly_roundup, d.set_at
    from public.venue_distribution_preferences d
   where d.venue_id = any (coalesce(p_venues, array[]::uuid[]))
$$;

-- The venues that said no to one channel ('our_posts' or 'weekly_roundup'); any other name is refused, never empty.
create or replace function public.venue_distribution_off(p_channel text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_channel = 'our_posts' then
    return query select d.venue_id from public.venue_distribution_preferences d where not d.our_posts;
  elsif p_channel = 'weekly_roundup' then
    return query select d.venue_id from public.venue_distribution_preferences d where not d.weekly_roundup;
  else
    raise exception 'refused: unknown channel %', p_channel using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.venue_distribution_set(uuid, uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.venue_distribution_for(uuid[]) from public, anon, authenticated;
revoke all on function public.venue_distribution_off(text) from public, anon, authenticated;
grant execute on function public.venue_distribution_set(uuid, uuid, boolean, boolean) to service_role;
grant execute on function public.venue_distribution_for(uuid[]) to service_role;
grant execute on function public.venue_distribution_off(text) to service_role;
