# Job 3: the tweak layer

9 August 2026, branch `feat/public-composer`. Law 7: every market claim carries
a fetched source and a date.

The founder's constraint governs the whole job: **nothing may let a person
produce something worse than the default.**

---

## STATUS

| Control | State |
|---|---|
| Constrained named palettes | **BUILT AND PROVEN** |
| Layout treatment | **NOT BUILT.** Analysis below |
| Logo | **NOT BUILT.** Analysis below |
| Free colour picker | **REFUSED**, per ruling and evidence |
| Text scale | **REFUSED**, per ruling and evidence |

---

## 1. CONSTRAINED NAMED PALETTES: built

Three named schemes, no field, no hex ever shown to a person:
`Navy` (default), `Midnight`, `Paper`.

**What it adds.** The single biggest visual decision on a poster, and the one a
promoter actually has an opinion about. `Paper` is not decoration: a
mostly-white A4 costs a fraction of a full-bleed dark one at a copy shop, which
is exactly where these go.

**What it costs.** One resolver, one field on `PosterInput`, and 24 colour call
sites re-pointed from constants to the resolved scheme. No new colours: every
value already exists in `globals.css`.

**What it risks, and what removes the risk.** The risk is an illegible
combination. Removed structurally rather than by care: each scheme carries its
OWN accent, so a field cannot be chosen without the accent that is legible on
it. `globals.css` records that gold-400 fails 4.5:1 on white, so `Paper` carries
gold-800. Asserted, not described:

```
every named scheme is legible
  navy/midnight/paper: body text clears 4.5:1 on its own field
  navy/midnight/paper: the accent clears 3:1 on its own field
  navy/midnight/paper: ticket bar text clears 4.5:1 on the bar
  the light scheme uses the gold-800 tier, not gold-400
the default is where you land by accident
  resolves unknown, empty, null, absent, __proto__ and toString to the default
13 passed
```

**The default did not move.** The parity proof still passes byte-for-byte on
both compositions after the refactor, which is what makes a 24-site colour
change safe to ship:

```
artwork    unchanged
no-artwork unchanged
[parity] PASS - the renderer is where it was left.
```

Rendered proofs: `docs/design/poster-palette/`, six PDFs.

### Why there are three and not ten

Not a shortage of ideas, a law. The design system is navy and gold and forbids
new colours, so a palette control cannot offer hues. What it can honestly offer
is FIELD. Two dark and one light is the extent of it. Anyone extending this list
must add a scheme from existing tokens and it must pass the contrast tests above.

---

## 2. LAYOUT TREATMENT: not built, and here is the honest analysis

**What it would add.** Canva's own step 1 is "pick a design"
(`canva.com/posters/templates/event/`, fetched 9 August 2026). It is the first
thing their flow asks for, so it is the control with the clearest market
warrant.

**What it costs.** More than it looks. The renderer now has two compositions,
and a third and fourth are additive rather than a rewrite, which is exactly why
Job 2 was sequenced first. But each new treatment needs its own measurement pass
(the band that sizes itself to content is per-composition arithmetic), its own
before-and-after renders, and its own row in the parity baseline.

**What it risks.** This is the control most able to produce something worse than
the default, because a treatment that suits a photograph rarely suits type and
vice versa. The mitigation is that treatments must be offered per composition,
not globally: an organiser with artwork should never be shown a treatment
designed for the typographic poster.

**Recommendation.** Build it after the logo, not before. The logo is what makes
the poster theirs; a second layout is what makes it different from ours.

## 3. LOGO: not built, and the reason is a dependency

**What it would add.** Canva's step 4. The organiser's own mark is, with their
artwork, one of the two things that make the poster theirs.

**What it costs.** Less rendering work than it looks and more plumbing.
`logo-pipeline.ts` exists, `resolveLogoPlacement` exists, and both poster
compositions already draw `organiserLogo` with a light readability tile when the
mark is dark. The renderer is done.

**What is missing is the UPLOAD**, and on the anonymous composer that is a
second instance of everything Job 4 just built: ownership by cookie, a
fail-closed rate limit, magic-byte sniffing, a re-encode, a storage bucket and a
sweep. It is not a small addition, it is Job 4 again for a second object.

**What it risks.** A dark mark on a dark field, which is already solved:
`resolveLogoPlacement` measures luminance and returns `on-tile`, and the tile is
drawn white on every palette by design.

**Recommendation.** Reuse the cover route rather than writing a second one:
the same bucket, `<kitCode>/logo.png`, the same ownership check, the same sweep
prefix. That turns it from a rebuild into a parameter.

---

## 4. WHAT WAS REFUSED, WITH THE EVIDENCE

### No free colour picker

Humanitix ships one. Their own help page,
`help.humanitix.com/en/articles/8951375-how-to-style-your-event-page`, fetched
9 August 2026:

> "Can I remove the colour gradient from my event page background? The colour
> gradient is added to your background when you select a custom primary colour.
> This currently cannot be removed independently."

and the documented way back to the default is to type a hex from memory:

> "you can add our default colour HEX code: #FFB18F into the primary colour
> field"

An unconstrained picker produced an artefact users want removed and a support
answer that says "type this hex". That is the founder's own test failing in
production at a direct competitor.

### No text scale

Canva's four-step sequence never mentions resizing type
(`canva.com/posters/templates/event/`, fetched 9 August 2026), and
`fitPosterTitle` now returns the largest size at which no word has to be broken,
which is a better answer than a person dragging a slider. A manual control here
can only make the output worse.

### No stock graphics, ever

The one step that needs two million templates. Licensing plus Law 1.
