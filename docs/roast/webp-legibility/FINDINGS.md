# WebP quality 80: 81 percent smaller, and still legible

Founder direction: do the cheapest win now. Prove a rendered card and a page
capture are still legible at 80.

---

## The measurement

`node scripts/verify/webp-legibility-proof.mjs` at deviceScaleFactor 2, which is
the setting that makes captures large in the first place.

| Capture | PNG | WebP q80 | Saving | Mean pixel difference |
|---|---|---|---|---|
| event card (hardest case: small, text-dense) | 373 KB | **44 KB** | 88% | 1.92 / 255 |
| header chrome | 35 KB | **14 KB** | 59% | 1.21 / 255 |
| events page, FULL PAGE | 1763 KB | **368 KB** | 79% | 0.85 / 255 |
| events page, viewport | 1563 KB | **264 KB** | 83% | 1.16 / 255 |
| **total** | **3733 KB** | **691 KB** | **81%** | worst 1.92 |

**Both files are written for every case** in this directory, so the judgement
can be disagreed with by opening them rather than by trusting a number.

## Legibility, judged not asserted

The event card is the hardest case for lossy compression: small text, fine
borders, a badge over a photograph. At 44 KB, down from 373 KB, every element a
reviewer would check is crisp: the LAST CHANCE badge, the organiser name
"Common Ground Community", the two-line title, the date and city line
"Sat, 8 Aug, Hobart", and the price "From AUD $32". The photograph shows no
banding or blocking.

A mean difference of 1.92 of 255 is below the threshold at which a difference is
visible at review zoom. The full-page capture, which is the one that produces
the 26 MB files, differs by 0.85.

## Applied to the archive's real numbers

`docs/` in this worktree is 2.44 GB of images. At 81 percent, the same evidence
is roughly **0.46 GB**. Across the nine worktrees, 10.68 GB becomes roughly
**2.0 GB**. That is not retroactive, and it is not a substitute for the ruling
that the archive leaves git: it stops the problem growing from today.

## What was changed, and what was not

**The shared helper** `scripts/lib/capture.mjs` is the one place a harness
writes a capture. It screenshots to a PNG buffer and converts with sharp at
quality 80, rewriting a `.png` path to `.webp` so callers do not have to
remember. `{ lossless: true }` is available for the rare proof that genuinely
depends on exact pixels (a contrast-ratio measurement, a colour-token
assertion), and the call site should say why.

**One harness is switched and verified:** `share-conversion-e2e.mjs`. Syntax
checked, and the helper proven end to end against a live page: it wrote a valid
`RIFF/WEBP, VP8, 1440x900` file at 80 KB.

**Seven active harnesses are NOT switched**, and this is the honest part. I
attempted it with a regex across all eight and **broke all eight**: the
substitution could not handle a `page.screenshot({ path: ... })` call whose path
is a template literal containing braces. Every file failed `node --check`. All
eight were reverted with `git checkout` and re-verified as restored, so nothing
is left damaged.

They need a careful per-file edit, which is a small job and not one to do at the
end of a long session with a regex. The remaining seven:

```
artist-layer-gate  guidance-hint-capture  magic-launch-kit-drive
marketplace-gate   paid-purchase-webhook-e2e  seated-attachment-e2e
waitlist-bridge-e2e
```

The pattern to apply in each is exactly what `share-conversion-e2e.mjs` now
shows: add `import { capture } from '../lib/capture.mjs'`, then turn
`page.screenshot({ path: X, ...rest })` into `capture(page, X, { ...rest })`.

**97 historical batch scripts under `scripts/` are deliberately untouched.** They
are one-off captures from finished work that will not run again; changing them
is churn with no benefit.
