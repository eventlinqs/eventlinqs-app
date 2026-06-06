# Imagery ingestion pipeline

`scripts/ingest-imagery.mjs` turns a local stock-image library into responsive
AVIF renditions in Supabase storage and emits a mapping JSON the `seed-events`
skill consumes. Built ahead of the real photo library so it drops straight in.

## Library tree it reads

```
<src>/hero/<name>.jpg
<src>/categories/<category>/<name>.jpg
<src>/cities/<name>.jpg
<src>/scenes/<scene>/<name>.jpg
<src>/venues/<name>.jpg
```

## Usage

```
# Convert + map only, no network (safe to run anywhere):
node scripts/ingest-imagery.mjs --src ./stock-library --dry-run --out ./imagery-map.json

# Real run: convert, upload to the bucket, write the seed map:
node scripts/ingest-imagery.mjs --src ./stock-library --out supabase/seed/imagery-map.json
```

Flags: `--src`, `--bucket` (default `event-images`), `--prefix` (default
`stock`), `--out` (default `supabase/seed/imagery-map.json`), `--quality`
(default 62), `--dry-run`.

## Guarantees

- **Responsive AVIF** per role (hero 1280/1920/2560; categories and scenes
  480/960/1440; cities and venues 400/800/1200). Sources are never upscaled
  (`withoutEnlargement`); targets that collapse to the same actual width on a
  small source are de-duplicated.
- **Storage only.** The Supabase client is wrapped so only `.storage` is
  reachable; `.from()`, `.rpc()`, `.schema()` throw. The script cannot read or
  write a data table. Seeding rows is the seed-events skill's job.
- **Idempotent.** Deterministic object paths plus `upsert: true`, so re-runs
  overwrite in place rather than duplicating.
- **Dry-run** does the full conversion and writes the map with the would-be
  public URLs, with no network and no credentials required.

## Mapping JSON shape (consumed by seed-events)

```json
{
  "bucket": "event-images",
  "prefix": "stock",
  "dryRun": false,
  "counts": { "sources": 3, "renditions": 8 },
  "images": [
    {
      "role": "categories",
      "group": "music",
      "slug": "live-gig",
      "source": "stock-library/categories/music/live-gig.jpg",
      "sizes": [
        { "width": 480,  "path": "stock/categories/music/live-gig-480.avif",  "url": "https://.../live-gig-480.avif" },
        { "width": 1440, "path": "stock/categories/music/live-gig-1440.avif", "url": "https://.../live-gig-1440.avif" }
      ],
      "default": "https://.../live-gig-1440.avif"
    }
  ]
}
```

The seed-events skill picks an image by `role` (+ `group` for categories and
scenes), sets `cover_image_url` to the `default` URL, and may keep the `sizes`
for responsive use.

## Proven (2026-06-06), before the real library lands

- **Conversion + mapping (dry-run):** 3 sample images (2400px hero, 1500px
  category, 900px scene) produced 8 AVIF renditions with correct per-role
  widths, no upscaling, and width de-duplication on the small source.
- **Storage mechanics:** a control upload (allowed `image/webp`) proved
  `upload` then idempotent `upsert`, a public URL serving HTTP 200, and
  `remove` cleanup. Test artefacts were deleted.

## BLOCKER for the founder (storage config)

The `event-images` bucket currently allows only
`["image/jpeg","image/png","image/webp","image/gif"]`, so **AVIF uploads are
rejected** ("mime type image/avif is not supported"). Before ingesting the real
library, add `image/avif` (and ideally raise the 5 MB file-size limit for hero
sources). Steps are in `docs/LAUNCH-RUNBOOK.md` (storage section). The pipeline
fails fast with that exact instruction until it is done.
