-- Migration: 20260505000001_fix_seed_cover_urls_pre_taxonomy.sql
-- Purpose: replace picsum.photos cover URLs on already-seeded
--   published-public events so the events_published_real_cover
--   constraint does not fire when the next migration
--   (20260507000001_city_taxonomy.sql) runs an UPDATE on the events
--   table.
--
-- Context (Batch 11.1 D2 CI fix):
--   20260426000001_cultural_breadth_seed.sql inserts events with
--   status='published' AND cover_image_url LIKE 'https://picsum.photos/%'.
--   20260504000001_event_photo_required.sql adds the constraint
--   events_published_real_cover that forbids picsum URLs on
--   published-public events. The constraint is added NOT VALID so
--   it does not check existing rows at migration time, but Postgres
--   DOES re-validate the constraint on any UPDATE to the row.
--   20260507000001_city_taxonomy.sql backfills city_primary on
--   every event row, which triggers the constraint check and fails
--   on the picsum-cover rows. GitHub Lighthouse CI workflow goes
--   permanently red because `supabase start` cannot apply the
--   migration chain from a clean state.
--
-- Fix: this migration sits BETWEEN the constraint add and the
--   city_taxonomy migration. It swaps every picsum URL on a
--   published-public event for a brand-aligned Pexels stock URL
--   keyed to the event's culture tag where possible, falling back
--   to a generic Pexels festival URL otherwise.
--
-- Production note: production data has been manually backfilled
--   with real cover URLs since the original seed. This migration is
--   idempotent and runs as a no-op against production (the
--   `WHERE cover_image_url LIKE 'https://picsum.photos/%'` filter
--   matches zero rows).
--
-- Author: Batch 11.1 D2
-- Date: 2026-05-05 (timestamp positioned between 20260504 and
--   20260507 so the migration chain resolves cleanly on a fresh DB).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Culture-keyed Pexels covers. Each event's tags JSONB is inspected
--    to pick a culture-aligned stock photo. Fallback to a generic
--    festival image when no tag matches.
-- ---------------------------------------------------------------------------
WITH culture_covers(culture_tag, cover_url, thumbnail_url) AS (
  VALUES
    ('african',        'https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('afrobeats',      'https://images.pexels.com/photos/30497160/pexels-photo-30497160.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/30497160/pexels-photo-30497160.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('amapiano',       'https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('gospel',         'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('south-asian',    'https://images.pexels.com/photos/9534913/pexels-photo-9534913.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/9534913/pexels-photo-9534913.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('bollywood',      'https://images.pexels.com/photos/20532119/pexels-photo-20532119.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/20532119/pexels-photo-20532119.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('diwali',         'https://images.pexels.com/photos/9534913/pexels-photo-9534913.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/9534913/pexels-photo-9534913.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('caribbean',      'https://images.pexels.com/photos/6301776/pexels-photo-6301776.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/6301776/pexels-photo-6301776.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('reggae',         'https://images.pexels.com/photos/6301776/pexels-photo-6301776.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/6301776/pexels-photo-6301776.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('pacific',        'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('pasifika',       'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('middle-eastern', 'https://images.pexels.com/photos/8939568/pexels-photo-8939568.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/8939568/pexels-photo-8939568.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('lebanese',       'https://images.pexels.com/photos/8939568/pexels-photo-8939568.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/8939568/pexels-photo-8939568.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('filipino',       'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('latin',          'https://images.pexels.com/photos/3171810/pexels-photo-3171810.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/3171810/pexels-photo-3171810.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('european',       'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('pride',          'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'),
    ('comedy',         'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200', 'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=450&w=600')
),
fallback_cover AS (
  SELECT
    'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200' AS cover_url,
    'https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&h=450&w=600' AS thumbnail_url
)
UPDATE public.events e
SET
  cover_image_url = COALESCE(
    (
      SELECT cc.cover_url
      FROM culture_covers cc
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(e.tags, '[]'::jsonb)) tag
        WHERE lower(tag) = cc.culture_tag
      )
      LIMIT 1
    ),
    (SELECT cover_url FROM fallback_cover)
  ),
  thumbnail_url = COALESCE(
    (
      SELECT cc.thumbnail_url
      FROM culture_covers cc
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(e.tags, '[]'::jsonb)) tag
        WHERE lower(tag) = cc.culture_tag
      )
      LIMIT 1
    ),
    (SELECT thumbnail_url FROM fallback_cover)
  ),
  updated_at = NOW()
WHERE
  e.cover_image_url LIKE 'https://picsum.photos/%';

COMMIT;

-- ---------------------------------------------------------------------------
-- Post-migration verification (run manually):
--
--   SELECT COUNT(*) FROM public.events
--    WHERE cover_image_url LIKE 'https://picsum.photos/%';
--   -- expect: 0
--
--   SELECT COUNT(*) FROM public.events WHERE status='published' AND visibility='public';
--   -- expect: same as before, no rows lost.
-- ---------------------------------------------------------------------------
