-- ============================================================================
-- 20261028140201_listing_submissions.sql
--
-- H1 OF THE RELEASE CHECKLIST (C:\dev\START-16OCT\EVENTLINQS-RELEASE-CHECKLIST.md, the project manager's 13:10 of
-- 28 October 2026 (2)): "Organiser submission of an outside event (a form: event, booking link, photo they own,
-- permission line), into the review queue". The first source in the acquisition order (G11).
--
-- One table, listing_submissions: what an organiser sent from /submit-event, waiting for a person in
-- /admin/submissions. Nothing here is published; an accepted submission goes into the next checked listings file
-- (scripts/ops/import-city-listings.mjs), as every listing does. It writes nothing into the collection run's
-- listing_sources or listing_candidates.
--
-- One private bucket, listing-submissions: the photo the organiser says they own, if they send one, re-encoded by the
-- image pipeline (src/lib/media/image-pipeline.ts) before it is stored. A submission never needs a photo (the release
-- checklist's section K, Lawal's 14:33 of 28 October 2026: "Discovery never stops for want of an image licence"). No storage policy: only the service role reads or writes it,
-- and staff see a photo by a short signed address.
--
-- THE RULES THE DATABASE HOLDS, so no form, script or person can store less:
--   the booking address is https only, with no space (the 21:51 (C) of 27 October: no javascript:, data:, http:);
--   the sender confirmed they may speak for the event; a photo sent is one they said they own; the permission line
--   (K4's one line) is kept in the exact words they agreed to, with the moment they agreed;
--   the entry is said (free, free with registration, paid), never inferred; a price only for a paid one (section B);
--   a review is whole (who and when) and a refusal says why.
-- Staff only through the service role (the 21 October grant rule).
-- ============================================================================

create table if not exists public.listing_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- who sent it
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 320),
  role text not null check (role in ('organiser', 'venue', 'promoter')),
  -- the event
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null check (length(btrim(venue_name)) between 1 and 160),
  venue_address text not null check (length(btrim(venue_address)) between 1 and 300),
  city_slug text not null check (city_slug in ('melbourne', 'geelong', 'ballarat', 'bendigo')),
  booking_url text not null check (booking_url ~* '^https://[^[:space:]]+$' and length(booking_url) <= 2000),
  entry text not null check (entry in ('free', 'free_registration', 'paid')),
  price_from_cents integer check (price_from_cents is null or price_from_cents > 0),
  description text check (description is null or length(btrim(description)) between 1 and 2000),
  -- the photo and the permission
  photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}\.(webp|avif|jpg)$'),
  photo_owned boolean not null default false,
  authority_confirmed boolean not null check (authority_confirmed),
  permission_words text not null check (length(btrim(permission_words)) between 20 and 600),
  permission_given_at timestamptz not null,
  -- the review
  status text not null default 'waiting' check (status in ('waiting', 'accepted', 'refused')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  refused_because text,
  constraint listing_submissions_ends_after_start check (ends_at is null or ends_at > starts_at),
  constraint listing_submissions_photo_is_owned check (photo_path is null or photo_owned),
  constraint listing_submissions_price_only_when_paid check (entry = 'paid' or price_from_cents is null),
  constraint listing_submissions_review_is_whole check (
    (status = 'waiting' and reviewed_at is null)
    or (status <> 'waiting' and reviewed_at is not null)
  ),
  constraint listing_submissions_refusal_says_why check (status <> 'refused' or length(btrim(coalesce(refused_because, ''))) > 0)
);

create index if not exists listing_submissions_waiting on public.listing_submissions (created_at desc) where status = 'waiting';

comment on table public.listing_submissions is
  'H1: an outside event an organiser sent from /submit-event, with any photo they own and the permission line in the words they agreed to, waiting for a person in /admin/submissions. Nothing here is published.';

alter table public.listing_submissions enable row level security;
revoke all on public.listing_submissions from public, anon, authenticated, service_role;
-- Delete too: a person may ask for their submission to be removed, and a drive removes what it made.
grant select, insert, update, delete on public.listing_submissions to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-submissions', 'listing-submissions', false, 10485760, array['image/webp', 'image/avif', 'image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_cell record;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'listing_submissions' and c.relrowsecurity) then
    v_missing := v_missing || ' listing_submissions.rls';
  end if;
  if not exists (select 1 from storage.buckets where id = 'listing-submissions' and public = false) then
    v_missing := v_missing || ' bucket.listing-submissions.private';
  end if;
  for v_cell in
    select r.role, p.priv, (r.role = 'service_role' and p.priv in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) as expected
      from (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, 'public.listing_submissions', v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' listing_submissions.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'Listing submissions migration post-condition failed:%', v_missing;
  end if;
end
$post$;
