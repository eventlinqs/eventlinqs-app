-- ORGANISER SELF-LISTING (Lawal's rulings of 8 November 2026, 07:01 and 07:05): an organiser's submission publishes itself, the
-- way Eventbrite and Humanitix publish a host's event, once the automatic checks pass: its facts read against the organiser's
-- own booking page (a wrong fact the page states rightly is corrected from the page, never held), its photo rights ticked, not
-- a duplicate, not spam. Only a submission that cannot be verified at all is held. NO ORGANISER IS TURNED AWAY FOR LOCATION
-- (07:01 (1)): any Australian city we know may be named; a city with no guide yet still gets its event page.
--
-- Additive, and no existing row changes:
--   * the city is any city in public.cities (the four Victorian guide cities were the only ones allowed);
--   * the category the organiser chose (a live category slug), new submissions only;
--   * two more states: 'published' (the checks passed and the event is live) and 'held' (it could not be verified; the window
--     deals with it, and Lawal gets a one line note);
--   * what the checks read, what they corrected, why a submission is held, the event and series it became, and when Lawal
--     was told.
-- The review rule stays whole: a submission still waiting has no reviewed_at; any other state carries the moment it left
-- waiting (a person's review, or the checks).

alter table public.listing_submissions drop constraint if exists listing_submissions_city_slug_check;
alter table public.listing_submissions drop constraint if exists listing_submissions_city_is_known;
alter table public.listing_submissions
  add constraint listing_submissions_city_is_known foreign key (city_slug) references public.cities (slug);

alter table public.listing_submissions add column if not exists category_slug text;
alter table public.listing_submissions drop constraint if exists listing_submissions_category_slug_shape;
alter table public.listing_submissions
  add constraint listing_submissions_category_slug_shape check (category_slug is null or category_slug ~ '^[a-z][a-z0-9-]{1,60}$');

alter table public.listing_submissions drop constraint if exists listing_submissions_status_check;
alter table public.listing_submissions
  add constraint listing_submissions_status_check check (status in ('waiting', 'accepted', 'refused', 'published', 'held'));

alter table public.listing_submissions add column if not exists checked_at timestamptz;
alter table public.listing_submissions add column if not exists check_result jsonb;
alter table public.listing_submissions add column if not exists corrections jsonb not null default '[]'::jsonb;
alter table public.listing_submissions add column if not exists held_because text;
alter table public.listing_submissions add column if not exists published_event_id uuid references public.events (id) on delete set null;
alter table public.listing_submissions add column if not exists published_series_id uuid references public.event_series (id) on delete set null;
alter table public.listing_submissions add column if not exists alerted_at timestamptz;

alter table public.listing_submissions drop constraint if exists listing_submissions_hold_says_why;
alter table public.listing_submissions
  add constraint listing_submissions_hold_says_why check (status <> 'held' or length(btrim(coalesce(held_because, ''))) between 5 and 300);
alter table public.listing_submissions drop constraint if exists listing_submissions_published_names_its_event;
alter table public.listing_submissions
  add constraint listing_submissions_published_names_its_event check (status <> 'published' or published_series_id is not null);

comment on column public.listing_submissions.check_result is
  'What the self-listing checks read on the organiser''s own booking page and decided (src/lib/listings/self-listing.ts).';
comment on column public.listing_submissions.corrections is
  'Each fact the booking page stated differently, corrected from the page before publishing: [{field, submitted, page}].';
comment on column public.listing_submissions.held_because is
  'Why a submission could not be verified at all (no readable booking page, spam, a duplicate); the window deals with it.';
