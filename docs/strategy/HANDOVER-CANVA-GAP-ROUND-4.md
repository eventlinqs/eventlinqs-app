# HANDOVER: round 4

9 August 2026, branch `feat/public-composer`, last commit `67a1582`.

**THERE IS UNCOMMITTED WORK IN THE TREE AND IT CANNOT BE COMMITTED YET. READ THE
BLOCKER FIRST.**

---

## THE BLOCKER: another session's merge is open in this working tree

`.git/MERGE_HEAD` exists, from `86bb285 Production defect sweep before launch
(#112)`. It is not mine and I did not start it. Four files are unmerged:

```
src/app/events/page.tsx
src/lib/events/fetchers.ts
src/lib/events/search-params.ts
src/lib/events/types.ts
```

None are files I touched. I did not `git merge --abort` (that destroys their
work) and I did not `git commit` (that creates their merge commit with conflicts
I did not resolve and cannot judge).

**It already cost something.** Checking out the merge overwrote my uncommitted
poster band change. All COMMITTED work survived (`poster.ts` was byte-identical
to `67a1582`). I re-applied the change and then proved the re-application was
exact: the parity baseline recorded BEFORE the overwrite still matches, byte for
byte. The baseline earned its keep within the hour.

**Consequence:** `npm test` currently shows 3 failures in
`tests/unit/ci/copy-gate-can-see.test.ts` and three test files failing to load.
Those are the conflict markers in the unmerged files, not my work. The copy gate
itself is clean.

**What needs deciding:** whether that merge gets finished, aborted, or moved to
its own worktree. Until then nothing on this branch can be committed.

---

## DONE THIS ROUND, ALL VERIFIED, ALL UNCOMMITTED

### 1. The poster band, on your ruling

`drawCoverPoster` now measures its content and sizes the band to it; the
photograph takes what the band does not need. Every spacing constant is
unchanged. The measurement replays exactly the advances the drawing makes, so
the two cannot drift.

Clamped so the band is never TALLER than the old flat 45%, which means the
photograph can only gain space by this change and never lose it.

Worked example, the birthday poster: band 378.85pt to 278pt, so the photograph
region grows 463pt to 564pt, about **22% taller**.

Your four conditions:

| Condition | State |
|---|---|
| Take the smaller-and-better option | Done, the band sizes to content |
| Re-baseline the parity proof after, with a header note | Done. `parity-baseline.json`, and the header of `scripts/verify/poster-parity.mjs` records that the baseline moved on your ruling and why, so a changed hash is never read as a regression |
| Render all six arrivals with artwork before and after | Done. `docs/design/poster-band/before/` and `after/`, twelve PDFs |
| The no-artwork composition must not move at all | **Proven.** `scripts/verify/poster-band-before-after.mjs`: 6 artwork posters CHANGED, 0 no-artwork posters moved |

The parity proof now guards against ACCIDENTAL drift rather than comparing to a
git ref. `--rebaseline` is the deliberate act; without it a changed hash fails.

### 2. The gates, on your ruling

- `npm run gates` = guards, preview-deployment-state, tsc, eslint, vitest,
  **and `next build`**.
- `scripts/guards/preview-deployment-state.mjs` fails when the newest settled
  deployment for the current branch is in ERROR, and is registered in
  `run-guards.mjs` (11 guards now).

**Honest limit:** it needs `VERCEL_TOKEN`. Without one it SKIPS with a loud
warning saying the state is UNKNOWN, not good, because a guard that fails on
every machine without credentials gets disabled and then protects nothing. The
fetch path is exercised (a bogus token returns "Vercel API answered 403"); the
ERROR branch is **unexercised** until a real token is available. The field names
(`state`, `meta.githubCommitRef`) are confirmed against real API responses read
this session.

### 3. The false-positive checklist

`docs/roast/FALSE-POSITIVE-CHECKLIST.md`, with the Mallory entry written as its
own case, the build-gate entry, and the parity-proof-that-could-not-fail as a
third instance of the same shape.

### 4. Law 8

Recorded as a founder-reviewed deferral in that file's sibling note and here:
`0b103f4`, `da9bc30`, `e991173` keep their trailers. The hook prevents new ones.

### 5. One defect of mine, caught by a gate

`copy-tell-gate` flagged my own upload error message for naming Eventbrite and
Humanitix in copy an organiser reads. Fixed; the citation moved into the code
comment where the next person changing the number will look. Gate now clean.

---

## NOT STARTED

Job 3 (tweak layer), D1 (kit URL), D2 (child-safety proof, driven), D3 (the
floor). Scoping for all four is in `HANDOVER-CANVA-GAP-ROUND-3.md` and has not
changed.

D1 note worth carrying: the URL truncates with an ellipsis on the card in the
wild, but much of that length is the PREVIEW hostname. Measure on the production
host before changing the format.

---

## RUN THIS FIRST NEXT SESSION

```
git status                      # the merge above may or may not still be open
node scripts/verify/poster-parity.mjs          # must PASS
node scripts/verify/poster-band-before-after.mjs   # 6 changed, 0 moved
npm run gates                   # includes next build
```

Build against `.env.test`, never bare: `.env.local` points at PRODUCTION and the
env guard will block, correctly.
