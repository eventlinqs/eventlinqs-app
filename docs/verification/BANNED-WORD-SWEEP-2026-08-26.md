# The banned word, everywhere it can live; and the exemptions whose reasons expired

**Date:** 26 August 2026
**Ordered by:** Lawal Adams
**Guard:** `scripts/guards/no-banned-word-anywhere.mjs` (registered, blocking on prebuild)
**Drills:** 63 of 63 fire, two of them new

---

## 1. Why two instances survived a guard that appeared to cover them

`copy-tell-gate.mjs` scans **customer-facing text**. Its name and its output line
(`clean (dashes, banned word, phrase tells, competitor names)`) read as though it
covers the banned word everywhere. It does not, and the two survivors are exactly
the two shapes it cannot see:

| Survivor | Shape | Why the copy gate could not see it |
|---|---|---|
| `captions.ts` compared `slug === 'arts-cult<span/>ure'` | a **string comparison** | code, not copy |
| `stock/categories/arts-cult<span/>ure/…` | a **storage key** in an image URL | not text at all, and served to browsers |

The first mis-registered **every arts event** into the wrong caption family from
the day of the rename. Fixed.

## 2. The new guard, and what it scans

1,359 files under `src`, `scripts`, `supabase/seed`. 1,183 scanned, 176 exempt.
It reads whole files including comments, and separately checks **filenames**,
because a path can carry the word when no line inside does.

It fails on **identifiers, string comparisons, slugs, URLs, storage keys,
filenames and config**, and it fails on **an exemption whose file no longer
contains the word** — because an exemption that excuses nothing is one nobody has
re-read, which is precisely how the stale justification survived.

**It caught its own first mistake.** `scripts/sweep/walk.mjs` was listed as a file
exemption while `scripts/sweep` was already exempt as a directory, so the file
entry could never be marked used and the staleness check reported it immediately.
A redundant exemption is indistinguishable from an expired one, which is correct.

**Four comments were reworded rather than exempted**, in
`categories/[slug]/page.tsx`, `captions.ts`, `lighthouse-exemption-expiry.mjs` and
`warm-preview.mjs`. Each named the retired route in prose; none needed to.

### Drilled, both blind spots

| Drill | Fires |
|---|---|
| the banned word planted in a **storage path** | yes |
| the banned word planted in a **string comparison** | yes |

## 3. The storage objects: measured, and the safe answer

**Measured on TEST, 26 August 2026:**

```
objects under stock/categories/arts-cult<span/>ure:  1
  theatre-interior-evening-1440.avif   30,979 bytes
```

**One object.** That is the entire scope, and it changes the recommendation.

**The safe rename is copy-then-switch-then-delete, never move.** A `move` renames
the object instantly, and every already-rendered page, every CDN edge and every
in-flight request keeps asking for the old path until the next deploy lands. That
is a broken image on the homepage for the length of a deploy.

**Steps, and which are yours:**

1. **Mine, on TEST:** copy the object to `stock/categories/arts-community/`,
   leaving the original in place.
2. **Mine:** point `src/lib/images/spine.ts` at the new key and remove its
   exemption from the guard.
3. **Yours, on PRODUCTION:** the same copy, in the Supabase dashboard or CLI,
   before the deploy. I write to TEST only.
4. **Yours, after the deploy is verified:** delete the old object.

**My recommendation is to do steps 1 to 3 and stop.** Leaving one 31KB orphan in
storage costs nothing and removes every risk of a 404 on a page somebody has open.
Deleting it is tidiness, and tidiness is not worth a broken image on the homepage.
If you would rather not touch production storage at all, the honest alternative
is to leave the object and change only what generates the path going forward,
which is one line in `spine.ts` plus the copy in step 1.

## 4. The stale exemption, and how many others are like it

**Removed:** `copy-tell-gate.mjs` excused `captions.ts` on the grounds that *"the
live event_categories row still carries the slug arts-cult<span/>ure"*. Measured
against TEST the same day: **22 rows, not one carrying the word.** The reason had
expired and the exemption was keeping a dead comparison alive.

### Every exemption list in the repository

13 files carry one. Verdict per list:

| List | Entries | Reason still holds? | Machine-checked now? |
|---|---|---|---|
| `copy-tell-gate.mjs` ALLOWLIST | 8 (was 9) | 8 yes, **1 expired and removed** | **no** — see the gap below |
| `no-banned-word-anywhere.mjs` | 11 | all yes | **yes**, staleness fails the build |
| `no-silent-catch.mjs` | 4 | all yes | prints every run, not staleness-checked |
| `steps-declare-work.mjs` | 2 | all yes | **yes**, a stale entry fails |
| `maintained-aggregates.mjs` | registry | all yes | **yes**, both directions |
| `check-client-barrel-imports.mjs` | list | unverified | no |
| `canonical-host.mjs` | list | unverified | no |
| `no-control-characters.mjs` | list | unverified | no |
| `no-inherited-git-env.mjs` | list | unverified | no |
| `no-unowned-organisation-read.mjs` | list | all yes, printed with reasons | prints "no match now" per entry |
| `one-db-connection-source.mjs` | list | unverified | no |
| `one-refund-path.mjs` | list | unverified | no |
| `one-sellability-source.mjs` | list | unverified | no |

**Six lists are marked unverified and I am not going to claim otherwise.** Reading
each entry's stated reason and re-measuring whether it still holds is the same
work this document did for one list, times six, and it is not done.

**The class, named:** an exemption is a claim about the world, and like every
claim in this repository it goes stale silently. It joins the detector that
matched a filename instead of an href and the warmer that counted its own cap.
The general fix is the one applied here: **every allowlist reports entries that
no longer match anything, and treats them as failures rather than noise.** Three
lists now do. The remaining ten are the honest backlog.

## 5. De-duplication: recorded, deferred

**The proposal:** cap any single event at two sections per page, hero counting as
one, applied at page level after all rails resolve.

**Deferred, by founder ruling of 26 August 2026**, and the reasoning is his:

> "Thin-catalogue behaviour is not observable from outside and I will not have a
> rule invented from nothing. It resolves itself as the catalogue fills and I am
> not building for a state I am about to leave."

The research that would have grounded it is **UNSOURCED and marked so**:
Eventbrite and Humanitix both carry full catalogues, so what they do when a rail
set would repeat cannot be observed from the outside. Nothing was invented to
fill the gap.

**Revisit when** the catalogue passes roughly five events per homepage rail, at
which point the repetition disappears on its own and the rule may never be needed.

## 6. The peek: measured, ruled OFF, recorded so nobody redoes it

**Founder ruling, 26 August 2026:** leave it off. 280px of visible misalignment at
1440 is a worse defect than a peek that varies.

Measured 26 August 2026 (`docs/benchmark/rail-peek-2026-08-26/`):

| | 390 | 768 | 1024 | 1440 | 1920 |
|---|---|---|---|---|---|
| **EventLinqs, as shipped** | 35% | 42% | **21%** | 47% | 47% |
| With the constant-peek rule on | 35% | 51% | 53% | 54% | 54% |
| Eventbrite AU | n/a | n/a | n/a | 53% | 53% |
| Humanitix | n/a | n/a | n/a | 84% | 53% |

Our 47% sits inside Eventbrite's 53% and Humanitix's 53 to 84%. **We are not
behind anyone**, and the peek itself is the convention rather than a defect.

**The 1024 exception, and why it cannot be fixed alone.** At 1024 the content
width is 960, the card is 288 and the gap 16, so three cards plus their gaps
occupy 912 and the remainder is 48px. To reach even the bottom of the 35 to 54%
band the peek must be at least 101px, which requires the track to be either 1013px
(more than exists) or trimmed to two whole cards at 709px, wasting 251px — the
same misalignment ruled out at 1440, in a narrower window.

**So: no. 1024 cannot be brought into the band without a per-breakpoint card
width, and card size is locked.** Left as it is, as instructed.

The machinery is built and left OFF, one line from enabled, with the measurements
recorded in `m5-recommended-rail.tsx`. The root arithmetic, so nobody re-derives
it: a constant peek needs the container to divide by the card pitch. Eventbrite
hold 53% at both desktop widths because their 360px card divides their 1272px
container exactly. Ours is fixed at 288 against 358 / 720 / 960 / 1336, which no
single card width divides.
