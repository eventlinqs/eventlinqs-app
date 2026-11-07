-- FOLLOW THE HOST (car 57, the CONTROLLER's order of 7 November from Lawal's 06:57: every event shows Follow the host;
-- C:\dev\EVIDENCE\EL-8NOV\follow-host). A night EventLinqs lists names its venue as its host (src/lib/listings/
-- shown-organiser.ts), so following that host is following the venue. public.follows took 'artist' and 'subgenre' only
-- (migration 20260530000004); it now takes 'venue' too, followable_id the venue's id. Additive: no row changes, the
-- table's row security (a person reads, adds and removes only their own) and its grants stand as they are.

alter table public.follows drop constraint if exists follows_followable_type_check;
alter table public.follows
  add constraint follows_followable_type_check check (followable_type in ('artist', 'subgenre', 'venue'));

comment on column public.follows.followable_type is
  'What is followed: an artist (its id), a scene (its slug) or a venue (its id), the host of every night EventLinqs lists there.';
