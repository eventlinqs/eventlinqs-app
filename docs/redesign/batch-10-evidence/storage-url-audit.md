# Batch 10 Phase A - Storage URL audit

Date: 2026-05-09
Branch: `redesign/world-class-rebuild-2026-05-03`

## Audit method

`grep -rE 'getPublicUrl|/storage/v1/object|supabase\.co/storage' --include="*.ts" --include="*.tsx" src/`

## Findings

| Site | File:line | Pattern | Disposition |
|---|---|---|---|
| Image upload | `src/lib/upload.ts:33` | `admin.storage.from('event-images').getPublicUrl(fileName)` | **REFACTORED** to wrap the result in `rewriteStorageUrl()` so the branded domain replaces the Supabase host whenever `NEXT_PUBLIC_STORAGE_DOMAIN` is set. |

That is the only direct URL-construction site in `src/`. Picsum URLs in `src/lib/events/fetchers.ts:88` and `src/lib/images/event-media.ts:6` are documentation comments, not URL construction.

## Pre-existing URL sources

| Source | Notes |
|---|---|
| Database `events.cover_image_url` and `events.thumbnail_url` | Stored as full URLs from prior seed migrations. Picsum URLs in 14 draft events are addressed by the Batch 10 imagery backfill programme (`docs/IMAGERY-MANIFEST.md` + `scripts/backfill-event-covers.mjs`). After backfill, every URL becomes a branded `images.eventlinqs.com` URL when the env var is set. |
| Pexels API responses | `src/lib/images/{culture-photo,city-photo,sub-culture-photo,suburb-photo,category-photo,event-media}.ts` return Pexels-hosted URLs. These are NOT Supabase storage URLs; they remain on the Pexels CDN per the existing media architecture. |
| Static images at `/public/images/...` | Served by Next from the project bundle. Not affected by storage URL config. |

## Verdict

Zero remaining direct Supabase URL concatenations after the upload.ts refactor. Storage URLs are now governed by a single utility (`src/lib/storage/url.ts`), tested by 11 vitest cases, and wired through every code path that ships a user-facing storage URL.
