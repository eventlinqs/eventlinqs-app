# EventLinqs Event Media Standard - SPEC (confirm current state, then build to this)

**Status:** The standard for organiser-uploaded event media: the cover image, the
gallery, and video. Build to it and confirm it works on the TEST preview. Not a
build done blind: CC confirms what already exists first (Law 2, evidence-driven),
then fills the gaps to this standard.

**Sits under:** `MEDIA-ARCHITECTURE.md`, the platform media law (the component
library, the LCP rules, formats, buckets, the single hero standard). This SPEC sets
the COUNTS, LIMITS, and organiser UPLOAD UX that the architecture doc does not pin
down. Where they overlap, MEDIA-ARCHITECTURE governs the rendering and this SPEC
governs the input limits.

**Inherits:** the Definition of Done (SHIP 100%, A to Z), Law 5 (zero dead links,
no broken states), the `competitor-benchmark` skill. The funds-holding payment
engine is untouched. Never write to Production. Writes only to TEST
(vkapkibzokmfaxqogypq).

**Evidence base:** competitor specs from the Eventbrite and Humanitix help centres,
captured 2026-06. Eventbrite allows up to 10 images per event plus video linked
from YouTube or Vimeo, main image recommended 2160x1080, max 10MB, JPEG or PNG.
Humanitix uses one banner image (2:1, recommended min 3200x1600, max 10MB) plus a
gallery, and requires video to be embedded from YouTube or Vimeo, not uploaded as a
file. Both converge on the same shape, and neither hosts organiser video itself.

---

## The standard (build to this exactly)

### Images: 1 cover + up to 9 gallery = 10 maximum

**Cover image (required).**
- Role: the event hero, the event card image, and the LCP raster candidate. It is
  the most important single asset on the page.
- Source: landscape, 2:1 or 16:9, minimum 1920px wide. Maximum 4000x4000 (the
  existing server-side reject in `src/lib/upload.ts` stays). Maximum file size
  10MB.
- Formats accepted: JPEG, PNG, WebP, AVIF, and HEIC/HEIF (iPhone) converted to
  JPEG or WebP on ingest. NOT SVG (see Security).
- The uploader shows the organiser the hero crop AND the card crop on a preview, so
  the cover is authored to look right in both surfaces, not just one.

**Gallery images (optional, up to 9).**
- Total images per event: 10 maximum (1 cover + up to 9 gallery). This matches the
  Eventbrite ceiling.
- Same formats, same 10MB cap, same 4000x4000 maximum.
- Gallery images lazy-load below the fold per MEDIA-ARCHITECTURE, so the ceiling
  never costs LCP. Ten is a generous ceiling, not a target; most events use one to
  four images.

**Alt text.** Every image carries alt text for accessibility, defaulting to the
event name and editable by the organiser.

### Video: 1 per event, embed first, never self-hosted at scale

- One video per event, optional.
- PRIMARY path: embed by a trusted provider URL (YouTube, Vimeo, Instagram,
  TikTok). EventLinqs never hosts the file. The provider handles transcoding,
  adaptive streaming, global delivery, and most moderation, at zero storage and
  egress cost to us. This is what both benchmarked platforms do, and it is the right
  architecture for a national platform on Supabase and Vercel, where self-hosted
  video egress is a real and unpredictable cost.
- The embed renders BELOW the hero, never as the LCP (the cover raster is the LCP
  per MEDIA-ARCHITECTURE sections 5 and 7), with a raster poster, muted,
  playsInline, autoplay gated by the existing headless rule.
- Provider URL ALLOWLIST only. Parse the URL to a canonical embed on the SERVER.
  NEVER accept a raw user iframe or pasted HTML embed. That is an XSS vector. This
  is a deliberate security improvement over platforms that accept raw embed HTML.
- OPTIONAL native upload (only if and when EventLinqs adds an "upload your own clip"
  feature): route through a managed video service (Cloudflare Stream or Mux), not
  raw Supabase storage, so transcode-to-HLS, poster generation, and predictable
  global delivery are handled. Cap roughly 90 seconds, roughly 200MB, MP4, MOV, or
  WebM, with an auto-generated poster. Raw Supabase video is acceptable only at tiny
  scale and becomes an egress and transcode trap nationally. Embed first is the
  standard; managed-service native is the later upgrade if it is ever justified.

### Security and robustness (the national-platform bar)

- Validate every upload by its real file signature (magic bytes), not its
  extension, plus size and dimension. The 4000x4000 reject already exists; keep it.
- Raster only for user content. Reject SVG and any active content (XSS).
- Strip EXIF and metadata on ingest (privacy: removes GPS and device data; also
  shrinks files).
- Compress and downscale client-side before upload (faster uploads, leaner
  storage), then re-encode server-side to AVIF and WebP via next/image (the existing
  pipeline).
- Generate a blur placeholder (blurDataURL) per image, per MEDIA-ARCHITECTURE.
- Signed, scoped upload URLs: an organiser can only write to its own event path.
  Rate-limit uploads.
- Screen for abusive or unlawful imagery before an event can publish (moderation
  hook). A public national platform must not host illegal or abusive media.
- Public bucket for cover and gallery; single `remotePatterns` entry. Clean up
  orphaned objects when an event is deleted or unpublished (no storage leak).

### UX (the organiser uploader)

- Drag-and-drop multi-upload with reorder. The first image is the cover, clearly
  labelled, and draggable to change which image is the cover.
- A cover crop preview showing both the hero band and the card crop.
- Per-file progress, optimistic thumbnails, friendly inline validation (too big,
  wrong format, too small for a cover, over the 10 limit).
- An alt-text field per image.
- A visible counter: 1 cover, up to 9 more images, 1 video.
- The cover is required before an event can publish. No broken or empty states on a
  published event (Definition of Done, Law 5).

## What this is NOT

- No raw self-hosted video at scale. No SVG user uploads. No arbitrary iframe or
  pasted-HTML embed. No "mostly works" gallery that breaks when one image is
  missing. No event that can publish without a cover.

---

## The build prompt (confirm first, then build, then verify)

```
EventLinqs Event Media Standard. Staging preview only. Read every rule first.

SACRED RULES
1. Write only to TEST (vkapkibzokmfaxqogypq). Never write to Production (gndnldyfudbytbboxesk), for any reason.
2. Do not modify the funds-holding payment engine. This is media upload, render, and validation.
3. Single source of truth. Use the existing upload pipeline (src/lib/upload.ts and related) and the MEDIA-ARCHITECTURE component library (HeroMedia, EventCardMedia, the gallery surfaces). Do not fork or duplicate the upload or media-render logic.
4. No fabrication. Each check returns PASS, FAIL, or NOT VERIFIED with concrete observed evidence (the uploaded file rendered on the real preview page, the TEST row, the rejection message, the exact error). A green unit test is not a live PASS.
5. Australian English. No em-dashes and no en-dashes (hyphens, colons, commas, pipes are fine). The word "culture" is banned in every form: use "community".
6. Flag every test row and uploaded test object with is_seed_data true and list them for cleanup. Restore any state you change.

PHASE 0, evidence first (read only, report before building)
0.1 Read and report the CURRENT state of organiser event media with file-level evidence: the upload pipeline (src/lib/upload.ts and callers); the event data model for cover, gallery, and video (which tables and columns hold them); how the cover, gallery, and video render today and which MEDIA-ARCHITECTURE components are used; whether a per-event image COUNT limit exists and what it is; whether video today is an embed or a self-hosted upload, and if embed, whether it accepts a raw iframe/HTML or an allowlisted provider URL; the storage buckets and remotePatterns; the validation in place (magic-byte check? dimension reject? is SVG rejected? is EXIF stripped?).
0.2 State plainly, per item in the standard, what already exists versus what must be built. Do not build until this map is reported.

PHASE 1, build to the standard (on the TEST preview, to the Definition of Done)
1.1 Cover image required, with the hero-crop and card-crop preview, formats JPEG/PNG/WebP/AVIF plus HEIC converted on ingest, max 10MB, max 4000x4000.
1.2 Gallery up to 9 images (10 total per event) with drag reorder; first image is the cover and is changeable; lazy-loaded below the fold; alt text per image.
1.3 Enforce the 10-image limit server-side and in the UI (the 11th is refused with a friendly message).
1.4 Video: one per event, embed by allowlisted provider URL (YouTube, Vimeo, Instagram, TikTok), parsed to a safe embed on the SERVER, never a raw iframe/HTML. Render below the hero with a raster poster, muted, playsInline, autoplay gated, never the LCP.
1.5 Security: magic-byte validation, reject SVG and active content, strip EXIF, client-side downscale before upload, server re-encode to AVIF/WebP, blur placeholder per image, signed scoped upload URLs, upload rate limit, a moderation hook before publish, orphan cleanup on event delete or unpublish.
1.6 Report every code change as a diff. Reuse the existing pipeline and components; do not fork.

PHASE 2, verify on the preview (real evidence per check, PASS/FAIL)
2.1 On a real TEST event, upload a cover and several gallery images and confirm they render in the hero, the event card, and the gallery on the live preview.
2.2 Confirm the 10-image limit holds: the 11th is refused with a clear message.
2.3 Add an allowlisted video URL and confirm it renders below the hero and is NOT the LCP; confirm a non-allowlisted URL and a raw iframe are both refused.
2.4 Confirm SVG, an oversized file, a wrong-format file, and an under-size cover are each rejected with a friendly message; confirm EXIF is stripped from an uploaded image.
2.5 Confirm a cover is required before the event can publish, and that no media surface renders a broken or empty state.
2.6 Run the Lighthouse check on the event detail page and confirm it stays green: the cover raster is the LCP, the gallery is lazy, CLS unaffected.

REPORTING
A. The diffs for every code change.
B. One table: standard item, verdict, evidence.
C. The plain bottom line: is the event media standard 100 percent built and working on the preview, yes or no. If no, the exact NOT DONE items.
D. Every is_seed_data row and object created, for cleanup, and confirmation TEST is back to baseline.
E. Confirm the funds-holding payment engine was not modified and nothing touched Production.

Begin with Phase 0. Do not build until the evidence map is reported.
```
