# The verdict, with a photograph in it

9 August 2026, branch `feat/public-composer`. Written after Job 4 was proven end
to end on the deployed preview, not before.

---

## THE QUESTION

**With a real photograph in it, would a promoter look at that poster and think
they could not have done better themselves?**

## THE ANSWER: for the CARDS yes, for the POSTER not yet.

I am splitting it because the honest answer genuinely differs between the two
artefacts, and a single verdict would hide the useful half.

### The three share cards: YES

This is the first artefact in the build I would expect a promoter to forward.
The photograph is properly cropped per format rather than squashed into one
shape, the type sits on it with real hierarchy, and the story card in
particular reads like something made deliberately rather than filled in. A
promoter with ten minutes in Canva would produce something comparable, not
something better, and they would not produce three correctly-sized versions of
it in one go.

That is the thing Humanitix sends people away to do. We now do it in the
product.

### The A4 poster: NO, and precisely why

**About a third of the information band is empty navy.** In the poster I walked
(`tjzb656rfxgx`), the band below the photograph runs roughly 375px on screen.
The content ends at the ticket bar and the QR at about 210px in. The remaining
third is empty until the small "Ticketing by EVENTLINQS" line at the very
bottom.

So the exact defect that Job 2 was built to remove from the NO-artwork poster is
still present in the WITH-artwork poster. Job 2 split the renderer in two and
fixed the typographic composition; it deliberately left `drawCoverPoster`
byte-identical, and the parity proof exists precisely to guarantee that. The
hole was never removed from that path, because removing it was out of scope.

A promoter looking at that will not say "there is 33% dead space in the lower
band". They will say it looks like a template. That is the same judgement that
produced this whole brief.

**I did not fix it, deliberately.** The standing rule is not to regress a
working surface, and this one is working, is owned by another branch, and is
protected by a parity proof that is currently the only thing guaranteeing the
artwork path has not moved. Changing it is a real design change with a real
blast radius and it should be a decision, not a side effect of my pass.

### What would close it

One of these, and it needs a ruling rather than my taste:

1. **Let the information band size itself to its content**, so the photograph
   takes the space the band does not need. The photograph is the strongest
   element on the page and it is currently capped at 55% while a third of the
   remaining 45% is empty.
2. **Or give the band something to hold.** The organiser's own leftover detail
   already exists (the summary line: "40 stalls", "5 comics", "About 40 kids")
   and is on the event page but not on the poster.

Option 1 is the smaller change and the bigger improvement. Both break byte
parity with the pre-split renderer, which is why this is a founder call.

---

## WHAT IS NOW PROVEN, WITH THE EVIDENCE

### The upload, walked on the deployed preview

A real 3625 x 4961 photograph, the founder's own reported camera size, uploaded
through the actual control.

```
source  3625x4961  jpeg  1.06MB   EXIF PRESENT 296 bytes
                                  IFD0 tag ids: 0x10f 0x110 0x112 0x11a 0x11b
                                  0x128 0x213 0x8298 0x8769 0x8825
                                  GPS IFD pointer 0x8825 present: YES
stored  2192x3000  webp   305KB   EXIF ABSENT
                                  GPS string      NOT FOUND
                                  EXIF chunk      NOT FOUND
                                  iPhone/Apple    NOT FOUND
                                  Copyright name  NOT FOUND
                                  long edge exactly 3000, aspect 0.7307 both
                                  sides, 3.6x smaller
```

The GPS half is checked by walking the IFD0 tag ids, not by grepping for the
string "GPS". EXIF does not store the word; a string check passes vacuously and
would have "proven" stripping on a file that never carried GPS at all.

### The six-arrival walk, half with artwork, both viewports

```
dj         ARTWORK  upload=ok  cards=3/3  poster=694107b  pdf=true  dl=401  overflow390=0  consoleErr=0
comedian   none                cards=3/3  poster=24963b   pdf=true  dl=401  overflow390=0  consoleErr=0
market     ARTWORK  upload=ok  cards=3/3  poster=693889b  pdf=true  dl=401  overflow390=0  consoleErr=0
workshop   none                cards=3/3  poster=24727b   pdf=true  dl=401  overflow390=0  consoleErr=0
charity    none                cards=3/3  poster=26175b   pdf=true  dl=401  overflow390=0  consoleErr=0
birthday   ARTWORK  upload=ok  cards=3/3  poster=692655b  pdf=true  dl=401  overflow390=0  consoleErr=0
```

The 693KB against 25KB is the part that cannot be faked: the photograph is
genuinely embedded in the PDF.

### The sweep

Seven driven tests, including the 31-day boundary, that a draft still alive at
29.9 days keeps its artwork, and that replacing artwork restarts its life
(because the object is upserted in place). Live on the deployment it answers
401 unauthenticated, so the fail-closed half is proven there. A live deletion
run needs the preview `CRON_SECRET`, which is Vercel-managed and is not the
local `.env.test` value.

---

## TWO THINGS FOUND ON THE WAY THAT MATTER MORE THAN THEY LOOK

### 1. A vulnerability, found by asserting the wrong thing first

The Mallory test passed while checking only that her upload never moved Ruby's
draft POINTER. It did not check storage, and storage was the damage. The object
path is `<code>/cover.webp`, derived from the code that is shareable by design,
and the upload is an upsert, while ownership was verified AFTER the write.
Anybody holding a shared code could overwrite the owner's artwork: 403 returned,
pointer unmoved, and the bytes behind the poster replaced.

Fixed by resolving ownership before any write.

### 2. Every preview build on this branch had been failing

Six consecutive deployments in ERROR going back to the act-link commit
`d529390`. The branch alias was serving an old build, so every "verified on the
deployed preview" claim on this branch since then was made against stale code.

`bill-ref.ts` imported two constants from the `server-only` `draft-store.ts`,
and `bill-ref` is imported by a client component. They moved to an isomorphic
`kit-code.ts`.

**The lesson is the gate, not the bug.** 1839 unit tests, tsc, lint and nine
guards were green against a branch that had not produced a deployable build in
six commits. `npm run build` was the one gate not being run, and it is the only
one that would have caught it.
