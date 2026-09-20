# The event route's loading boundary, and why it was deleted

20 September 2026, close-out C8, lane C. Every number here was measured on this
tree's own production build, served by the push gate's own server on port 3200,
Lighthouse 12.6.1, mobile, median of five, with `benchmarkIndex` recorded beside
each figure because this machine is shared by three build lanes and a median
quoted without it is not a measurement anyone can check.

## The one-sentence version

`src/app/events/[slug]/loading.tsx` was deleted, and the page's six serial
database stages were collapsed into one parallel stage. Together they took the
three gated event pages from 0.80 / 0.80 / 0.75 to 0.87 / 0.84 / 0.86, and the
buyer now reaches the real page sooner than the skeleton used to finish.

## What the boundary was actually doing

A route-level `loading.tsx` wraps its segment's page in Suspense. React streams a
suspended tree in a fixed order: the shell, then the RSC **flight payload** for
the whole tree, then the resumed HTML. The page's own markup therefore lands
*after* the flight payload, and the hero lands with it.

Read off the served bytes, warm, byte offset of the first `<img>` and of the
first `self.__next_f.push`:

| route | first `<img>` | first flight push | boundary? |
|---|---|---|---|
| `/` | 18,599 | 510,262 | no |
| `/events` | 34,437 | 206,420 | no |
| `/events/browse/melbourne` | 20,215 | not measured | no |
| `/events/cat-indie-...` | **102,160** | **15,559** | YES |
| `/events/arena-...` | 102,034 | not measured | YES |
| `/events/artist-layer-...` | 101,973 | not measured | YES |

That inversion is the whole defect, and it is why the rule the guard enforces is
expressed as "the first `<img>` must precede the first flight push" rather than
as a byte threshold: the ordering is the rule, the offsets are its consequence.

The image was never slow. With the preload fix of commit `7a7f8bfb` already in
place, `Resource load delay` was 12ms and `Resource load duration` 25ms. The
browser held the photograph about 253ms after the first byte and then could not
paint it for another 603ms, because **the element did not exist yet**. Nothing
can paint an element the parser has not reached, and no amount of preloading
changes that.

## The measurements, in the order they were taken

### Baseline, commit `4a68c00d`

| page | perf | LCP sim | TBT | main | script | bench |
|---|---|---|---|---|---|---|
| cat-indie | 0.80 | 3,862ms | 322ms | 2,373ms | 224KB | 2,395 |
| arena | 0.80 | 3,923ms | 296ms | 2,456ms | 224KB | 2,092 |
| artist-layer | 0.75 | 3,882ms | 476ms | 2,890ms | 224KB | 1,864 |
| `/events` (control, no boundary) | 0.88 | 3,736ms | 85ms | 2,123ms | 205KB | 2,053 |

cat-indie observed LCP 874ms = TTFB 198 + load delay 12 + load duration 25 +
**element render delay 603**.

### Step one: the boundary removed, nothing else changed

cat-indie went to **0.84**, and the breakdown moved exactly where the diagnosis
said it would: **element render delay 603ms to 153ms**. The first `<img>` moved
from byte 102,160 to 24,114 and the document itself got 11,635 bytes smaller
(the skeleton's markup and its serialised form in the flight payload, both gone).

But it was not a free win, and this is the part a score alone would have hidden:
**warm TTFB went from 277ms to 926ms.** The boundary was flushing a shell early
and hiding a slow server render behind it. Removing it exposed the render.

A control was measured in the same collection: `/events`, which has no boundary
and which this change cannot touch, moved 0.88 to 0.85. That is the noise band
on this machine, roughly ±0.03, and it is recorded so the gains below are read
against it.

### Step two: the six serial stages collapsed into one

The page's render was a chain six database round trips deep: `fetchEvent`, then
the lineup, then the one parallel stage, then the per-tier inventory, then the
organiser sale gate, then the capture placement and consent wording. Four of
those had no dependency on anything the parallel stage produced; they ran alone
because each was written beside the markup that uses it, which reads well and
costs a round trip every time.

They were folded in. Nothing about any query changed - same selects, same
filters, same mapping - only the moment each one starts. The two capture
questions, which genuinely gate the wording read, are started beside the event
instead.

Full document time, median of nine warm samples:

| route | boundary, serial | no boundary, serial | no boundary, parallel |
|---|---|---|---|
| cat-indie | 763ms | 932ms | **428ms** |
| arena | not taken | 863ms | **635ms** |
| artist-layer | 838ms | 824ms | **350ms** |
| melbourne (untouched control) | 249ms | not taken | 273ms |

### The result

| page | baseline | after | floor | bench base / after |
|---|---|---|---|---|
| cat-indie | 0.80 | **0.87** | 0.85 | 2,395 / 2,191 |
| arena | 0.80 | **0.84** | 0.85 | 2,092 / 2,004 |
| artist-layer | 0.75 | **0.86** | 0.85 | 1,864 / 1,971 |

All three improved. Two of the three clear their floor on the local gate, which
`lighthouserc.json` documents as running 4 to 8 points BELOW the CI runner on the
same commit. **Arena is reported as it measured: 0.84, one point under its floor
locally, improved by four points and not yet proven over the line.** It was not
among the URLs that refused lane A's push, so it passes on the runner; that is an
explanation, not a claim that it is finished.

## The part that is a design decision, not a measurement

A `loading.tsx` is not only a performance artefact. Next's own `Link` reference
states that for a DYNAMIC route the default `auto` prefetch fetches "the partial
route down to the nearest segment with a `loading.js` boundary"
(`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`).
`/events/[slug]` is dynamic, so while that file existed, tapping an event card
painted a skeleton instantly. Deleting it changes what the buyer sees between the
tap and the page, on the first step of the buyer journey, and no Lighthouse
number describes that: the gate measures a cold document load, never an in-app
navigation.

So it was driven rather than argued about.
`scripts/verify/event-route-loading-boundary-drive.mjs` clicks a real event card
on `/events` at 390, 768 and 1440 and samples the viewport at 80ms, 200ms and
350ms while the server is still rendering:

```
390   80ms:4632chars/32img  200ms:4632chars/32img  350ms:4632chars/32img   hero visible 1162ms
768   80ms:4682chars/32img  200ms:4682chars/32img  350ms:4682chars/32img   hero visible  684ms
1440  80ms:4680chars/32img  200ms:4680chars/32img  350ms:3042chars/2img    hero visible  506ms
```

**The buyer never sees a blank screen.** Without a boundary Next keeps the
current page painted until the new one is ready, so the browse grid stays up and
then the event page replaces it. That is a different loading design, not an
absent one.

And the comparison that decides it: with the boundary the complete document
arrived at 763ms; without it, and with the render parallelised, at 428ms. The
skeleton was covering a wait that is now shorter than the wait it covered. A
skeleton that appears and disappears inside 400ms is a flash of loading state,
which is worse than not showing one.

**What is NOT claimed:** that a contextual pending affordance would be worthless.
Next documents `useLinkStatus` for exactly this case - "the destination route is
dynamic and doesn't include a `loading.js` file". It was not built here because
the event card is a server component used in 22 places and the cost is a client
chunk on every surface that renders a card, which is a byte measurement to take
rather than a guess to make. It is named in `C:\dev\REVIEW-QUEUE-C.md`.

## What holds it

- `scripts/guards/no-loading-boundary-in-front-of-a-hero.mjs`, registered in
  `run-guards.mjs` and therefore blocking on `prebuild`. It derives its whole
  subject from the tree and drills red on each clause
  (`C:\dev\EVIDENCE\C8\guard-drills.txt`). It REPLACES
  `hero-preload-above-the-loading-boundary`, which rescued the preload from
  behind the boundary but could not move the element; the new rule subsumes it.
- `scripts/verify/event-route-loading-boundary-drive.mjs`, 14 checks at three
  widths, including the ordering assertion on the served bytes.
- `scripts/verify/hero-preload-in-the-head-drive.mjs` still passes 72 of 72:
  exactly one image preload per document, in the head, one transfer. The fix of
  `7a7f8bfb` is intact and the hero is not downloaded twice.

## One thing left behind on purpose

With the boundary gone, the layout's bespoke preload is **redundant but
harmless**. Every other public route carries its hint in the head at byte 221 to
241 from next/image's own registration, with no bespoke preload, because nothing
closes the head early; and the drive confirms ONE hint per document, because
React dedupes this link and the element's registration to a single resource key.

It is kept in this pass because removing it also removes `HeroPreloadLink`, the
`next/image` edge it puts in the layout's graph, and the guard clause and tests
that hold it. That is a separate change with its own measurement to take, and it
is worth taking: lane A measured that graph edge at 5,641 bytes gzip on
`/events/[slug]/with/[artist]`. It is named in `C:\dev\REVIEW-QUEUE-C.md` with
that number beside it, rather than left for somebody to discover.
