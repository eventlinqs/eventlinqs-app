-- INSTAGRAM COLLABORATION IN THE CRM (law 40 (c), Lawal, 20 November 2026, 14:44; the PM's 14:46 item 3): per organiser,
-- the Instagram handle verified as theirs and where it was verified, their collaboration preference, every invitation
-- sent and what Instagram shows of it. Photo permission (organiser_permissions, social_assets) and collaboration consent
-- are held separately: nothing here grants or reads a photo permission. Follows 20261120150001. Additive.
alter table public.organisers
  add column if not exists instagram_verified_at timestamptz,
  add column if not exists instagram_verified_source text check (instagram_verified_source is null or instagram_verified_source ~ '^https://'),
  add column if not exists collab_preference text not null default 'open' check (collab_preference in ('open', 'declined', 'do_not_invite'));
comment on column public.organisers.instagram_verified_at is
  'When instagram_handle was verified as the organiser''s own: read from their own site or listing (instagram_verified_source) and read back on Instagram (law 40 (c)). Null: unverified, never invited.';
comment on column public.organisers.collab_preference is
  'Whether the organiser may be invited as an Instagram collaborator (law 40): open, declined (they said no), do_not_invite. Never inferred from a photo permission.';
-- A verified handle carries its source: no verification without the page it was read from.
alter table public.organisers drop constraint if exists organisers_instagram_verified_has_source;
alter table public.organisers add constraint organisers_instagram_verified_has_source
  check (instagram_verified_at is null or (instagram_verified_source is not null and instagram_handle is not null));

-- Every invitation sent, one row per organiser per published piece (law 40 (c)): pending when the post goes out with the
-- invite; accepted or declined only where Instagram shows it (IG Media Collaborators' invite_status); ignored once it has
-- stood pending past its window. A published post is never an accepted collaboration (law 40 (b)).
create table if not exists public.collab_invitations (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.organisers(id) on delete restrict,
  piece_id uuid not null references public.social_pieces(id) on delete restrict,
  schedule_id uuid references public.social_piece_schedules(id) on delete restrict,
  handle text not null check (handle ~ '^[a-z0-9._]{1,30}$'),
  post_ref text check (post_ref is null or post_ref ~ '^https://'),
  sent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'ignored')),
  status_read_at timestamptz,
  status_source text check (status_source is null or status_source in ('instagram_api', 'organiser_reply', 'window')),
  notes text check (notes is null or length(btrim(notes)) between 3 and 2000),
  created_at timestamptz not null default now(),
  unique (organiser_id, piece_id)
);
create index if not exists collab_invitations_organiser on public.collab_invitations (organiser_id, sent_at desc);
comment on table public.collab_invitations is
  'Each Instagram Collab invitation (law 40): which organiser, which piece, when, and its status as Instagram shows it. Written and read by the service role only.';

alter table public.collab_invitations enable row level security;
revoke all on table public.collab_invitations from anon, authenticated, service_role;
grant select, insert, update (status, status_read_at, status_source, notes, post_ref) on table public.collab_invitations to service_role;
grant update (instagram_verified_at, instagram_verified_source, collab_preference) on table public.organisers to service_role;

-- POST-CONDITION
do $post$
begin
  if has_table_privilege('anon', 'public.collab_invitations', 'SELECT') or has_table_privilege('authenticated', 'public.collab_invitations', 'SELECT') then
    raise exception 'collab_invitations is readable beyond the service role';
  end if;
  if not has_table_privilege('service_role', 'public.collab_invitations', 'INSERT') then
    raise exception 'the service role cannot record an invitation';
  end if;
  if has_table_privilege('service_role', 'public.collab_invitations', 'DELETE') then
    raise exception 'an invitation must never be deleted';
  end if;
end $post$;
