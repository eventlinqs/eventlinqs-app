-- Broadcast Layer Stage 3: extend the existing artist entities for performer
-- attribution. SPEC: docs/EventLinqs-Broadcast-Layer-SPEC.md sections 4 and 5.
--
-- The genre foundation already created public.artists (20260530000002) and
-- public.event_artists (20260530000003). Per the one-source-of-truth law those
-- tables ARE the spec's indicative artists and event_lineups tables; this
-- migration extends them additively rather than forking new ones:
--
--   artists.links          - external links (website, socials) as jsonb.
--   artists.owner_user_id  - the platform user who has claimed this artist
--                            profile; backs the artist attribution dashboard.
--   event_artists.status   - confirmed or invited, so an organiser can invite
--                            an untagged guest performer by link.
--   event_artists.invite_token - the no-login claim token for that invite.
--
-- Additive only. Reversible by dropping the added columns. TEST database only,
-- applied with `supabase db push --linked` from PowerShell.

begin;

-- ---------------------------------------------------------------------------
-- artists: external links and profile ownership.
-- ---------------------------------------------------------------------------
alter table public.artists
  add column if not exists links jsonb not null default '{}'::jsonb;

alter table public.artists
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

comment on column public.artists.links is
  'External artist links (website and socials) as a jsonb object of label to url.';
comment on column public.artists.owner_user_id is
  'The user who has claimed this artist profile. Backs the artist attribution dashboard and artist-scoped RLS reads.';

create index if not exists artists_owner_user_idx
  on public.artists (owner_user_id)
  where owner_user_id is not null;

-- The claimed owner may update their own artist profile (bio, image, links).
drop policy if exists "artists_owner_update" on public.artists;
create policy "artists_owner_update" on public.artists
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- event_artists: lineup tag status and the guest-performer invite token.
-- ---------------------------------------------------------------------------
alter table public.event_artists
  add column if not exists status text not null default 'confirmed'
  check (status in ('confirmed', 'invited'));

alter table public.event_artists
  add column if not exists invite_token uuid unique;

comment on column public.event_artists.status is
  'confirmed: the artist appears on the event page. invited: an untagged guest performer has been invited by link and has not yet claimed the tag.';
comment on column public.event_artists.invite_token is
  'No-login claim token for an invited guest performer. Null once claimed or for directly confirmed tags.';

commit;
