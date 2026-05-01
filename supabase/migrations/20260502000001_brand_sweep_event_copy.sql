-- M6.5 Brand Sweep follow-up: scrub remaining "diaspora" copy from events.
--
-- Production audit (Sydney, 2026-05-02) found exactly one row in the events
-- table with "diaspora" in any text column: the Brisbane Gospel Choir
-- Showcase. The "Diaspora Business Summit 2026" fixture from the older
-- 20260414000001 seed was never applied to this database, so no row deletion
-- is required - just a description update.
--
-- This migration is idempotent: the WHERE clauses key on slug, and the
-- replacement strings contain no further "diaspora" tokens, so re-running the
-- migration is a no-op once applied.

UPDATE events
SET description = 'Six gospel choirs from Brisbane''s cultural communities perform in one ticketed evening. Hosted, recorded, and broadcast to the community.'
WHERE slug = 'brisbane-gospel-choir-showcase'
  AND description ILIKE '%diaspora%';

-- Defensive cleanup for any other event row that may have drifted in via a
-- partial seed re-run. The gospel showcase is the only known hit, but a
-- targeted UPDATE keeps the migration honest if history surprises us.
UPDATE events
SET description = REPLACE(REPLACE(description, 'diaspora', 'cultural'), 'Diaspora', 'Cultural')
WHERE description ILIKE '%diaspora%';

UPDATE events
SET summary = REPLACE(REPLACE(summary, 'diaspora', 'cultural'), 'Diaspora', 'Cultural')
WHERE summary ILIKE '%diaspora%';

UPDATE events
SET title = REPLACE(REPLACE(title, 'Diaspora', 'Cultural'), 'diaspora', 'cultural')
WHERE title ILIKE '%diaspora%';

-- Tags are a JSONB array. Strip the "diaspora" tag if present without
-- disturbing other tag values.
UPDATE events
SET tags = (SELECT jsonb_agg(t) FROM jsonb_array_elements_text(tags) AS t WHERE t <> 'diaspora')
WHERE tags @> '["diaspora"]'::jsonb;
