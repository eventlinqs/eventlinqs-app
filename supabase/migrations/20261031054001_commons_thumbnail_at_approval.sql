-- AN APPROVED COMMONS PHOTO IS STORED AS ITS 1920 PX THUMBNAIL OF THE SAME FILE (the project manager's ruling of
-- 31 October 2026, 05:05 (2), taken by window 6 at 05:00). Approved Commons originals reached 24 MB; through
-- /_next/image they gave 502s and a 12 MB JPEG, while the 1920 px thumbnail of the same file gave 15 to 70 KB AVIF.
-- Window 4 moved the 19 approved rows on production by a logged data fix (04:26); this makes every approval from now
-- on do the same, in the one function every approval path calls (the founder's screen and the logged scripts).
--
-- 1920 px is a standard Wikimedia thumbnail width; hotlinks at any other width are refused
-- (https://www.mediawiki.org/wiki/Common_thumbnail_sizes, revision of 20 October 2026, as window 3 cited at 04:21).
-- The upload host is kept because our image allow-list carries it. Credit, licence, file page and everything else on
-- the row are untouched; an original 1920 px wide or narrower, a non-Commons photo, or any other address is unchanged.
--
-- Replaces public.venue_image_approve exactly as 20261030171501 wrote it, plus the thumbnail step; its grants stand
-- (create or replace keeps them). Proved on TEST by scripts/verify/commons-thumbnail-at-approval-proof.sql through
-- scripts/verify/replay-under-new-default.mjs (red without this file, green with it), rolled back.

create or replace function public.venue_image_approve(p_admin uuid, p_image uuid, p_quality smallint, p_primary boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_img public.venue_images;
  v_url text;
begin
  select * into v_img from public.venue_images where id = p_image;
  if v_img.id is null then
    raise exception 'refused: no such photograph' using errcode = '23514';
  end if;
  if v_img.approval_state = 'withdrawn' then
    raise exception 'refused: that photograph was withdrawn' using errcode = '23514';
  end if;
  if v_img.venue_id is null then
    raise exception 'refused: match the photograph to one of our venues first' using errcode = '23514';
  end if;
  if p_primary then
    update public.venue_images set is_primary = false where venue_id = v_img.venue_id and is_primary and id <> p_image;
  end if;
  -- An approved Commons photo is stored as the 1920 px thumbnail of the SAME file when the original is wider (a
  -- standard Wikimedia width; hotlinks at other widths are refused). Only a plain upload address of a JPEG, PNG or
  -- WebP file is rewritten; anything else keeps its address.
  v_url := v_img.image_url;
  if v_img.source = 'wikimedia_commons' and coalesce(v_img.width, 0) > 1920
     and v_url ~* '^https://upload\.wikimedia\.org/wikipedia/commons/[0-9a-f]/[0-9a-f]{2}/[^/]+\.(jpe?g|png|webp)$' then
    v_url := regexp_replace(v_url, '^https://upload\.wikimedia\.org/wikipedia/commons/([0-9a-f])/([0-9a-f]{2})/([^/]+)$',
                            'https://upload.wikimedia.org/wikipedia/commons/thumb/\1/\2/\3/1920px-\3');
  end if;
  update public.venue_images
     set image_url = v_url,
         verified_depicts_venue = true, verified_by = p_admin, verified_at = now(),
         approval_state = 'approved', approved_by = p_admin, approved_at = now(),
         quality_score = p_quality, is_primary = coalesce(p_primary, false),
         challenge_reason = null, challenged_by = null, challenged_at = null
   where id = p_image;
  update public.venue_images set approval_state = 'withdrawn', withdrawn_at = now()
   where replaced_by = p_image and approval_state <> 'withdrawn';
end;
$$;
