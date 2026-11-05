-- ENGINE P0, THE PUBLICATION GATE'S HOLD REASONS (the engine directive C:\dev\GROWTH\ENGINE-P0-DIRECTIVE-5NOV.md, Phase 5;
-- LAW 19 section 4; the independent review C:\dev\GROWTH\ENGINE-P0-INDEPENDENT-REVIEW-5NOV.md, defects 1 to 4).
--
-- A found night that the gate holds for a person says why, in the reason list /admin/collected reads
-- (src/lib/listings/judge.ts CandidateReason, REASON_LABELS). Four new reasons:
--   offset_mismatch   its stated UTC offset is not its venue zone's offset on that date (the Melbourne Park and AAMI Park
--                     pages wrote 7:30 pm as '19:30:00+00:00', 5 November 2026)
--   no_time           the source gives a date with no time; no time is ever filled in
--   implausible_time  a concert, show, comedy, club night or match starting 00:00 to 09:59 local, not stated in words
--   multi_day_span    one Event spanning more than a day with no performance of its own named
-- Nothing else changes: the same eight reasons stay allowed, so every row already stored still passes.
alter table public.listing_candidates drop constraint if exists listing_candidates_reasons_known;
alter table public.listing_candidates add constraint listing_candidates_reasons_known check (
  reasons <@ array[
    'source_unverified', 'no_venue_address', 'midnight_start', 'called_off_words',
    'time_changed', 'venue_changed', 'similar_listing', 'judged_before_the_queue',
    'offset_mismatch', 'no_time', 'implausible_time', 'multi_day_span'
  ]::text[]
);
