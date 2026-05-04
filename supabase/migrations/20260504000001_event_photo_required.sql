-- Migration: 20260504000001_event_photo_required.sql
-- Purpose: enforce the photo-required organiser rule at the database layer.
--
-- Rule (per Batch 4 visual quality gate, 2026-05-04):
--   Every event MUST carry a real organiser-uploaded cover_image_url before
--   it can be published to public surfaces. Picsum.photos placeholder seeds
--   are not real imagery and are explicitly disallowed for published-public
--   events.
--
-- Rationale: a previous projection layer collided picsum URLs onto a single
-- Pexels category photo, so multiple events on /events/browse/[city] showed
-- the same stock image. Hardening the DB removes the failure mode at source.
--
-- Application layer (companion changes in this batch):
--   - src/lib/events/fetchers.ts                hasRealCover() filter on every public-surface query
--   - src/lib/events/event-card-projection.ts   projection is now a pure pass-through, no Pexels fallback
--   - src/lib/events/publish-gate.ts            (this batch) blocks status='published' updates without a real cover
--
-- Migration is idempotent (constraint guarded by NOT EXISTS lookup).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_published_real_cover'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_published_real_cover
      CHECK (
        status <> 'published'
        OR visibility <> 'public'
        OR (
          cover_image_url IS NOT NULL
          AND cover_image_url <> ''
          AND cover_image_url NOT ILIKE 'https://picsum.photos/%'
        )
      ) NOT VALID;
  END IF;
END $$;

-- VALIDATE separately so existing rows that fail are surfaced explicitly
-- without rolling back the schema change. After backfill (run via
-- scripts/batch-4-seed-real-covers.mjs against the dev DB) the constraint
-- can be validated:
--   ALTER TABLE public.events VALIDATE CONSTRAINT events_published_real_cover;
-- The seed migrations 20260414 and 20260426 inserted picsum URLs for dev
-- fixtures only; production has never had picsum data.

COMMENT ON CONSTRAINT events_published_real_cover ON public.events IS
  'Photo-required gate: published-public events must carry a real organiser cover (no picsum.photos placeholders). Added 2026-05-04.';
