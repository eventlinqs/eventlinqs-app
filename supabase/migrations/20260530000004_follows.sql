-- follows: a user follows artists and sub-genres. This is the taste signal that
-- powers the launch follow-feed without needing a streaming integration.
-- See docs/GENRE-DISCOVERY-FOUNDATION-SPEC.md section 5.
--
-- Polymorphic: followable_type is 'artist' (followable_id = artist uuid as text)
-- or 'subgenre' (followable_id = sub-genre slug). This is distinct from the
-- existing saved_events table (saving an event, not following a community).
--
-- RLS: a user may read, insert and delete only their own rows. Admin read-all is
-- served by the service role (which bypasses RLS), so no admin policy is defined.

begin;

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  followable_type text not null check (followable_type in ('artist', 'subgenre')),
  followable_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, followable_type, followable_id)
);

comment on table public.follows is
  'User taste follows: artists and sub-genres. Powers the launch follow-feed.';

create index if not exists follows_user_id_idx on public.follows (user_id);
create index if not exists follows_followable_idx on public.follows (followable_type, followable_id);

alter table public.follows enable row level security;

drop policy if exists "follows_own_select" on public.follows;
create policy "follows_own_select" on public.follows
  for select using (auth.uid() = user_id);

drop policy if exists "follows_own_insert" on public.follows;
create policy "follows_own_insert" on public.follows
  for insert with check (auth.uid() = user_id);

drop policy if exists "follows_own_delete" on public.follows;
create policy "follows_own_delete" on public.follows
  for delete using (auth.uid() = user_id);

commit;
