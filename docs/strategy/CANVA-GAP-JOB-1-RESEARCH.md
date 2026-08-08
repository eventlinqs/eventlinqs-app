# The Canva gap: Job 1 research, and the handover for Jobs 3 to 5

9 August 2026, branch `feat/public-composer`. Law 7: every claim below carries a
fetched primary source and a date. Anything without one is marked UNSOURCED.

---

## THE HEADLINE FINDING

**The closest competitor's own answer to the design gap is to send the
organiser to Canva.** Humanitix ships a "design on Canva" button inside its
event page editor, and when an organiser's poster does not fit, its published
advice is to go to Canva and resize it.

Verbatim, `help.humanitix.com/en/articles/8892493-add-or-edit-an-event-banner-image`,
fetched 9 August 2026:

> "We recommend using the **design on Canva** option to help 'resize' your image
> within the required specifications."

> "Portrait images like flyers or posters are often unsuitable for an event
> banner image as they will be heavily cropped to fit within a 'landscape'
> format."

> "We recommend inserting your flyer or poster into your **event description**
> as an additional image."

That is an incumbent telling a promoter with a finished poster that the poster
does not fit, and to go elsewhere. It confirms the founder's thesis exactly:
organisers leave the ticketing platform to finish the job, and the platform
treats that as normal.

---

## 1. WHAT ORGANISERS ACTUALLY DO IN A DESIGN TOOL

The honest limit first: **I found no published usage data on which controls are
used and which are ignored.** No design tool publishes that, and I will not
invent a number. What can be sourced is what Canva itself says the workflow is,
which is the nearest primary evidence available.

Canva's own event poster page, `canva.com/posters/templates/event/`, fetched
9 August 2026, describes the whole job in four steps, in this order:

> "Browse through our gallery of event poster designs and pick a design that
> suits your needs."

> "Start by changing the event details using our text editor. Choose from a
> variety of font styles and colors that match the feel of your event."

> "Next, draw the eyes to your poster with graphical elements... our stock
> library has millions of high-quality visual elements... Simply drag and drop
> them."

> "To further elevate your design, don't forget to include branding elements.
> You can upload a logo from your computer or choose from preset brand colors
> from our style gallery."

**Read as a specification, that is:**

| Canva's step | What it is | Can we do it? |
|---|---|---|
| 1. Pick a design | Layout choice | **Yes.** A small set of treatments. |
| 2. Change the details | Text content | **Already do.** Extracted, not typed. |
| 2b. Font styles and colours | Type and palette | **Yes, constrained.** |
| 3. Stock graphics | Decorative elements | **No, and should not.** Licensing plus Law 1. |
| 4. Logo upload and brand colours | Identity | **Yes.** Logo pipeline already exists. |

**Inference, marked as mine:** steps 1, 2 and 4 are the "two percent". Step 3 is
the part that needs two million templates and a stock library, and it is the
part we should never chase.

The founder's expectation was layout, palette, crop and text scale. The
evidence supports layout, palette and logo. **It does not support text scale**:
Canva's own sequence never mentions resizing type, and our poster now auto-fits
type, which is strictly better than asking an organiser to do it. Crop is not
in Canva's list either, but it is in Humanitix's failure mode, which is
stronger evidence than a marketing page, so crop stays in.

---

## 2. WHAT THE TICKETING PLATFORMS ALREADY GIVE

All fetched 9 August 2026.

| Platform | Design controls for the organiser | Source |
|---|---|---|
| **Humanitix** | The fullest by far. A "page design" panel with: banner image (upload **or** design on Canva), logo upload with light or dark treatment, **light / dark / adaptive** page mode, **primary colour** via colour picker or hex (recolours buttons and links), ticket button text, reusable styling templates, desktop and mobile preview. | `help.humanitix.com/.../8951375-how-to-style-your-event-page` |
| **Eventbrite** | Image upload only. Recommended 2160 x 1080, max 10MB, JPEG or PNG, 2:1. | `eventbrite.com/help/en-us/articles/682424/` |
| **Luma** | A Share Event Poster generator with **no customisation described at all**. Verbatim: "Luma generates a poster image for your event. You can post it straight to Instagram Stories, save it to your camera roll, or send it through any app." | `help.luma.com/p/promote-your-event` |
| **TryBooking** | Generic TryBooking buttons and logos only. Nothing event-specific. | `learn.trybooking.com/en/articles/41814` |
| **Moshtix** | None. The promoter supplies artwork to a specification sheet, one week ahead. | `moshtix.com.au/v2/pages/marketing-artwork-specs` |
| **Oztix** | No design tooling described. | `oztix.com.au/venues-organisers/` |
| **DICE** | **UNSOURCED.** No published image specification or design tooling found. Their terms describe the promoter supplying materials. Absence of a published spec is not proof of absence. | `support.dice.fm` searched |

**Two things follow.**

1. **Humanitix is the bar, and it is a low one.** Six controls, none of which
   compose an artefact. They style an event PAGE. Nobody in the set composes a
   poster the organiser can print, except Luma, which offers no control at all.
2. **Humanitix's free hex picker is evidence AGAINST a free colour picker.**
   Their own help page carries this:

   > "Can I remove the colour gradient from my event page background? The colour
   > gradient is added to your background when you select a custom primary
   > colour. This currently cannot be removed independently."

   And the way back to the default is to type a hex code from memory:

   > "you can add our default colour HEX code: #FFB18F into the primary colour
   > field"

   An unconstrained colour control produced an artefact users want removed and
   a support answer that says "type this hex". That is precisely the "nothing
   that lets somebody produce something worse than the default" test failing in
   production at a direct competitor.

---

## 3. WHERE THE BOUNDARY SITS

**The evidenced answer: the boundary is the STOCK LIBRARY, not the editor.**

Everything an organiser does in Canva up to step 3 is choosing between a small
number of good defaults and putting their own material in. That needs three
choices, not a canvas. Step 3, decorative graphics, is the only step that
genuinely needs a designer or a library of millions, and it is the one step we
should never build.

**Inference, and it is the load-bearing one for Job 3:** an organiser does not
want to design. They want their night to look like their night. The two things
that make a poster theirs are their ARTWORK and their NAME, and we currently
support neither on the public composer. That is why Job 4 matters more than
Job 3, and I would sequence it first if the founder is choosing.

---

## 4. THE 4000 x 4000 DEFECT, ROOT-CAUSED AND SOURCED

The founder reported a 3625 x 4961 photo refused with "The maximum is 4000 x
4000". Confirmed in the shipped source:

`src/lib/media/image-pipeline.ts:80`

```
if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
  error: `Image is too large in pixels: ${width} x ${height}. The maximum is ${MAX_IMAGE_DIMENSION} x ${MAX_IMAGE_DIMENSION}.`
```

`MAX_IMAGE_DIMENSION = 4000` (`src/lib/media/limits.ts:16`), commented
"Server-side hard reject."

**The market has no such rule.** Neither Eventbrite nor Humanitix publishes a
maximum pixel dimension at all. Both publish a **10MB file size** cap and a
**recommended minimum** resolution:

- Eventbrite: recommended 2160 x 1080, max 10MB.
- Humanitix: "We recommend that event banner images be a minimum of 3200px by
  1600px", "Images must be less than **10mb**", "Accepted formats are **JPEG**,
  **PNG**, or **SVG**."

And Humanitix's response to an image that does not fit is to **crop it**, not
refuse it: "Images outside of this ratio will be cropped."

**So the defect is not the number, it is the verb.** We reject where the market
resizes. A 3625 x 4961 photo is ordinary phone and camera output, it is well
under 10MB once compressed, and `sharp` downscales it in milliseconds. The fix
is to replace the hard reject with a downscale to a long-edge ceiling, keeping
the 10MB byte cap that the market does share.

This must be fixed in the same pass as the anonymous upload, because a ceiling
that refuses a normal photo would make the new upload path worse than useless.

---

## STATUS OF EACH JOB

### JOB 2, the no-artwork poster: CODE COMPLETE, NOT YET VERIFIED

`src/lib/broadcast/poster.ts` is rewritten into two compositions behind one
entry point:

- `drawCoverPoster` is the previous renderer lifted verbatim, so the artwork
  path cannot move.
- `drawTypographicPoster` is new: one flat navy field over the whole page, the
  organiser's mark and name at the top, a single gold rule, then the TITLE
  auto-fitted by `fitPosterTitle` to fill everything down to the details block,
  then date, locality, gold ticket bar and QR on the baseline.

`fitPosterTitle` is the point of it: the old renderer drew every title at 29pt
regardless, which is what made a short name look lost in half a page of navy.
It now steps from 68pt down until the wrapped title fits its box, so "Ruby's
16th" prints large and a long name steps down and wraps.

**NOT VERIFIED, and it is blocked rather than skipped.** Another session on this
machine removed `node_modules/.bin` mid-session (28 node processes running,
`npm run reclaim` had already refused because that session holds port 3000). I
cannot run `tsc`, `vitest`, `eslint` or the build, and I will not run
`npm install` underneath another session's install. **Nothing in Job 2 should be
believed until the tests below are run.**

`tests/unit/poster-composition.test.ts` is written and covers: both
compositions render a valid PDF, the two differ, rendering is deterministic,
and four `fitPosterTitle` cases including a short title printing above 50pt and
a pathological 4000-character title clamping to the floor.

**The byte-identity proof is designed but NOT RUN.** The method: the test writes
`docs/design/poster-composition/parity.json` with a SHA-256 of the rendered PDF
with `CreationDate` and `ModDate` normalised (pdf-lib stamps the current time,
so raw bytes differ between any two renders). Run it on this commit, then
`git stash` `poster.ts`, run again, and compare the `withArtwork` hash. They
must be equal.

### NEXT ACTIONS, IN ORDER

1. **Wait for `node_modules/.bin` to return**, then run, in this order:
   `npx tsc --noEmit`, `npx vitest run tests/unit/poster-composition.test.ts`,
   `npm test`, `npm run lint`, `node scripts/guards/run-guards.mjs`.
2. **Run the byte-identity proof** as described above. If the artwork hash
   moved, the lift was not verbatim and must be corrected before anything else.
3. **Open the two PDFs and look at them.** They are written to
   `docs/design/poster-composition/`. Real Chrome renders PDFs; headless
   Chromium does not, which is why the earlier walk screenshots showed a blank
   poster frame that was a tooling artefact and not a defect.
4. **Job 4 first, then Job 3** (see the boundary finding above).
5. **Job 4 design**, already settled by the research: 10MB byte cap (market
   standard, both platforms), accept JPEG, PNG and WebP, **downscale rather
   than refuse** at a long-edge ceiling, and fix `image-pipeline.ts:80` in the
   same pass so the organiser path stops refusing ordinary camera output.
   Storage policy and migration to be WRITTEN, with exact commands handed to
   the founder to apply.
6. **Job 3**, the shortest list the evidence supports: layout treatment,
   constrained palette (never a free hex picker, per the Humanitix evidence),
   focal point or crop for supplied artwork, logo. Text scale is NOT
   recommended, because auto-fit already does it better.
7. **Job 5**, re-walk the six arrivals with and without artwork.
