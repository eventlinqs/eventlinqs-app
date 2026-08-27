# Post-launch findings

Noticed, **not fixed**, deliberately. One line each. Opened 26 August 2026 so
that things seen during the launch run are recorded as known debt rather than
rediscovered later as gaps.

Nothing in this file is a blocker. Anything that was a blocker was fixed.

---

## Known debt

- **Six exemption lists carry justifications nobody has re-verified.**
  `scripts/check-client-barrel-imports.mjs`, `scripts/guards/canonical-host.mjs`,
  `scripts/guards/no-control-characters.mjs`,
  `scripts/guards/no-inherited-git-env.mjs`,
  `scripts/guards/one-db-connection-source.mjs`,
  `scripts/guards/one-refund-path.mjs` and
  `scripts/guards/one-sellability-source.mjs`. Each entry states a reason that was
  true when written; none is staleness-checked. This is the same class as the
  exemption in `copy-tell-gate.mjs` that excused `captions.ts` on the grounds that
  a database row still carried a slug it no longer carried, which kept a dead
  comparison alive for months. The fix is the one already applied to three lists:
  report entries that no longer match anything and treat them as failures. See
  `docs/verification/BANNED-WORD-SWEEP-2026-08-26.md` section 4.

- **Six more production storage objects still carry the banned word in their
  FILENAME**, under `stock/scenes/first-nations/cultural-ceremony-day-{480,960,1440}.avif`
  and `stock/scenes/pasifika-maori/cultural-festival-day-{480,960,1440}.avif`.
  Found on 26 August 2026 by `no-banned-word-anywhere` the moment `spine.ts`
  stopped being exempt as a whole file, which is the widening working. Left
  unchanged: renaming either descriptor without copying the objects first serves
  a 404 instead of a photo on the First Nations and Pasifika scene surfaces. Two
  scoped exemptions carry that reason.

- **Whole-file exemptions were the blind spot, and are now count-scoped.** Every
  entry in `no-banned-word-anywhere` declares how many occurrences it excuses; a
  file that grows a new one fails the build. It caught two of its own budgets
  being off by one on the first run. The other twelve exemption lists in the repo
  are still whole-file.

- **RESOLVED 26 August 2026, kept here for the sequence it imposes.**
  `src/lib/images/spine.ts` generated the retired category storage path into every
  homepage image URL. The key now reads `arts-community`, so **the storage copy
  must land on production BEFORE this deploys** or the Arts tile serves a 404.
  That ordering is the only thing about this entry that is still live.

- **`/events` grid heading spacing vs the sticky filter bar.** `scroll-mt-40`
  clears it for anchors and restored scroll positions. Not measured against every
  filter-bar height at every breakpoint; a taller bar could still overlap.

- **1024 rail peek sits at 21%** where every other width reads as a deliberate
  slice. Ruled to stay, 26 August 2026: unfixable without a per-breakpoint card
  width, and card size is locked. Arithmetic recorded in the sweep document.

- **De-duplication on a thin catalogue is unbuilt and deliberately so.** Proposal:
  cap any event at two sections per page, hero counting as one. Deferred until the
  catalogue fills; competitor behaviour on a thin catalogue is not observable from
  outside and is marked UNSOURCED rather than invented.

- **`captions.ts` arts register was mis-mapped for the life of the rename.** Fixed
  26 August 2026, but no test asserts the mapping against the live taxonomy, so
  the next category rename can break it the same way.

- **The homepage zero-event rail behaviour differs from `/events`.** `/events`
  rails fill with invitation cards when empty; `EventRailSection` on the homepage
  still returns null. Deliberate, by the instruction to leave the homepage alone.
  The two surfaces now answer "empty rail" differently.
