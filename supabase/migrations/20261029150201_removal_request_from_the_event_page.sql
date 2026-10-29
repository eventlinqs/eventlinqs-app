-- REPORT OR REMOVE THIS LISTING, FROM ANY EVENT PAGE (the release checklist's I5; the project manager's ruling of
-- 29 October 2026, 14:20: "a 'Report or remove this listing' link on every event page to a small form (no account,
-- rate limited by IP, honeypot, one reason, an optional email) that writes removal_requests and shows in
-- /admin/today").
--
-- removal_requests (20261027150001) was made for a venue or a series, with a name and an email always given. A visitor
-- reporting one night needs neither a series nor a venue to point at, and gives a reason and, if they like, an email.
-- So, additive only: an event as the third possible target (still exactly one), and the name and email may be absent,
-- each still held to its shape when given. Nothing here hides, deletes or changes a listing: a request waits in
-- /admin/today for a person, and a listing comes down only through the event lifecycle that already exists.
--
-- Grants are unchanged: service role only, no policy (the form writes through the server). The 21 October grant rule
-- binds a NEW table; this one is not new, and its grants stand as 20261027150001 wrote them.

alter table public.removal_requests
  add column if not exists event_id uuid references public.events (id) on delete cascade;

create index if not exists removal_requests_event_id_idx on public.removal_requests (event_id) where event_id is not null;

alter table public.removal_requests alter column requester_name drop not null;
alter table public.removal_requests alter column requester_email drop not null;

alter table public.removal_requests drop constraint if exists removal_requests_one_target;
alter table public.removal_requests
  add constraint removal_requests_one_target check (num_nonnulls(venue_id, series_id, event_id) = 1);

alter table public.removal_requests drop constraint if exists removal_requests_name;
alter table public.removal_requests
  add constraint removal_requests_name check (requester_name is null or char_length(btrim(requester_name)) between 1 and 120);

alter table public.removal_requests drop constraint if exists removal_requests_email;
alter table public.removal_requests
  add constraint removal_requests_email check (requester_email is null or requester_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

comment on column public.removal_requests.event_id is
  'One night reported from its own page (/events/[slug]/report, I5). Exactly one of venue_id, series_id and event_id.';

-- Post-condition: the three targets and the relaxed columns are as written, or the migration fails here.
do $check$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'removal_requests' and column_name = 'event_id'
  ) then
    raise exception 'removal_requests.event_id is missing';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'removal_requests'
       and column_name in ('requester_name', 'requester_email') and is_nullable = 'NO'
  ) then
    raise exception 'removal_requests requester_name or requester_email is still required';
  end if;
end
$check$;
