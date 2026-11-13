-- CAPTURE PUBLISHES BY ITSELF (Lawal's 10:42, 10:49 and 11:05 of 13 November 2026; the project manager's 11:06 item 1:
-- 'A night that fails any check waits in the Command Centre with its reason'; src/lib/listings/capture-rule.ts).
--
-- Additive only. Four hold reasons the capture rule gives a night it will not publish by itself: venue_not_known (its
-- venue words name no venue EventLinqs holds in that city), title_too_long (longer than a listing's 80 characters),
-- banned_words (its title carries a word the platform bans), no_category (neither its words nor its source give one).
-- The fourteen reasons already allowed stay, so every stored row still passes. Until it is applied, the collection run
-- drops these four from a row the database refuses (src/lib/listings/collect-store.ts land) and the night still waits for
-- a person. No table is created, so no grant is needed (the 21 October 2026 grant rule covers new tables).
alter table public.listing_candidates drop constraint if exists listing_candidates_reasons_known;
alter table public.listing_candidates add constraint listing_candidates_reasons_known check (
  reasons <@ array[
    'source_unverified', 'no_venue_address', 'midnight_start', 'called_off_words',
    'time_changed', 'venue_changed', 'similar_listing', 'judged_before_the_queue',
    'offset_mismatch', 'no_time', 'implausible_time', 'multi_day_span',
    'link_unreached', 'canary_hold',
    'venue_not_known', 'title_too_long', 'banned_words', 'no_category'
  ]::text[]
);
