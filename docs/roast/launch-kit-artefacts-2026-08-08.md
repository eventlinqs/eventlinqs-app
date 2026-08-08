# Progress: feat/launch-kit-artefacts

Branch cut from `origin/main` at `bbe6fd7`. Nothing merged, nothing pushed.
The parallel session on `feat/launch-kit-moat` holds the reach layer; this
branch has not touched it.

Scope, from the founder's brief: A2 (story and square cards plus captions), B1
(the organiser logo, both jobs), B2 (the four zeros), A4 (the positioning), E2
(images and video). Law 6 governs everything here: the platform NEVER generates
imagery. The organiser supplies the artwork and we render it into every format.
If they supply nothing, the artefact becomes a typographic composition from
their own event details.

---

## A2: the social cards and the captions. DELIVERED.

### What now exists

| File | What it is |
|---|---|
| `src/lib/broadcast/social-card-spec.ts` | The published platform specifications, quoted with their source, and the geometry each one justifies |
| `src/lib/broadcast/social-card-layout.ts` | The pure geometry and text fitting, unit tested without rendering a pixel |
| `src/lib/broadcast/social-cards.tsx` | The three compositions and the sharp preparation of the organiser's photograph |
| `src/lib/broadcast/card-fonts.ts` | The brand type stack, read once per lambda |
| `src/assets/fonts/*.ttf` | Archivo 700 and 800, Hanken Grotesk 500 and 600, vendored under the OFL |
| `src/lib/broadcast/captions.ts` | One caption per channel, deterministic, in that channel's register |
| `src/lib/broadcast/kit-artefacts.ts` | The single source both the card route and the kit screen read the event from |
| `src/app/api/organiser/events/[id]/card/[format]/route.ts` | The organiser-gated download |
| `src/components/launch-kit/post-pack.tsx` | The kit panel: per channel, the image and the words |
| `tests/unit/social-cards.test.ts`, `tests/unit/captions.test.ts` | 37 assertions |
| `tests/proofs/*`, `vitest.proof.config.ts` | The render harness that produced the before-and-after set |
| `docs/design/launch-kit-artefacts/` | Six event types, before and after, plus every caption |

### The specifications, and where each number came from

Every dimension was read off the platform's own current published page on
8 August 2026. Nothing here is from memory or from a social-media size blog.

- **Instagram Help Centre, "Image resolution of photos you share on Instagram"**
  (help.instagram.com/1631821640426723): uploads are kept untouched at a width
  between 320 and 1080 with an aspect ratio between 1.91:1 and 3:4; anything
  outside is cropped; anything wider than 1080 is sized down.
  **This corrected a live misconception:** the tall bound is 3:4 (1080 x 1440),
  not the 4:5 that circulates everywhere in secondary guides.
- **Meta Business Help Centre, "Best practices for aspect ratios"**
  (facebook.com/business/help/103816146375741): 1:1 recommended for the
  Instagram feed, 4:5 recommended for the Facebook feed, 9:16 recommended for
  stories, status and reels.
- **Meta Business Help Centre, "Recommended minimum image pixel requirements
  across placements"** (facebook.com/business/help/469767027114079): Instagram
  Feed and Instagram Stories 1080 x 1080; Facebook Feed 1080 x 1080 at 1:1 and
  **1440 x 1800 at 4:5**.
- **Meta Business Help Centre, "About carousel ads in Facebook Stories"**
  (facebook.com/business/help/201503794673956): 9:16 recommended, at least
  1080 x 1080, and "consider leaving roughly 14% (250 pixels) of the top and
  bottom of the image free from text and logos".
- **LinkedIn, single image ads specifications**
  (business.linkedin.com/advertise/ads/sponsored-content/single-image-ads-specs):
  jpg, png or gif, 5 MB, 1:1 recommended at 1200 x 1200 with a 360 to 4320
  range.
- **X Help Centre, "How to post on X"**: up to 280 characters, up to 4 media
  items. **X API media best practices** (docs.x.com): JPG, PNG, GIF, WEBP, image
  5 MB or under.

**One deviation from the internal plan, on the evidence.** `LAUNCH-KIT-PLAN.md`
section 8 step 1 specifies the 4:5 asset at 1080 x 1350. Meta's published
recommended minimum for a 4:5 Facebook Feed image is 1440 x 1800, so the tall
card renders at 1440 x 1800. The brief said to build against the current
published specification and cite it; where the plan and the specification
disagreed, the specification won.

**One thing deliberately NOT asserted.** Instagram's current hashtag help page
(help.instagram.com/351460621611097) documents how to add hashtags and states no
numeric cap. The widely repeated "30 hashtags" figure could not be confirmed on
any Instagram-published page. So hashtag count is treated as a craft budget
(three) rather than a platform limit, and nothing in the code or the copy claims
a limit exists.

### The three defects the first renders exposed, and the fixes

I rendered before judging, and the first pass was not good enough.

1. **The crop threw the subject away.** sharp's attention strategy, cropping a
   1920 x 1080 comedy photograph into 9:16, scored the colourful paintings on
   the wall and kept them. The comedian was gone. Full render:
   the first version of `01-comedy-night-story.jpg`.
   **Fix: the panel rule.** A landscape or square photograph is now placed
   WHOLE, full width at the top of the frame, with the type below it on navy.
   Only a photograph already close to 9:16 is cropped to bleed. Threshold and
   cap are named constants with the reasoning attached, and three unit tests
   assert the classification.
2. **The QR tile was pushed off the right edge of the 4:5 card.** A long title
   and an unbreakable ticket line gave the text column a min-content width the
   renderer would not shrink below. **Fix:** the QR is positioned rather than
   flowed, and every text column now has an explicit width computed from the
   card width minus the QR reserve.
3. **The typographic fallback left the top 60 per cent of the story empty.**
   **Fix:** the composition now fills the frame, with the display type stepped
   up and the spare height split evenly by two auto margins rather than pooled
   in one gap.

A fourth was found in the captions rather than the cards: the hashtag builder
derived a tag from the category slug and produced `#artsculture` for a comedy
night. Junk nobody follows, and a form of the word the constitution bans
outright. There is now no path at all from a raw slug to a tag.

### A finding the founder should see

The live `event_categories` table still carries the slug `arts-culture`. The
caption register map has to match the string the database actually stores, so
`captions.ts` carries an allowlist entry in the copy gate with that reason, in
the same form as the existing `src/lib/images/spine.ts` entry. **The underlying
issue is data, not copy:** renaming that row is the Phase 2 taxonomy migration,
which is outside this brief and needs a migration the founder applies.

### Gates at this point

- `npx tsc --noEmit`: clean.
- `npx eslint`: **0 errors, 42 warnings** (baseline 48).
- `npm test`: **1424 passed across 130 files**, up from 1387 (37 new).
- `node scripts/copy-tell-gate.mjs`: clean.

### What is NOT yet proven for A2

The card download route has been typechecked and its renderer is proven by the
proof harness, but it has **not yet been driven in a browser against a real
published event on TEST**. That live walk is scheduled once B1 lands, because B1
changes what the card renders (the organiser logo) and driving it twice would be
wasted work. It will be reported with evidence, and if it fails, A2 is not done.

---

## B1, B2, A4, E2

Not started at the time of writing. This document is updated after each item.
