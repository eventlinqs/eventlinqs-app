-- =============================================================================
-- 20260628000002_event_media_standard.sql
--
-- Event Media Standard (docs/EventLinqs-Event-Media-Standard-SPEC.md): the data
-- model for organiser-uploaded event media beyond the single cover.
--
--   - cover_image_url        (existing) stays the canonical cover: the hero, the
--                            card image, and the LCP raster. NOT forked. Every
--                            reader and the events_published_real_cover constraint
--                            keep using it unchanged.
--   - cover_image_alt        accessibility alt text for the cover (defaults to the
--                            event title at render when null).
--   - cover_image_blur       blurDataURL placeholder for the cover (next/image).
--   - gallery_urls (existing jsonb) is ENRICHED in the app layer from string[] to
--                            an array of { url, alt, blur } objects (up to 9). The
--                            length cap is enforced here AND in the server action.
--   - video_url              ONE optional video per event: the canonical, server
--                            -parsed embed URL on a provider host. A raw user
--                            iframe / pasted HTML is never stored (parsed + rejected
--                            in src/lib/media/video-embed.ts before write).
--   - video_provider         youtube | vimeo | instagram | tiktok.
--
-- Additive and idempotent. SAFE on Production (all columns nullable, no backfill,
-- no behaviour change for existing rows) but applied to TEST only for this build.
-- The funds-holding payment engine is untouched.
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cover_image_alt  text,
  ADD COLUMN IF NOT EXISTS cover_image_blur text,
  ADD COLUMN IF NOT EXISTS video_url        text,
  ADD COLUMN IF NOT EXISTS video_provider   text;

COMMENT ON COLUMN public.events.cover_image_alt IS
  'Organiser-editable alt text for the cover image. Defaults to the event title at render when null.';
COMMENT ON COLUMN public.events.cover_image_blur IS
  'blurDataURL placeholder for the cover image (next/image placeholder="blur").';
COMMENT ON COLUMN public.events.video_url IS
  'Canonical, server-parsed video embed URL on a provider host (YouTube/Vimeo/Instagram/TikTok). Never a raw iframe. One per event.';
COMMENT ON COLUMN public.events.video_provider IS
  'Allowlisted video provider for video_url: youtube | vimeo | instagram | tiktok.';

-- Provider allowlist guard (defence in depth behind the app-layer parser).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_video_provider_allowlist'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_video_provider_allowlist
      CHECK (
        video_provider IS NULL
        OR video_provider IN ('youtube', 'vimeo', 'instagram', 'tiktok')
      );
  END IF;
END $$;

-- Gallery ceiling guard: at most 9 gallery images (10 total incl. the cover).
-- NOT VALID so the schema change lands regardless of any pre-existing seed rows;
-- new and updated rows are checked from now on. jsonb-array-shape tolerant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_gallery_max_9'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_gallery_max_9
      CHECK (
        gallery_urls IS NULL
        OR jsonb_typeof(gallery_urls) <> 'array'
        OR jsonb_array_length(gallery_urls) <= 9
      ) NOT VALID;
  END IF;
END $$;
