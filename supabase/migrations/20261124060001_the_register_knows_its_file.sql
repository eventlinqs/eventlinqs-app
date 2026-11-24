-- THE REGISTER KNOWS ITS FILE (WINDOW 5C, 24 November 2026; the master directive's A3 (3); Lawal's 12:34 of 23 November
-- 2026, the media library's fields: "File type and dimensions: determines technical suitability" and "Integrity
-- reference: helps detect duplicates and preserve provenance"; the PM's 12:18 item 4 and 13:55).
--
-- Three columns on the asset register, written by its one writer (src/lib/social/store.ts addAsset):
--   content_sha256  the file as the rights holder supplied it, by its SHA-256, so the same file is never registered twice
--                   (the unique index below; the photo page and the email intake both compute it from the bytes given);
--   byte_size       that file's size in bytes;
--   file_format     its format read from its own first bytes (src/lib/launch/sniff-image.ts), never a declared type.
-- Its pixel size already has its columns (source_width, source_height, 20261028205501). Rows registered before this
-- carry none of the three and are not filled here: their files were stored re-encoded and their bytes as supplied are
-- not kept, so a hash computed now would not be the supplied file's.
--
-- Additive only: no row is changed, nothing is dropped, and no new table is made, so no grant is written.

alter table public.social_assets
  add column if not exists content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists byte_size integer check (byte_size is null or byte_size > 0),
  add column if not exists file_format text check (file_format is null or file_format in ('jpeg', 'png', 'webp', 'avif', 'heic'));

create unique index if not exists social_assets_one_file on public.social_assets (content_sha256) where content_sha256 is not null;

comment on column public.social_assets.content_sha256 is 'The SHA-256 of the file as the rights holder supplied it: the same file is never registered twice (social_assets_one_file).';
comment on column public.social_assets.byte_size is 'The size in bytes of the file as the rights holder supplied it.';
comment on column public.social_assets.file_format is 'The format of the file as supplied, read from its own first bytes: jpeg, png, webp, avif or heic.';
