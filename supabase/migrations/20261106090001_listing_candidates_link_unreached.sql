-- LAW 19 SECTION 4.2, RULE (5): A BOOKING LINK THAT DOES NOT REACH ITS SELLER (C:\dev\GROWTH\RELEASE-POLICY-5NOV.md; LAW 19 section
-- 7.3; WINDOW 5, 6 November 2026, C:\dev\EVIDENCE\ENGINE-P0\law19-section7-status.md).
--
-- A found night whose ticket link answers 404 or 410 from the seller, read politely (robots.txt first, the collector's agent),
-- is held for a person with the reason link_unreached, never published by a rule (src/lib/listings/judge.ts CandidateReason,
-- REASON_LABELS: 'Its ticket link does not reach the seller'). One reason added; the twelve already allowed stay, so every row
-- already stored still passes.
alter table public.listing_candidates drop constraint if exists listing_candidates_reasons_known;
alter table public.listing_candidates add constraint listing_candidates_reasons_known check (
  reasons <@ array[
    'source_unverified', 'no_venue_address', 'midnight_start', 'called_off_words',
    'time_changed', 'venue_changed', 'similar_listing', 'judged_before_the_queue',
    'offset_mismatch', 'no_time', 'implausible_time', 'multi_day_span',
    'link_unreached'
  ]::text[]
);
