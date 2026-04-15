# EventLinqs — Media Upload Spec

**Requirement solved:** set recommended image and video upload limits, benchmarked against competitors, with client-side compression and CDN delivery.
**Research source:** competitor audit completed in prior session (Eventbrite 10MB / Ticketmaster ~5MB / DICE ~8MB / Humanitix 5MB).

---

## 1. Benchmark Summary

| Platform | Image max | Recommended dimensions | Aspect | Formats | Video |
|---|---|---|---|---|---|
| Eventbrite | 10 MB | 2160 × 1080 | 2:1 | JPG/PNG/GIF | Host externally (YouTube/Vimeo embed) |
| Ticketmaster | ~5 MB | 1920 × 1080 | 16:9 | JPG/PNG | Editorial only — partner uploads |
| DICE | ~8 MB | 1080 × 1350 | 4:5 | JPG/PNG | None on organiser side |
| Humanitix | 5 MB | 1920 × 1080 | 16:9 | JPG/PNG/GIF | None |
| **EventLinqs (current)** | **5 MB** | Not enforced | Not enforced | JPG/PNG/WEBP | None |

---

## 2. EventLinqs Decision

### Images (event covers, organiser avatars, venue photos)

| Setting | Value | Rationale |
|---|---|---|
| **Max file size** | 10 MB | Match Eventbrite ceiling — highest in the market |
| **Recommended dimensions** | 2160 × 1080 px | Looks sharp on 4K, matches 2:1 card aspect |
| **Minimum dimensions** | 1200 × 600 px (enforced) | Prevents pixelation on hero use |
| **Aspect ratio** | 2:1 enforced via crop UI | Consistent card grid |
| **Accepted formats** | JPG, PNG, WEBP, AVIF | WEBP/AVIF are ~30-50% smaller than JPG at same quality |
| **Client-side compression** | Yes, before upload | Saves Supabase Storage egress, cuts upload time |
| **Delivery** | Supabase Storage + Next.js `<Image>` with resize params | On-the-fly sizing for cards vs heroes |

### Video (future — for Session 4.5 / M10 scope)

| Setting | Value | Rationale |
|---|---|---|
| **Max file size** | 50 MB (organisers), 100 MB (verified organisers) | Eventbrite doesn't allow direct video; DICE doesn't either — this is a differentiator but we throttle |
| **Max duration** | 30 seconds | Short-form, hype clips only |
| **Recommended dimensions** | 1080 × 1920 (9:16 vertical) OR 1920 × 1080 (16:9) | Match social-first consumption |
| **Accepted formats** | MP4 (H.264), MOV, WebM | Standard web-compatible |
| **Delivery** | Mux or Cloudflare Stream (NOT Supabase Storage) | Storage is not a video CDN; adaptive bitrate needed |
| **Fallback** | Static poster image always required | For slow connections and SEO |

**Decision for the 7-day window:** ship images now, defer video to after Session 4. Do not open video uploads until the First-Party Media Pipeline is built.

---

## 3. Client-Side Compression Strategy

Use `browser-image-compression` (MIT, 200k/month downloads, zero deps beyond browser APIs).

```ts
// lib/upload/compressImage.ts
import imageCompression from 'browser-image-compression';

export async function compressForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file; // don't compress GIFs (kills animation)

  const compressed = await imageCompression(file, {
    maxSizeMB: 2,                    // target ~2MB after compression
    maxWidthOrHeight: 2160,          // enforces max dim client-side
    useWebWorker: true,
    fileType: 'image/webp',          // convert everything to WEBP
    initialQuality: 0.85,
  });

  return compressed;
}
```

Pipeline: user picks file → client validates dims/size → compress → upload to Supabase Storage → URL saved to event record.

---

## 4. Validation Rules

Enforce in this order. Fail fast with a clear error message.

1. **MIME type whitelist:** `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif`. Reject anything else.
2. **Max raw file size 10 MB** (before compression — stops users uploading 50MB phone photos).
3. **Min dimensions 1200 × 600** (reject immediately with message "Image too small — minimum 1200×600 required").
4. **Aspect ratio check** — if outside 1.8:1 to 2.2:1, show crop UI. Don't auto-crop silently.
5. **Compress** to WEBP, ≤ 2MB.
6. **Upload to Supabase Storage** under `event-covers/{event_id}/{uuid}.webp`.
7. **Store URL in `events.cover_image_url`.**

---

## 5. Server-Side Safety Net

Client validation is for UX. Server validation is for security.

On the upload endpoint:
- Verify the uploaded blob's MIME matches the file extension.
- Run a quick header check (WEBP signature: `RIFF....WEBP`) — reject spoofed types.
- Cap at 12 MB at the edge (10 MB user-facing + buffer for metadata).
- Rate-limit uploads: 20 per organiser per hour.

---

## 6. Delivery Optimisation

Use `next/image` with a custom loader that hits Supabase's transform endpoint:

```ts
// next.config.js
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'cqwdlimwlnyaaowwcyzp.supabase.co',
      pathname: '/storage/v1/render/image/public/**',
    },
  ],
}
```

Card contexts use `width={640}`, hero contexts use `width={1920}`. Supabase resizes on the fly and caches at the edge.

---

## 7. Claude Code Command — Implement Media Pipeline

```
Read docs/design/MEDIA-UPLOAD-SPEC.md.

Implement the image upload pipeline:

1. npm install browser-image-compression
2. Create lib/upload/compressImage.ts per Section 3 of the spec.
3. Create lib/upload/validateImage.ts implementing all validation rules from Section 4 — returns { ok: true, file } or { ok: false, error: string }.
4. Update the event cover image upload component (find it — likely in app/events/new/ or components/events/). Wire up: validate → compress → upload to Supabase Storage bucket 'event-covers' → save URL. Show a progress state during compression and upload. Show clear error toasts for each failure case.
5. Update next.config.js per Section 6 to add Supabase as a remote image pattern.
6. Replace every <img> tag in event pages with <Image> from next/image, passing width based on context (640 for cards, 1920 for heroes).
7. Update the max file size in Supabase Storage bucket policy to 12MB (server-side ceiling).
8. Add a rate limit of 20 uploads/organiser/hour on the upload route — use Upstash Redis with a counter keyed by organiser_id.
9. Commit: "feat(media): 10MB + WEBP pipeline with client-side compression".

Do NOT implement video upload in this pass — deferred to post-Session 4.
```

---

## 8. Verification

- [ ] Upload a 9MB JPEG → compressed to <2MB WEBP → displays sharp on hero.
- [ ] Upload a 1000×500 image → rejected with clear "too small" message.
- [ ] Upload a 15MB file → rejected with "file too large" message.
- [ ] Upload a PDF renamed to .jpg → rejected at server.
- [ ] Upload 21 images in an hour as one organiser → 21st fails with rate limit message.
- [ ] Event card and event hero both load correctly sized images (check Network tab).
