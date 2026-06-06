-- Remove the Spotify integration footprint from the artists foundation.
-- Spotify integration is not viable for a new public app, so the speculative
-- spotify_url column and the "future Spotify sync" note are dropped. The
-- artists table and the wider artist / genre discovery foundation stay intact.
--
-- Idempotent: safe to re-run. Drops only the Spotify-specific column.

begin;

alter table public.artists drop column if exists spotify_url;

comment on table public.artists is
  'Artist entities for artist-level discovery (native, platform-owned).';

commit;
