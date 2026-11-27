-- WINDOW 5C, 28 November 2026, car W (the organiser P0 audit of 27 November 2026, item 8, the PM's 15:58 item 2: "THE END
-- TO END /submit-event TEST IS HELD, NOT RUN: listing_submissions has no is_test, a submission publishes at once as a real
-- public event owned by the listings organisation (is_test false) ... Smallest fix first: a submission from a hello+test
-- address carries is_test to its published event").
--
-- A series carries is_test. The self-listing run sets it for a submission from a test address (the database's own rule,
-- 20261121140001: hello+qa, hello+test or hello+acceptance at eventlinqs.com), and the occurrence run makes each of its
-- events is_test from birth, so a test night is never an admin figure, a guide or sitemap entry, an IndexNow notice or a
-- notice to the owner. Existing series are not test series (the default). A column only: no table, no grant, nothing
-- hidden that is not a test.
alter table public.event_series add column if not exists is_test boolean not null default false;

comment on column public.event_series.is_test is
  'A test submission''s series (car W, 28 November 2026): its events are born is_test. Set only by the self-listing run for a test address.';
