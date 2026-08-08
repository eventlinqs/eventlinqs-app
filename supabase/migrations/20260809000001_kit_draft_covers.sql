-- Anonymous composer cover artwork.
--
-- The public composer has no account by design, so an organiser can build a
-- launch kit as a stranger. Uploading their own photograph is the one thing
-- that makes the poster theirs rather than ours, so the bytes have to land
-- somewhere, and this is that bucket.
--
-- PUBLIC READ, and NO ANONYMOUS INSERT POLICY AT ALL.
--
-- Read is public because the poster renderer, the social cards and the kit
-- preview all fetch the object by URL, and the paths are unguessable (the kit
-- code is 31^12).
--
-- There is deliberately no insert policy. The ONLY writer is
-- POST /api/launch/[code]/cover using the service role, and it writes only
-- after the bytes have passed a fail-closed rate limit, an ownership check
-- against the httpOnly draft cookie, a byte cap, magic-byte sniffing, a
-- decompression-bomb guard and a full sharp re-encode. Granting anon INSERT and
-- then trying to constrain it in policy would be strictly weaker and harder to
-- audit; this way there is no anon-writable bucket anywhere in the project.
--
-- allowed_mime_types is image/webp ALONE, narrower than the accepted UPLOAD
-- formats on purpose. The route re-encodes everything it accepts (JPEG, PNG,
-- WebP, AVIF, HEIC) to WebP, so WebP is the only thing that is ever written.
-- Listing the input formats here would let a future careless change write an
-- un-re-encoded original and still succeed; this way that fails loudly at the
-- storage layer instead of silently shipping EXIF to a public URL.
--
-- file_size_limit is the 10MB market cap (Eventbrite help 682424, Humanitix
-- help 8892493, both fetched 9 August 2026) as a backstop. In practice a
-- re-encoded object is 200-400KB.
--
-- LIFECYCLE: objects here are swept by /api/cron/sweep-kit-covers at 31 days,
-- one day longer than the 30-day draft TTL in Redis, so a live draft is never
-- stripped of its artwork by a clock race.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kit-draft-covers',
  'kit-draft-covers',
  true,
  10485760,
  array['image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Anyone can view kit draft covers" on storage.objects;

create policy "Anyone can view kit draft covers"
  on storage.objects for select
  using (bucket_id = 'kit-draft-covers');
