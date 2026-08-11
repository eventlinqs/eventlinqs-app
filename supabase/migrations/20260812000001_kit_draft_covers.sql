-- Anonymous composer cover artwork.
--
-- RENUMBERED 20260809000001 -> 20260812000001 on 2026-08-12, by founder ruling
-- (R-MIGRATION-COLLISION). fix/security-hardening carries its own
-- 20260809000001, payout_status_unset, which releases an organiser from the
-- one-way payout_status door. Supabase keys applied migrations on the VERSION
-- PREFIX alone, so with both files at 20260809000001 whichever landed first
-- would record the version as done and the other would be treated as already
-- applied and NEVER RUN, silently.
--
-- THIS file moved rather than that one because the cost is not symmetric. This
-- creates a storage bucket and nothing depends on its ordering; if it were the
-- one skipped, cover upload falls back to the typographic poster and someone
-- notices. If payout_status_unset were skipped, every restricted organiser
-- would stay restricted for ever with no error anywhere.
--
-- 20260812000001 is clear of every version claimed on all 143 refs, not merely
-- clear of that one file.
--
-- ALREADY APPLIED ON TEST UNDER THE OLD VERSION. TEST records 20260809000001 as
-- applied, from this file. That record now belongs to no file on this branch,
-- and payout_status_unset would inherit it. Correcting it needs
-- `supabase migration repair --status reverted 20260809000001 --linked` before
-- the next push; the runbook is in the delivery notes. Re-running this file is
-- safe: the bucket insert is `on conflict do nothing` and the policy is dropped
-- before it is created.
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
