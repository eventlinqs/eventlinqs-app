-- LAW 19 SECTION 7.4, THE RECORDS CANARY (C:\dev\GROWTH\RELEASE-POLICY-5NOV.md section 2.2.4: 'a production canary: one source,
-- or at most 10% of that source's records, live through one full refresh cycle and at least 6 hours before it widens';
-- WINDOW 5, 6 November 2026, the design in C:\dev\EVIDENCE\ENGINE-P0\law19-section7-status.md, '7.4, the design to build').
--
-- Additive only. Two columns on listing_sources name a source's open canary: when it opened (canary_opened_at) and the
-- production commit whose reader opened it (canary_release, a git sha). Both null is no canary; both set is an open one.
-- And one hold reason, canary_hold: a record a rule would publish that falls outside the canary's tenth waits for a person
-- until the canary widens. The thirteen reasons already allowed stay, so every stored row still passes. No table is
-- created, so no grant is needed (the 21 October 2026 grant rule covers new tables).
alter table public.listing_sources
  add column if not exists canary_opened_at timestamptz,
  add column if not exists canary_release text;

alter table public.listing_sources drop constraint if exists listing_sources_canary_named;
alter table public.listing_sources add constraint listing_sources_canary_named check (
  (canary_opened_at is null and canary_release is null)
  or (canary_opened_at is not null and canary_release ~ '^[0-9a-f]{7,40}$')
);

comment on column public.listing_sources.canary_opened_at is
  'LAW 19 7.4: when this source''s records canary opened (a reader it uses changed in canary_release); null when none is open.';
comment on column public.listing_sources.canary_release is
  'LAW 19 7.4: the production commit whose reader change opened this source''s canary.';

alter table public.listing_candidates drop constraint if exists listing_candidates_reasons_known;
alter table public.listing_candidates add constraint listing_candidates_reasons_known check (
  reasons <@ array[
    'source_unverified', 'no_venue_address', 'midnight_start', 'called_off_words',
    'time_changed', 'venue_changed', 'similar_listing', 'judged_before_the_queue',
    'offset_mismatch', 'no_time', 'implausible_time', 'multi_day_span',
    'link_unreached', 'canary_hold'
  ]::text[]
);
